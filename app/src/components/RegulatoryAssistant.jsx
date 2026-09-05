import { useState } from 'react'
import { askRegulatory } from '../rag/ragClient.js'

const QUICK_QUESTIONS = [
  'Pourquoi ce plafond de TEG ?',
  'Comment le TEG est-il calculé ?',
  "Que faire si le client n'a pas d'historique de crédit ?",
]

/** "Poser au RAG : Pourquoi ? → réponse sourcée" — étape 8 du scénario de démo de Lory. */
export default function RegulatoryAssistant() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      const { answer, sources } = await askRegulatory(q)
      setMessages((m) => [...m, { role: 'assistant', text: answer, sources }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Assistant réglementaire (RAG)</h3>
      <div className="chat-sub">Répond à partir d'un corpus contrôlé (taux d'usure, méthode TEG, politique de crédit) — chaque réponse cite sa source.</div>

      <div className="chips">
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} type="button" className="chip" onClick={() => ask(q)} disabled={busy}>{q}</button>
        ))}
      </div>

      <div className="chat-thread">
        {messages.length === 0 && <div className="empty">Aucune question posée pour l'instant.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.text}
            {m.sources?.length > 0 && (
              <ul className="rag-sources">
                {m.sources.map((s, j) => (
                  <li key={j}><strong>{s.title}</strong> — <span>{s.excerpt.slice(0, 140)}{s.excerpt.length > 140 ? '…' : ''}</span></li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="msg msg-assistant msg-pending">…</div>}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(input) }}
          placeholder="Question sur la réglementation ou la politique de crédit…"
          disabled={busy}
        />
        <button className="btn-primary" type="button" onClick={() => ask(input)} disabled={busy}>Envoyer</button>
      </div>
    </div>
  )
}
