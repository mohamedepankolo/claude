/**
 * Baraka Score — contrôle qualité en amont et abstention
 *
 * Implémente la notion d'abstention du document de cadrage de Lory
 * (DigiCoopWA 2026, Architecture/Business Model/MVP, Révision 2, section 3) :
 * *"Lorsque des informations critiques manquent ou que le dossier sort du
 * domaine prévu, le système demande une revue humaine ou un complément. Un
 * contrôle de qualité peut bloquer l'analyse, même si le moteur serait
 * techniquement capable de produire un nombre."*
 *
 * Appelé AVANT `scoreCreditApplication` — si `abstention` est vrai, le
 * scoring ne doit PAS être lancé (certains champs critiques manquants
 * feraient d'ailleurs lever une erreur au contrat de scoring, ou produiraient
 * un chiffre sur un dossier hors du domaine que le modèle a appris).
 * Fonction pure, déterministe, sans LLM — mêmes principes que les autres
 * moteurs du projet.
 */

// Sans ces champs, le contrat de scoring ne peut techniquement pas
// s'exécuter (application_id/secteur) ou produirait un chiffre dénué de
// sens (montant/CA/durée nuls ou absents).
export const CHAMPS_CRITIQUES = [
  ['montant_demande', 'Montant demandé'],
  ['chiffre_affaires', "Chiffre d'affaires mensuel"],
  ['secteur', "Secteur d'activité"],
  ['duree_mois', 'Durée du crédit'],
]

// Secteurs couverts par le modèle entraîné (cf. scoring/model.js, ml/METRICS.md).
const SECTEURS_CONNUS = new Set([
  'commerce_detail', 'vente_vivres', 'quincaillerie_materiaux', 'services', 'artisanat', 'agriculture',
])

// Financement possible seulement à partir de 6 mois d'ancienneté d'activité
// (règle métier validée par Prisca, cf. data/README.md) — en-dessous, le
// dossier est hors du domaine que le modèle a appris à évaluer.
const ANCIENNETE_MIN_MOIS = 6

/**
 * @param {Object} input Les champs bruts du dossier, avant tout appel à scoreCreditApplication.
 * @returns {{ abstention: boolean, motifs: string[] }}
 */
export function checkAbstention(input) {
  if (!input || typeof input !== 'object') throw new TypeError('checkAbstention: input object required')

  const motifs = []
  const isMissing = (v) => v === null || v === undefined || v === ''

  for (const [key, label] of CHAMPS_CRITIQUES) {
    const v = input[key]
    const invalideNumerique = typeof v === 'number' && !(v > 0)
    if (isMissing(v) || invalideNumerique) {
      motifs.push(`${label} manquant ou invalide — indispensable pour évaluer le dossier.`)
    }
  }

  if (input.secteur && !SECTEURS_CONNUS.has(input.secteur)) {
    motifs.push(`Secteur "${input.secteur}" non couvert par le modèle entraîné.`)
  }
  if (typeof input.anciennete_activite_mois === 'number' && input.anciennete_activite_mois < ANCIENNETE_MIN_MOIS) {
    motifs.push(`Ancienneté de l'activité (${input.anciennete_activite_mois} mois) sous le seuil finançable de ${ANCIENNETE_MIN_MOIS} mois — hors du domaine couvert par le modèle, pas seulement un facteur défavorable.`)
  }

  return { abstention: motifs.length > 0, motifs }
}
