// Extraction du texte d'un PDF — étape purement mécanique, AUCUN modèle
// (ni LLM ni OCR) : pdf.js lit la couche de texte déjà présente dans le
// fichier. Si le PDF est un scan (image sans texte sélectionnable), voir
// `renderPdfPageToBlob` ci-dessous + `documents/ocrExtract.js` pour la
// suite (OCR page par page, cf. rapport "Veille et corpus multiformat" §4).
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * @param {File|Blob} file
 * @returns {Promise<{ text: string, pageCount: number, looksScanned: boolean }>}
 */
export async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => it.str).join(' '))
  }
  const text = pages.join('\n\n').trim()
  return {
    text,
    pageCount: doc.numPages,
    // Heuristique simple : un PDF scanné sans couche de texte ne renvoie
    // presque rien malgré des pages réelles — on le signale à l'appelant
    // plutôt que de prétendre avoir lu un document vide.
    looksScanned: doc.numPages > 0 && text.length < 20 * doc.numPages,
  }
}

/**
 * Rend une page de PDF en image (PNG) pour l'OCR — utilisé uniquement quand
 * `extractTextFromPdf` signale `looksScanned`. Limite MVP : pages traitées
 * une par une, taille raisonnable (échelle 2x, cf. rapport §4 "taille et
 * nombre de pages limités").
 * @param {File|Blob} file
 * @param {number} pageNumber 1-indexé
 * @returns {Promise<Blob>}
 */
export async function renderPdfPageToBlob(file, pageNumber, scale = 2) {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
