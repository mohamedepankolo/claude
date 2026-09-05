/**
 * Baraka Score — recherche lexicale sur le corpus RAG.
 *
 * Pas d'embeddings, pas de base vectorielle : pour un corpus de quelques
 * documents courts, un scoring lexical (TF-IDF) est plus simple, testable
 * sans dépendance, et cohérent avec la règle d'architecture de Lory
 * ("pour les données structurées, utiliser SQL/agrégations plutôt que de
 * tout transformer en vecteurs") — un vrai vector store reste l'évolution
 * naturelle en production si le corpus grossit.
 */

const STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'est', 'sont',
  'dans', 'pour', 'par', 'sur', 'au', 'aux', 'ce', 'ces', 'se', 'sa', 'son',
  'ses', 'avec', 'plus', 'pas', 'que', 'qui', 'il', 'elle', 'on', 'ne', 'a',
  'en', 'd', 'l', 'n', 'être', 'ainsi', 'si', 'à', 'ne', 'leur', 'leurs',
])

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function chunkDocument(doc) {
  return doc.text
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ source: doc.id, sourceTitle: doc.title, chunkIndex: i, text, tokens: tokenize(text) }))
}

/** @param {Array<{id:string, title:string, text:string}>} corpus */
export function buildIndex(corpus) {
  const chunks = corpus.flatMap(chunkDocument)

  const df = new Map()
  for (const chunk of chunks) {
    for (const term of new Set(chunk.tokens)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = new Map()
  for (const [term, count] of df) idf.set(term, Math.log((1 + chunks.length) / (1 + count)) + 1)

  return { chunks, idf }
}

function termFrequencies(tokens) {
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

/**
 * @param {string} query
 * @param {{chunks: Array, idf: Map}} index
 * @param {number} [k]
 * @returns {Array<{source:string, sourceTitle:string, text:string, score:number}>}
 */
export function search(query, index, k = 3) {
  const queryTokens = tokenize(query)
  if (!queryTokens.length) return []

  const scored = index.chunks.map((chunk) => {
    const tf = termFrequencies(chunk.tokens)
    let score = 0
    for (const term of queryTokens) {
      const termFreq = tf.get(term) ?? 0
      if (termFreq === 0) continue
      score += termFreq * (index.idf.get(term) ?? 0)
    }
    return { source: chunk.source, sourceTitle: chunk.sourceTitle, text: chunk.text, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
