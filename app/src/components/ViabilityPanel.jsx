import { useState } from 'react'
import { computeViability } from '@finance/computeViability.mjs'

/**
 * "Rentabilité pour l'institution" — étape 7 du scénario de démo de Lory,
 * juste après le TEG (étape 5-6). Moteur déterministe (@finance/computeViability),
 * volontairement séparé du TEG : le TEG dit ce que le client paie et si
 * c'est légal, ce panneau dit ce que l'institution gagne ou perd — jamais
 * fusionnés (règle d'architecture "TEG ≠ rentabilité").
 */
export default function ViabilityPanel({ dossier, onCompute }) {
  const [taux, setTaux] = useState('18')
  const [frais, setFrais] = useState('0')
  const [result, setResult] = useState(dossier?.viability ?? null)

  if (!dossier) return null

  // Le score de risque (@scoring) fournit la probabilité de défaut ; ce
  // moteur ne calcule jamais le risque lui-même, il consomme uniquement le
  // résultat déjà produit par le contrat de scoring (dossier.score).
  const probabiliteDefaut = typeof dossier.score === 'number' ? (100 - dossier.score) / 100 : null

  function handleSimulate(e) {
    e.preventDefault()
    if (probabiliteDefaut === null) return
    const out = computeViability({
      montant_demande: dossier.montant_demande,
      duree_mois: dossier.duree_mois,
      taux_nominal_annuel_pct: Number(taux) || 0,
      frais_dossier: Number(frais) || 0,
      probabilite_defaut: probabiliteDefaut,
    })
    setResult(out)
    onCompute?.(out)
  }

  return (
    <div className="card">
      <h3>Rentabilité pour l'institution</h3>
      <div className="teg-note">
        Estimation de la marge nette du crédit (revenus d'intérêts et de frais, moins les coûts de
        ressources, opérationnels, du risque et technologiques) — <strong>paramètres indicatifs</strong>,
        à confirmer par la direction financière. Séparé du TEG par principe : ce calcul ne modifie
        jamais la conformité réglementaire, et le TEG n'intègre jamais ces coûts internes.
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
        <button className="btn-primary" type="submit" disabled={probabiliteDefaut === null}>
          Calculer la rentabilité
        </button>
        {probabiliteDefaut === null && (
          <div className="hint">Le score de risque du dossier est requis avant de calculer la rentabilité.</div>
        )}
      </form>

      {result && (
        <div className={`teg-result viability-result ${result.viable ? 'teg-ok' : 'teg-ko'}`}>
          <div className="teg-figs">
            <div><strong>{result.revenus.toLocaleString('fr-FR')}</strong><span>revenus FCFA</span></div>
            <div><strong>{result.couts.toLocaleString('fr-FR')}</strong><span>coûts FCFA</span></div>
            <div><strong>{result.marge.toLocaleString('fr-FR')}</strong><span>marge FCFA</span></div>
            <div><strong>{result.marge_pct.toFixed(1)}%</strong><span>marge / montant</span></div>
          </div>
          <div className="teg-status">
            {result.viable ? '✓ Crédit rentable pour l\'institution' : '✕ Marge insuffisante (seuil : ' + result.params.marge_minimale_pct + '%)'}
          </div>
          <ul className="viability-detail">
            <li>Coût des ressources : {result.detail.cout_ressources.toLocaleString('fr-FR')} FCFA</li>
            <li>Coût opérationnel : {result.detail.cout_operationnel.toLocaleString('fr-FR')} FCFA</li>
            <li>Coût du risque (défaut) : {result.detail.cout_risque.toLocaleString('fr-FR')} FCFA</li>
            <li>Coût technologique (LLM/serveur) : {result.detail.cout_technologique.toLocaleString('fr-FR')} FCFA</li>
          </ul>
        </div>
      )}
    </div>
  )
}
