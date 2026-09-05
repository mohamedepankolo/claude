import { useEffect, useState } from 'react'
import { addExternalCreditCheck, listExternalCreditChecks } from '../db/index.js'

/**
 * Dimension externe du risque (BIC) — cf. PLAN_RISQUE.md, P2. Ce panneau
 * n'interroge PAS une vraie API du Bureau d'Information sur le Crédit (hors
 * de portée technique de ce prototype : contrat BCEAO, requête payante) —
 * il opérationnalise la recommandation explicite de Prisca (session de
 * mentoring 3) : archiver dans une "bibliothèque" interne chaque
 * vérification d'endettement externe faite par l'agent (rapport BIC papier/PDF,
 * ou vérification manuelle), pour ne pas reperdre l'information.
 */
export default function ExternalChecksPanel({ dossier }) {
  const [checks, setChecks] = useState([])
  const [source, setSource] = useState('bic')
  const [montant, setMontant] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dossier?.id) { setChecks([]); return }
    listExternalCreditChecks(dossier.id).then(setChecks)
  }, [dossier?.id])

  if (!dossier) return null

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
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h3>Vérifications externes (endettement — dimension BIC)</h3>
      <div className="teg-note">
        Archive locale des vérifications d'endettement externe (rapport de solvabilité BIC ou
        vérification manuelle) — <strong>pas une consultation en direct du Bureau d'Information
        sur le Crédit</strong>, qui nécessite une intégration réelle hors de portée de ce prototype.
        Sert à ne pas reperdre une information déjà vérifiée (recommandation de Prisca).
      </div>

      <form onSubmit={handleAdd}>
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
        <button className="btn-primary" type="submit" disabled={saving}>Archiver la vérification</button>
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
