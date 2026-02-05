import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Normalize string for comparison (remove diacritics, special chars)
export function normalize(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // Arabic diacritics
    .replace(/[^\w\u0600-\u06FF]/g, '') // Keep only letters/numbers/Arabic
    .trim()
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ARABIC_DIGITS_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
}
const ARABIC_DIGITS_REGEX = /[٠-٩]/g

export const convertNumbersToEnglish = (value: any): string => {
  if (value === null || value === undefined) return ""
  return String(value).replace(ARABIC_DIGITS_REGEX, (char) => ARABIC_DIGITS_MAP[char] || char)
}

// Generate a numeric-only invoice number aligned with system usage (6 digits)
// Extracts digits from id and pads with the timestamp to ensure consistency.
export function getNumericInvoiceNumber(id: string, date: Date): string {
  const onlyDigitsFromId = (id || "").replace(/\D/g, "")
  const ts = String(date.getTime()) // milliseconds since epoch (digits only)
  const combined = (onlyDigitsFromId + ts)
  return combined.slice(-6) // last 6 digits for stable short code
}

// Ensure images from external URLs are routed via server proxy
export function getSafeImageSrc(src?: string): string {
  if (!src || src.trim() === "") return "/placeholder.svg"

  // Already has data prefix
  if (src.startsWith("data:")) return src

  // Handle special DB_IMAGE flag (placeholder used before async loading)
  if (src === "DB_IMAGE") return "/placeholder.svg"

  // Local path
  if (src.startsWith("/")) return src

  // External URL
  if (/^https?:\/\//i.test(src)) {
    // For normal display, use the direct URL (better performance)
    // The proxy is only needed for PDF generation or canvas manipulation
    return src
  }

  // Detect raw base64 (common issue) - starts with alphanumeric, no spaces, long length
  // This is a heuristic: if it doesn't start with http or /, and is long, assume base64
  if (src.length > 100 && !src.includes(" ")) {
    if (src.startsWith("/9j/")) {
      return `data:image/jpeg;base64,${src}`
    }
    if (src.startsWith("iVBORw0KGgo")) {
      return `data:image/png;base64,${src}`
    }
    // Default fallback
    return `data:image/png;base64,${src}`
  }

  return src
}

// Format Arabic UI dates with Gregorian calendar and Latin digits
export function formatArabicGregorianDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  // Use valid BCP 47 tag; fallback gracefully if environment lacks support
  // "en-u-ca-gregory" ensures English numbers and names if Arabic is failing? 
  // User asked for "All numbers... to be English 0123...".
  // "ar-u-ca-gregory-nu-latn" is the standard way.
  const primary = "ar-u-ca-gregory-nu-latn"
  try {
    return date.toLocaleDateString(primary, options)
  } catch {
    try {
      return date.toLocaleDateString("ar", options)
    } catch {
      return date.toLocaleDateString("en-GB", options)
    }
  }
}

export function formatArabicGregorianTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  const primary = "ar-u-ca-gregory-nu-latn"
  try {
    return date.toLocaleTimeString(primary, { ...options, hour12: false })
  } catch {
    try {
      return date.toLocaleTimeString("ar", { ...options, hour12: false })
    } catch {
      return date.toLocaleTimeString("en-GB", { ...options, hour12: false })
    }
  }
}

// Format date and time together for invoices and tables
export function formatArabicGregorianDateTime(date: Date): string {
  const datePart = formatArabicGregorianDate(date)
  const timePart = formatArabicGregorianTime(date, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${datePart} ${timePart}`
}

// Ensure numbers render with English digits across UI
export function formatEnglishNumber(value: number | string): string {
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""))
  if (Number.isNaN(num)) return convertNumbersToEnglish(String(value))
  // useGrouping: false removes thousand separators (e.g. 1000 instead of 1,000)
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 20, useGrouping: false }).format(num)
}

// Download JSON helper
export function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Resolves the correct API URL based on the environment.
 * In a standalone desktop app (file://), it points to the production server.
 * Otherwise, it uses the relative path.
 */
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  // If we are in Electron/standalone environment (using file:// or app:// protocol)
  if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'app:')) {
    return `https://sahatcom.cards${cleanPath}`
  }

  return cleanPath
}
