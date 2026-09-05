const DECISION_LABEL = { approve: 'Accordé', review: 'À examiner', reject: 'Refusé' }

export default function Sidebar({ isOnline, applications, selectedId, onSelect, onNew, pendingCount, syncing, onSyncNow }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">Baraka Score</div>
        <div className="brand-tag">Scoring microcrédit — prototype React/SQLite/Firebase</div>
      </div>

      <button className="nav-item" onClick={onNew}>+ Nouveau dossier</button>

      <div className={`conn-status conn-${isOnline ? 'online' : 'offline'}`}>
        <span className="dot" /> {isOnline ? 'En ligne' : 'Hors ligne'}
        {pendingCount > 0 && <span className="pending-count">{pendingCount} en attente</span>}
      </div>
      {isOnline && pendingCount > 0 && (
        <button className="nav-item" onClick={onSyncNow} disabled={syncing}>
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      )}

      <div className="side-label">Dossiers</div>
      <div className="dossiers">
        {applications.length === 0 && <div className="empty">Aucun dossier pour le moment.</div>}
        {applications.map((a) => (
          <div key={a.id} className={`dossier-card ${a.id === selectedId ? 'active' : ''}`} onClick={() => onSelect(a.id)}>
            <div className="dossier-name">{a.client_name}</div>
            <div className="dossier-meta">
              {a.decision && <span className={`pill pill-${a.decision}`}>{DECISION_LABEL[a.decision]}</span>}
              <span className="dossier-sync">{a.sync_status}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
