// Assistant réglementaire RAG — corpus contrôlé + recherche lexicale
// (@rag/retrieve.mjs) + LLM local pour la synthèse finale. Distinct du
// chat du dossier (llmClient.js) : celui-ci répond sur la réglementation
// et la politique de crédit, avec citation systématique des sources.
//
// Règle d'architecture (Lory) : "le RAG explique, il ne remplace pas le
// moteur réglementaire" — cette brique ne décide jamais de la conformité
// (@regulatory/computeTEG.mjs s'en charge), elle explique et cite ses sources.
import { buildIndex, search } from '@rag/retrieve.mjs'
import { CORPUS } from '@rag/corpus.mjs'
import { isLlmAvailable, chatCompletion } from '../llm/llmClient.js'

const INDEX = buildIndex(CORPUS)

const RAG_SYSTEM_PROMPT = `Tu es l'assistant réglementaire de Baraka Score. Tu réponds en français,
brièvement. Règle stricte : réponds UNIQUEMENT à partir des passages fournis
ci-dessous, jamais avec des connaissances externes. Cite le document source
de chaque affirmation importante entre parenthèses, par exemple (source :
Méthode de calcul du TEG). Si les passages ne suffisent pas pour répondre,
dis-le clairement plutôt que de deviner ou d'inventer une règle.`

/**
 * @param {string} question
 * @returns {Promise<{ answer: string, sources: Array<{title:string, excerpt:string}>, viaLlm: boolean }>}
 */
export async function askRegulatory(question) {
  const passages = search(question, INDEX, 3)

  if (!passages.length) {
    return {
      answer: "Aucun passage du corpus ne correspond à cette question. Reformulez, ou consultez directement les documents (taux d'usure, méthode de calcul du TEG, politique de crédit).",
      sources: [],
      viaLlm: false,
    }
  }

  const sources = passages.map((p) => ({ title: p.sourceTitle, excerpt: p.text }))
  const context = passages.map((p, i) => `[Passage ${i + 1} — source : ${p.sourceTitle}]\n${p.text}`).join('\n\n')

  const llmOn = await isLlmAvailable()
  if (!llmOn) {
    return {
      answer: "Assistant local non disponible — passages trouvés dans le corpus, sans reformulation :",
      sources,
      viaLlm: false,
    }
  }

  try {
    const answer = await chatCompletion([
      { role: 'system', content: RAG_SYSTEM_PROMPT },
      { role: 'user', content: `${context}\n\nQuestion : ${question}` },
    ])
    return { answer, sources, viaLlm: true }
  } catch {
    return {
      answer: "Le LLM local n'a pas répondu — passages trouvés dans le corpus, sans reformulation :",
      sources,
      viaLlm: false,
    }
  }
}
