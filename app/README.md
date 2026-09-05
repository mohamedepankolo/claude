# Baraka Score — app (React + IndexedDB + Firebase + LLM local)

Implémente l'architecture de Lory ("Architecture technique, réglementaire &
business model — MVP DigiCoop-WA+ 2026") : React + stockage local IndexedDB
(via [Dexie](https://dexie.org)) + moteur de scoring entraîné + moteur
réglementaire (TEG) + file de synchronisation Firebase + assistant en
langage naturel local (optionnel). Vue d'ensemble complète : `../ARCHITECTURE.md`.

## Démarrer

```bash
npm install
npm run dev
```

L'app tourne entièrement côté navigateur : IndexedDB est natif, aucune
installation ni étape de build supplémentaire, les données survivent aux
rechargements et l'app fonctionne sans connexion.

Pour activer l'assistant en langage naturel (optionnel, cf. `../llm/README.md`) :
copier `.env.example` en `.env.local` et démarrer `llama-server` en local.
Sans lui, le chat et les explications fonctionnent quand même (repli par règles).

## Où sont les choses

- `src/db/db.js` — définition de la base IndexedDB (Dexie) : `clients`,
  `credit_applications`, `credit_scores`, `credit_decisions`,
  `regulatory_results` (résultat TEG), `viability_results` (résultat
  rentabilité), `sync_queue`. Colonnes de `credit_applications` alignées sur
  les variables réelles validées par Prisca. `genre` est stocké (audit
  d'équité) mais jamais transmis au scoring.
- `src/db/repository.js` — couche d'accès (création dossier, lecture,
  historique, file de synchronisation), API asynchrone (Dexie/IndexedDB).
- `../scoring/scoreCreditApplication.mjs` (aliasé `@scoring`) — **le
  contrat de scoring** ("Contrat avec Mohamede"), adossé à une régression
  logistique entraînée sur les 3000 dossiers de Prisca (`../ml/`, ROC-AUC 0.83).
- `../regulatory/computeTEG.mjs` (aliasé `@regulatory`) — **le moteur
  réglementaire** : calcule le TEG d'un crédit et sa conformité à un plafond
  configurable (taux d'usure — valeur par défaut = placeholder à confirmer,
  cf. commentaire en tête du fichier). Déterministe, jamais piloté par le LLM
  (règle d'architecture #2 de Lory). Strictement séparé du calcul de rentabilité.
- `../finance/computeViability.mjs` (aliasé `@finance`) — **le moteur de
  rentabilité** : marge de l'institution sur un crédit (revenus d'intérêts et
  de frais moins coûts de ressources/opérationnels/du risque/technologiques),
  à partir de la probabilité de défaut du dossier (`(100 - score) / 100`).
  Paramètres économiques configurables, tous des placeholders documentés
  (cf. commentaire en tête du fichier). Jamais fusionné avec le TEG.
- `../scoring/applyBusinessGuardrails.mjs` (aliasé `@scoring`) — **garde-fous
  métier** appliqués après le score ML (endettement externe déclaré,
  ancienneté du membre, progressivité du crédit, durée/type de crédit, ratio
  garantie/montant, pertinence saisonnière, croissance des ventes, doublon
  de dossier détecté localement). Ne peut que durcir la décision ou réduire
  le montant recommandé, jamais l'inverse — cf. `PLAN_RISQUE.md`.
- `../scoring/assessDossierQuality.mjs` (aliasé `@scoring`) — **qualité du
  dossier et fiabilité** : complétude (champs suivis réellement renseignés)
  et alertes de cohérence documentées, remplace l'affichage de l'ancien
  champ `confidence` (distance au seuil jamais évaluée statistiquement) —
  cf. `ANALYSE_ARCHITECTURE_LORY_REV2.md`. Jamais une mesure de la
  probabilité que la prédiction soit correcte.
- `src/sync/syncService.js` — file de synchronisation (P1). Ne bloque jamais
  la saisie, conserve les erreurs, permet le retry, évite les doublons (UUID
  stables), état visible (pending/synced/failed). **Utilise un adapter
  simulé (`mockRemoteAdapter`)** en attendant la config Firebase du projet.
- `src/llm/llmClient.js` + `src/llm/fallbackResponder.js` — assistant en
  langage naturel sur le *dossier* (explication reformulée, chatbox), avec
  repli déterministe si le LLM local n'est pas démarré.
- `../rag/corpus.mjs` + `../rag/retrieve.mjs` (aliasés `@rag`) + `src/rag/ragClient.js`
  — assistant RAG sur la *réglementation* (taux d'usure, méthode de calcul
  du TEG, politique de crédit), recherche lexicale sur un petit corpus
  contrôlé, réponse toujours accompagnée de ses sources.
- `src/documents/pdfExtract.js` + `src/llm/extractParamsFromText.js` —
  pipeline d'extraction (PDF → texte, sans modèle ; texte → paramètres
  structurés, via le LLM local) partagé par l'import de dossier scanné et le
  rapport BIC. `src/audio/whisperClient.js` — même pipeline en aval d'une
  transcription audio (`whisper-server`, cf. `PLAN_INTERFACE_DOCUMENTS.md`).
- `src/components/` — formulaire de dossier (avec pré-remplissage optionnel
  depuis un document importé), import de dossier scanné (PDF), entretien
  enregistré (audio), panneau de résultat, **explication de la décision**
  (générée automatiquement, favorable/défavorable + synthèse LLM),
  vérification externe (BIC, facultative, PDF ou saisie manuelle), panneau
  TEG et panneau de rentabilité (moteurs construits, **retirés de
  l'affichage** sur demande — cf. `PLAN_INTERFACE_DOCUMENTS.md` §7),
  assistant réglementaire (RAG), chatbox dossier, sidebar.

## Ce qui est fait

- [x] Application démarrable (`npm run dev`), environnement reproductible
- [x] IndexedDB opérationnelle sans installation manuelle
- [x] Création de dossier (formulaire → IndexedDB)
- [x] Lecture de dossier (historique dans la sidebar)
- [x] Statut de connexion visible (réel — `navigator.onLine`)
- [x] Contrat de scoring défini, intégré, adossé à un modèle entraîné et évalué
- [x] Montant recommandé, décision suggérée, reason codes
- [x] **Moteur TEG** : simulation du crédit, conformité au plafond, affichage séparé du score de risque
- [x] **Moteur de rentabilité** : marge de l'institution, séparée du TEG, persistée dans IndexedDB
- [x] **Garde-fous métier** (P0/P1/P2, cf. `PLAN_RISQUE.md`) appliqués après le score ML
- [x] **Explication de la décision générée automatiquement** après le scoring (pas seulement sur demande dans le chat)
- [x] **Import de dossier scanné (PDF)** : extraction de texte → extraction de paramètres par LLM → pré-remplissage du formulaire → relecture avant validation
- [x] **BIC facultatif** : bouton "Passer cette étape", import du rapport (PDF) ou saisie manuelle, ré-évaluation des garde-fous sans toucher au score ML
- [x] **Entretien audio → transcription → extraction** (code complet, testé avec un micro simulé ; vérification avec un vrai `whisper-server` à faire sur la machine de démo)
- [x] **Interface redessinée** (maquette `../index-light.html`) : thème clair/sombre bascule, cartes avec ombre, onglets Formulaire/Documents/Audio, verdict/facteurs de décision restylés
- [x] Chatbox pour approfondir la décision (avec repli sans LLM)
- [x] **Assistant réglementaire RAG** : corpus contrôlé, recherche lexicale, réponse sourcée, repli sans LLM
- [x] Testé de bout en bout (formulaire → score → TEG → rentabilité → RAG → affichage), y compris
      un scénario hors ligne réel (dossier créé sans connexion, synchronisé
      automatiquement à la reconnexion) et le branchement LLM (vérifié avec
      un faux serveur imitant l'API `llama-server`)

## Ce qui reste (cf. plan de Lory)

Les 4 moteurs métier de l'architecture de Lory sont désormais tous construits.
Ce qui reste :

- Brancher un vrai adapter Firebase (Firestore) à la place de `mockRemoteAdapter`.
- Confirmer la valeur réelle du taux d'usure (plafond TEG) avec Prisca / le
  texte BCEAO applicable, à la place du placeholder actuel (24%).
- Démarrer `llama-server` (et `whisper-server` pour l'audio) avec les
  modèles GGUF/GGML sur la machine de démo — cf. `PLAN_INTERFACE_DOCUMENTS.md` §4.
