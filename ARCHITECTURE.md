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
4. **Profitability/Viability Engine** ✅ — `finance/computeViability.mjs` : estime
   la marge de l'institution sur un crédit (revenus d'intérêts + frais, moins
   les coûts de ressources/opérationnels/du risque/technologiques), **toujours
   séparée du TEG** (principe non-négociable : un coût interne comme le coût
   du LLM ne doit jamais gonfler le TEG réglementaire). Les 4 moteurs de
   l'architecture de Lory sont désormais tous construits.

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

**Ce chat n'est pas le RAG documentaire** — les deux sont complémentaires :
`ChatPanel.jsx` répond sur les données du *dossier* (chiffre d'affaires,
score, facteurs...), `RegulatoryAssistant.jsx` répond sur la
*réglementation et la politique de crédit*, avec citation systématique de
sa source (étape 8 du scénario de démo de Lory : *"Poser au RAG : Pourquoi ?
→ réponse sourcée"*).

## 6. Le RAG documentaire (rag/) ✅

Corpus contrôlé de 3 documents courts (`rag/corpus.mjs`) :
- **Méthode de calcul du TEG** — contenu réel, documente notre propre moteur (`regulatory/computeTEG.mjs`).
- **Taux d'usure — canevas à compléter** — volontairement PAS un texte réglementaire inventé : une liste de ce que le vrai texte BCEAO doit préciser, à remplacer avant toute présentation officielle.
- **Politique de crédit interne** — document **fictif**, explicitement demandé comme tel par l'architecture de Lory.

Recherche par scoring lexical (TF-IDF, `rag/retrieve.mjs`) plutôt qu'une
base vectorielle : suffisant et fiable pour un corpus de cette taille,
cohérent avec la note de Lory ("pour les données structurées, utiliser
SQL/agrégations plutôt que de tout transformer en vecteurs"). Un vrai vector
store reste l'évolution naturelle si le corpus grossit en production.

`app/src/rag/ragClient.js` récupère les passages pertinents, les envoie au
LLM local avec instruction de citer sa source ; si le LLM est indisponible,
les passages bruts sont affichés tels quels (jamais de texte inventé).
Testé de bout en bout avec un faux serveur imitant l'API `llama-server`
(cf. `llm/README.md`, section CORS) : le chat et l'assistant réglementaire
basculent automatiquement sur le LLM dès qu'il répond, et retombent
proprement sur les règles/passages bruts sinon.

## 6bis. Le moteur de rentabilité (finance/) ✅

`finance/computeViability.mjs` — 4ᵉ et dernier moteur métier de l'architecture
de Lory. Réutilise la même hypothèse d'amortissement que `regulatory/computeTEG.mjs`
(`monthlyPayment`, exportée pour l'occasion) pour rester cohérent entre les
deux calculs, mais produit une sortie strictement séparée :

- **INPUT** : les termes du crédit (`montant_demande`, `duree_mois`,
  `taux_nominal_annuel_pct`, `frais_dossier`) + `probabilite_defaut` — fournie
  par l'appelant (`(100 - dossier.score) / 100`, dérivée du contrat de scoring
  sans jamais importer `@scoring` directement, pour garder les moteurs découplés).
- **OUTPUT** : `{ revenus, couts, marge, marge_pct, viable, detail, params }` —
  jamais de champ `teg` ni `compliant` (testé explicitement, cf.
  `finance/computeViability.test.mjs`).
- **Paramètres économiques** (`DEFAULT_PARAMS`) : coût des ressources (6%/an),
  coût opérationnel (5% du montant), perte en cas de défaut (LGD, 60%), coût
  technologique fixe par dossier (500 FCFA — le coût du LLM/serveur est ici,
  jamais dans le TEG), marge minimale (5%) — tous des **placeholders**
  documentés, comme `DEFAULT_TAUX_USURE`, à confirmer par la direction financière.
- `app/src/components/ViabilityPanel.jsx` (aliasé `@finance`) : affiché juste
  après le panneau TEG (étape 7 du scénario de démo de Lory), persisté dans
  IndexedDB (`viability_results`, `db.version(2)`), testé de bout en bout
  (Playwright) y compris la persistance après rechargement de page.

## 6ter. Garde-fous métier (scoring/applyBusinessGuardrails.mjs) ✅

Suite au retour détaillé de Prisca sur sa méthodologie complète d'évaluation
du risque (cf. `NOTES_MENTORING_CIF.md` session 3 et `PLAN_RISQUE.md`), une
couche de règles métier est appliquée **après** `scoreCreditApplication`,
jamais à sa place : elle ne peut que durcir `decision` et/ou réduire
`recommended_amount`, jamais l'inverse, et ne touche jamais `score`,
`confidence`, `risk_level` ni `explanations` du modèle entraîné (le
"contrat" reste stable). Couvre l'endettement externe déclaré, l'ancienneté
du membre, la progressivité du crédit (P0), la cohérence durée/type de
crédit, le ratio garantie/montant, la pertinence saisonnière et la
croissance des ventes déclarées par l'agent (P1), et un doublon de dossier
détecté localement — proxy honnête de la vérification BIC/multi-agences,
pas une intégration réelle (P2). Détail complet, y compris les limites
explicitement assumées, dans `PLAN_RISQUE.md`.

## 7. Ce qui reste à faire

- Brancher un vrai adapter Firestore (config du projet Firebase de l'équipe) —
  prérequis, entre autres, pour une vraie détection multi-agences.
- Une vraie intégration BIC (API BCEAO) reste hors de portée technique de ce
  prototype — `ExternalChecksPanel.jsx` archive les vérifications déjà
  faites par l'agent, mais n'interroge aucune API.
- Confirmer avec Prisca/le texte BCEAO le vrai taux d'usure (le plafond TEG
  actuel, 24%, est un placeholder documenté dans `regulatory/computeTEG.mjs`).
- Démarrer `llama-server` avec le fichier `.gguf` sur la machine de démo.
- Reprendre le style visuel de `index-light.html` dans l'app React (actuellement
  minimal, cf. directive de Lory : "ne cherchez pas la beauté finale au Jour 1").
- Confirmer avec Prisca les deux points encore ouverts sur les données
  (niveau des achats par secteur, seuil des "retards graves") — cf. `data/README.md`.
