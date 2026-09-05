// Fusionne le corpus contrôlé (rag/corpus.mjs) avec les documents importés
// par l'agent (bibliothèque documentaire, cf. db/documentsRepository.js) —
// cf. rapport "Veille et corpus multiformat", section 5 : réutiliser
// l'index existant plutôt que créer un second moteur RAG. L'index est mis
// en cache et reconstruit uniquement quand un nouveau document est indexé
// (invalidateRagIndex), pas à chaque question.
import { buildIndex } from '@rag/retrieve.mjs'
import { CORPUS } from '@rag/corpus.mjs'
import { listIndexedDocumentsForRag } from '../db/index.js'

let cachedIndex = null

export function invalidateRagIndex() {
  cachedIndex = null
}

export async function getRagIndex() {
  if (cachedIndex) return cachedIndex
  const documentsImportes = await listIndexedDocumentsForRag()
  cachedIndex = buildIndex([...CORPUS, ...documentsImportes])
  return cachedIndex
}
