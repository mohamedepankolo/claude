import { useEffect, useState } from 'react'
import { extractDocument } from '../documents/extractDocument.js'
import { addImportedDocument, updateImportedDocument, listImportedDocuments } from '../db/index.js'
import { invalidateRagIndex } from '../rag/dynamicCorpus.js'

const STATUT_LABEL = {
  recu: 'Reçu', extraction: 'Extraction en cours…', a_verifier: 'À vérifier', indexe: 'Indexé', echec: 'Échec',
}

/**
 * Bibliothèque documentaire — référentiel métier du RAG (cf. rapport
 * "Veille et corpus multiformat" §5 : espace distinct des pièces d'un
 * dossier client). Import PDF (texte ou scanné), DOCX, JPG/PNG ; relecture
 * et correction obligatoires avant indexation — jamais un texte extrait
 * automatiquement indexé sans validation (cf. §4, "Qualité des documents").
 */
export default function CorpusLibraryPanel() {
  const [documents, setDocuments] = useState([])
  const [pending, setPending] = useState(null) // { id, nom_fichier, texte, avertissement }
  const [status, setStatus] = useState('idle') // idle | processing | error
  const [message, setMessage] = useState('')

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setDocuments(await listImportedDocuments())
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus('processing')
    setMessage('')
    const docId = await addImportedDocument({ nom_fichier: file.name, type: file.type, statut: 'recu' })
    await refresh()
    try {
      await updateImportedDocument(docId, { statut: 'extraction' })
      const { text, methode, avertissement } = await extractDocument(file)
      if (!text) {
        await updateImportedDocument(docId, { statut: 'echec', erreur: "Aucun texte n'a pu être extrait de ce fichier." })
        setStatus('error')
        setMessage("Aucun texte n'a pu être extrait — fichier vide, illisible, ou format mal reconnu.")
        await refresh()
        return
      }
      await updateImportedDocument(docId, { statut: 'a_verifier', texte_extrait: text, methode })
      setPending({ id: docId, nom_fichier: file.name, texte: text, avertissement })
      setStatus('idle')
    } catch (err) {
      await updateImportedDocument(docId, { statut: 'echec', erreur: err.message })
      setStatus('error')
      setMessage(err.message)
    }
    await refresh()
  }

  async function confirmIndexation() {
    if (!pending) return
    await updateImportedDocument(pending.id, { statut: 'indexe', texte_extrait: pending.texte })
    invalidateRagIndex() // le prochain appel au RAG reconstruira l'index avec ce document
    setPending(null)
    await refresh()
  }

  function discardPending() {
    setPending(null)
  }

  return (
    <div className="card">
      <h2>Bibliothèque documentaire</h2>
      <div className="teg-note">
        Référentiel métier du RAG — procédures, politiques, notes internes. Distinct des pièces d'un
        dossier client (celles-là restent dans l'import de dossier scanné). PDF (texte ou scanné avec
        OCR), DOCX, JPG/PNG. Relecture obligatoire avant indexation — rien n'est ajouté au RAG sans validation.
      </div>

      <label className="file-input-label">
        <input type="file" accept=".pdf,.docx,image/*" onChange={handleFile} disabled={status === 'processing' || !!pending} />
        {status === 'processing' ? 'Extraction en cours (OCR possible, peut prendre un moment)…' : 'Importer un document'}
      </label>
      {message && <div className="import-message import-error">{message}</div>}

      {pending && (
        <div className="teg-result">
          <div className="teg-status">Relecture avant indexation — {pending.nom_fichier}</div>
          {pending.avertissement && <div className="import-message import-error">{pending.avertissement}</div>}
          <textarea
            value={pending.texte}
            onChange={(e) => setPending((p) => ({ ...p, texte: e.target.value }))}
            rows={10}
            style={{ width: '100%', marginTop: 10, background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, fontFamily: 'var(--sans)', fontSize: 12.5 }}
          />
          <div className="button-row">
            <button type="button" className="btn-primary" onClick={confirmIndexation}>Valider et indexer</button>
            <button type="button" className="chip" onClick={discardPending}>Annuler</button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Documents importés</h3>
      {documents.length === 0 && <div className="empty">Aucun document importé pour l'instant.</div>}
      {documents.length > 0 && (
        <ul className="external-checks-list">
          {documents.map((d) => (
            <li key={d.id}>
              <strong>{d.nom_fichier}</strong> — {STATUT_LABEL[d.statut] ?? d.statut}
              {d.erreur && <> — {d.erreur}</>}
              <span className="hint"> ({new Date(d.created_at).toLocaleDateString('fr-FR')})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
