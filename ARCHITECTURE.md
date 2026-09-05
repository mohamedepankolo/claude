# Baraka Score — architecture

Vue d'ensemble consolidée : l'architecture de Lory ("Architecture technique,
réglementaire & business model — MVP DigiCoop-WA+ 2026", 4 moteurs métier,
React/IndexedDB/Firebase, offline-first) + le contrat de scoring de Mohamede,
adossé à un modèle entraîné sur les données de Prisca + le moteur
réglementaire (TEG) + une brique optionnelle de langage naturel local (LLM).
Design de référence pour l'UI : `index-light.html` (choisi par l'équipe).

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   ÉQUIPE / DONNÉES          │        │  ☁ FIREBASE — MVP        │
│   Prisca : variables +      │        │  synchronisation seule   │
│   3000 dossiers synthétiques│        └────────────▲─────────────┘
│   (data/)                   │                     │ si en ligne
└──────────────┬───────────────┘                     │
               │ entraînement hors-ligne              │
               ▼ (ml/train_model.py)                  │
┌──────────────────────────────┐        ┌─────────────┴─────────────┐
│ scoring/model.js              │───────▶│      APPLICATION REACT     │
│ (coefficients régression      │ import │  Formulaire / Dossier /   │
│  logistique, ROC-AUC 0.83)    │        │  Score / TEG / Chat /     │
├────────────────────────────────┤        │  Online-Offline (app/src)  │
│ scoring/scoreCreditApplication │◀──────▶│                           │
│ .mjs — CONTRAT STABLE          │ appel  └─────────────┬─────────────┘
│ (Mohamede ↔ Lory, section 6)   │                      │
└────────────────────────────────┘                      ▼
┌────────────────────────────────┐           ┌─────────────────────┐
│ regulatory/computeTEG.mjs       │◀─────────▶│  IndexedDB (Dexie)   │
│ TEG + conformité, déterministe  │  appel     │  clients, dossiers,  │
└────────────────────────────────┘            │  scores, TEG, sync   │
┌────────────────────────────────┐            └─────────────────────┘
│ llm/ — Mistral 7B GGUF          │◀─fetch────▶ (optionnel)
│ (llama-server, localhost,       │
│  explication + chatbox)         │
│ repli déterministe si absent    │
└────────────────────────────────┘
```

## 1. Les moteurs métier (architecture de Lory, section 4)

Lory structure l'application en 4 moteurs séparés. État d'avancement :

1. **Risk Scoring Engine** ✅ — `scoring/scoreCreditApplication.mjs`, adossé à
   une régression logistique entraînée (section 2 ci-dessous).
2. **Affordability Engine** ✅ — intégré au contrat de scoring (`recommended_amount`),
   pas encore extrait en module séparé.
3. **Regulatory/TEG Engine** ✅ — `regulatory/computeTEG.mjs` : calcule le TEG
   d'un crédit simulé (montant, durée, taux nominal, frais) et sa conformité
   à un plafond configurable. **Déterministe, jamais piloté par le LLM**
   (règle d'architecture #2 de Lory). Le plafond par défaut (24%) est un
   **placeholder** à remplacer par le taux d'usure BCEAO confirmé.
4. **Profitability/Viability Engine** ⏳ — pas encore construit. Estimera la
   marge de l'institution (coûts de ressources/opérationnels/du risque/technologiques
   vs revenus du crédit), **toujours séparée du TEG** (principe non-négociable :
   un coût interne comme le coût du LLM ne doit jamais gonfler le TEG réglementaire).

## 2. Le contrat de scoring (OUTPUT stable)

`scoring/scoreCreditApplication.mjs` reste la seule frontière entre "ce que
Lory affiche" et "comment le risque est calculé" (section 6 du premier plan
de Lory : *"si le modèle évolue, ton application garde le même contrat"*).

- **INPUT** (v2) : les variables réelles validées par Prisca — `chiffre_affaires`,
  `charges_activite`, `montant_demande`, `duree_mois`, `epargne_mensuelle`,
  `regularite_tontine`, `a_historique`, `nb_retards`, `capacite_caution`,
  `score_reputation`, `secteur`, `zone`... (cf. `data/README.md`). `genre` est
  stocké (pour l'audit d'équité) mais **jamais lu par le scoring**.
- **OUTPUT** : `score` (0-100), `risk_level`, `confidence`, `recommended_amount`,
  `decision`, `explanations[]`, et `narrative[]` (extension pratique).
- Zéro dépendance à l'exécution : uniquement de l'algèbre linéaire (le modèle
  entraîné est "compilé" en coefficients dans `scoring/model.js`). Fonctionne
  hors-ligne, sur un poste modeste, en JS pur — testable avec `node --test`
  sans backend. Même principe pour `regulatory/computeTEG.mjs`.

## 3. Le modèle de scoring (ml/)

Régression logistique entraînée sur `data/donnees_completes.csv` (3000
dossiers synthétiques de Prisca) : `ml/train_model.py` → `ml/model.json` →
`scoring/model.js` (copie JS du même contenu, consommée par le contrat).

- **Performance** (jeu de test, 20%) : ROC-AUC **0.83**, Brier **0.092**.
  Détail complet, coefficients et audit d'équité : `ml/METRICS.md`.
- **Comparé à des modèles plus complexes** (gradient boosting, random forest,
  testés sur les mêmes données) : la régression logistique reste meilleure
  (0.83 vs 0.78-0.82 de ROC-AUC) — attendu vu la nature des données
  synthétiques (logique métier plutôt linéaire) et la taille de l'échantillon
  d'entraînement (2400 lignes). Pas de gain à sacrifier l'interprétabilité ici.
- **Équité** : `genre` exclu des features (consigne de Prisca), audité a
  posteriori — le taux de défaut observé est quasi identique entre F et M
  (12.83% vs 12.84%) et le risque prédit aussi (12.55% vs 12.41%). Zone et
  secteur sont audités de la même façon (cf. `ml/METRICS.md`).
- **Ré-entraîner** : `pip install scikit-learn pandas numpy && python3 ml/train_model.py`
  depuis la racine du repo. Regénère `ml/model.json` — il faut ensuite
  recopier son contenu dans `scoring/model.js`.

## 4. L'application (app/) — React + IndexedDB (Dexie)

Le stockage local est passé de sql.js/SQLite à **IndexedDB via Dexie**
(choix explicite de Lory dans sa v2 d'architecture) : natif du navigateur,
persistant sans étape d'export manuel, pas de binaire WASM à charger.
`app/src/db/db.js` définit les tables : `clients`, `credit_applications`,
`credit_scores`, `credit_decisions`, `regulatory_results` (résultat TEG),
`sync_queue`. Colonnes de `credit_applications` alignées sur les variables
réelles de Prisca.

Testé de bout en bout (Playwright) y compris le scénario offline réel de la
démo de Lory : dossier créé sans connexion → `sync_status=pending` →
reconnexion → synchronisation automatique — et la persistance IndexedDB
vérifiée après rechargement de page. Firebase lui-même est simulé
(`app/src/sync/syncService.js`, `mockRemoteAdapter`) en attendant la config
du projet de l'équipe.

## 5. Langage naturel : LLM local optionnel (llm/)

Mistral 7B Instruct (GGUF, fourni par Mohamede) servi localement via
`llama-server` (API HTTP compatible OpenAI sur `localhost`, cf. `llm/README.md`)
pour deux usages, tous deux **non bloquants** :

1. Reformuler l'explication du score en langage plus naturel.
2. Répondre aux questions libres du chatbox (`app/src/components/ChatPanel.jsx`).

`app/src/llm/llmClient.js` vérifie la disponibilité du serveur avant chaque
appel ; en son absence, `app/src/llm/fallbackResponder.js` répond avec des
règles déterministes qui **recalculent de vraies simulations** via
`scoreCreditApplication` (jamais de texte halluciné) — conforme au Plan B de
Lory : *"si le modèle complet tombe, utiliser un modèle de secours prévalidé,
ne jamais inventer un résultat."*

**Ce chat n'est pas le RAG documentaire décrit par Lory dans sa v2**
(corpus PDF réglementaire → chunks → embeddings → vector store → recherche →
LLM → réponse sourcée). Notre chat actuel injecte les données du *dossier*
dans le prompt ; le RAG de Lory répondra sur la *réglementation* (taux
d'usure, règles de calcul TEG, politique de crédit) avec citation de source.
Les deux sont complémentaires, pas redondants — le RAG documentaire reste à
construire (Priorité 3 du plan de Lory).

## 6. Ce qui reste à faire

- **Profitability/Viability Engine** — moteur 4/4, pas encore construit.
- **RAG documentaire** — corpus contrôlé + pipeline embeddings/recherche (Priorité 3).
- Brancher un vrai adapter Firestore (config du projet Firebase de l'équipe).
- Confirmer avec Prisca/le texte BCEAO le vrai taux d'usure (le plafond TEG
  actuel, 24%, est un placeholder documenté dans `regulatory/computeTEG.mjs`).
- Démarrer `llama-server` avec le fichier `.gguf` sur la machine de démo.
- Reprendre le style visuel de `index-light.html` dans l'app React (actuellement
  minimal, cf. directive de Lory : "ne cherchez pas la beauté finale au Jour 1").
- Confirmer avec Prisca les deux points encore ouverts sur les données
  (niveau des achats par secteur, seuil des "retards graves") — cf. `data/README.md`.
