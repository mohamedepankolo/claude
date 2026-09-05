// Extraction de paramètres structurés à partir d'un texte brut (issu d'un
// PDF via documents/pdfExtract.js, ou d'une transcription audio via
// audio/whisperClient.js) — un seul pipeline d'extraction pour ces deux
// sources, cf. PLAN_INTERFACE_DOCUMENTS.md §2-3. Réutilise le LLM local
// déjà en place (aucun modèle supplémentaire nécessaire pour cette étape).
//
// Règle stricte, comme partout ailleurs dans le projet : si le LLM est
// indisponible ou répond n'importe quoi, on ne fabrique JAMAIS de valeur —
// on lève une erreur, à charge de l'appelant de proposer la saisie/relecture
// manuelle (jamais un pré-remplissage silencieux et non vérifiable).
import { isLlmAvailable, chatCompletion } from './llmClient.js'

const EXTRACTION_SYSTEM_PROMPT = `Tu es un assistant d'extraction de données pour Baraka Score, un outil de
microcrédit. On te donne un texte brut (dossier de crédit scanné ou
transcription d'entretien) et une liste de champs à en extraire.
Règles strictes :
- Réponds UNIQUEMENT avec un objet JSON valide, rien d'autre : pas de texte avant/après, pas de balises de code.
- N'inclus une clé QUE si sa valeur apparaît clairement dans le texte fourni.
- N'invente JAMAIS une valeur absente du texte — omets simplement la clé.
- Les nombres doivent être des nombres JSON (pas de texte, pas d'espaces, pas de "FCFA").`

function buildPrompt(schema, text) {
  const fieldsDoc = Object.entries(schema).map(([k, desc]) => `- "${k}": ${desc}`).join('\n')
  return `Champs à extraire s'ils sont présents :\n${fieldsDoc}\n\nRéponds avec UNIQUEMENT un objet JSON.\n\nTEXTE :\n"""\n${text.slice(0, 6000)}\n"""`
}

function parseJsonLoose(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error("extraction : aucun JSON exploitable dans la réponse du LLM")
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * @param {string} text
 * @param {Record<string,string>} schema  nom_de_champ -> description (guide l'extraction ET whitelist les clés acceptées)
 * @returns {Promise<{ fields: Record<string, any>, raw: string }>}
 * @throws si le LLM est indisponible ou si sa réponse n'est pas exploitable.
 */
export async function extractParamsFromText(text, schema) {
  if (!text || !text.trim()) throw new Error('extraction : texte vide')
  if (!(await isLlmAvailable())) throw new Error('extraction : LLM local indisponible')

  const raw = await chatCompletion([
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(schema, text) },
  ])
  const parsed = parseJsonLoose(raw)

  // Ne garde que les clés annoncées dans le schéma : le LLM ne doit jamais
  // pouvoir injecter un champ arbitraire dans le formulaire/le scoring.
  const fields = {}
  for (const key of Object.keys(schema)) {
    if (key in parsed && parsed[key] !== null && parsed[key] !== '') fields[key] = parsed[key]
  }
  return { fields, raw }
}

// Schémas réutilisables — mêmes noms de champs que le contrat de scoring
// (scoring/scoreCreditApplication.mjs) et les garde-fous
// (scoring/applyBusinessGuardrails.mjs), pour éviter toute étape de
// traduction supplémentaire entre l'extraction et le formulaire.
export const DOSSIER_FIELD_SCHEMA = {
  clientName: 'nom complet du demandeur',
  age: 'âge en années, nombre',
  zone: '"urbain" ou "rural"',
  secteur: "un de: commerce_detail, vente_vivres, quincaillerie_materiaux, services, artisanat, agriculture",
  anciennete_activite_mois: "ancienneté de l'activité en mois, nombre",
  chiffre_affaires: "chiffre d'affaires mensuel en FCFA, nombre",
  charges_activite: 'charges/achats mensuels de l\'activité en FCFA, nombre',
  montant_demande: 'montant du crédit demandé en FCFA, nombre',
  duree_mois: 'durée du crédit demandée en mois, nombre',
  epargne_mensuelle: 'épargne mensuelle déclarée en FCFA, nombre',
  nb_credits_anterieurs: 'nombre de crédits antérieurs, nombre',
  nb_retards: 'nombre de retards de paiement passés, nombre',
  montant_dernier_credit: 'montant du dernier crédit obtenu, en FCFA, nombre',
}

export const BIC_FIELD_SCHEMA = {
  endettement_externe_declare: "montant total des engagements/crédits actifs dans d'autres institutions, en FCFA, nombre",
  commentaire: 'résumé en une phrase des éléments notables (incidents, nombre d\'institutions, factures impayées)',
}
