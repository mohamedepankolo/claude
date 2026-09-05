import { useEffect, useState, useCallback } from 'react'
import { scoreCreditApplication } from '@scoring/scoreCreditApplication.mjs'
import { initDb, createApplication, saveScoreAndDecision, listApplications, getApplication, listSyncQueue } from './db/index.js'
import { processSyncQueue } from './sync/syncService.js'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import DossierForm from './components/DossierForm.jsx'
import ResultPanel from './components/ResultPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Sidebar from './components/Sidebar.jsx'
import './App.css'

// SQLite (via sql.js) n'a pas de type booléen natif ; les cases à cocher du
// formulaire arrivent en `true`/`false` JS, on les normalise en 0/1 avant
// stockage ET avant l'appel au moteur de scoring (contrat 0|1).
function normalizeBooleans(fields) {
  const boolKeys = ['informel', 'participe_tontine', 'a_historique', 'deja_impaye', 'a_caution']
  const out = { ...fields }
  for (const k of boolKeys) if (k in out) out[k] = out[k] ? 1 : 0
  return out
}

export default function App() {
  const [db, setDb] = useState(null)
  const [applications, setApplications] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showForm, setShowForm] = useState(true)
  const isOnline = useOnlineStatus()

  // Chargement de la base SQLite locale (sql.js/WASM) au démarrage.
  useEffect(() => {
    initDb().then((database) => {
      setDb(database)
      refresh(database)
    })
  }, [])

  const refresh = useCallback((database) => {
    const list = listApplications(database)
    setApplications(list)
    setPendingCount(listSyncQueue(database, 'pending').length + listSyncQueue(database, 'failed').length)
  }, [])

  function handleSelect(id) {
    setSelectedId(id)
    setSelected(getApplication(db, id))
    setShowForm(false)
  }

  function handleNew() {
    setSelectedId(null)
    setSelected(null)
    setShowForm(true)
  }

  async function handleSubmit(rawFields) {
    setSubmitting(true)
    try {
      const fields = normalizeBooleans(rawFields)
      const applicationId = createApplication(db, fields)
      const result = scoreCreditApplication({ application_id: applicationId, ...fields })
      saveScoreAndDecision(db, applicationId, result)
      refresh(db)
      handleSelect(applicationId)

      // P1 : si en ligne, on tente une synchronisation immédiate (sinon
      // l'entrée reste 'pending' dans sync_queue jusqu'à la reconnexion).
      if (navigator.onLine) await runSync()
    } finally {
      setSubmitting(false)
    }
  }

  async function runSync() {
    setSyncing(true)
    try {
      await processSyncQueue(db, { isOnline: navigator.onLine })
      refresh(db)
      if (selectedId) setSelected(getApplication(db, selectedId))
    } finally {
      setSyncing(false)
    }
  }

  // Dès que la connexion revient, on relance la synchronisation (règle de Lory :
  // "la reconnexion lance/reprend la synchronisation").
  useEffect(() => {
    if (isOnline && db && pendingCount > 0) runSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, db])

  if (!db) return <div className="loading">Initialisation de la base locale…</div>

  return (
    <div className="app">
      <Sidebar
        isOnline={isOnline}
        applications={applications}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
        pendingCount={pendingCount}
        syncing={syncing}
        onSyncNow={runSync}
      />
      <main className="main">
        {showForm && <DossierForm onSubmit={handleSubmit} submitting={submitting} />}
        {!showForm && (
          <>
            <ResultPanel dossier={selected} />
            <ChatPanel dossier={selected} />
          </>
        )}
      </main>
    </div>
  )
}
