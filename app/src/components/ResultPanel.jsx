const DECISION_LABEL = { approve: 'Crédit accordable', review: 'À examiner de plus près', reject: 'Crédit non recommandé' }
const DECISION_ICON = { approve: '✓', review: '!', reject: '✕' }

export default function ResultPanel({ dossier }) {
  if (!dossier) return null
  const explanations = dossier.explanations ?? []
  const guardrails = dossier.guardrails ?? []
  const champsManquants = dossier.champs_manquants ?? []
  const alertes = dossier.alertes ?? []

  return (
    <div className="card">
      <div className={`verdict verdict-${dossier.decision}`}>
        <div className="verdict-icon">{DECISION_ICON[dossier.decision] ?? '?'}</div>
        <div className="verdict-body">
          <div className="verdict-title">{DECISION_LABEL[dossier.decision] ?? dossier.decision}</div>
          <div className="verdict-sub">{dossier.client_name} · {dossier.secteur?.replace(/_/g, ' ')} · demande de {Number(dossier.montant_demande).toLocaleString('fr-FR')} FCFA sur {dossier.duree_mois} mois</div>
          <div className="verdict-figs">
            <div><strong>{dossier.score}</strong><span>score /100</span></div>
            <div><strong>{Number(dossier.recommended_amount).toLocaleString('fr-FR')}</strong><span>soutenable FCFA</span></div>
            {dossier.qualite_pct != null && <div><strong>{dossier.qualite_pct}%</strong><span>qualité du dossier</span></div>}
          </div>
        </div>
      </div>

      <h3>Facteurs de la décision (modèle entraîné)</h3>
      <div className="reasons">
        {explanations.map((r) => (
          <div key={r.code} className={`reason reason-${r.direction}`}>
            <span className="reason-tag">{r.direction === 'favorable' ? '+' : '−'}</span>
            <div className="reason-body">
              <div className="reason-label">{r.label}</div>
              <div className="reason-detail">{r.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {guardrails.length > 0 && (
        <>
          <h3>Garde-fous métier <span className="hint">(règles de politique de crédit, appliquées après le score)</span></h3>
          <div className="reasons">
            {guardrails.map((g) => (
              <div key={g.code} className="reason reason-unfavorable reason-guardrail">
                <span className="reason-tag">!</span>
                <div className="reason-body">
                  <div className="reason-label">{g.label}</div>
                  <div className="reason-detail">{g.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(champsManquants.length > 0 || alertes.length > 0) && (
        <>
          <h3>Fiabilité et limites <span className="hint">(complétude et cohérence du dossier — pas une probabilité)</span></h3>
          <ul className="reliability-list">
            {champsManquants.map((c) => <li key={c}>Champ non renseigné : {c}</li>)}
            {alertes.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </>
      )}

      <div className={`sync-badge sync-${dossier.sync_status}`}>
        {dossier.sync_status === 'synced' ? 'Synchronisé' : dossier.sync_status === 'failed' ? 'Échec de synchronisation' : 'En attente de synchronisation'}
      </div>
    </div>
  )
}
