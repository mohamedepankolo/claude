// Client pour le LLM local (llama-server + Mistral 7B Instruct GGUF, cf.
// /llm/README.md). Optionnel : toute fonction ici peut échouer (serveur pas
// démarré, modèle absent) et l'appelant doit retomber sur
// `fallbackResponder.js`, jamais inventer un résultat (Plan B de Lory).
const BASE_URL = import.meta.env.VITE_LLM_URL || 'http://127.0.0.1:8090'

async function withTimeout(promise, ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await promise(ctrl.signal)
  } finally {
    clearTimeout(t)
  }
}

export async function isLlmAvailable() {
  try {
    const res = await withTimeout((signal) => fetch(`${BASE_URL}/health`, { signal }), 800)
    return res.ok
  } catch {
    return false
  }
}

function dossierContext(dossier) {
  const facteurs = (dossier.explanations ?? [])
    .map((e) => `- ${e.label} (${e.direction === 'favorable' ? 'favorable' : 'défavorable'}) : ${e.detail}`)
    .join('\n')
  return [
    `Dossier de ${dossier.client_name}, secteur ${dossier.secteur}.`,
    `Montant demandé : ${dossier.montant_demande} FCFA sur ${dossier.duree_mois} mois.`,
    `Score : ${dossier.score}/100. Niveau de risque : ${dossier.risk_level}. Décision : ${dossier.decision}.`,
    `Montant soutenable estimé : ${dossier.recommended_amount} FCFA.`,
    'Facteurs retenus par le modèle :',
    facteurs,
  ].join('\n')
}

const SYSTEM_PROMPT = `Tu es l'assistant de Baraka Score, un outil d'aide à la décision pour des
agents de microfinance. Tu réponds en français, de façon brève et concrète.
Règle stricte : n'utilise QUE les chiffres du dossier fournis dans le
contexte ci-dessous. N'invente jamais une donnée absente. Si tu ne peux pas
répondre avec les informations données, dis-le explicitement plutôt que de
deviner. Rappelle si utile que l'outil assiste l'agent, il ne décide pas à sa place.`

async function chatCompletion(messages) {
  const res = await withTimeout(
    (signal) => fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ messages, temperature: 0.2, max_tokens: 300 }),
    }),
    15000
  )
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('LLM: réponse vide')
  return text.trim()
}

/** Reformule l'explication du score en langage plus naturel. Peut lever une erreur : à catcher par l'appelant. */
export async function explainWithLlm(dossier) {
  return chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${dossierContext(dossier)}\n\nExplique cette décision en 3-4 phrases claires, comme si tu parlais à l'agent.` },
  ])
}

/** Répond à une question libre sur le dossier. `history` = [{role, content}] des échanges précédents. */
export async function askLlm(dossier, question, history = []) {
  return chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: dossierContext(dossier) },
    ...history,
    { role: 'user', content: question },
  ])
}
