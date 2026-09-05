// Couche d'accès aux données — IndexedDB (Dexie). Toutes les fonctions sont
// asynchrones (API native de Dexie/IndexedDB). Contrairement à la version
// sql.js précédente, IndexedDB stocke des objets structurés directement :
// plus besoin de JSON.stringify/parse pour `explanations`/`narrative`.
import { v4 as uuid } from 'uuid'
import { db } from './db.js'

const now = () => new Date().toISOString()

async function enqueueSync(entityType, entityId, operation) {
  await db.sync_queue.add({
    id: uuid(), entity_type: entityType, entity_id: entityId, operation,
    status: 'pending', attempts: 0, last_error: null, created_at: now(), updated_at: now(),
  })
}

/** Crée un client s'il n'existe pas déjà sous ce nom, retourne son id. */
export async function ensureClient(name) {
  const existing = await db.clients.where('name').equals(name).first()
  if (existing) return existing.id
  const id = uuid()
  await db.clients.add({ id, name, created_at: now(), updated_at: now() })
  return id
}

const APPLICATION_FIELDS = [
  'genre', 'age', 'zone', 'secteur', 'informel', 'personnes_a_charge', 'anciennete_activite_mois',
  'chiffre_affaires', 'charges_activite', 'revenu_activite', 'flux_tresorerie_net', 'charges_perso',
  'montant_demande', 'duree_mois', 'epargne_mensuelle', 'regularite_epargne', 'participe_tontine',
  'regularite_tontine', 'a_historique', 'nb_credits_anterieurs', 'nb_retards', 'deja_impaye',
  'a_caution', 'capacite_caution', 'score_reputation',
  // Garde-fous métier (PLAN_RISQUE.md, P0/P1) — jamais transmis au modèle ML,
  // consommés uniquement par @scoring/applyBusinessGuardrails.
  'anciennete_membre_mois', 'endettement_externe_declare', 'montant_dernier_credit',
  'type_credit', 'type_garantie', 'valeur_garantie', 'pertinence_saisonniere', 'croissance_ventes_pct',
]

/** Crée un dossier de demande de crédit. Retourne l'id (UUID) du dossier créé. */
export async function createApplication({ clientName, ...fields }) {
  const clientId = await ensureClient(clientName)
  const id = uuid()
  const row = { id, client_id: clientId, created_at: now(), updated_at: now(), sync_status: 'pending' }
  for (const f of APPLICATION_FIELDS) row[f] = fields[f] ?? null
  await db.credit_applications.add(row)
  await enqueueSync('credit_applications', id, 'create')
  return id
}

/**
 * Détecte si ce client a déjà un autre dossier existant (P2 — proxy local de
 * la vérification BIC/multi-agences décrite dans PLAN_RISQUE.md : ceci ne
 * couvre que ce navigateur/cette base locale, pas une vraie interconnexion
 * multi-agences ni le Bureau d'Information sur le Crédit).
 */
export async function hasOtherApplicationForClient(clientName, excludeApplicationId) {
  const client = await db.clients.where('name').equals(clientName).first()
  if (!client) return false
  const apps = await db.credit_applications.where('client_id').equals(client.id).toArray()
  return apps.some((a) => a.id !== excludeApplicationId)
}

/** Archive une vérification d'endettement externe (P2 — "bibliothèque BIC" recommandée par Prisca). */
export async function addExternalCreditCheck(applicationId, { source, montant_declare, commentaire }) {
  const id = uuid()
  await db.external_credit_checks.add({
    id, application_id: applicationId, source, montant_declare: montant_declare ?? 0,
    commentaire: commentaire ?? '', created_at: now(),
  })
  return id
}

/** Liste les vérifications externes archivées pour un dossier, plus récentes en premier. */
export async function listExternalCreditChecks(applicationId) {
  const rows = await db.external_credit_checks.where('application_id').equals(applicationId).toArray()
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

/** Enregistre le résultat du scoring (contrat @scoring/scoreCreditApplication) pour un dossier. */
export async function saveScoreAndDecision(applicationId, result) {
  const scoreId = uuid()
  await db.credit_scores.add({
    id: scoreId, application_id: applicationId,
    score: result.score, risk_level: result.risk_level, confidence: result.confidence,
    recommended_amount: result.recommended_amount, explanations: result.explanations,
    narrative: result.narrative ?? [], created_at: now(),
  })
  const decisionId = uuid()
  await db.credit_decisions.add({
    id: decisionId, application_id: applicationId, decision: result.decision,
    reason: result.narrative?.[0] ?? null, agent_override: null,
    guardrails: result.guardrails ?? [], created_at: now(),
  })
  await enqueueSync('credit_scores', scoreId, 'create')
  await enqueueSync('credit_decisions', decisionId, 'create')
}

/** Enregistre le résultat du moteur réglementaire (TEG) pour un dossier — cf. @regulatory/computeTEG. */
export async function saveRegulatoryResult(applicationId, regResult) {
  const id = uuid()
  await db.regulatory_results.add({
    id, application_id: applicationId,
    teg: regResult.teg, plafond: regResult.plafond, compliant: regResult.compliant,
    taux_nominal_annuel: regResult.taux_nominal_annuel, frais_dossier: regResult.frais_dossier,
    mensualite: regResult.mensualite, created_at: now(),
  })
  await enqueueSync('regulatory_results', id, 'create')
  return id
}

/** Enregistre le résultat du moteur de rentabilité pour un dossier — cf. @finance/computeViability. */
export async function saveViabilityResult(applicationId, viabilityResult) {
  const id = uuid()
  await db.viability_results.add({
    id, application_id: applicationId,
    revenus: viabilityResult.revenus, couts: viabilityResult.couts, marge: viabilityResult.marge,
    marge_pct: viabilityResult.marge_pct, viable: viabilityResult.viable,
    detail: viabilityResult.detail, params: viabilityResult.params, created_at: now(),
  })
  await enqueueSync('viability_results', id, 'create')
  return id
}

/** Liste les dossiers avec leur dernier score/décision connus, du plus récent au plus ancien. */
export async function listApplications() {
  const [apps, clients, scores, decisions] = await Promise.all([
    db.credit_applications.orderBy('created_at').reverse().toArray(),
    db.clients.toArray(),
    db.credit_scores.toArray(),
    db.credit_decisions.toArray(),
  ])
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]))
  // Trie par date croissante avant de construire les maps : une ré-évaluation
  // (cf. ExternalChecksPanel "Archiver et relancer l'évaluation") ajoute une
  // nouvelle ligne plutôt que d'écraser l'ancienne — on veut ici la plus
  // récente, jamais un ordre arbitraire de lecture IndexedDB.
  const byCreatedAtAsc = (a, b) => (a.created_at < b.created_at ? -1 : 1)
  const scoreByApp = Object.fromEntries([...scores].sort(byCreatedAtAsc).map((s) => [s.application_id, s]))
  const decisionByApp = Object.fromEntries([...decisions].sort(byCreatedAtAsc).map((d) => [d.application_id, d]))

  return apps.map((a) => ({
    ...a,
    client_name: clientById[a.client_id]?.name ?? '—',
    score: scoreByApp[a.id]?.score,
    risk_level: scoreByApp[a.id]?.risk_level,
    confidence: scoreByApp[a.id]?.confidence,
    recommended_amount: scoreByApp[a.id]?.recommended_amount,
    decision: decisionByApp[a.id]?.decision,
  }))
}

// Dexie's `.last()` on a `.where(field).equals(...)` query orders by primary
// key (a random UUID here), NOT by insertion time — harmless while there was
// only ever one row per application, but wrong now that a dossier can be
// re-scored (cf. ExternalChecksPanel "relancer l'évaluation") or a TEG/
// viability simulation resubmitted. Sort by `created_at` explicitly instead.
async function mostRecent(table, applicationId) {
  const rows = await table.where('application_id').equals(applicationId).sortBy('created_at')
  return rows.length ? rows[rows.length - 1] : undefined
}

/** Récupère un dossier complet (application + client + score + décision + résultat réglementaire). */
export async function getApplication(applicationId) {
  const app = await db.credit_applications.get(applicationId)
  if (!app) return null
  const [client, score, decision, regulatory, viability] = await Promise.all([
    db.clients.get(app.client_id),
    mostRecent(db.credit_scores, applicationId),
    mostRecent(db.credit_decisions, applicationId),
    mostRecent(db.regulatory_results, applicationId),
    mostRecent(db.viability_results, applicationId),
  ])
  return {
    ...app,
    client_name: client?.name ?? '—',
    score: score?.score, risk_level: score?.risk_level, confidence: score?.confidence,
    recommended_amount: score?.recommended_amount, explanations: score?.explanations ?? [],
    narrative: score?.narrative ?? [],
    decision: decision?.decision, reason: decision?.reason, guardrails: decision?.guardrails ?? [],
    regulatory: regulatory ?? null,
    viability: viability ?? null,
  }
}

export async function listSyncQueue(status) {
  return status
    ? db.sync_queue.where('status').equals(status).sortBy('created_at')
    : db.sync_queue.orderBy('created_at').toArray()
}

export async function markSyncQueueItem(id, status, error) {
  const item = await db.sync_queue.get(id)
  await db.sync_queue.update(id, {
    status, last_error: error ?? null, updated_at: now(),
    attempts: (item?.attempts ?? 0) + 1,
  })
}

export async function markApplicationSynced(applicationId, status) {
  await db.credit_applications.update(applicationId, { sync_status: status, updated_at: now() })
}
