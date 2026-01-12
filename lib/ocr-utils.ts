/**
 * OCR and code normalization utilities
 */

/**
 * Normalize product code by removing spaces and converting to uppercase
 */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase()
}

/**
 * Perform OCR on file (placeholder - needs actual OCR implementation)
 * @param file File to process
 * @returns Extracted text/code
 */
export async function performOcrOnFile(file: File): Promise<string> {
  // This is a placeholder implementation
  // In production, you would integrate with an OCR service like:
  // - Tesseract.js
  // - Google Cloud Vision
  // - AWS Textract
  // etc.
  
  console.warn('OCR not implemented - returning empty string')
  return ''
}
