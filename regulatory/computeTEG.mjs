/**
 * Baraka Score — moteur réglementaire (TEG)
 *
 * Calcule le Taux Effectif Global d'un crédit (le coût réel annualisé,
 * intérêts + frais compris) et vérifie sa conformité par rapport à un
 * plafond légal (taux d'usure). Fonction pure, déterministe, sans LLM.
 *
 * Séparation stricte avec le RAG (cf. ARCHITECTURE de Lory, section 5 et
 * règle #2) : le RAG peut expliquer *pourquoi* un taux d'usure s'applique et
 * citer sa source, mais seul ce moteur calcule et décide de la conformité.
 * TEG et rentabilité (voir @finance/computeViability) restent deux sorties
 * séparées : un coût interne (serveur, LLM, personnel) ne doit jamais être
 * ajouté ici.
 *
 * ⚠️ DEFAULT_TAUX_USURE ci-dessous est un PLACEHOLDER (24%), pas une valeur
 * réglementaire vérifiée. Conformément à la règle #5 de l'architecture
 * ("les paramètres réglementaires sont versionnés et configurables"), le
 * plafond réel doit être fourni explicitement (`plafond`) dès qu'il est
 * confirmé par Prisca / le texte BCEAO applicable.
 */

export const DEFAULT_TAUX_USURE = 0.24 // PLACEHOLDER — à confirmer, voir le commentaire ci-dessus

/**
 * Mensualité d'un prêt amorti à mensualités constantes. Exportée pour être
 * réutilisée par @finance/computeViability (même hypothèse d'amortissement,
 * cohérence entre le TEG et l'estimation de rentabilité) — les deux moteurs
 * restent néanmoins des sorties séparées, jamais fusionnées.
 */
export function monthlyPayment(principal, monthlyRate, n) {
  if (monthlyRate === 0) return principal / n
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
}

function presentValue(payment, monthlyRate, n) {
  if (monthlyRate === 0) return payment * n
  return (payment * (1 - Math.pow(1 + monthlyRate, -n))) / monthlyRate
}

/**
 * Résout par bissection le taux mensuel effectif i tel que :
 *   montant_percu = Σ_{k=1..n} mensualité / (1+i)^k
 * La valeur actuelle est strictement décroissante en i, la convergence est
 * donc garantie sur un encadrement large.
 */
function solveMonthlyEffectiveRate(payment, n, amountReceived) {
  let lo = 0
  let hi = 5 // 500%/mois : borne volontairement très large pour rester valide sur des cas extrêmes
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    const pv = presentValue(payment, mid, n)
    if (pv > amountReceived) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * @param {Object} input
 * @param {number} input.montant_demande          Montant du crédit, FCFA
 * @param {number} input.duree_mois                Durée, mois
 * @param {number} [input.taux_nominal_annuel_pct]  Taux d'intérêt nominal annuel déclaré, en % (ex. 18 pour 18%)
 * @param {number} [input.frais_dossier]            Frais/commissions prélevés à l'octroi, FCFA
 * @param {number} [input.plafond]                  Taux d'usure applicable, fraction (ex. 0.24) — sinon DEFAULT_TAUX_USURE
 * @returns {{ mensualite:number, teg:number, plafond:number, compliant:boolean, taux_nominal_annuel:number, frais_dossier:number }}
 */
export function computeTEG(input) {
  const {
    montant_demande,
    duree_mois,
    taux_nominal_annuel_pct = 0,
    frais_dossier = 0,
    plafond = DEFAULT_TAUX_USURE,
  } = input ?? {}

  if (!(montant_demande > 0)) throw new TypeError('computeTEG: montant_demande requis (> 0)')
  if (!(duree_mois > 0)) throw new TypeError('computeTEG: duree_mois requis (> 0)')

  const tauxMensuelNominal = taux_nominal_annuel_pct / 100 / 12
  const mensualite = monthlyPayment(montant_demande, tauxMensuelNominal, duree_mois)
  const montantPercu = Math.max(0, montant_demande - frais_dossier)

  const tauxMensuelEffectif = solveMonthlyEffectiveRate(mensualite, duree_mois, montantPercu)
  const teg = Math.pow(1 + tauxMensuelEffectif, 12) - 1

  return {
    mensualite: Math.round(mensualite),
    teg: Math.round(teg * 10000) / 10000,
    plafond,
    compliant: teg <= plafond,
    taux_nominal_annuel: taux_nominal_annuel_pct,
    frais_dossier,
  }
}
