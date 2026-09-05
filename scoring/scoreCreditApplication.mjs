/**
 * Baraka Score — moteur de scoring microcrédit
 *
 * Implémente le "Contrat avec Mohamede" défini par Lory (Plan d'architecture
 * & directives Jour J, section 6) : une fonction pure, sans dépendance, que
 * l'application React/SQLite/Firebase peut appeler sans connaître
 * l'implémentation interne du modèle.
 *
 *   scoreCreditApplication(input) -> output
 *
 * Le modèle actuel est un scoring par règles pondérées, transparent et
 * explicable, dérivé de la note de présentation de l'équipe (Thématique 02).
 * Il pourra être remplacé plus tard (modèle entraîné, appel API, ...) sans
 * que ce contrat ne change : seule cette fonction serait réécrite en
 * interne, sa signature INPUT/OUTPUT restant stable.
 */

export const RISK_LEVELS = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });
export const DECISIONS = Object.freeze({ APPROVE: 'approve', REVIEW: 'review', REJECT: 'reject' });

/**
 * @typedef {Object} CreditHistory
 * @property {boolean} has_prior_credit
 * @property {number}  [incidents_last_12m]     Nombre d'incidents/retards sur 12 mois
 * @property {number}  [repayment_rate_pct]      Taux de remboursement estimé (0-100)
 *
 * @typedef {Object} ApplicantProfile
 * @property {'good'|'average'|'to_verify'} [reputation]
 * @property {'good'|'average'|'weak'}      [guarantor_strength]     Pertinent seulement si guarantee=1
 * @property {'favorable'|'stable'|'difficult'} [sector_dynamics]
 * @property {number} [agency_distance_km]
 *
 * @typedef {Object} CreditApplicationInput
 * @property {string} application_id     Identifiant du dossier (UUID, cf. table credit_applications)
 * @property {number} amount_requested   Montant demandé, FCFA
 * @property {number} duration           Durée du crédit, mois
 * @property {number} income             Capacité mensuelle retenue (chiffre d'affaires x marge,
 *                                        ou revenu régulier), FCFA
 * @property {number} expenses           Charges financières actuelles, FCFA/mois
 * @property {number} business_age       Ancienneté de l'activité, mois
 * @property {0|1} [savings]             1 si épargne régulière et/ou participation à une tontine
 * @property {0|1} [guarantee]           1 si une caution personnelle est déclarée
 * @property {string} [purpose]          Secteur d'activité / objet du crédit
 * @property {CreditHistory} [history]   Absent ou has_prior_credit=false => profil "cold start"
 * @property {ApplicantProfile} [profile]
 *
 * @typedef {Object} Explanation
 * @property {string} code                              Identifiant stable du facteur (ex. "debt_ratio")
 * @property {string} label                              Libellé lisible
 * @property {'favorable'|'unfavorable'} direction
 * @property {number} weight                             Contribution au score, 0-1
 * @property {string} detail                             Explication en langage naturel
 *
 * @typedef {Object} CreditApplicationOutput
 * @property {number} score                              Score global, 0-100
 * @property {'low'|'medium'|'high'} risk_level
 * @property {number} confidence                          Fiabilité de l'évaluation, 0-1
 * @property {number} recommended_amount                  Montant soutenable estimé, FCFA
 * @property {'approve'|'review'|'reject'} decision
 * @property {Explanation[]} explanations
 * @property {string[]} narrative                         Extension non contractuelle : l'explication
 *                                                         en langage naturel, prête à afficher/lire.
 */

const clamp01 = (x) => Math.max(0, Math.min(1, x));

const REPUTATION_SCORE = { good: 1, average: 0.6, to_verify: 0.25 };
const GUARANTOR_SCORE = { good: 1, average: 0.6, weak: 0.3 };
const SECTOR_SCORE = { favorable: 1, stable: 0.7, difficult: 0.3 };

/**
 * @param {CreditApplicationInput} input
 * @returns {CreditApplicationOutput}
 */
export function scoreCreditApplication(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('scoreCreditApplication: input object required');
  }
  const {
    application_id,
    amount_requested = 0,
    duration = 12,
    income = 0,
    expenses = 0,
    business_age = 0,
    savings = 0,
    guarantee = 0,
    history,
    profile = {},
  } = input;

  if (!application_id) throw new TypeError('scoreCreditApplication: application_id required');

  const coldStart = !history || !history.has_prior_credit;

  const monthlyInstallment = duration > 0 ? amount_requested / duration : amount_requested;
  const chargesAfter = expenses + monthlyInstallment;
  const debtRatio = income > 0 ? chargesAfter / income : 1;

  const compDebtRatio = clamp01(1 - debtRatio / 0.65);
  const compBusinessAge = clamp01(business_age / 24);
  const compSavings = savings ? 1 : 0;
  const compReputation = REPUTATION_SCORE[profile.reputation] ?? 0.5;
  const compGuarantee = guarantee ? (GUARANTOR_SCORE[profile.guarantor_strength] ?? 0.7) : 0.2;
  const compExternal = clamp01(
    ((SECTOR_SCORE[profile.sector_dynamics] ?? 0.7) +
      clamp01(1 - (profile.agency_distance_km ?? 5) / 20)) / 2
  );
  const compHistory = coldStart
    ? null
    : clamp01((history.repayment_rate_pct ?? 90) / 100 - (history.incidents_last_12m ?? 0) * 0.15);

  const components = coldStart
    ? { debt_ratio: compDebtRatio, savings: compSavings, reputation: compReputation, guarantee: compGuarantee, business_age: compBusinessAge, external: compExternal }
    : { debt_ratio: compDebtRatio, history: compHistory, business_age: compBusinessAge, savings: compSavings, reputation: compReputation, guarantee: compGuarantee, external: compExternal };

  const weights = coldStart
    ? { debt_ratio: 0.30, savings: 0.15, reputation: 0.15, guarantee: 0.15, business_age: 0.15, external: 0.10 }
    : { debt_ratio: 0.30, history: 0.20, business_age: 0.15, savings: 0.10, reputation: 0.10, guarantee: 0.10, external: 0.05 };

  let rawScore = 0;
  for (const key of Object.keys(weights)) rawScore += (components[key] ?? 0) * weights[key];
  const score = Math.round(rawScore * 100);

  const risk_level = score >= 70 ? RISK_LEVELS.LOW : score >= 40 ? RISK_LEVELS.MEDIUM : RISK_LEVELS.HIGH;
  const decision = risk_level === RISK_LEVELS.LOW ? DECISIONS.APPROVE
    : risk_level === RISK_LEVELS.MEDIUM ? DECISIONS.REVIEW
    : DECISIONS.REJECT;

  const disposableIncome = Math.max(0, income - expenses);
  let recommended_amount = Math.round((disposableIncome * 0.35 * duration) / 1000) * 1000;
  if (decision === DECISIONS.REJECT) recommended_amount = Math.round((recommended_amount * 0.4) / 1000) * 1000;
  recommended_amount = Math.min(recommended_amount, amount_requested > 0 ? amount_requested * 1.15 : recommended_amount);

  // Confiance : pénalisée par le cold start et par les données optionnelles manquantes.
  const optionalFieldsPresent = [
    savings !== undefined, guarantee !== undefined,
    profile.reputation !== undefined, profile.sector_dynamics !== undefined,
  ].filter(Boolean).length;
  const confidence = clamp01(0.95 - (coldStart ? 0.15 : 0) - (4 - optionalFieldsPresent) * 0.05);

  const LABELS = {
    debt_ratio: { label: "Taux d'endettement après crédit", detail: `${Math.round(debtRatio * 100)}% de la capacité mensuelle (mensualité estimée ${Math.round(monthlyInstallment).toLocaleString('fr-FR')} FCFA).` },
    history: { label: 'Historique de remboursement', detail: `${history?.repayment_rate_pct ?? 0}% de remboursement, ${history?.incidents_last_12m ?? 0} incident(s) sur 12 mois.` },
    business_age: { label: "Ancienneté de l'activité", detail: `${business_age} mois d'activité déclarés.` },
    savings: { label: 'Épargne et discipline financière', detail: savings ? 'Épargne régulière et/ou tontine active.' : "Pas d'épargne régulière déclarée." },
    reputation: { label: 'Réputation de terrain', detail: `Évaluation qualitative : ${profile.reputation ?? 'non renseignée'}.` },
    guarantee: { label: 'Caution personnelle', detail: guarantee ? `Garant de capacité ${profile.guarantor_strength ?? 'non précisée'}.` : 'Aucune caution déclarée.' },
    external: { label: "Contexte du secteur et de l'agence", detail: `Secteur ${profile.sector_dynamics ?? 'non renseigné'}, ${profile.agency_distance_km ?? '?'} km de l'agence.` },
  };

  const explanations = Object.keys(weights)
    .map((code) => ({
      code,
      label: LABELS[code].label,
      direction: (components[code] ?? 0) >= 0.55 ? 'favorable' : 'unfavorable',
      weight: Math.round((components[code] ?? 0) * weights[code] * 100) / 100,
      detail: LABELS[code].detail,
    }))
    .sort((a, b) => b.weight - a.weight);

  const narrative = buildNarrative({ score, decision, risk_level, explanations, recommended_amount, amount_requested, duration });

  return { score, risk_level, confidence, recommended_amount, decision, explanations, narrative };
}

function buildNarrative({ score, decision, explanations, recommended_amount, amount_requested, duration }) {
  const DECISION_TEXT = {
    approve: 'peut être accordé',
    review: 'nécessite un examen approfondi',
    reject: "n'est pas recommandé en l'état",
  };
  const lines = [`Le dossier ${DECISION_TEXT[decision]}, avec un score de ${score}/100.`];

  const worst = explanations.find((e) => e.direction === 'unfavorable');
  if (worst) lines.push(`Le facteur le plus défavorable est ${worst.label.toLowerCase()} : ${worst.detail}`);

  if (decision !== 'approve') {
    lines.push(
      `Sur la base des charges actuelles, le montant raisonnablement soutenable est estimé à ${recommended_amount.toLocaleString('fr-FR')} FCFA sur ${duration} mois${amount_requested > recommended_amount ? `, contre ${amount_requested.toLocaleString('fr-FR')} FCFA demandé` : ''}.`
    );
  } else {
    const best = explanations.filter((e) => e.direction === 'favorable').slice(0, 2).map((e) => e.label.toLowerCase());
    if (best.length) lines.push(`Les points forts du dossier sont ${best.join(' et ')}.`);
  }
  lines.push('Cette lecture reste indicative : elle assiste la décision de l\'agent et ne la remplace pas.');
  return lines;
}
