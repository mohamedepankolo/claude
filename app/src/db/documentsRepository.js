// Bibliothèque documentaire (référentiel métier, RAG global) — cf. rapport
// "Veille et corpus multiformat", section 5 : "Réutiliser l'index existant,
// avec métadonnées et filtres, sans créer un second moteur RAG inutile."
// Ces documents s'ajoutent au corpus contrôlé (`rag/corpus.mjs`) plutôt que
// de le remplacer — cf. `rag/dynamicCorpus.js` pour la fusion des deux au
// moment de la recherche.
import { v4 as uuid } from 'uuid'
import { db } from './db.js'

const now = () => new Date().toISOString()

/**
 * Enregistre un document importé. `statut` suit le cycle du rapport :
 * reçu -> extraction -> à_vérifier -> indexé (ou échec à tout moment).
 */
export async function addImportedDocument({ nom_fichier, type, texte_extrait, statut, erreur, methode }) {
  const id = uuid()
  await db.imported_documents.add({
    id, nom_fichier, type, texte_extrait: texte_extrait ?? '', statut,
    erreur: erreur ?? null, methode: methode ?? null, version: 1, created_at: now(), updated_at: now(),
  })
  return id
}

export async function updateImportedDocument(id, patch) {
  await db.imported_documents.update(id, { ...patch, updated_at: now() })
}

export async function listImportedDocuments() {
  const rows = await db.imported_documents.toArray()
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

/** Documents indexés, au format attendu par rag/retrieve.mjs ({id, title, text}). */
export async function listIndexedDocumentsForRag() {
  const rows = await db.imported_documents.where('statut').equals('indexe').toArray()
  return rows.map((d) => ({ id: d.id, title: d.nom_fichier, text: d.texte_extrait }))
}
