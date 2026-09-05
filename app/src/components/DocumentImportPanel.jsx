import { useState } from 'react'
import { extractTextFromPdf } from '../documents/pdfExtract.js'
import { extractParamsFromText, DOSSIER_FIELD_SCHEMA } from '../llm/extractParamsFromText.js'

/**
 * Import d'un dossier de crédit scanné (PDF) — alternative à la saisie
 * manuelle, cf. PLAN_INTERFACE_DOCUMENTS.md §2. Pipeline :
 * PDF -> texte (pdf.js, local, aucun modèle) -> paramètres structurés (LLM
 * local) -> pré-remplissage du formulaire habituel, jamais une validation
 * automatique : l'agent relit et corrige avant de créer le dossier.
 */
export default function DocumentImportPanel({ onExtracted }) {
  const [status, setStatus] = useState('idle') // idle | reading | extracting | done | error
  const [message, setMessage] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de réimporter le même fichier après correction
    if (!file) return
    setStatus('reading')
    setMessage('')
    try {
      const { text, looksScanned, pageCount } = await extractTextFromPdf(file)
      if (looksScanned) {
        setStatus('error')
        setMessage(`Ce PDF (${pageCount} page(s)) semble être un scan sans texte sélectionnable — l'extraction ne fonctionne aujourd'hui que sur un PDF avec une vraie couche de texte (l'OCR n'est pas encore branché, cf. PLAN_INTERFACE_DOCUMENTS.md §4). Remplissez le formulaire manuellement.`)
        return
      }
      setStatus('extracting')
      const { fields } = await extractParamsFromText(text, DOSSIER_FIELD_SCHEMA)
      const count = Object.keys(fields).length
      if (count === 0) {
        setStatus('error')
        setMessage("Aucun champ n'a pu être extrait avec confiance de ce document — remplissez le formulaire manuellement.")
        return
      }
      onExtracted(fields)
      setStatus('done')
      setMessage(`${count} champ(s) extrait(s) et pré-remplis ci-dessous — vérifiez-les avant de créer le dossier.`)
    } catch (err) {
      setStatus('error')
      setMessage(
        err.message?.includes('indisponible')
          ? "Extraction automatique indisponible (le LLM local n'est pas démarré) — remplissez le formulaire manuellement."
          : `Échec de l'extraction : ${err.message}`
      )
    }
  }

  const busy = status === 'reading' || status === 'extracting'

  return (
    <div className="card">
      <h3>Importer un dossier scanné (PDF)</h3>
      <div className="teg-note">
        Optionnel — alternative à la saisie manuelle ci-dessous. Le texte du PDF est extrait localement (rien
        n'est envoyé à l'extérieur), puis le LLM local repère les champs qu'il reconnaît avec confiance.
        Rien n'est validé automatiquement : vous relisez et corrigez dans le formulaire avant de créer le dossier.
      </div>
      <label className="file-input-label">
        <input type="file" accept="application/pdf" onChange={handleFile} disabled={busy} />
        {status === 'reading' ? 'Lecture du PDF…' : status === 'extracting' ? 'Extraction en cours…' : 'Choisir un fichier PDF'}
      </label>
      {message && <div className={`import-message import-${status}`}>{message}</div>}
    </div>
  )
}
