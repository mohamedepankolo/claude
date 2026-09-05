// Service de synchronisation — implémente les règles de la section 7 du plan
// de Lory : ne jamais bloquer la saisie à cause du réseau, conserver les
// erreurs, permettre le retry, éviter les doublons (chaque entrée de
// sync_queue est traitée une fois, à l'aide d'UUID stables), afficher
// clairement l'état de synchronisation.
//
// `remoteAdapter` est le point d'intégration Firebase : tant que le projet
// Firebase de l'équipe (apiKey, projectId...) n'est pas fourni, on utilise
// `mockRemoteAdapter` ci-dessous pour que le reste de la chaîne (queue,
// retry, statuts) soit testable de bout en bout. Le remplacer par un
// vrai adapter Firestore ne doit rien changer côté appelant :
//
//   import { initializeApp } from 'firebase/app'
//   import { getFirestore, doc, setDoc } from 'firebase/firestore'
//   const app = initializeApp(firebaseConfig)
//   const dbRemote = getFirestore(app)
//   export function createFirebaseAdapter() {
//     return {
//       async push(item, record) {
//         await setDoc(doc(dbRemote, item.entity_type, item.entity_id), record)
//       },
//     }
//   }

import { listSyncQueue, markSyncQueueItem, markApplicationSynced, getApplication } from '../db/sqlite.js'

/** Adapter de secours : simule un envoi réseau (à remplacer par Firestore). */
export const mockRemoteAdapter = {
  async push(item) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400))
    if (Math.random() < 0.08) throw new Error('Échec simulé de synchronisation (réseau instable)')
    return true
  },
}

/**
 * Traite la file d'attente : n'agit que si `isOnline` est vrai. Chaque
 * élément 'pending' ou 'failed' est retenté ; un succès passe l'entité en
 * synced, un échec conserve le statut failed + le message d'erreur pour retry.
 */
export async function processSyncQueue(db, { isOnline, remoteAdapter = mockRemoteAdapter, onProgress } = {}) {
  if (!isOnline) return { processed: 0, synced: 0, failed: 0 }

  const items = [...listSyncQueue(db, 'pending'), ...listSyncQueue(db, 'failed')]
  let synced = 0
  let failed = 0

  for (const item of items) {
    try {
      const record = buildRecordForSync(db, item)
      await remoteAdapter.push(item, record)
      markSyncQueueItem(db, item.id, 'synced', null)
      if (item.entity_type === 'credit_applications') markApplicationSynced(db, item.entity_id, 'synced')
      synced += 1
    } catch (err) {
      markSyncQueueItem(db, item.id, 'failed', String(err?.message ?? err))
      if (item.entity_type === 'credit_applications') markApplicationSynced(db, item.entity_id, 'failed')
      failed += 1
    }
    onProgress?.({ done: synced + failed, total: items.length })
  }

  return { processed: items.length, synced, failed }
}

function buildRecordForSync(db, item) {
  if (item.entity_type === 'credit_applications') return getApplication(db, item.entity_id)
  // Les scores/décisions voyagent avec leur dossier ; on renvoie l'identifiant
  // pour la simulation, un vrai adapter Firestore choisira sa propre forme de document.
  return { entity_type: item.entity_type, entity_id: item.entity_id, operation: item.operation }
}
