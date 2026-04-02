import { jsPDF } from "jspdf"
import JsBarcode from "jsbarcode"
import type { Product } from "./types"

export type BarcodeFormat = "CODE128" | "QR"

export interface BarcodeOptions {
  format: BarcodeFormat
  showName: boolean
  showItemNumber: boolean
  showPrice: boolean
  showCode: boolean
  textPosition: "above" | "below" | "left" | "right"
  darkColor: string // لون الخطوط/الوحدات
  lightColor: string // لون الخلفية
  unitWidth: number // عرض الوحدة (JsBarcode width) أو حجم QR
  unitHeight: number // ارتفاع الباركود (JsBarcode height)
  fontSize: number
}

// تحميل خط عربي للـ Canvas كي تُعرض النصوص بشكل صحيح
function ensureArabicFontLoaded(): void {
  if (typeof document === "undefined") return
  const existing = document.getElementById("arabic-font-link") as HTMLLinkElement | null
  if (!existing) {
    const link = document.createElement("link")
    link.id = "arabic-font-link"
    link.rel = "stylesheet"
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Cairo:wght@400;700&display=swap"
    document.head.appendChild(link)
  }
}

export const generateProductBarcode = (product: Product): string => {
  const canvas = document.createElement("canvas")
  JsBarcode(canvas, product.productCode, {
    format: "CODE128",
    width: 2,
    height: 50,
    displayValue: true,
    fontSize: 14,
    margin: 10,
  })
  return canvas.toDataURL("image/png")
}

// يرسم بطاقة باركود/QR على Canvas مع عناصر نصية عربية قابلة للتخصيص
async function composeCodeCanvas(product: Product, options: BarcodeOptions): Promise<HTMLCanvasElement> {
  ensureArabicFontLoaded()

  // أبعاد أساسية لرمز الباركود/QR داخل البطاقة
  const baseWidth = Math.max(200, Math.floor(options.unitWidth * 100))
  const baseHeight = Math.max(60, Math.floor(options.unitHeight * 20))

  // سنضيف مساحة للنص حسب الموضع
  const textLines: string[] = []
  if (options.showName) textLines.push(product.productName || "")
  if (options.showItemNumber) textLines.push(product.itemNumber || "")
  if (options.showPrice) textLines.push(typeof product.price === "number" ? `${product.price}` : "")
  if (options.showCode) textLines.push(product.productCode || "")

  const lineHeight = options.fontSize + 6
  const textBlockWidthEstimate = 260 // تقدير عرض كتلة النص عند الوضع يمين/يسار
  const textBlockHeight = textLines.length * lineHeight

  let canvasWidth = baseWidth
  let canvasHeight = baseHeight
  if (options.textPosition === "above" || options.textPosition === "below") {
    canvasHeight += textBlockHeight + 20
  } else {
    canvasWidth += textBlockWidthEstimate + 20
  }

  const finalCanvas = document.createElement("canvas")
  finalCanvas.width = canvasWidth
  finalCanvas.height = canvasHeight
  const ctx = finalCanvas.getContext("2d")!

  // خلفية
  ctx.fillStyle = options.lightColor
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // إنشاء رمز داخل Canvas مؤقت
  const codeCanvas = document.createElement("canvas")
  // مساحة للرمز فقط
  codeCanvas.width = baseWidth
  codeCanvas.height = baseHeight

  if (options.format === "CODE128") {
    JsBarcode(codeCanvas, product.productCode || "", {
      format: "CODE128",
      width: Math.max(1, options.unitWidth),
      height: Math.max(40, options.unitHeight),
      displayValue: false,
      lineColor: options.darkColor,
      background: options.lightColor,
      margin: 10,
    })
  } else {
    const QRCode = (await import("qrcode")).default
    await QRCode.toCanvas(codeCanvas, JSON.stringify({
      code: product.productCode,
      name: product.productName,
      price: product.price,
      itemNumber: product.itemNumber,
    }), {
      width: baseWidth,
      margin: 1,
      color: { dark: options.darkColor, light: options.lightColor },
    })
  }

  // موضع الرمز داخل البطاقة
  let codeX = 10
  let codeY = 10
  if (options.textPosition === "left") {
    // ضع النص يساراً والرمز يميناً
    codeX = textBlockWidthEstimate
  } else {
    codeX = 10
  }
  if (options.textPosition === "above") {
    codeY = textBlockHeight + 10
  } else {
    codeY = 10
  }

  ctx.drawImage(codeCanvas, codeX, codeY)

  // رسم النص العربي
  ctx.fillStyle = "#000000"
  ctx.font = `${options.fontSize}px "Noto Sans Arabic", "Cairo", sans-serif`
  ctx.textAlign = options.textPosition === "left" ? "right" : "center"

  const startY = (() => {
    if (options.textPosition === "above") return 10 + options.fontSize
    if (options.textPosition === "below") return codeY + baseHeight + 10 + options.fontSize
    return 20 + options.fontSize // لليسار/اليمين
  })()

  const textX = (() => {
    if (options.textPosition === "left") return textBlockWidthEstimate - 10
    if (options.textPosition === "right") return codeX + baseWidth + textBlockWidthEstimate / 2
    return codeX + baseWidth / 2
  })()

  textLines.forEach((line, i) => {
    const y = startY + i * lineHeight
    // Canvas يدعم تشكيل العربية تلقائياً مع الخط المناسب
    ctx.fillText(String(line || ""), textX, y)
  })

  return finalCanvas
}

export const generateBarcodeSheet = (products: Product[]): void => {
  // الإبقاء على الدالة القديمة للتوافق الخلفي: تستخدم إعدادات افتراضية
  generateCodesSheet(products, {
    format: "CODE128",
    showName: true,
    showItemNumber: false,
    showPrice: false,
    showCode: true,
    textPosition: "below",
    darkColor: "#000000",
    lightColor: "#FFFFFF",
    unitWidth: 1.5,
    unitHeight: 40,
    fontSize: 10,
  })
}

export const generateQRCode = async (data: string): Promise<string> => {
  const QRCode = (await import("qrcode")).default
  return await QRCode.toDataURL(data, {
    width: 200,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  })
}

export const generateProductQRSheet = async (products: Product[]): Promise<void> => {
  // للتوافق الخلفي: تحويل إلى الدالة الموحدة بخيارات افتراضية
  await generateCodesSheet(products, {
    format: "QR",
    showName: true,
    showItemNumber: false,
    showPrice: false,
    showCode: true,
    textPosition: "below",
    darkColor: "#000000",
    lightColor: "#FFFFFF",
    unitWidth: 2,
    unitHeight: 60,
    fontSize: 10,
  })
}

export async function generateCodesSheet(products: Product[], options: BarcodeOptions): Promise<void> {
  const pdf = new jsPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // حجم عنصر البطاقة داخل PDF (نحسبه من أبعاد Canvas لاحقاً)
  const itemsPerRow = options.format === "QR" ? 3 : 3
  const rowsPerPage = options.format === "QR" ? 6 : 6
  const padding = 8

  for (let i = 0; i < products.length; i++) {
    if (i > 0 && i % (itemsPerRow * rowsPerPage) === 0) pdf.addPage()
    const product = products[i]

    const positionInPage = i % (itemsPerRow * rowsPerPage)
    const row = Math.floor(positionInPage / itemsPerRow)
    const col = positionInPage % itemsPerRow

    const cardCanvas = await composeCodeCanvas(product, options)
    const cardW = (pageWidth - padding * 2) / itemsPerRow - padding
    const cardH = (pageHeight - padding * 2) / rowsPerPage - padding

    const x = padding + col * (cardW + padding)
    const y = padding + row * (cardH + padding)

    pdf.addImage(cardCanvas.toDataURL("image/png"), "PNG", x, y, cardW, cardH)
  }

  pdf.save(options.format === "QR" ? "qr-codes.pdf" : "barcodes.pdf")
}
