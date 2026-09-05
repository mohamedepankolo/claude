import { useEffect, useState } from 'react'
import { addExternalCreditCheck, listExternalCreditChecks } from '../db/index.js'
import { extractTextFromPdf } from '../documents/pdfExtract.js'
import { extractParamsFromText, BIC_FIELD_SCHEMA } from '../llm/extractParamsFromText.js'

/**
 * Dimension externe du risque (BIC) — cf. PLAN_RISQUE.md (P2) et
 * PLAN_INTERFACE_DOCUMENTS.md §1. **Facultatif** : la décision est déjà
 * affichée avant ce panneau (cf. ordre dans App.jsx), rien ici ne bloque le
 * parcours — un bouton "Passer cette étape" permet de l'ignorer explicitement.
 *
 * Ce panneau n'interroge PAS une vraie API du Bureau d'Information sur le
 * Crédit (hors de portée technique de ce prototype : contrat BCEAO, requête
 * payante). Deux façons de renseigner une vérification :
 * 1. Import du PDF du rapport de solvabilité → extraction de texte (locale)
 *    → extraction de paramètres par le LLM local → relecture avant validation.
 * 2. Saisie manuelle directe.
 * Dans les deux cas, l'agent peut ensuite relancer l'évaluation
 * (`onReevaluate`) : le score ML ne change jamais, mais les garde-fous
 * métier (@scoring/applyBusinessGuardrails) sont recalculés avec
 * l'endettement externe désormais connu.
 */
export default function ExternalChecksPanel({ dossier, onReevaluate }) {
  const [checks, setChecks] = useState([])
  const [source, setSource] = useState('bic')
  const [montant, setMontant] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [importStatus, setImportStatus] = useState('idle') // idle | reading | extracting | done | error
  const [importMessage, setImportMessage] = useState('')

  useEffect(() => {
    if (!dossier?.id) { setChecks([]); return }
    listExternalCreditChecks(dossier.id).then(setChecks)
    setSkipped(false)
  }, [dossier?.id])

  if (!dossier) return null

  async function handleImportPdf(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportStatus('reading')
    setImportMessage('')
    try {
      const { text, looksScanned, pageCount } = await extractTextFromPdf(file)
      if (looksScanned) {
        setImportStatus('error')
        setImportMessage(`Ce PDF (${pageCount} page(s)) semble être un scan sans texte sélectionnable — remplissez les champs manuellement ci-dessous.`)
        return
      }
      setImportStatus('extracting')
      const { fields } = await extractParamsFromText(text, BIC_FIELD_SCHEMA)
      if (typeof fields.endettement_externe_declare === 'number') setMontant(String(fields.endettement_externe_declare))
      if (fields.commentaire) setCommentaire(fields.commentaire)
      setSource('bic')
      const count = Object.keys(fields).length
      setImportStatus(count > 0 ? 'done' : 'error')
      setImportMessage(count > 0
        ? `${count} élément(s) extrait(s) du rapport — vérifiez avant d'archiver.`
        : "Aucun élément n'a pu être extrait avec confiance de ce document — remplissez manuellement.")
    } catch (err) {
      setImportStatus('error')
      setImportMessage(
        err.message?.includes('indisponible')
          ? "Extraction automatique indisponible (LLM local non démarré) — remplissez manuellement."
          : `Échec de l'extraction : ${err.message}`
      )
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addExternalCreditCheck(dossier.id, {
        source, montant_declare: Number(montant) || 0, commentaire,
      })
      setChecks(await listExternalCreditChecks(dossier.id))
      setMontant('')
      setCommentaire('')
      setImportStatus('idle')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddAndReevaluate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addExternalCreditCheck(dossier.id, {
        source, montant_declare: Number(montant) || 0, commentaire,
      })
      setChecks(await listExternalCreditChecks(dossier.id))
      await onReevaluate?.(Number(montant) || 0)
      setMontant('')
      setCommentaire('')
      setImportStatus('idle')
    } finally {
      setSaving(false)
    }
  }

  if (skipped) {
    return (
      <div className="card card-skipped">
        <span>Vérification externe (BIC) passée pour ce dossier.</span>
        <button type="button" className="chip" onClick={() => setSkipped(false)}>Reprendre cette étape</button>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>Vérification externe (endettement — dimension BIC) <span className="hint">facultatif</span></h3>
      <div className="teg-note">
        La décision ci-dessus ne dépend pas de cette étape. Vous pouvez la passer, ou insérer le rapport de
        solvabilité BIC (PDF) pour relancer l'évaluation en tenant compte de l'endettement externe déclaré.
        Ceci archive une vérification déjà faite — <strong>pas une consultation en direct du BIC</strong>
        (hors de portée technique de ce prototype).
      </div>

      <button type="button" className="chip" onClick={() => setSkipped(true)}>Passer cette étape</button>

      <label className="file-input-label" style={{ marginTop: 12 }}>
        <input type="file" accept="application/pdf" onChange={handleImportPdf} disabled={importStatus === 'reading' || importStatus === 'extracting'} />
        {importStatus === 'reading' ? 'Lecture du PDF…' : importStatus === 'extracting' ? 'Extraction en cours…' : 'Importer le rapport de solvabilité (PDF)'}
      </label>
      {importMessage && <div className={`import-message import-${importStatus}`}>{importMessage}</div>}

      <form>
        <div className="grid2">
          <label>Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="bic">Rapport de solvabilité BIC</option>
              <option value="manuel">Vérification manuelle</option>
            </select>
          </label>
          <label>Montant déclaré (FCFA)
            <input type="number" min="0" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </label>
          <label>Commentaire
            <input type="text" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="ex. 2 crédits actifs ailleurs, RAS sur ONEA/SONABEL" />
          </label>
        </div>
        <div className="button-row">
          <button className="btn-primary" type="button" onClick={handleAdd} disabled={saving}>Archiver seulement</button>
          <button className="btn-primary" type="button" onClick={handleAddAndReevaluate} disabled={saving || !onReevaluate}>Archiver et relancer l'évaluation</button>
        </div>
      </form>

      {checks.length === 0 && <div className="empty">Aucune vérification archivée pour ce dossier.</div>}
      {checks.length > 0 && (
        <ul className="external-checks-list">
          {checks.map((c) => (
            <li key={c.id}>
              <strong>{c.source === 'bic' ? 'BIC' : 'Manuel'}</strong> — {c.montant_declare.toLocaleString('fr-FR')} FCFA
              {c.commentaire && <> — {c.commentaire}</>}
              <span className="hint"> ({new Date(c.created_at).toLocaleDateString('fr-FR')})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
