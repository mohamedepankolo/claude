// Répondeur de repli, utilisé quand le LLM local n'est pas disponible
// (cf. llmClient.js et /llm/README.md — "ne jamais inventer un résultat").
// Recalcule de vraies simulations "et si...?" via le moteur de scoring plutôt
// que de générer du texte : c'est volontairement limité (mots-clés) mais
// jamais halluciné.
import { scoreCreditApplication } from '@scoring/scoreCreditApplication.mjs'

const DECISION_LABEL_FR = { approve: 'accorder', review: 'examiner', reject: 'refuser' }

function phraseSimulation(intro, before, after) {
  const delta = after.score - before.score
  const beforeLabel = DECISION_LABEL_FR[before.decision] ?? before.decision
  const afterLabel = DECISION_LABEL_FR[after.decision] ?? after.decision
  if (delta === 0) {
    return `${intro}, le score resterait quasiment inchangé (${after.score}/100) : un autre facteur limite le dossier plus fortement, la recommandation resterait « ${beforeLabel} ».`
  }
  const evolution = `le score passerait de ${before.score} à ${after.score}/100 (${delta >= 0 ? '+' : ''}${delta} points)`
  return after.decision === before.decision
    ? `${intro}, ${evolution}, sans changer la recommandation (« ${afterLabel} »).`
    : `${intro}, ${evolution}, ce qui ferait passer la recommandation de « ${beforeLabel} » à « ${afterLabel} ».`
}

/** `dossier` = résultat de getApplication() (application + score + explanations). `inputs` = les champs bruts du dossier. */
export function fallbackAnswer(question, dossier, inputs) {
  const q = question.toLowerCase()

  if (q.includes("aurait-il fallu") || q.includes('accorder')) {
    const worst = (dossier.explanations ?? []).find((e) => e.direction === 'unfavorable')
    if (!worst) return 'Le dossier est déjà favorable sur l\'ensemble des facteurs retenus par le modèle.'
    return `Le facteur limitant est « ${worst.label.toLowerCase()} » : ${worst.detail} Pour faire évoluer la recommandation, il faudrait agir en priorité sur ce point.`
  }

  const caMatch = q.match(/chiffre d'affaires.*?(\d+)\s*%|ca\b.*?(\d+)\s*%/)
  if (q.includes("chiffre d'affaires") || caMatch) {
    const pct = caMatch ? Number(caMatch[1] || caMatch[2]) : 20
    const nextCA = inputs.chiffre_affaires * (1 + pct / 100)
    const before = scoreCreditApplication({ ...inputs, application_id: 'sim' })
    const after = scoreCreditApplication({ ...inputs, application_id: 'sim', chiffre_affaires: nextCA, benefice_activite: Math.max(0, nextCA - inputs.charges_activite) })
    return phraseSimulation(`Avec un chiffre d'affaires en hausse de ${pct}%`, before, after)
  }

  if (q.includes('durée') || q.includes('duree') || q.includes('plus longue')) {
    const before = scoreCreditApplication({ ...inputs, application_id: 'sim' })
    const nextDuree = inputs.duree_mois + 6
    const after = scoreCreditApplication({ ...inputs, application_id: 'sim', duree_mois: nextDuree })
    return phraseSimulation(`En portant la durée à ${nextDuree} mois`, before, after)
  }

  if (q.includes('résume') || q.includes('resume') || q.includes('résumer')) {
    return (dossier.narrative ?? []).slice(0, 2).join(' ') || `Score ${dossier.score}/100, décision : ${dossier.decision}.`
  }

  if (q.includes('endettement')) {
    const top = (dossier.explanations ?? []).find((e) => e.code === 'taux_endettement')
    return top ? top.detail : "Le détail du taux d'endettement n'est pas disponible pour ce dossier."
  }

  const top = dossier.explanations?.[0]
  return top
    ? `Le facteur qui pèse le plus dans cette décision est « ${top.label.toLowerCase()} ». Vous pouvez aussi me demander un scénario "et si..." sur le chiffre d'affaires ou la durée du crédit.`
    : "Je n'ai pas assez d'éléments sur ce dossier pour répondre précisément."
}
