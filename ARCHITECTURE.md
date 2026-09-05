# Baraka Score — architecture

Vue d'ensemble consolidée : le plan de Lory (React/SQLite/Firebase, offline-first)
+ le contrat de scoring de Mohamede, désormais adossé à un modèle entraîné sur
les données de Prisca + une brique optionnelle de langage naturel local (LLM).
Design de référence pour l'UI : `index-light.html` (choisi par l'équipe).

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   ÉQUIPE / DONNÉES          │        │  ☁ FIREBASE (Firestore)  │
│   Prisca : variables +      │        │  synchronisation seule   │
│   3000 dossiers synthétiques│        └────────────▲─────────────┘
│   (data/)                   │                     │ si en ligne
└──────────────┬───────────────┘                     │
               │ entraînement hors-ligne              │
               ▼ (ml/train_model.py)                  │
┌──────────────────────────────┐        ┌─────────────┴─────────────┐
│ scoring/model.js              │───────▶│      APPLICATION REACT     │
│ (coefficients régression      │ import │  Formulaire / Dossier /   │
│  logistique, ROC-AUC 0.83)    │        │  Score / Historique /     │
├────────────────────────────────┤        │  Chat / Online-Offline    │
│ scoring/scoreCreditApplication │◀──────▶│        (app/src)          │
│ .mjs — CONTRAT STABLE          │ appel  └─────────────┬─────────────┘
│ (Mohamede ↔ Lory, section 6)   │                      │
└────────────────────────────────┘                      ▼
                                              ┌─────────────────────┐
┌────────────────────────────────┐           │   SQLite LOCAL        │
│ llm/ — Mistral 7B GGUF          │◀─fetch───▶│   (sql.js / WASM)     │
│ (llama-server, localhost,       │  optionnel│   schéma de Lory +    │
│  explication + chatbox)         │           │   variables Prisca    │
│ repli déterministe si absent    │           └─────────────────────┘
└────────────────────────────────┘
```

## 1. Le contrat de scoring (inchangé côté OUTPUT)

`scoring/scoreCreditApplication.mjs` reste la seule frontière entre "ce que
Lory affiche" et "comment le risque est calculé" (section 6 du plan de
Lory : *"si le modèle évolue, ton application garde le même contrat"*).

- **INPUT** (v2) : les variables réelles validées par Prisca — `chiffre_affaires`,
  `charges_activite`, `montant_demande`, `duree_mois`, `epargne_mensuelle`,
  `regularite_tontine`, `a_historique`, `nb_retards`, `capacite_caution`,
  `score_reputation`, `secteur`, `zone`... (cf. `data/README.md`). `genre` est
  accepté par la base SQLite (pour l'audit d'équité) mais **jamais lu par le
  scoring**.
- **OUTPUT** (inchangé depuis la v1) : `score` (0-100), `risk_level`,
  `confidence`, `recommended_amount`, `decision`, `explanations[]`, et
  `narrative[]` (extension pratique, texte prêt à afficher).
- Zéro dépendance à l'exécution : uniquement de l'algèbre linéaire (le modèle
  entraîné est "compilé" en coefficients dans `scoring/model.js`). Fonctionne
  hors-ligne, sur un poste modeste, en JS pur — testable avec `node --test`
  sans backend.

## 2. Le modèle (ml/)

Régression logistique entraînée sur `data/donnees_completes.csv` (3000
dossiers synthétiques de Prisca) : `ml/train_model.py` → `ml/model.json` →
`scoring/model.js` (copie JS du même contenu, consommée par le contrat).

- **Performance** (jeu de test, 20%) : ROC-AUC **0.83**, Brier **0.092**.
  Détail complet, coefficients et audit d'équité : `ml/METRICS.md`.
- **Pourquoi une régression logistique plutôt qu'un modèle plus complexe** :
  interprétable et auditable (chaque `explanation` est une vraie contribution
  du modèle, pas un habillage) — cohérent avec le "modèle interprétable" mis
  en avant dans la note de présentation de l'équipe.
- **Équité** : `genre` exclu des features (consigne de Prisca), audité a
  posteriori — le taux de défaut observé est quasi identique entre F et M
  (12.83% vs 12.84%) et le risque prédit aussi (12.55% vs 12.41%). Zone et
  secteur sont audités de la même façon (cf. `ml/METRICS.md`).
- **Ré-entraîner** : `pip install scikit-learn pandas numpy && python3 ml/train_model.py`
  depuis la racine du repo. Regénère `ml/model.json` — il faut ensuite
  recopier son contenu dans `scoring/model.js` (un script pourra automatiser
  cette étape si le modèle est amené à changer souvent).

## 3. L'application (app/) — reprend l'architecture de Lory

React + SQLite local (`sql.js`, WASM, zéro installation) + file de
synchronisation Firebase. Le schéma SQLite (`app/src/db/schema.js`) reprend
celui de Lory à l'identique, avec les colonnes de `credit_applications`
alignées sur les variables réelles de Prisca plutôt que sur des noms
génériques provisoires.

Testé de bout en bout (Playwright) y compris le scénario offline réel de la
démo de Lory : dossier créé sans connexion → `sync_status=pending` →
reconnexion → synchronisation automatique. Firebase lui-même est simulé
(`app/src/sync/syncService.js`, `mockRemoteAdapter`) en attendant la config
du projet de l'équipe.

## 4. Langage naturel : LLM local optionnel (llm/)

Mistral 7B Instruct (GGUF, fourni par Mohamede) servi localement via
`llama-server` (API HTTP compatible OpenAI sur `localhost`, cf. `llm/README.md`)
pour deux usages, tous deux **non bloquants** :

1. Reformuler l'explication du score en langage plus naturel.
2. Répondre aux questions libres du chatbox (`app/src/components/ChatPanel.jsx`).

`app/src/llm/llmClient.js` vérifie la disponibilité du serveur avant chaque
appel ; en son absence (modèle non démarré — cas normal si le fichier `.gguf`
n'a pas encore été placé sur la machine), `app/src/llm/fallbackResponder.js`
répond avec des règles déterministes qui **recalculent de vraies simulations**
via `scoreCreditApplication` (jamais de texte halluciné) — conforme au
Plan B de Lory : *"si le modèle complet tombe, utiliser un modèle de secours
prévalidé, ne jamais inventer un résultat."*

## 5. Ce qui reste à faire

- Brancher un vrai adapter Firestore (config du projet Firebase de l'équipe).
- Démarrer `llama-server` avec le fichier `.gguf` sur la machine de démo
  (cf. `llm/README.md`) et vérifier le temps de réponse en conditions réelles.
- Reprendre le style visuel de `index-light.html` dans l'app React (actuellement
  minimal, cf. directive de Lory : "ne cherchez pas la beauté finale au Jour 1").
- Confirmer avec Prisca les deux points encore ouverts sur les données
  (niveau des achats par secteur, seuil des "retards graves") — cf. `data/README.md`.
- Faire vérifier les calculs/seuils par 2-3 collègues de Prisca si l'équipe
  est retenue, comme proposé dans le document de correction des données.
