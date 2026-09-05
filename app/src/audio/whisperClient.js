// Client pour la transcription audio locale — whisper.cpp `whisper-server`,
// cf. PLAN_INTERFACE_DOCUMENTS.md §4 pour le modèle GGML à télécharger et le
// binaire à démarrer. Même principe que llm/llmClient.js : entièrement
// optionnel, jamais bloquant, et si le serveur est absent on le dit
// clairement — jamais de texte transcrit inventé.
//
// Hypothèse sur l'API (à ajuster si la version de whisper.cpp diffère) :
// POST /inference, multipart avec un champ `file` (audio), réponse JSON
// `{ text: "..." }` — c'est le format de l'exemple `server` officiel de
// whisper.cpp au moment de l'écriture de ce client.
const BASE_URL = import.meta.env.VITE_WHISPER_URL || 'http://127.0.0.1:8091'

async function withTimeout(promise, ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await promise(ctrl.signal)
  } finally {
    clearTimeout(t)
  }
}

/** whisper-server ne fournit pas de /health dédié ; on considère toute réponse HTTP (même 404) comme "le serveur tourne". */
export async function isWhisperAvailable() {
  try {
    const res = await withTimeout((signal) => fetch(`${BASE_URL}/`, { signal }), 800)
    return res.status < 500
  } catch {
    return false
  }
}

/**
 * @param {Blob} audioBlob
 * @returns {Promise<string>} texte transcrit — lève une erreur si le serveur est indisponible ou répond sans texte.
 */
export async function transcribeAudio(audioBlob) {
  const form = new FormData()
  form.append('file', audioBlob, 'interview.wav')
  const res = await withTimeout(
    (signal) => fetch(`${BASE_URL}/inference`, { method: 'POST', body: form, signal }),
    60000
  )
  if (!res.ok) throw new Error(`whisper-server HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.text ?? (Array.isArray(data?.transcription) ? data.transcription.map((t) => t.text).join(' ') : null)
  if (!text || !text.trim()) throw new Error('whisper-server : réponse sans texte')
  return text.trim()
}
