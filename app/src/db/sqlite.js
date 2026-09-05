// Couche SQLite locale (sql.js = SQLite compilé en WASM, exécuté dans le
// navigateur — aucune installation manuelle par l'agent, conforme à la
// checklist de Lory). La base est tenue en mémoire par sql.js et persistée
// dans localStorage après chaque écriture, afin de survivre aux rechargements
// et de fonctionner entièrement hors ligne.
import initSqlJs from 'sql.js'
import { v4 as uuid } from 'uuid'
import { SCHEMA_SQL } from './schema.js'

// v2 : les colonnes de credit_applications sont passées aux variables
// réelles validées par Prisca (cf. schema.js) — on change de clé de
// stockage pour ne pas tenter de recharger une base v1 incompatible.
const STORAGE_KEY = 'baraka_sqlite_db_v2'
const now = () => new Date().toISOString()

let SQL = null

function persist(db) {
  const bytes = db.export()
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  localStorage.setItem(STORAGE_KEY, btoa(binary))
}

function loadPersisted() {
  const b64 = localStorage.getItem(STORAGE_KEY)
  if (!b64) return null
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function initDb() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  }
  const existing = loadPersisted()
  const db = existing ? new SQL.Database(existing) : new SQL.Database()
  db.run(SCHEMA_SQL)
  persist(db)
  return db
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function enqueueSync(db, entityType, entityId, operation) {
  db.run(
    `INSERT INTO sync_queue (id, entity_type, entity_id, operation, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [uuid(), entityType, entityId, operation, now(), now()]
  )
}

/** Crée un client s'il n'existe pas déjà sous ce nom, retourne son id. */
export function ensureClient(db, name) {
  const existing = queryAll(db, 'SELECT id FROM clients WHERE name = ? LIMIT 1', [name])
  if (existing.length) return existing[0].id
  const id = uuid()
  db.run('INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, name, now(), now()])
  persist(db)
  return id
}

const APPLICATION_FIELDS = [
  'genre', 'age', 'zone', 'secteur', 'informel', 'personnes_a_charge', 'anciennete_activite_mois',
  'chiffre_affaires', 'charges_activite', 'revenu_activite', 'flux_tresorerie_net', 'charges_perso',
  'montant_demande', 'duree_mois', 'epargne_mensuelle', 'regularite_epargne', 'participe_tontine',
  'regularite_tontine', 'a_historique', 'nb_credits_anterieurs', 'nb_retards', 'deja_impaye',
  'a_caution', 'capacite_caution', 'score_reputation',
]

/**
 * Crée un dossier de demande de crédit. `fields` porte les variables du
 * contrat de scoring (cf. scoring/scoreCreditApplication.mjs) ; `clientName`
 * et `genre` sont gérés à part (le second n'est jamais transmis au scoring).
 * Retourne l'id (UUID) du dossier créé.
 */
export function createApplication(db, { clientName, ...fields }) {
  const clientId = ensureClient(db, clientName)
  const id = uuid()
  const cols = ['id', 'client_id', ...APPLICATION_FIELDS, 'created_at', 'updated_at', 'sync_status']
  const values = [
    id, clientId,
    ...APPLICATION_FIELDS.map((f) => fields[f] ?? null),
    now(), now(), 'pending',
  ]
  db.run(
    `INSERT INTO credit_applications (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    values
  )
  enqueueSync(db, 'credit_applications', id, 'create')
  persist(db)
  return id
}

/** Enregistre le résultat du scoring (contrat @scoring/scoreCreditApplication) pour un dossier. */
export function saveScoreAndDecision(db, applicationId, result) {
  const scoreId = uuid()
  db.run(
    `INSERT INTO credit_scores (id, application_id, score, risk_level, confidence, recommended_amount, explanations, narrative, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [scoreId, applicationId, result.score, result.risk_level, result.confidence, result.recommended_amount, JSON.stringify(result.explanations), JSON.stringify(result.narrative ?? []), now()]
  )
  const decisionId = uuid()
  db.run(
    `INSERT INTO credit_decisions (id, application_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
    [decisionId, applicationId, result.decision, result.narrative?.[0] ?? null, now()]
  )
  enqueueSync(db, 'credit_scores', scoreId, 'create')
  enqueueSync(db, 'credit_decisions', decisionId, 'create')
  persist(db)
}

/** Liste les dossiers avec leur dernier score/décision connus, du plus récent au plus ancien. */
export function listApplications(db) {
  return queryAll(db, `
    SELECT
      a.id, a.montant_demande, a.duree_mois, a.secteur, a.created_at, a.sync_status,
      c.name AS client_name,
      s.score, s.risk_level, s.confidence, s.recommended_amount,
      d.decision
    FROM credit_applications a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN credit_scores s ON s.application_id = a.id
    LEFT JOIN credit_decisions d ON d.application_id = a.id
    ORDER BY a.created_at DESC
  `)
}

/** Récupère un dossier complet (application + score + décision + explications parsées). */
export function getApplication(db, applicationId) {
  const rows = queryAll(db, `
    SELECT
      a.*, c.name AS client_name,
      s.score, s.risk_level, s.confidence, s.recommended_amount, s.explanations, s.narrative,
      d.decision, d.reason
    FROM credit_applications a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN credit_scores s ON s.application_id = a.id
    LEFT JOIN credit_decisions d ON d.application_id = a.id
    WHERE a.id = ?
  `, [applicationId])
  if (!rows.length) return null
  const row = rows[0]
  return {
    ...row,
    explanations: row.explanations ? JSON.parse(row.explanations) : [],
    narrative: row.narrative ? JSON.parse(row.narrative) : [],
  }
}

export function listSyncQueue(db, status) {
  return status
    ? queryAll(db, 'SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at', [status])
    : queryAll(db, 'SELECT * FROM sync_queue ORDER BY created_at')
}

export function markSyncQueueItem(db, id, status, error) {
  db.run(
    'UPDATE sync_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?',
    [status, error ?? null, now(), id]
  )
  persist(db)
}

export function markApplicationSynced(db, applicationId, status) {
  db.run('UPDATE credit_applications SET sync_status = ?, updated_at = ? WHERE id = ?', [status, now(), applicationId])
  persist(db)
}
