/**
 * Baraka Score — garde-fous métier (P0/P1/P2 du plan de risque, cf. PLAN_RISQUE.md)
 *
 * Couche déterministe et pure appliquée APRÈS `scoreCreditApplication`,
 * jamais à la place. Le score ML (`score`, `risk_level`, `confidence`,
 * `explanations`) issu du modèle entraîné n'est jamais modifié ici — ce
 * module ne fait que DURCIR `decision` et/ou `recommended_amount`, jamais
 * les assouplir, à partir de règles métier explicites et sourcées auprès de
 * Prisca (session de mentoring 3) qui ne sont pas dans le jeu de données
 * d'entraînement (donc pas modélisables par la régression logistique sans
 * réentraînement) :
 *
 *  P0 — endettement externe déclaré, ancienneté du membre dans
 *       l'institution, progressivité du crédit (montant vs historique).
 *  P1 — cohérence durée/type de crédit, couverture de la garantie,
 *       pertinence saisonnière et croissance des ventes déclarées par
 *       l'agent (jugement de terrain collecté, jamais inventé).
 *  P2 — doublon de dossier actif détecté localement (proxy de la
 *       vérification BIC/multi-agences — cf. limites documentées dans
 *       PLAN_RISQUE.md : ceci n'est PAS une consultation BIC réelle).
 *
 * Chaque règle déclenchée est tracée dans `guardrails[]`, séparément de
 * `explanations[]` (qui reste la sortie brute et stable du modèle) — pour
 * qu'on puisse toujours distinguer "ce que dit le modèle" de "ce que dit la
 * politique de crédit".
 */

export const DECISIONS_ORDER = Object.freeze({ approve: 0, review: 1, reject: 2 })

export const DEFAULT_GUARDRAIL_PARAMS = Object.freeze({
  // P0
  anciennete_membre_min_mois: 6, // symétrique à anciennete_activite_mois
  anciennete_membre_facteur_plafond: 0.7, // plafond du montant recommandé pour un nouveau membre
  endettement_externe_ratio_max: 1.5, // vs benefice_activite mensuel
  progressivite_facteur_max: 3, // montant demandé ne doit pas dépasser 3x le dernier crédit
  // P1
  garantie_ratio_min: 0.5, // valeur de la garantie / montant demandé
  croissance_ventes_seuil_pct: -20, // en-dessous, alerte activité en déclin
})

// Durées usuelles par type de crédit (mois) — catégories alignées sur les
// produits réels d'un réseau de microfinance au Burkina Faso (RCPB, cf.
// data/SOURCES_METHODOLOGIE.md). Valeurs indicatives, NON validées par
// Prisca (pas de grille officielle RCPB recopiée ici) — à confirmer.
export const DUREE_NORMES_PAR_TYPE = Object.freeze({
  credit_agricole: { min: 6, max: 24 }, // calé sur le cycle de campagne
  credit_commercial: { min: 6, max: 18 },
  credart_artisans: { min: 6, max: 24 },
  cfc_femmes_commercantes: { min: 6, max: 18 },
  credit_communautaire: { min: 6, max: 12 },
  credit_jeune: { min: 6, max: 24 },
  avance_salaire: { min: 1, max: 6 }, // remboursement sur les prochains salaires, très court
  credit_social: { min: 6, max: 12 },
  btp_marche_public: { min: 6, max: 24 },
})

// Garantie usuellement associée à chaque type de crédit — règle indicative
// (pas validée par Prisca), utilisée à la fois par le formulaire
// (app/src/components/DossierForm.jsx, suggestion affichée à l'agent) et
// par le garde-fou P1.2b ci-dessous (informatif, jamais bloquant).
export const GARANTIE_RECOMMANDEE_PAR_TYPE = Object.freeze({
  avance_salaire: 'domiciliation_salaire',
  credit_social: 'domiciliation_salaire',
  credit_agricole: 'caution_solidaire',
  credit_commercial: 'materiel',
  credart_artisans: 'materiel',
  cfc_femmes_commercantes: 'caution_solidaire',
})

const worseOf = (a, b) => (DECISIONS_ORDER[b] > DECISIONS_ORDER[a] ? b : a)

/**
 * @param {import('./scoreCreditApplication.mjs').CreditApplicationOutput} scoreResult
 * @param {Object} context
 * @param {number} context.montant_demande
 * @param {number} [context.benefice_activite]
 * @param {number} [context.duree_mois]
 * @param {number} [context.anciennete_membre_mois]       Ancienneté du membre dans l'institution (≠ ancienneté de l'activité)
 * @param {number} [context.endettement_externe_declare]  FCFA, déclaré par l'agent (P0 — proxy BIC en l'absence d'intégration réelle)
 * @param {number} [context.montant_dernier_credit]       FCFA, dernier crédit soldé/en cours du membre
 * @param {'credit_agricole'|'credit_commercial'|'credart_artisans'|'cfc_femmes_commercantes'|'credit_communautaire'|'credit_jeune'|'avance_salaire'|'credit_social'|'btp_marche_public'} [context.type_credit]
 * @param {'aucune'|'foncier'|'vehicule'|'materiel'|'caution_solidaire'|'domiciliation_salaire'} [context.type_garantie]
 * @param {number} [context.valeur_garantie]               FCFA
 * @param {'favorable'|'neutre'|'defavorable'} [context.pertinence_demande]  Jugement déclaré par l'agent sur le timing de la demande par rapport au cycle de l'activité (jamais déduit d'une donnée absente)
 * @param {number} [context.croissance_ventes_pct]         Variation déclarée du CA, en %
 * @param {boolean} [context.duplicate_active_client]      Un autre dossier actif existe déjà pour ce même client (détection locale)
 * @param {Partial<typeof DEFAULT_GUARDRAIL_PARAMS>} [context.params]
 * @returns {typeof scoreResult & { guardrails: Array<{code:string, effect:string, label:string, detail:string}> }}
 */
export function applyBusinessGuardrails(scoreResult, context) {
  if (!scoreResult || typeof scoreResult !== 'object') {
    throw new TypeError('applyBusinessGuardrails: scoreResult requis')
  }
  const { montant_demande, benefice_activite = 0, duree_mois } = context ?? {}
  if (!(montant_demande > 0)) throw new TypeError('applyBusinessGuardrails: montant_demande requis (> 0)')

  const params = { ...DEFAULT_GUARDRAIL_PARAMS, ...(context.params ?? {}) }
  const guardrails = []
  let decision = scoreResult.decision
  let recommended_amount = scoreResult.recommended_amount

  const escalate = (target) => { decision = worseOf(decision, target) }
  const cap = (amount) => { recommended_amount = Math.min(recommended_amount, Math.round(amount)) }

  // P0.1 — endettement externe déclaré (proxy BIC).
  const endettementExterne = context.endettement_externe_declare ?? 0
  if (endettementExterne > 0 && benefice_activite > 0 && endettementExterne > params.endettement_externe_ratio_max * benefice_activite) {
    escalate('review')
    guardrails.push({
      code: 'endettement_externe_eleve', effect: 'review',
      label: 'Endettement externe élevé',
      detail: `${endettementExterne.toLocaleString('fr-FR')} FCFA déclarés dans d'autres institutions, au-delà de ${params.endettement_externe_ratio_max}x le bénéfice mensuel — vérification recommandée (cf. dimension externe/BIC).`,
    })
  }

  // P0.2 — ancienneté du membre dans l'institution : plafonne le montant pour un nouveau membre.
  const ancienneteMembre = context.anciennete_membre_mois
  if (typeof ancienneteMembre === 'number' && ancienneteMembre < params.anciennete_membre_min_mois) {
    const plafond = scoreResult.recommended_amount * params.anciennete_membre_facteur_plafond
    if (plafond < recommended_amount) {
      cap(plafond)
      guardrails.push({
        code: 'nouveau_membre', effect: 'cap_amount',
        label: 'Nouveau membre — montant plafonné',
        detail: `${ancienneteMembre} mois d'ancienneté dans l'institution (< ${params.anciennete_membre_min_mois}) : montant recommandé plafonné à ${Math.round(plafond).toLocaleString('fr-FR')} FCFA, en attendant un premier historique de remboursement.`,
      })
    }
  }

  // P0.3 — progressivité du crédit : le montant demandé ne doit pas exploser par rapport au dernier crédit connu.
  const dernierCredit = context.montant_dernier_credit ?? 0
  if (dernierCredit > 0 && montant_demande > params.progressivite_facteur_max * dernierCredit) {
    escalate('review')
    const plafondProgressif = dernierCredit * params.progressivite_facteur_max
    cap(plafondProgressif)
    guardrails.push({
      code: 'progressivite_credit', effect: 'review+cap_amount',
      label: 'Montant disproportionné par rapport à l\'historique',
      detail: `Montant demandé (${montant_demande.toLocaleString('fr-FR')} FCFA) supérieur à ${params.progressivite_facteur_max}x le dernier crédit connu (${dernierCredit.toLocaleString('fr-FR')} FCFA) — l'évolution du crédit doit rester progressive.`,
    })
  }

  // P1.1 — cohérence durée / type de crédit (informatif, non bloquant : ne fait qu'informer l'agent).
  const normes = context.type_credit ? DUREE_NORMES_PAR_TYPE[context.type_credit] : null
  if (normes && typeof duree_mois === 'number' && (duree_mois < normes.min || duree_mois > normes.max)) {
    guardrails.push({
      code: 'duree_hors_norme', effect: 'info',
      label: 'Durée inhabituelle pour ce type de crédit',
      detail: `${duree_mois} mois demandés pour un crédit "${context.type_credit}" — norme usuelle : ${normes.min} à ${normes.max} mois.`,
    })
  }

  // P1.2 — couverture de la garantie déclarée.
  const valeurGarantie = context.valeur_garantie ?? 0
  if (context.type_garantie && context.type_garantie !== 'aucune' && valeurGarantie > 0) {
    const ratio = valeurGarantie / montant_demande
    if (ratio < params.garantie_ratio_min) {
      escalate('review')
      guardrails.push({
        code: 'garantie_insuffisante', effect: 'review',
        label: 'Garantie insuffisante',
        detail: `Garantie (${context.type_garantie}) estimée à ${Math.round(ratio * 100)}% du montant demandé — en-dessous du seuil de ${Math.round(params.garantie_ratio_min * 100)}%.`,
      })
    }
  }

  // P1.2b — garantie recommandée pour ce type de crédit non déclarée (informatif, non bloquant).
  const garantieRecommandee = context.type_credit ? GARANTIE_RECOMMANDEE_PAR_TYPE[context.type_credit] : null
  if (garantieRecommandee && context.type_garantie && context.type_garantie !== garantieRecommandee && context.type_garantie === 'aucune') {
    guardrails.push({
      code: 'garantie_recommandee_absente', effect: 'info',
      label: 'Garantie usuelle non déclarée',
      detail: `Pour un crédit "${context.type_credit}", la garantie usuelle est "${garantieRecommandee}" — aucune garantie n'est déclarée ici (indicatif, non bloquant).`,
    })
  }

  // P1.3 — pertinence de la demande / timing par rapport au cycle de l'activité (jugement déclaré par l'agent, jamais déduit).
  if (context.pertinence_demande === 'defavorable') {
    escalate('review')
    guardrails.push({
      code: 'timing_defavorable', effect: 'review',
      label: 'Moment jugé défavorable pour ce crédit',
      detail: "L'agent a évalué que le timing de la demande n'est pas en phase avec le cycle de l'activité (cf. exemple du vendeur d'eau en sachet, session de mentoring 3).",
    })
  }

  // P1.4 — croissance des ventes déclarée par l'agent.
  const croissance = context.croissance_ventes_pct
  if (typeof croissance === 'number' && croissance < params.croissance_ventes_seuil_pct) {
    escalate('review')
    guardrails.push({
      code: 'ventes_en_declin', effect: 'review',
      label: 'Activité en déclin',
      detail: `Croissance des ventes déclarée à ${croissance}%, en-dessous du seuil d'alerte (${params.croissance_ventes_seuil_pct}%).`,
    })
  }

  // P2 — doublon de dossier actif détecté localement (proxy BIC/multi-agences, cf. limites dans PLAN_RISQUE.md).
  if (context.duplicate_active_client) {
    escalate('review')
    guardrails.push({
      code: 'doublon_dossier_local', effect: 'review',
      label: 'Dossier actif déjà existant pour ce client',
      detail: "Un autre dossier actif a été trouvé localement pour ce même client — à vérifier avant d'engager un nouveau crédit (risque de cavalerie financière). Ceci est une détection locale, pas une consultation BIC réelle.",
    })
  }

  return { ...scoreResult, decision, recommended_amount, guardrails }
}
