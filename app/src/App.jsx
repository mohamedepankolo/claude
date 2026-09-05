import { useEffect, useState, useCallback } from 'react'
import { scoreCreditApplication } from '@scoring/scoreCreditApplication.mjs'
import { applyBusinessGuardrails } from '@scoring/applyBusinessGuardrails.mjs'
import { initDb, createApplication, saveScoreAndDecision, hasOtherApplicationForClient, listApplications, getApplication, listSyncQueue } from './db/index.js'
import { processSyncQueue } from './sync/syncService.js'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import { useTheme } from './hooks/useTheme.js'
import SourceTabs from './components/SourceTabs.jsx'
import ResultPanel from './components/ResultPanel.jsx'
import DecisionExplanationPanel from './components/DecisionExplanationPanel.jsx'
import ExternalChecksPanel from './components/ExternalChecksPanel.jsx'
import RegulatoryAssistant from './components/RegulatoryAssistant.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Sidebar from './components/Sidebar.jsx'
import './App.css'

// RegulatoryPanel (TEG, "Simuler le crédit") et ViabilityPanel (rentabilité
// pour l'institution) restent construits et testés (regulatory/computeTEG.mjs,
// finance/computeViability.mjs, app/src/components/{RegulatoryPanel,ViabilityPanel}.jsx)
// mais sont retirés de l'affichage sur demande explicite — à réactiver plus
// tard si besoin, rien n'a été supprimé côté moteur.

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

// Contexte des garde-fous métier (PLAN_RISQUE.md, P0/P1) : factorisé pour
// être identique entre la première évaluation (handleSubmit) et une
// ré-évaluation ultérieure (handleReevaluateWithExternalCheck) — seul
// `endettement_externe_declare` diffère entre les deux appels.
function guardrailContext(fields, duplicate_active_client, overrides = {}) {
  return {
    montant_demande: fields.montant_demande,
    revenu_activite: fields.revenu_activite,
    duree_mois: fields.duree_mois,
    anciennete_membre_mois: fields.anciennete_membre_mois,
    endettement_externe_declare: fields.endettement_externe_declare,
    montant_dernier_credit: fields.montant_dernier_credit,
    type_credit: fields.type_credit,
    type_garantie: fields.type_garantie,
    valeur_garantie: fields.valeur_garantie,
    pertinence_saisonniere: fields.pertinence_saisonniere,
    croissance_ventes_pct: fields.croissance_ventes_pct,
    duplicate_active_client,
    ...overrides,
  }
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
  const [prefill, setPrefill] = useState(null)
  const [prefillVersion, setPrefillVersion] = useState(0)
  const isOnline = useOnlineStatus()
  const { theme, toggleTheme } = useTheme()

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
    setPrefill(null)
  }

  // Import PDF (DocumentImportPanel) et/ou audio (AudioInterviewPanel)
  // peuvent tous deux pré-remplir le formulaire — cf. PLAN_INTERFACE_DOCUMENTS.md
  // §2-3, "cas combiné" : on fusionne plutôt que d'écraser, la dernière
  // source extraite gagne en cas de champ commun.
  function handleExtracted(fields) {
    setPrefill((prev) => ({ ...prev, ...fields }))
    setPrefillVersion((v) => v + 1) // force DossierForm à se réinitialiser avec le nouveau prefill (cf. `key`)
  }

  async function handleSubmit(rawFields) {
    setSubmitting(true)
    try {
      const fields = normalizeBooleans(rawFields)
      const applicationId = await createApplication(fields)
      const scoreResult = scoreCreditApplication({ application_id: applicationId, ...fields })

      // Garde-fous métier (PLAN_RISQUE.md, P0/P1/P2) : appliqués APRÈS le
      // score ML, jamais à sa place — cf. doc de tête de
      // @scoring/applyBusinessGuardrails. La détection de doublon (P2) est
      // une vérification locale (ce navigateur), pas une consultation BIC réelle.
      const duplicate_active_client = await hasOtherApplicationForClient(fields.clientName, applicationId)
      const result = applyBusinessGuardrails(scoreResult, guardrailContext(fields, duplicate_active_client))
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

  // Ré-évaluation après ajout d'une vérification externe (BIC), cf.
  // ExternalChecksPanel "Archiver et relancer l'évaluation" et
  // PLAN_INTERFACE_DOCUMENTS.md §1. Le score ML est recalculé (fonction pure
  // du dossier stocké, mêmes entrées => même résultat) puis les garde-fous
  // sont réappliqués avec l'endettement externe désormais connu — jamais un
  // ajustement direct du score ou de la décision déjà enregistrée. Le
  // résultat s'ajoute comme une NOUVELLE ligne (cf. `mostRecent` dans
  // repository.js) : l'historique de la première évaluation est conservé.
  async function handleReevaluateWithExternalCheck(endettementExterneDeclare) {
    if (!selectedId || !selected) return
    const scoreResult = scoreCreditApplication({ application_id: selectedId, ...selected })
    const duplicate_active_client = await hasOtherApplicationForClient(selected.client_name, selectedId)
    const result = applyBusinessGuardrails(
      scoreResult,
      guardrailContext(selected, duplicate_active_client, { endettement_externe_declare: endettementExterneDeclare })
    )
    await saveScoreAndDecision(selectedId, result)
    await refresh()
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
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{showForm ? 'Nouveau dossier de crédit' : selected?.client_name}</div>
            <div className="topbar-sub">Scoring microcrédit — assistant à la décision, pas décideur automatique</div>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-badge">CIF · DigiCoop-WA+</div>
        </div>
        <div className="content">
          {showForm && (
            <SourceTabs
              onSubmit={handleSubmit}
              submitting={submitting}
              prefill={prefill}
              prefillVersion={prefillVersion}
              onExtracted={handleExtracted}
            />
          )}
          {!showForm && (
            <>
              <ResultPanel dossier={selected} />
              <DecisionExplanationPanel dossier={selected} />
              <ExternalChecksPanel dossier={selected} onReevaluate={handleReevaluateWithExternalCheck} />
              <RegulatoryAssistant />
              <ChatPanel dossier={selected} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
