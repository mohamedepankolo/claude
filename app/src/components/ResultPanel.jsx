const DECISION_LABEL = { approve: 'Crédit accordable', review: 'À examiner de plus près', reject: 'Crédit non recommandé' }

export default function ResultPanel({ dossier }) {
  if (!dossier) return null
  const explanations = dossier.explanations ?? []
  const guardrails = dossier.guardrails ?? []

  return (
    <div className="card">
      <div className={`verdict verdict-${dossier.decision}`}>
        <div className="verdict-title">{DECISION_LABEL[dossier.decision] ?? dossier.decision}</div>
        <div className="verdict-sub">{dossier.client_name} · {dossier.secteur?.replace(/_/g, ' ')} · demande de {Number(dossier.montant_demande).toLocaleString('fr-FR')} FCFA sur {dossier.duree_mois} mois</div>
        <div className="verdict-figs">
          <div><strong>{dossier.score}</strong><span>score /100</span></div>
          <div><strong>{Number(dossier.recommended_amount).toLocaleString('fr-FR')}</strong><span>soutenable FCFA</span></div>
          <div><strong>{Math.round((dossier.confidence ?? 0) * 100)}%</strong><span>confiance</span></div>
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

      <div className={`sync-badge sync-${dossier.sync_status}`}>
        {dossier.sync_status === 'synced' ? 'Synchronisé' : dossier.sync_status === 'failed' ? 'Échec de synchronisation' : 'En attente de synchronisation'}
      </div>
    </div>
  )
}
