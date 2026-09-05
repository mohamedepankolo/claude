// Base locale — IndexedDB via Dexie, comme spécifié dans l'architecture de
// Lory ("Architecture technique, réglementaire & business model", section 2).
// Remplace la première version (sql.js/SQLite en WASM) : IndexedDB est natif
// du navigateur, persistant sans étape d'export manuel, et c'est le choix
// que Lory a arrêté pour le MVP.
import Dexie from 'dexie'

export const db = new Dexie('baraka_score_db_v1')

db.version(1).stores({
  clients: 'id, name',
  credit_applications: 'id, client_id, sync_status, created_at',
  credit_scores: 'id, application_id, created_at',
  credit_decisions: 'id, application_id, created_at',
  regulatory_results: 'id, application_id, created_at',
  sync_queue: 'id, status, entity_type, created_at',
})

// v2 : ajout du résultat du 4ᵉ moteur (Profitability/Viability Engine),
// séparé de `regulatory_results` par principe (TEG ≠ rentabilité).
db.version(2).stores({
  viability_results: 'id, application_id, created_at',
})

// v3 : garde-fous métier (cf. PLAN_RISQUE.md, P0/P1/P2) — `external_credit_checks`
// est la "bibliothèque" recommandée par Prisca pour archiver les vérifications
// d'endettement externe (proxy du rapport de solvabilité BIC en l'absence
// d'intégration réelle à l'API du Bureau d'Information sur le Crédit).
db.version(3).stores({
  external_credit_checks: 'id, application_id, created_at',
})
