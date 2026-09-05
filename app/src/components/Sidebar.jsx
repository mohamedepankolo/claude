const DECISION_LABEL = { approve: 'Accordé', review: 'À examiner', reject: 'Refusé', abstention: 'À compléter' }

export default function Sidebar({ isOnline, applications, selectedId, onSelect, onNew, onOpenLibrary, showLibrary, pendingCount, syncing, onSyncNow, theme, onToggleTheme }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">Baraka Score</div>
        <div className="brand-tag">Scoring microcrédit explicable<br />CIF · Projet DigiCoop-WA+</div>
      </div>

      <div className="side-block">
        <button className="nav-item" onClick={onNew}>+ Nouveau dossier</button>
        <button className="nav-item" onClick={onOpenLibrary} style={{ marginTop: 6 }} aria-current={showLibrary}>
          📚 Bibliothèque documentaire
        </button>
        <div className={`conn-status conn-${isOnline ? 'online' : 'offline'}`}>
          <span className="dot" /> {isOnline ? 'En ligne' : 'Hors ligne'}
          {pendingCount > 0 && <span className="pending-count">{pendingCount} en attente</span>}
        </div>
        {isOnline && pendingCount > 0 && (
          <button className="nav-item" onClick={onSyncNow} disabled={syncing} style={{ marginTop: 8 }}>
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </button>
        )}
      </div>

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

      <div className="side-foot">
        <span style={{ fontSize: 11.5, color: 'var(--side-ink-3)' }}>Baraka Score</span>
        <button type="button" className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀ Clair' : '☾ Sombre'}
        </button>
      </div>
    </aside>
  )
}
