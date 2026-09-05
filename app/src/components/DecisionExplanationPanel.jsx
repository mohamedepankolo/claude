import { useEffect, useState } from 'react'
import { isLlmAvailable, explainWithLlm } from '../llm/llmClient.js'

const DECISION_LABEL = { approve: 'accordé', review: 'à examiner', reject: 'non recommandé' }

/**
 * Explication structurée générée automatiquement juste après la décision —
 * pas seulement sur demande dans le chat. Les listes favorables/défavorables
 * restent 100% déterministes (dérivées de `explanations`/`guardrails`,
 * jamais du LLM) ; seule la synthèse en langage naturel est confiée au LLM
 * local, avec repli déterministe s'il est indisponible — même principe que
 * partout ailleurs dans le projet (jamais un texte inventé).
 */
export default function DecisionExplanationPanel({ dossier }) {
  const [synthese, setSynthese] = useState(null)
  const [loading, setLoading] = useState(false)
  const [viaLlm, setViaLlm] = useState(false)

  useEffect(() => {
    if (!dossier) return
    let cancelled = false
    setSynthese(null)
    setLoading(true)
    ;(async () => {
      let text = null
      let usedLlm = false
      if (await isLlmAvailable()) {
        try {
          text = await explainWithLlm(dossier)
          usedLlm = true
        } catch {
          text = null
        }
      }
      if (!text) {
        text = (dossier.narrative ?? []).join(' ') || `Dossier ${DECISION_LABEL[dossier.decision] ?? dossier.decision}, score ${dossier.score}/100.`
      }
      if (!cancelled) {
        setSynthese(text)
        setViaLlm(usedLlm)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [dossier?.id])

  if (!dossier) return null

  const favorables = (dossier.explanations ?? []).filter((e) => e.direction === 'favorable')
  const defavorables = (dossier.explanations ?? []).filter((e) => e.direction === 'unfavorable')
  const guardrails = dossier.guardrails ?? []

  return (
    <div className="card">
      <h3>Explication de la décision</h3>
      <div className="chat-sub">
        {loading ? 'Génération en cours…' : viaLlm ? 'Synthèse reformulée par l\'assistant local (Mistral 7B)' : 'Synthèse générée par règles (assistant local non disponible)'}
      </div>
      {synthese && <p className="explanation-synthesis">{synthese}</p>}

      <div className="explanation-columns">
        <div>
          <div className="explanation-col-title explanation-col-favorable">Favorable ({favorables.length})</div>
          {favorables.length === 0 && <div className="empty">Aucun facteur favorable notable.</div>}
          {favorables.map((e) => <div key={e.code} className="explanation-line">• {e.label}</div>)}
        </div>
        <div>
          <div className="explanation-col-title explanation-col-unfavorable">Défavorable ({defavorables.length + guardrails.length})</div>
          {defavorables.length === 0 && guardrails.length === 0 && <div className="empty">Aucun facteur défavorable notable.</div>}
          {defavorables.map((e) => <div key={e.code} className="explanation-line">• {e.label}</div>)}
          {guardrails.map((g) => <div key={g.code} className="explanation-line explanation-guardrail-line">• {g.label} (garde-fou)</div>)}
        </div>
      </div>
    </div>
  )
}
