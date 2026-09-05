// Point d'entrée unique d'extraction — dispatche selon le type réel du
// fichier (pas seulement son extension), cf. rapport "Veille et corpus
// multiformat" §4 : "Vérifier le type réel, la taille et les limites avant
// extraction." Formats pris en charge pour le MVP : PDF (texte ou scanné,
// avec bascule OCR automatique), DOCX, JPG/PNG. Tout le reste est différé
// explicitement (cf. rapport, "Formats différés") plutôt que de tenter une
// extraction hasardeuse.
import mammoth from 'mammoth'
import { extractTextFromPdf, renderPdfPageToBlob } from './pdfExtract.js'
import { ocrImage, MAX_PAGES_OCR } from './ocrExtract.js'

export const MAX_FILE_SIZE_MB = 10 // cf. rapport §4 : valeur de départ proposée, configurable
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

const FORMATS_DIFFERES = ['.doc', '.zip', '.rar', '.mp3', '.wav', '.mp4', '.mov']

function extensionOf(name) {
  const m = /\.[^.]+$/.exec(name || '')
  return m ? m[0].toLowerCase() : ''
}

/**
 * @param {File} file
 * @returns {Promise<{ text: string, methode: string, ocrUsed: boolean, pageCount: number|null, avertissement: string|null }>}
 * @throws si le fichier dépasse la taille limite ou est d'un format différé.
 */
export async function extractDocument(file) {
  const ext = extensionOf(file.name)

  if (FORMATS_DIFFERES.includes(ext)) {
    throw new Error(`Format "${ext}" différé pour cette version — préférez un DOCX ou un PDF pour un ancien document Word (cf. rapport "Formats différés").`)
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, limite ${MAX_FILE_SIZE_MB} Mo).`)
  }

  if (file.type === 'application/pdf' || ext === '.pdf') {
    const { text, pageCount, looksScanned } = await extractTextFromPdf(file)
    if (!looksScanned) {
      return { text, methode: 'pdf_texte', ocrUsed: false, pageCount, avertissement: null }
    }
    if (pageCount > MAX_PAGES_OCR) {
      throw new Error(`PDF scanné de ${pageCount} pages — limite OCR de ${MAX_PAGES_OCR} pages pour cette version.`)
    }
    const pagesTexte = []
    let pagesIllisibles = 0
    for (let i = 1; i <= pageCount; i++) {
      const blob = await renderPdfPageToBlob(file, i)
      const { text: pageText, confidence } = await ocrImage(blob)
      if (confidence < 40 || !pageText) pagesIllisibles++
      pagesTexte.push(pageText)
    }
    return {
      text: pagesTexte.join('\n\n').trim(),
      methode: 'pdf_ocr',
      ocrUsed: true,
      pageCount,
      avertissement: pagesIllisibles > 0 ? `${pagesIllisibles} page(s) difficilement lisible(s) par l'OCR — à vérifier.` : null,
    }
  }

  if (ext === '.docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return {
      text: (result.value ?? '').trim(),
      methode: 'docx',
      ocrUsed: false,
      pageCount: null,
      avertissement: result.messages?.length ? `${result.messages.length} avertissement(s) d'extraction DOCX.` : null,
    }
  }

  if (file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png'].includes(ext)) {
    const { text, confidence } = await ocrImage(file)
    return {
      text,
      methode: 'image_ocr',
      ocrUsed: true,
      pageCount: 1,
      avertissement: confidence < 40 ? "Image difficilement lisible par l'OCR — à vérifier." : null,
    }
  }

  throw new Error(`Format non pris en charge pour cette version (${ext || file.type || 'inconnu'}).`)
}
