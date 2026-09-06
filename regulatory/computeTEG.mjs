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
 * DEFAULT_TAUX_USURE = 24% est désormais une valeur RÉGLEMENTAIRE SOURCÉE,
 * pas un placeholder : la BCEAO a fixé le taux d'usure applicable aux
 * établissements financiers de crédit et aux institutions de microfinance
 * à 24% l'an (TAEG), en vigueur depuis le 1er juin 2026 — abaissé de 27% à
 * 24% par la Décision n°19/29-12-2025/CM/UMOA du Conseil des Ministres de
 * l'UMOA du 31 décembre 2025. Sources (cf. SOURCES_METHODOLOGIE.md, section
 * réglementaire) : BCEAO, "Taux d'usure pour les opérations de crédit des
 * SFD dans la zone UMOA" (bceao.int/fr/documents/taux-dusure-pour-les-
 * operations-de-credit-des-sfd-dans-la-zone-umoa) ; Agence Ecofin, "UMOA :
 * le taux de l'usure pour les institutions de microfinance passe à 24% en
 * juin" (agenceecofin.com). Conformément à la règle #5 de l'architecture
 * ("les paramètres réglementaires sont versionnés et configurables"), ce
 * plafond reste un paramètre (`plafond`) — pas une constante figée en dur
 * dans la logique métier — pour absorber un futur recalibrage BCEAO sans
 * modifier le code.
 */

export const DEFAULT_TAUX_USURE = 0.24 // Taux d'usure BCEAO en vigueur (SFD/IMF), depuis le 01/06/2026 — cf. commentaire ci-dessus

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
 * @returns {{ mensualite:number, teg:number, plafond:number, compliant:boolean, taux_nominal_annuel:number, frais_dossier:number, valide:boolean }}
 */
export function computeTEG(input) {
  const {
    montant_demande,
    duree_mois,
    taux_nominal_annuel_pct,
    frais_dossier,
    plafond,
  } = input ?? {}

  if (!(montant_demande > 0)) throw new TypeError('computeTEG: montant_demande requis (> 0)')
  if (!(duree_mois > 0)) throw new TypeError('computeTEG: duree_mois requis (> 0)')

  // Lory, Architecture Rev.2 section 7 : "Afficher «contrôle non validé» si
  // la règle applicable ou les frais nécessaires ne sont pas renseignés."
  // `valide` distingue "taux/plafond explicitement fournis" de "calculé sur
  // des valeurs par défaut (0%, pas de frais, plafond placeholder)" — un
  // TEG à 0% affiché comme "conforme" serait trompeur si personne n'a en
  // réalité renseigné le taux du crédit.
  const valide = taux_nominal_annuel_pct !== undefined && taux_nominal_annuel_pct !== null && plafond !== undefined && plafond !== null

  const tauxRetenu = taux_nominal_annuel_pct ?? 0
  const fraisRetenus = frais_dossier ?? 0
  const plafondRetenu = plafond ?? DEFAULT_TAUX_USURE

  const tauxMensuelNominal = tauxRetenu / 100 / 12
  const mensualite = monthlyPayment(montant_demande, tauxMensuelNominal, duree_mois)
  const montantPercu = Math.max(0, montant_demande - fraisRetenus)

  const tauxMensuelEffectif = solveMonthlyEffectiveRate(mensualite, duree_mois, montantPercu)
  const teg = Math.pow(1 + tauxMensuelEffectif, 12) - 1

  return {
    mensualite: Math.round(mensualite),
    teg: Math.round(teg * 10000) / 10000,
    valide,
    plafond: plafondRetenu,
    compliant: teg <= plafondRetenu,
    taux_nominal_annuel: tauxRetenu,
    frais_dossier: fraisRetenus,
  }
}
