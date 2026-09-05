import { useEffect, useRef, useState } from 'react'
import { isLlmAvailable, askLlm } from '../llm/llmClient.js'
import { fallbackAnswer } from '../llm/fallbackResponder.js'

const QUICK_QUESTIONS = [
  "Qu'aurait-il fallu pour accorder ce crédit ?",
  "Et si le chiffre d'affaires augmentait de 20% ?",
  'Et si la durée du crédit était plus longue ?',
  'Résume la décision en une phrase.',
]

/** `dossier` : résultat de getApplication() — sert à la fois de contexte du chat et d'entrée pour les simulations "et si...". */
export default function ChatPanel({ dossier }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [llmOn, setLlmOn] = useState(false)
  const threadRef = useRef(null)

  useEffect(() => { setMessages([]) }, [dossier?.id])
  useEffect(() => { isLlmAvailable().then(setLlmOn) }, [])
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [messages])

  async function send(question) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    const history = messages.map((m) => ({ role: m.role, content: m.text }))
    setMessages((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      let answer
      let viaLlm = false
      if (llmOn) {
        try {
          answer = await askLlm(dossier, q, history)
          viaLlm = true
        } catch {
          answer = fallbackAnswer(q, dossier, dossier)
        }
      } else {
        answer = fallbackAnswer(q, dossier, dossier)
      }
      setMessages((m) => [...m, { role: 'assistant', text: answer, viaLlm }])
    } finally {
      setBusy(false)
    }
  }

  if (!dossier) return null

  return (
    <div className="card chat-card">
      <h3>Approfondir la décision</h3>
      <div className="chat-sub">
        Posez une question sur ce dossier — {llmOn ? 'assistant local (Mistral 7B) actif' : 'mode de repli (règles) : le serveur LLM local n\'est pas détecté'}.
      </div>

      <div className="chips">
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} type="button" className="chip" onClick={() => send(q)} disabled={busy}>{q}</button>
        ))}
      </div>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && <div className="empty">Aucun échange pour l'instant.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="msg msg-assistant msg-pending">…</div>}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
          placeholder="Écrivez votre question…"
          disabled={busy}
        />
        <button className="btn-primary" type="button" onClick={() => send(input)} disabled={busy}>Envoyer</button>
      </div>
    </div>
  )
}
