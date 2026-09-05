import { useState } from 'react'
import { computeTEG, DEFAULT_TAUX_USURE } from '@regulatory/computeTEG.mjs'

/**
 * "Simuler le crédit" — étape 5-6 du scénario de démo de Lory : on affiche
 * le TEG et sa conformité au plafond légal, séparément du score de risque.
 * Moteur déterministe (@regulatory/computeTEG) : jamais piloté par le LLM.
 */
export default function RegulatoryPanel({ dossier, onCompute }) {
  const [taux, setTaux] = useState('18')
  const [frais, setFrais] = useState('0')
  const [result, setResult] = useState(dossier?.regulatory ?? null)

  if (!dossier) return null

  function handleSimulate(e) {
    e.preventDefault()
    const out = computeTEG({
      montant_demande: dossier.montant_demande,
      duree_mois: dossier.duree_mois,
      taux_nominal_annuel_pct: Number(taux) || 0,
      frais_dossier: Number(frais) || 0,
    })
    setResult(out)
    onCompute?.(out)
  }

  return (
    <div className="card">
      <h3>Simuler le crédit — conformité TEG</h3>
      <div className="teg-note">
        Plafond de référence : {(DEFAULT_TAUX_USURE * 100).toFixed(0)}% — <strong>valeur indicative</strong>, à
        remplacer par le taux d'usure réglementaire confirmé. Ce moteur est déterministe : le résultat ne dépend
        jamais du LLM.
      </div>
      <form onSubmit={handleSimulate}>
        <div className="grid2">
          <label>Taux nominal annuel (%)
            <input type="number" min="0" step="0.5" value={taux} onChange={(e) => setTaux(e.target.value)} />
          </label>
          <label>Frais de dossier (FCFA)
            <input type="number" min="0" value={frais} onChange={(e) => setFrais(e.target.value)} />
          </label>
        </div>
        <button className="btn-primary" type="submit">Calculer le TEG</button>
      </form>

      {result && (
        <div className={`teg-result teg-${result.compliant ? 'ok' : 'ko'}`}>
          <div className="teg-figs">
            <div><strong>{(result.teg * 100).toFixed(2)}%</strong><span>TEG</span></div>
            <div><strong>{(result.plafond * 100).toFixed(0)}%</strong><span>plafond</span></div>
            <div><strong>{result.mensualite.toLocaleString('fr-FR')}</strong><span>mensualité FCFA</span></div>
          </div>
          <div className="teg-status">{result.compliant ? '✓ Conforme au plafond' : '✕ Non conforme — dépasse le plafond'}</div>
        </div>
      )}
    </div>
  )
}
