/**
 * Baraka Score — moteur de scoring microcrédit (v2, régression logistique entraînée)
 *
 * Implémente le "Contrat avec Mohamede" défini par Lory (Plan d'architecture
 * & directives Jour J, section 6) : une fonction pure, sans dépendance, que
 * l'application React/SQLite/Firebase peut appeler sans connaître
 * l'implémentation interne du modèle.
 *
 *   scoreCreditApplication(input) -> output
 *
 * INPUT (v2) : reprend les variables validées par Prisca sur le jeu de
 * données synthétique (data/donnees_completes.csv, cf. GUIDE_LECTURE_DONNEES.md),
 * pas les noms simplifiés (income/expenses/...) d'un premier brouillon.
 * OUTPUT : inchangé par rapport à la v1 — score, risk_level, confidence,
 * recommended_amount, decision, explanations[] — donc rien à modifier côté
 * UI/SQLite pour bénéficier du modèle entraîné.
 *
 * Le modèle est une régression logistique entraînée hors-ligne (ml/train_model.py)
 * sur 3000 dossiers synthétiques (ROC-AUC 0.83 sur jeu de test, cf. ml/METRICS.md),
 * exportée dans model.js (coefficients + normalisation). Aucune dépendance
 * Python à l'inférence : uniquement de l'algèbre linéaire, exécutable
 * hors-ligne sur un poste modeste.
 *
 * `genre` est volontairement absent des variables du modèle (consigne de
 * Prisca : "audit d'équité uniquement, PAS dans le score") — il ne sert
 * qu'à l'audit d'équité (cf. ml/METRICS.md et /equity/auditEquity.mjs).
 */
import MODEL from './model.js';

export const RISK_LEVELS = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });
export const DECISIONS = Object.freeze({ APPROVE: 'approve', REVIEW: 'review', REJECT: 'reject' });

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * @typedef {Object} CreditApplicationInput
 * @property {string} application_id
 * @property {number} [age]
 * @property {'urbain'|'rural'} [zone]
 * @property {'commerce_detail'|'vente_vivres'|'quincaillerie_materiaux'|'services'|'artisanat'|'agriculture'} secteur
 * @property {0|1} [informel]
 * @property {number} [personnes_a_charge]
 * @property {number} anciennete_activite_mois     Mois (financement possible à partir de 6 mois)
 * @property {number} chiffre_affaires             CA mensuel, FCFA
 * @property {number} charges_activite             Achats + dépenses d'exploitation, FCFA/mois
 * @property {number} [revenu_activite]            Bénéfice = chiffre_affaires - charges_activite (calculé si absent)
 * @property {number} [flux_tresorerie_net]         FCFA/mois (défaut : = revenu_activite)
 * @property {number} [charges_perso]               FCFA/mois
 * @property {number} montant_demande               FCFA
 * @property {number} duree_mois
 * @property {number} [epargne_mensuelle]           FCFA
 * @property {number} [regularite_epargne]          0-1
 * @property {0|1} [participe_tontine]
 * @property {number} [regularite_tontine]          0-1
 * @property {0|1} [a_historique]
 * @property {number} [nb_credits_anterieurs]
 * @property {number} [nb_retards]
 * @property {0|1} [deja_impaye]
 * @property {0|1} [a_caution]
 * @property {number} [capacite_caution]            0-1
 * @property {number} [score_reputation]            0-1
 *
 * @typedef {Object} Explanation
 * @property {string} code
 * @property {string} label
 * @property {'favorable'|'unfavorable'} direction
 * @property {number} weight        Contribution absolue au log-odds (arrondie), pour le tri/l'affichage
 * @property {string} detail
 *
 * @typedef {Object} CreditApplicationOutput
 * @property {number} score                        0-100 (100 = risque minimal)
 * @property {'low'|'medium'|'high'} risk_level
 * @property {number} confidence                    0-1
 * @property {number} recommended_amount            FCFA
 * @property {'approve'|'review'|'reject'} decision
 * @property {Explanation[]} explanations
 * @property {string[]} narrative                    Extension non contractuelle (langage naturel)
 */

const LABELS = {
  taux_endettement: (v) => ({ label: "Taux d'endettement", detail: `Mensualité estimée à ${Math.round(v.mensualite).toLocaleString('fr-FR')} FCFA, soit ${Math.round(v.taux_endettement * 100)}% du bénéfice mensuel.` }),
  couverture_cashflow: (v) => ({ label: 'Couverture par le flux de trésorerie', detail: `Le flux de trésorerie net couvre ${v.couverture_cashflow.toFixed(1)}x la mensualité.` }),
  anciennete_activite_mois: (v) => ({ label: "Ancienneté de l'activité", detail: `${v.anciennete_activite_mois} mois d'activité déclarés.` }),
  regularite_tontine: (v) => ({ label: 'Régularité de la tontine', detail: v.participe_tontine ? `Participation à une tontine, régularité ${Math.round(v.regularite_tontine * 100)}%.` : 'Ne participe pas à une tontine.' }),
  regularite_epargne: (v) => ({ label: "Régularité de l'épargne", detail: `Épargne mensuelle ${Math.round(v.epargne_mensuelle).toLocaleString('fr-FR')} FCFA, régularité ${Math.round(v.regularite_epargne * 100)}%.` }),
  capacite_caution: (v) => ({ label: 'Solidité de la caution', detail: v.a_caution ? `Caution déclarée, solidité estimée à ${Math.round(v.capacite_caution * 100)}%.` : 'Aucune caution déclarée.' }),
  score_reputation: (v) => ({ label: 'Réputation de terrain', detail: `Évaluation terrain : ${Math.round(v.score_reputation * 100)}/100.` }),
  nb_retards: (v) => ({ label: 'Retards de paiement passés', detail: `${v.nb_retards} retard(s) sur l'historique connu.` }),
  deja_impaye: (v) => ({ label: 'Impayé antérieur', detail: v.deja_impaye ? 'Un impayé est enregistré dans l\'historique.' : "Pas d'impayé enregistré." }),
  a_historique: (v) => ({ label: 'Historique de crédit', detail: v.a_historique ? `${v.nb_credits_anterieurs} crédit(s) antérieur(s) chez nous.` : "Primo-demandeur, pas d'historique interne." }),
  nb_credits_anterieurs: (v) => ({ label: 'Crédits antérieurs', detail: `${v.nb_credits_anterieurs} crédit(s) déjà contracté(s).` }),
  participe_tontine: (v) => ({ label: 'Participation à une tontine', detail: v.participe_tontine ? 'Participe à une tontine.' : 'Ne participe pas à une tontine.' }),
  epargne_mensuelle: (v) => ({ label: 'Épargne mensuelle', detail: `${Math.round(v.epargne_mensuelle).toLocaleString('fr-FR')} FCFA/mois.` }),
  informel: (v) => ({ label: "Caractère informel de l'activité", detail: v.informel ? 'Activité informelle.' : 'Activité formalisée.' }),
  a_caution: (v) => ({ label: 'Présence d\'une caution', detail: v.a_caution ? 'Une caution est déclarée.' : 'Aucune caution déclarée.' }),
  personnes_a_charge: (v) => ({ label: 'Personnes à charge', detail: `${v.personnes_a_charge} personne(s) à charge.` }),
  age: (v) => ({ label: 'Âge du demandeur', detail: `${v.age} ans.` }),
  zone_rural: (v) => ({ label: "Zone d'habitation", detail: v.zone === 'rural' ? 'Zone rurale.' : 'Zone urbaine.' }),
};
for (const s of MODEL.secteurs) {
  LABELS[`secteur_${s}`] = (v) => ({ label: "Secteur d'activité", detail: `Secteur : ${v.secteur.replace(/_/g, ' ')}.` });
}

/**
 * @param {CreditApplicationInput} input
 * @returns {CreditApplicationOutput}
 */
export function scoreCreditApplication(input) {
  if (!input || typeof input !== 'object') throw new TypeError('scoreCreditApplication: input object required');
  if (!input.application_id) throw new TypeError('scoreCreditApplication: application_id required');
  if (!input.secteur) throw new TypeError('scoreCreditApplication: secteur required');

  const revenu_activite = input.revenu_activite ?? Math.max(0, (input.chiffre_affaires ?? 0) - (input.charges_activite ?? 0));
  const flux_tresorerie_net = input.flux_tresorerie_net ?? revenu_activite;
  const duree_mois = input.duree_mois > 0 ? input.duree_mois : 12;
  const mensualite = input.montant_demande / duree_mois;
  const taux_endettement = revenu_activite > 0 ? mensualite / revenu_activite : 1;
  const couverture_cashflow = mensualite > 0 ? flux_tresorerie_net / mensualite : 10;

  const values = {
    age: input.age ?? 35,
    personnes_a_charge: input.personnes_a_charge ?? 0,
    anciennete_activite_mois: input.anciennete_activite_mois ?? 6,
    taux_endettement,
    couverture_cashflow,
    epargne_mensuelle: input.epargne_mensuelle ?? 0,
    regularite_epargne: input.regularite_epargne ?? 0,
    participe_tontine: input.participe_tontine ? 1 : 0,
    regularite_tontine: input.regularite_tontine ?? 0,
    a_historique: input.a_historique ? 1 : 0,
    nb_credits_anterieurs: input.nb_credits_anterieurs ?? 0,
    nb_retards: input.nb_retards ?? 0,
    deja_impaye: input.deja_impaye ? 1 : 0,
    a_caution: input.a_caution ? 1 : 0,
    capacite_caution: input.capacite_caution ?? 0,
    score_reputation: input.score_reputation ?? 0.5,
    informel: input.informel ? 1 : 0,
    zone: input.zone ?? 'urbain',
    secteur: input.secteur,
    mensualite,
  };

  // Vecteur de features dans l'ordre exact du modèle entraîné (model.js).
  const featureValue = (name) => {
    if (name === 'zone_rural') return values.zone === 'rural' ? 1 : 0;
    if (name.startsWith('secteur_')) return values.secteur === name.slice('secteur_'.length) ? 1 : 0;
    return values[name] ?? 0;
  };

  let logit = MODEL.intercept;
  const contributions = [];
  MODEL.feature_order.forEach((name, i) => {
    const raw = featureValue(name);
    const standardized = (raw - MODEL.mean[i]) / MODEL.scale[i];
    const contribution = MODEL.coefficients[i] * standardized;
    logit += contribution;
    contributions.push({ code: name, raw, contribution });
  });

  const p_default = sigmoid(logit);
  const score = Math.round(100 * (1 - p_default));

  const { approve_below, reject_above } = MODEL.thresholds;
  const risk_level = p_default < approve_below ? RISK_LEVELS.LOW : p_default < reject_above ? RISK_LEVELS.MEDIUM : RISK_LEVELS.HIGH;
  const decision = risk_level === RISK_LEVELS.LOW ? DECISIONS.APPROVE : risk_level === RISK_LEVELS.MEDIUM ? DECISIONS.REVIEW : DECISIONS.REJECT;

  // Confiance : position de p(défaut) au sein de son propre bucket de
  // décision, chacun normalisé sur sa plage atteignable (pile sur une
  // frontière = confiance minimale ; au centre, ou au fond du bucket
  // "refuser", = confiance maximale).
  let confidence;
  if (risk_level === RISK_LEVELS.LOW) {
    confidence = clamp01(Math.abs(approve_below - p_default) / (approve_below || 1));
  } else if (risk_level === RISK_LEVELS.HIGH) {
    confidence = clamp01(Math.abs(p_default - reject_above) / ((1 - reject_above) || 1));
  } else {
    const mid = (approve_below + reject_above) / 2;
    const halfWidth = (reject_above - approve_below) / 2 || 1;
    confidence = clamp01(1 - Math.abs(p_default - mid) / halfWidth);
  }

  const disposableIncome = Math.max(0, revenu_activite - (input.charges_perso ?? 0));
  let recommended_amount = Math.round((disposableIncome * 0.35 * duree_mois) / 1000) * 1000;
  if (decision === DECISIONS.REJECT) recommended_amount = Math.round((recommended_amount * 0.4) / 1000) * 1000;
  recommended_amount = Math.min(recommended_amount, input.montant_demande > 0 ? input.montant_demande * 1.15 : recommended_amount);

  // `participe_tontine` et `regularite_tontine` portent le même signal
  // (la régularité est 0 par construction si la personne ne participe pas) ;
  // n'en afficher qu'un seul évite des facteurs d'explication qui semblent
  // se contredire ("participe" et "ne participe pas" côte à côte).
  const explanations = contributions
    .filter((c) => c.code !== 'participe_tontine')
    .filter((c) => Math.abs(c.contribution) > 1e-6)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 7)
    .map((c) => {
      const build = LABELS[c.code];
      const info = build ? build(values) : { label: c.code, detail: '' };
      return {
        code: c.code,
        label: info.label,
        direction: c.contribution < 0 ? 'favorable' : 'unfavorable',
        weight: Math.round(Math.abs(c.contribution) * 100) / 100,
        detail: info.detail,
      };
    });

  const narrative = buildNarrative({ score, decision, explanations, recommended_amount, amount_requested: input.montant_demande, duration: duree_mois, taux_endettement });

  return { score, risk_level, confidence, recommended_amount, decision, explanations, narrative };
}

function buildNarrative({ score, decision, explanations, recommended_amount, amount_requested, duration, taux_endettement }) {
  const DECISION_TEXT = { approve: 'peut être accordé', review: 'nécessite un examen approfondi', reject: "n'est pas recommandé en l'état" };
  const lines = [`Le dossier ${DECISION_TEXT[decision]}, avec un score de ${score}/100 (taux d'endettement estimé à ${Math.round(taux_endettement * 100)}%).`];

  const worst = explanations.find((e) => e.direction === 'unfavorable');
  if (worst) lines.push(`Le facteur le plus défavorable est ${worst.label.toLowerCase()} : ${worst.detail}`);

  if (decision !== 'approve') {
    lines.push(`Sur la base des charges actuelles, le montant raisonnablement soutenable est estimé à ${recommended_amount.toLocaleString('fr-FR')} FCFA sur ${duration} mois${amount_requested > recommended_amount ? `, contre ${amount_requested.toLocaleString('fr-FR')} FCFA demandé` : ''}.`);
  } else {
    const best = explanations.filter((e) => e.direction === 'favorable').slice(0, 2).map((e) => e.label.toLowerCase());
    if (best.length) lines.push(`Les points forts du dossier sont ${best.join(' et ')}.`);
  }
  lines.push("Cette lecture reste indicative : elle assiste la décision de l'agent et ne la remplace pas.");
  return lines;
}
