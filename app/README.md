# Baraka Score — app (React + SQLite + Firebase)

Implémente l'architecture du "Plan d'architecture & directives Jour J" de Lory :
React + SQLite local (via [sql.js](https://sql.js.org), SQLite compilé en WASM,
aucune installation manuelle requise) + moteur de scoring local + file de
synchronisation vers Firebase.

## Démarrer

```bash
npm install
npm run dev
```

L'app tourne entièrement côté navigateur : la base SQLite est tenue en
mémoire par sql.js et persistée dans `localStorage` après chaque écriture
(clé `baraka_sqlite_db_v1`), donc elle survit aux rechargements et fonctionne
sans connexion.

## Où sont les choses

- `src/db/schema.js` — schéma SQLite. Reprend celui de Lory à l'identique,
  avec un seul ajout additif : `credit_applications.extra_json`, qui porte
  les signaux qualitatifs optionnels (historique de crédit, réputation,
  contexte du secteur) consommés par le scoring. **À valider avec Lory.**
- `src/db/sqlite.js` — couche d'accès (création dossier, lecture, historique,
  file de synchronisation).
- `../scoring/scoreCreditApplication.mjs` (aliasé `@scoring` dans
  `vite.config.js`) — **le contrat de scoring** ("Contrat avec Mohamede",
  section 6). Fonction pure, testée (`node --test` depuis `/scoring`),
  indépendante de React/SQLite/Firebase : `scoreCreditApplication(input) -> output`.
- `src/sync/syncService.js` — file de synchronisation (P1). Respecte les
  règles du plan : ne bloque jamais la saisie, conserve les erreurs, permet
  le retry, évite les doublons (UUID stables), état visible (pending/synced/failed).
  **Utilise un adapter simulé (`mockRemoteAdapter`)** en attendant la config
  Firebase du projet (apiKey, projectId...) — voir les commentaires en tête
  du fichier pour brancher Firestore dès qu'elle est disponible.
- `src/components/` — formulaire de dossier, panneau de résultat, sidebar
  (historique + statut de connexion).

## Ce qui est fait (checklist Jour 1 de Lory)

- [x] Application démarrable (`npm run dev`), environnement reproductible (`package-lock.json`)
- [x] SQLite opérationnelle sans installation manuelle
- [x] Création de dossier (formulaire → SQLite)
- [x] Lecture de dossier (historique dans la sidebar)
- [x] Statut de connexion visible (en ligne/hors ligne, réel — `navigator.onLine`)
- [x] Contrat de scoring défini et intégré
- [x] Testé de bout en bout (formulaire → score → affichage), y compris un
      scénario hors ligne réel (dossier créé sans connexion, synchronisé
      automatiquement à la reconnexion)

## Ce qui reste (P1/P2 selon le plan)

- Brancher un vrai adapter Firebase (Firestore) à la place de `mockRemoteAdapter`
  dès que la config du projet est fournie.
- Historique détaillé par dossier, gestion d'erreurs plus fine, tests
  d'intégration supplémentaires (P2).
- Reprendre le style visuel premium de `index.html` / `index-light.html`
  (actuellement volontairement minimal, cf. directive de Lory : "ne cherchez
  pas la beauté finale ; cherchez le parcours complet minimal").
