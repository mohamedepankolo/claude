# Baraka Score — app (React + SQLite + Firebase + LLM local)

Implémente l'architecture du "Plan d'architecture & directives Jour J" de Lory :
React + SQLite local (via [sql.js](https://sql.js.org), SQLite compilé en WASM,
aucune installation manuelle requise) + moteur de scoring entraîné + file de
synchronisation vers Firebase + assistant en langage naturel local (optionnel).
Vue d'ensemble complète : `../ARCHITECTURE.md`.

## Démarrer

```bash
npm install
npm run dev
```

L'app tourne entièrement côté navigateur : la base SQLite est tenue en
mémoire par sql.js et persistée dans `localStorage` après chaque écriture
(clé `baraka_sqlite_db_v2`), donc elle survit aux rechargements et fonctionne
sans connexion.

Pour activer l'assistant en langage naturel (optionnel, cf. `../llm/README.md`) :
copier `.env.example` en `.env.local` et démarrer `llama-server` en local.
Sans lui, le chat et les explications fonctionnent quand même (repli par règles).

## Où sont les choses

- `src/db/schema.js` — schéma SQLite (reprend celui de Lory), colonnes de
  `credit_applications` alignées sur les variables réelles validées par
  Prisca (`chiffre_affaires`, `charges_activite`, `regularite_tontine`,
  `score_reputation`...) plutôt que sur des noms génériques provisoires.
  `genre` est stocké (audit d'équité) mais jamais transmis au scoring.
- `src/db/sqlite.js` — couche d'accès (création dossier, lecture, historique,
  file de synchronisation).
- `../scoring/scoreCreditApplication.mjs` (aliasé `@scoring` dans
  `vite.config.js`) — **le contrat de scoring** ("Contrat avec Mohamede",
  section 6), désormais adossé à une régression logistique entraînée sur les
  3000 dossiers de Prisca (`../ml/`, ROC-AUC 0.83). Fonction pure, testée
  (`node --test` depuis `/scoring`), indépendante de React/SQLite/Firebase.
- `src/sync/syncService.js` — file de synchronisation (P1). Respecte les
  règles du plan : ne bloque jamais la saisie, conserve les erreurs, permet
  le retry, évite les doublons (UUID stables), état visible (pending/synced/failed).
  **Utilise un adapter simulé (`mockRemoteAdapter`)** en attendant la config
  Firebase du projet (apiKey, projectId...) — voir les commentaires en tête
  du fichier pour brancher Firestore dès qu'elle est disponible.
- `src/llm/llmClient.js` + `src/llm/fallbackResponder.js` — assistant en
  langage naturel (explication reformulée, chatbox). Utilise un LLM local
  (Mistral 7B GGUF via `llama-server`, cf. `../llm/README.md`) s'il est
  disponible, sinon retombe sur des règles qui recalculent de vraies
  simulations via le contrat de scoring (jamais de texte inventé).
- `src/components/` — formulaire de dossier, panneau de résultat, chatbox,
  sidebar (historique + statut de connexion).

## Ce qui est fait (checklist Jour 1 et Jour 2 de Lory)

- [x] Application démarrable (`npm run dev`), environnement reproductible (`package-lock.json`)
- [x] SQLite opérationnelle sans installation manuelle
- [x] Création de dossier (formulaire → SQLite)
- [x] Lecture de dossier (historique dans la sidebar)
- [x] Statut de connexion visible (en ligne/hors ligne, réel — `navigator.onLine`)
- [x] Contrat de scoring défini, intégré, **adossé à un modèle entraîné et évalué**
- [x] Explications, montant recommandé, décision suggérée
- [x] Chatbox pour approfondir la décision (avec repli sans LLM)
- [x] Testé de bout en bout (formulaire → score → affichage), y compris un
      scénario hors ligne réel (dossier créé sans connexion, synchronisé
      automatiquement à la reconnexion)

## Ce qui reste (P1/P2 selon le plan)

- Brancher un vrai adapter Firebase (Firestore) à la place de `mockRemoteAdapter`
  dès que la config du projet est fournie.
- Démarrer `llama-server` avec le modèle GGUF sur la machine de démo et
  mesurer le temps de réponse réel (cf. `../llm/README.md`).
- Historique détaillé par dossier, gestion d'erreurs plus fine, tests
  d'intégration supplémentaires (P2).
- Reprendre le style visuel de `index-light.html` (choisi par l'équipe) dans
  l'app React (actuellement volontairement minimal, cf. directive de Lory :
  "ne cherchez pas la beauté finale ; cherchez le parcours complet minimal").
