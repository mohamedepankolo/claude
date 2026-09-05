import { useEffect, useState, useCallback } from 'react'
import { scoreCreditApplication } from '@scoring/scoreCreditApplication.mjs'
import { initDb, createApplication, saveScoreAndDecision, saveRegulatoryResult, listApplications, getApplication, listSyncQueue } from './db/index.js'
import { processSyncQueue } from './sync/syncService.js'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import DossierForm from './components/DossierForm.jsx'
import ResultPanel from './components/ResultPanel.jsx'
import RegulatoryPanel from './components/RegulatoryPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Sidebar from './components/Sidebar.jsx'
import './App.css'

// IndexedDB (Dexie) n'a pas de type booléen natif au sens SQL, et le
// contrat de scoring attend des 0/1 ; les cases à cocher du formulaire
// arrivent en `true`/`false` JS, on les normalise avant stockage ET avant
// l'appel au moteur de scoring.
function normalizeBooleans(fields) {
  const boolKeys = ['informel', 'participe_tontine', 'a_historique', 'deja_impaye', 'a_caution']
  const out = { ...fields }
  for (const k of boolKeys) if (k in out) out[k] = out[k] ? 1 : 0
  return out
}

export default function App() {
  const [dbReady, setDbReady] = useState(false)
  const [applications, setApplications] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showForm, setShowForm] = useState(true)
  const isOnline = useOnlineStatus()

  // Ouverture de la base locale (IndexedDB via Dexie) au démarrage.
  useEffect(() => {
    initDb().then(() => {
      setDbReady(true)
      refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(async () => {
    const [list, pending, failed] = await Promise.all([
      listApplications(), listSyncQueue('pending'), listSyncQueue('failed'),
    ])
    setApplications(list)
    setPendingCount(pending.length + failed.length)
  }, [])

  async function handleSelect(id) {
    setSelectedId(id)
    setSelected(await getApplication(id))
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
      const applicationId = await createApplication(fields)
      const result = scoreCreditApplication({ application_id: applicationId, ...fields })
      await saveScoreAndDecision(applicationId, result)
      await refresh()
      await handleSelect(applicationId)

      // P1 : si en ligne, on tente une synchronisation immédiate (sinon
      // l'entrée reste 'pending' dans sync_queue jusqu'à la reconnexion).
      if (navigator.onLine) await runSync()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComputeTEG(regResult) {
    if (!selectedId) return
    await saveRegulatoryResult(selectedId, regResult)
    setSelected(await getApplication(selectedId))
    if (navigator.onLine) await runSync()
  }

  async function runSync() {
    setSyncing(true)
    try {
      await processSyncQueue({ isOnline: navigator.onLine })
      await refresh()
      if (selectedId) setSelected(await getApplication(selectedId))
    } finally {
      setSyncing(false)
    }
  }

  // Dès que la connexion revient, on relance la synchronisation (règle de Lory :
  // "la reconnexion lance/reprend la synchronisation").
  useEffect(() => {
    if (isOnline && dbReady && pendingCount > 0) runSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, dbReady])

  if (!dbReady) return <div className="loading">Initialisation de la base locale…</div>

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
            <RegulatoryPanel dossier={selected} onCompute={handleComputeTEG} />
            <ChatPanel dossier={selected} />
          </>
        )}
      </main>
    </div>
  )
}
