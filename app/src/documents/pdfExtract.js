// Extraction du texte d'un PDF — étape purement mécanique, AUCUN modèle
// (ni LLM ni OCR) : pdf.js lit la couche de texte déjà présente dans le
// fichier. Si le PDF est un scan (image sans texte sélectionnable), cette
// fonction retourne une chaîne vide — cf. PLAN_INTERFACE_DOCUMENTS.md §4 :
// l'OCR (Tesseract.js) est l'étape à ajouter séparément pour ce cas, pas
// encore branchée ici.
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
