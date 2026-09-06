/**
 * Baraka Score — qualité du dossier et fiabilité
 *
 * Implémente les notions "Qualité du dossier" et "Fiabilité et limites" du
 * document de cadrage de Lory (DigiCoopWA 2026, Architecture/Business
 * Model/MVP, Révision 2, section 3) : une mesure de complétude/cohérence
 * calculée à partir de règles documentées, explicitement PAS une mesure de
 * la probabilité que la prédiction du modèle soit correcte — un dossier
 * peut être complet et cohérent tout en restant risqué (cf. section 2,
 * "dossier complet mais risqué").
 *
 * Remplace l'ancien champ `confidence` de `scoreCreditApplication` (une
 * distance géométrique au seuil de décision, jamais évaluée
 * statistiquement) — cf. ANALYSE_ARCHITECTURE_LORY_REV2.md : la révision de
 * Lory dit explicitement remplacer "les pourcentages de confiance non
 * définis" et exige qu'aucun pourcentage global ne soit affiché "sans
 * méthode justifiée". La méthode ici est volontairement simple et
 * documentée ligne par ligne plutôt qu'un indice composite opaque.
 *
 * Fonction pure, déterministe, sans LLM — même principe que les autres
 * moteurs du projet (scoring, TEG, viabilité, garde-fous).
 */

// Champs dont l'absence est détectable (le formulaire transmet `null`
// quand le champ est resté vide plutôt qu'une valeur par défaut muette —
// cf. DossierForm.jsx). Poids égal pour chacun, volontairement simple.
export const CHAMPS_SUIVIS = [
  ['age', 'Âge du demandeur'],
  ['personnes_a_charge', 'Personnes à charge'],
  ['capacite_caution', 'Solidité de la caution'],
  ['anciennete_membre_mois', "Ancienneté du membre dans l'institution"],
  ['montant_dernier_credit', 'Montant du dernier crédit'],
  ['endettement_externe_declare', 'Endettement externe déclaré'],
  ['valeur_garantie', 'Valeur de la garantie'],
  ['croissance_ventes_pct', 'Croissance des ventes déclarée'],
]

// Secteurs peu représentés dans le jeu d'entraînement (cf. ml/METRICS.md :
// commerce_detail domine largement les 3000 dossiers synthétiques) — le
// score y est statistiquement moins éprouvé, pas nécessairement moins bon.
const SECTEURS_SOUS_REPRESENTES = new Set(['agriculture', 'artisanat'])

const PENALITE_PAR_ALERTE = 5

/**
 * @param {Object} input Les champs bruts du dossier (avant les valeurs par défaut internes du scoring).
 * @returns {{ qualite_pct: number, champs_manquants: string[], alertes: string[] }}
 */
export function assessDossierQuality(input) {
  if (!input || typeof input !== 'object') throw new TypeError('assessDossierQuality: input object required')

  const isMissing = (v) => v === null || v === undefined || v === ''
  const champs_manquants = CHAMPS_SUIVIS.filter(([key]) => isMissing(input[key])).map(([, label]) => label)

  const alertes = []
  const benefice_activite = input.benefice_activite ?? Math.max(0, (input.chiffre_affaires ?? 0) - (input.charges_activite ?? 0))

  if (!(benefice_activite > 0)) {
    alertes.push('Bénéfice mensuel déclaré nul ou négatif — la capacité de remboursement ne peut pas être évaluée de façon fiable.')
  }
  if (input.montant_demande > 0 && benefice_activite > 0 && input.montant_demande > 50 * benefice_activite) {
    alertes.push('Montant demandé très supérieur au bénéfice mensuel déclaré (plus de 50x) — vérifier la cohérence du dossier.')
  }
  if (typeof input.anciennete_activite_mois === 'number' && input.anciennete_activite_mois < 6) {
    alertes.push("Ancienneté de l'activité sous le seuil finançable (6 mois).")
  }
  if (typeof input.duree_mois === 'number' && (input.duree_mois < 6 || input.duree_mois > 48)) {
    alertes.push('Durée du crédit hors de la plage usuelle du modèle (6 à 48 mois).')
  }
  if (SECTEURS_SOUS_REPRESENTES.has(input.secteur)) {
    alertes.push(`Secteur "${input.secteur}" peu représenté dans les données d'entraînement (cf. ml/METRICS.md) — le score y est statistiquement moins éprouvé.`)
  }

  // Complétude : proportion des champs suivis réellement renseignés (sur
  // 100), moins une pénalité fixe par alerte de cohérence, plancher à 0.
  const completude = CHAMPS_SUIVIS.length > 0
    ? 100 * (1 - champs_manquants.length / CHAMPS_SUIVIS.length)
    : 100
  const qualite_pct = Math.max(0, Math.round(completude - alertes.length * PENALITE_PAR_ALERTE))

  return { qualite_pct, champs_manquants, alertes }
}
