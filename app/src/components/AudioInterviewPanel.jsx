import { useRef, useState } from 'react'
import { isWhisperAvailable, transcribeAudio } from '../audio/whisperClient.js'
import { extractParamsFromText, DOSSIER_FIELD_SCHEMA } from '../llm/extractParamsFromText.js'

/**
 * Entretien enregistré -> transcription -> extraction — cf.
 * PLAN_INTERFACE_DOCUMENTS.md §3. Même pipeline d'extraction que
 * DocumentImportPanel.jsx (PDF), juste une source différente en amont
 * (audio transcrit au lieu de texte de PDF). Nécessite un `whisper-server`
 * local démarré séparément (cf. §4 du même document) — entièrement
 * optionnel, jamais bloquant si absent.
 */
export default function AudioInterviewPanel({ onExtracted }) {
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('idle') // idle | recording | transcribing | extracting | done | error
  const [message, setMessage] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const lastBlobRef = useRef(null)

  async function startRecording() {
    setMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        lastBlobRef.current = blob
        processAudio(blob)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setStatus('recording')
    } catch {
      setStatus('error')
      setMessage("Micro inaccessible (permission refusée ou aucun périphérique) — vous pouvez importer un fichier audio existant à la place.")
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    lastBlobRef.current = file
    await processAudio(file)
  }

  async function processAudio(blob) {
    setStatus('transcribing')
    setMessage('')
    try {
      if (!(await isWhisperAvailable())) {
        setStatus('error')
        setMessage("Serveur de transcription non détecté (whisper-server) — l'enregistrement est prêt, réessayez une fois le serveur démarré (cf. PLAN_INTERFACE_DOCUMENTS.md §4).")
        return
      }
      const text = await transcribeAudio(blob)
      setStatus('extracting')
      const { fields } = await extractParamsFromText(text, DOSSIER_FIELD_SCHEMA)
      const count = Object.keys(fields).length
      if (count === 0) {
        setStatus('error')
        setMessage("La transcription a réussi mais aucun champ n'a pu en être extrait avec confiance — remplissez le formulaire manuellement.")
        return
      }
      onExtracted(fields)
      setStatus('done')
      setMessage(`${count} champ(s) extrait(s) de l'entretien et pré-remplis ci-dessous — vérifiez-les avant de créer le dossier.`)
    } catch (err) {
      setStatus('error')
      setMessage(`Échec de la transcription/extraction : ${err.message}`)
    }
  }

  function retry() {
    if (lastBlobRef.current) processAudio(lastBlobRef.current)
  }

  return (
    <div className="card">
      <h3>Entretien enregistré (audio)</h3>
      <div className="teg-note">
        Optionnel. Enregistrez l'entretien ou importez un fichier audio existant : transcription locale
        (whisper.cpp) puis extraction des paramètres par le LLM local, avec le même principe de relecture
        que l'import PDF — rien n'est validé automatiquement.
      </div>
      <div className="audio-controls">
        {!recording
          ? <button type="button" className="btn-primary" onClick={startRecording} disabled={status === 'transcribing' || status === 'extracting'}>Démarrer l'enregistrement</button>
          : <button type="button" className="btn-primary btn-recording" onClick={stopRecording}>Arrêter l'enregistrement</button>}
        <label className="file-input-label">
          <input type="file" accept="audio/*" onChange={handleFileUpload} disabled={recording || status === 'transcribing' || status === 'extracting'} />
          Importer un fichier audio
        </label>
        {status === 'error' && lastBlobRef.current && (
          <button type="button" className="chip" onClick={retry}>Réessayer la transcription</button>
        )}
      </div>
      {(status === 'transcribing' || status === 'extracting') && (
        <div className="import-message">{status === 'transcribing' ? 'Transcription en cours…' : 'Extraction en cours…'}</div>
      )}
      {message && <div className={`import-message import-${status}`}>{message}</div>}
    </div>
  )
}
