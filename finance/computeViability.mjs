/**
 * Baraka Score — moteur de rentabilité (Profitability/Viability Engine)
 *
 * 4ᵉ et dernier moteur de l'architecture de Lory (section 4) : estime la
 * marge de l'institution sur un crédit donné (revenus d'intérêts et de
 * frais, moins les coûts de ressources, opérationnels, du risque et
 * technologiques). Fonction pure, déterministe, sans LLM.
 *
 * Séparation stricte avec @regulatory/computeTEG (règle non négociable de
 * l'architecture, section 4 : "TEG ≠ rentabilité") :
 *   - le TEG mesure ce que le CLIENT paie et sa conformité légale ;
 *   - ce moteur mesure ce que l'INSTITUTION gagne ou perd.
 * Un coût interne (LLM, serveur, personnel) ne doit JAMAIS être injecté dans
 * le calcul du TEG, et le plafond réglementaire ne doit JAMAIS être ajusté
 * pour préserver une marge. Les deux fonctions sont appelées séparément et
 * leurs résultats affichés séparément (cf. app/src/components/ViabilityPanel.jsx).
 *
 * ⚠️ DEFAULT_PARAMS ci-dessous sont des PLACEHOLDERS économiques (coût des
 * ressources, coût opérationnel, perte en cas de défaut, coût technologique
 * fixe par dossier) — pas des valeurs auditées par l'institution. Comme pour
 * DEFAULT_TAUX_USURE dans @regulatory/computeTEG, ils doivent être fournis
 * explicitement dès qu'ils sont confirmés (Prisca / la direction financière).
 */
import { monthlyPayment } from '../regulatory/computeTEG.mjs'

export const DEFAULT_PARAMS = Object.freeze({
  // Coût de refinancement de l'institution, taux annuel, en % — PLACEHOLDER.
  cout_ressources_annuel_pct: 6,
  // Coût opérationnel (agents, agences, saisie) en % du montant du crédit — PLACEHOLDER.
  cout_operationnel_pct: 5,
  // Coût technologique fixe par dossier traité (serveur, LLM local, etc.),
  // FCFA — volontairement PAS injecté dans le TEG (règle #4). PLACEHOLDER.
  cout_technologique_fixe: 500,
  // Perte en cas de défaut (LGD, "loss given default"), fraction du montant
  // prêté supposée irrécouvrable si le client fait défaut — PLACEHOLDER.
  taux_perte_en_cas_defaut: 0.6,
  // Marge nette minimale (en % du montant prêté) en-dessous de laquelle le
  // crédit est jugé non viable pour l'institution — PLACEHOLDER.
  marge_minimale_pct: 5,
})

/**
 * @param {Object} input
 * @param {number} input.montant_demande            Montant du crédit, FCFA
 * @param {number} input.duree_mois                  Durée, mois
 * @param {number} [input.taux_nominal_annuel_pct]    Taux d'intérêt nominal annuel déclaré, en % (ex. 18 pour 18%)
 * @param {number} [input.frais_dossier]              Frais/commissions prélevés à l'octroi, FCFA
 * @param {number} input.probabilite_defaut           Probabilité de défaut estimée (0-1) — fournie par l'appelant,
 *                                                     ex. `(100 - dossier.score) / 100` depuis @scoring (moteurs séparés,
 *                                                     ce module n'importe jamais @scoring directement).
 * @param {Partial<typeof DEFAULT_PARAMS>} [input.params]  Surcharge des paramètres économiques par défaut.
 * @returns {{ revenus:number, couts:number, marge:number, marge_pct:number, viable:boolean,
 *             detail: { revenu_interets:number, revenu_frais:number, cout_ressources:number,
 *                        cout_operationnel:number, cout_risque:number, cout_technologique:number },
 *             params: typeof DEFAULT_PARAMS }}
 */
export function computeViability(input) {
  const {
    montant_demande,
    duree_mois,
    taux_nominal_annuel_pct = 0,
    frais_dossier = 0,
    probabilite_defaut,
    params: paramOverrides,
  } = input ?? {}

  if (!(montant_demande > 0)) throw new TypeError('computeViability: montant_demande requis (> 0)')
  if (!(duree_mois > 0)) throw new TypeError('computeViability: duree_mois requis (> 0)')
  if (!(probabilite_defaut >= 0 && probabilite_defaut <= 1)) {
    throw new TypeError('computeViability: probabilite_defaut requis (entre 0 et 1)')
  }

  const params = { ...DEFAULT_PARAMS, ...paramOverrides }

  // Revenu d'intérêts : même hypothèse d'amortissement que le moteur TEG
  // (mensualités constantes), pour rester cohérent entre les deux moteurs.
  const tauxMensuelNominal = taux_nominal_annuel_pct / 100 / 12
  const mensualite = monthlyPayment(montant_demande, tauxMensuelNominal, duree_mois)
  const revenu_interets = Math.max(0, mensualite * duree_mois - montant_demande)
  const revenu_frais = frais_dossier

  const dureeAnnees = duree_mois / 12
  const cout_ressources = montant_demande * (params.cout_ressources_annuel_pct / 100) * dureeAnnees
  const cout_operationnel = montant_demande * (params.cout_operationnel_pct / 100)
  const cout_risque = montant_demande * params.taux_perte_en_cas_defaut * probabilite_defaut
  const cout_technologique = params.cout_technologique_fixe

  const revenus = revenu_interets + revenu_frais
  const couts = cout_ressources + cout_operationnel + cout_risque + cout_technologique
  const marge = revenus - couts
  const marge_pct = (marge / montant_demande) * 100

  return {
    revenus: Math.round(revenus),
    couts: Math.round(couts),
    marge: Math.round(marge),
    marge_pct: Math.round(marge_pct * 100) / 100,
    viable: marge_pct >= params.marge_minimale_pct,
    detail: {
      revenu_interets: Math.round(revenu_interets),
      revenu_frais: Math.round(revenu_frais),
      cout_ressources: Math.round(cout_ressources),
      cout_operationnel: Math.round(cout_operationnel),
      cout_risque: Math.round(cout_risque),
      cout_technologique: Math.round(cout_technologique),
    },
    params,
  }
}
