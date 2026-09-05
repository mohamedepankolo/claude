// OCR (Tesseract.js) — utilisé pour deux cas seulement (cf. rapport "Veille
// et corpus multiformat" §4) : une image (JPG/PNG) d'un document photographié,
// ou une page de PDF scanné sans couche de texte (rendue en image d'abord,
// cf. documents/pdfExtract.js:renderPdfPageToBlob). Langue française
// uniquement pour le MVP — limite documentée, pas une promesse générale.
// Aucune promesse sur l'écriture manuscrite ou les schémas complexes.
//
// Chemins explicitement locaux (worker + données de langue) plutôt que le
// CDN par défaut de tesseract.js : cohérent avec le principe hors-ligne du
// projet (l'OCR ne doit pas dépendre d'un réseau au moment de l'usage), et
// évite un appel externe bloqué par un pare-feu/proxy d'entreprise. Le
// fichier de langue (`public/tessdata/fra.traineddata.gz`, ~6 Mo) est
// embarqué une fois pour toutes dans le build — voir `app/README.md`.
import { createWorker } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'

const MAX_PAGES_OCR = 20 // cf. rapport §4 : "taille et nombre de pages limités"

let workerPromise = null
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('fra', 1, { workerPath, langPath: '/tessdata', corePath: '/tesseract-core/tesseract-core-lstm.wasm.js' })
  }
  return workerPromise
}

/** @param {Blob} imageBlob @returns {Promise<{ text: string, confidence: number }>} */
export async function ocrImage(imageBlob) {
  const worker = await getWorker()
  const { data } = await worker.recognize(imageBlob)
  return { text: (data.text ?? '').trim(), confidence: data.confidence ?? 0 }
}

export { MAX_PAGES_OCR }
