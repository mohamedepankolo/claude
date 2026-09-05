// Veille employeur/activité — cf. rapport "Veille et corpus multiformat"
// (sept. 2026). Trois idées structurantes reprises du rapport :
// 1. Le score principal n'est JAMAIS modifié automatiquement par une alerte
//    (section 3 : "conserver le score principal existant... pas un second
//    score arbitraire").
// 2. Un même événement peut concerner plusieurs dossiers liés à la même
//    entité (employeur/activité) — d'où la table `entities` séparée plutôt
//    qu'un champ sur le dossier lui-même.
// 3. Le connecteur est synthétique pour l'instant (`@veille/syntheticFeed.mjs`),
//    jamais un vrai appel réseau — cf. `veille/README.md`.
import { v4 as uuid } from 'uuid'
import { db } from './db.js'
import { matchEntityEvents, dedupeByFingerprint } from '@veille/matchEntity.mjs'
import { SYNTHETIC_FEED } from '@veille/syntheticFeed.mjs'

const now = () => new Date().toISOString()

/** Trouve ou crée l'entité (employeur/activité) associée à un dossier, et le lien correspondant. */
export async function ensureDossierEntity(applicationId, { nom, type, secteur, zone }) {
  if (!nom) return null
  let entity = await db.entities.where('nom').equals(nom).first()
  if (!entity) {
    entity = { id: uuid(), nom, type, secteur: secteur ?? null, localite: zone ?? null, created_at: now() }
    await db.entities.add(entity)
  }
  const existingLink = await db.dossier_entity_links
    .where('application_id').equals(applicationId).toArray()
    .then((links) => links.find((l) => l.entity_id === entity.id))
  if (!existingLink) {
    await db.dossier_entity_links.add({ id: uuid(), application_id: applicationId, entity_id: entity.id, created_at: now() })
  }
  return entity
}

/** Tous les dossiers (application_id) liés à une entité — sert au message d'alerte ("N dossiers liés à cet employeur"). */
export async function listApplicationsForEntity(entityId) {
  const links = await db.dossier_entity_links.where('entity_id').equals(entityId).toArray()
  return links.map((l) => l.application_id)
}

/**
 * Lance la veille pour un dossier : rapproche l'entité liée (employeur ou,
 * à défaut, l'activité/secteur du dossier lui-même pour un indépendant) au
 * flux synthétique, dédoublonne, et archive les événements + alertes
 * nouveaux (jamais de doublon si l'événement est déjà connu — cf. rapport,
 * "Robustesse minimale" : "pas de doublon d'événement ou d'alerte après relance").
 * Retourne les alertes créées pour CE dossier (d'autres dossiers liés à la
 * même entité reçoivent aussi une alerte, mais ne sont pas retournés ici).
 */
export async function runVeilleForApplication(applicationId, dossierFields) {
  const nomEntite = dossierFields.employeur_nom || dossierFields.secteur
  const type = dossierFields.employeur_nom ? 'employeur' : 'activite'
  const entity = await ensureDossierEntity(applicationId, {
    nom: nomEntite, type, secteur: dossierFields.secteur, zone: dossierFields.zone,
  })
  if (!entity) return { statut: 'aucun_resultat', alertes: [] }

  const { evenements } = matchEntityEvents({ nom: entity.nom, secteur: entity.secteur, zone: entity.localite }, SYNTHETIC_FEED)
  const deduped = dedupeByFingerprint(evenements)
  if (deduped.length === 0) return { statut: 'aucun_resultat', alertes: [] }

  const dossierIds = await listApplicationsForEntity(entity.id)
  const alertesCreees = []

  for (const ev of deduped) {
    let evenementRow = await db.veille_evenements.where('empreinte').equals(ev.empreinte).first()
    if (!evenementRow) {
      evenementRow = {
        id: uuid(), entity_id: entity.id, empreinte: ev.empreinte, type: ev.type,
        date_evenement: ev.date_evenement, date_publication: ev.date_publication,
        extrait: ev.extrait, source_titre: ev.source_titre, nb_reprises: ev.nb_reprises,
        qualite_rapprochement: ev.qualite_rapprochement, created_at: now(),
      }
      await db.veille_evenements.add(evenementRow)
    }
    // Une alerte par (événement, dossier concerné) — jamais de doublon si déjà créée.
    for (const dossierId of dossierIds) {
      const dejaAlerte = await db.veille_alertes
        .where('evenement_id').equals(evenementRow.id).toArray()
        .then((rows) => rows.find((r) => r.application_id === dossierId))
      if (dejaAlerte) continue
      const alerte = {
        id: uuid(), evenement_id: evenementRow.id, application_id: dossierId,
        statut: 'a_verifier', motif: null, auteur: null, created_at: now(), updated_at: now(),
      }
      await db.veille_alertes.add(alerte)
      if (dossierId === applicationId) alertesCreees.push({ ...alerte, evenement: evenementRow, entity, dossiers_lies: dossierIds.length })
    }
  }
  return { statut: 'trouve', alertes: alertesCreees }
}

/** Liste les alertes d'un dossier, avec leur événement, plus récentes en premier. */
export async function listAlertesForApplication(applicationId) {
  const alertes = await db.veille_alertes.where('application_id').equals(applicationId).toArray()
  const evenements = await db.veille_evenements.toArray()
  const evenementById = Object.fromEntries(evenements.map((e) => [e.id, e]))
  return alertes
    .map((a) => ({ ...a, evenement: evenementById[a.evenement_id] ?? null }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

/**
 * Revue humaine d'une alerte (rapport, section 3 : "à vérifier, confirmé
 * pertinent, écarté, dossier actualisé") — trace l'auteur et le motif,
 * jamais de modification automatique du score associé.
 */
export async function updateAlerteStatut(alerteId, statut, motif, auteur = 'agent') {
  await db.veille_alertes.update(alerteId, { statut, motif: motif ?? null, auteur, updated_at: now() })
}
