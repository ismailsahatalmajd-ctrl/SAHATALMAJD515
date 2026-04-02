// Import dynamic settings
import { getSettings } from "./settings-store"

// Counter for sequential numbering (in production, this would come from database)
let productCounter = 1

interface ProductInput {
  productName?: string
  productNameEnglish?: string
  category: string
  brand: string
  color: string
  collection?: string
  quantity?: string
  unit?: string
  sequence?: string
  usage?: string
  material?: string
}

interface GeneratedProduct {
  internalCode: string
  barcode: string
  fullNameArabic: string
  fullNameEnglish: string
  barcodeBreakdown?: BarcodeBreakdown
}

interface BarcodeBreakdown {
  saudiCode: string
  companyCode: string
  year: string
  month: string
  sequence: string
  categoryNum: string
  colorNum: string
  collectionNum: string
  checksum: string
  [key: string]: string
}

export function generateProduct(input: ProductInput): GeneratedProduct {
  // Get dynamic settings
  const settings = getSettings()

  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, "0")

  // Generate sequence number
  const sequence = input.sequence || generateSequence()

  // --- INTERNAL CODE GENERATION ---
  // Pattern: [TYPE]-[BRAND]-[CAT]-[COLOR]-[YY]-[SEQ]
  // According to user example: BOX-MIXB-SHK-BRN-23-0456
  // But strictly looking at user input mapping:
  // Type = Category Code (BOX)
  // Brand = Brand Code (MIXB)
  // Cat = ??? User example "SHK" for "شوكولاته". We don't have "SHK". 
  // Let's assume input.category IS the "Type".
  // User example: Hanoverian 12oz Paper Cup -> CUP-HANO-PPR-WHT-24-0123
  // CUP = Type (Category)
  // HANO = Brand
  // PPR = Material? Or SubCategory? 
  // The user said: "PPR: كود الفئة (ورق)". So here "Paper" is a Category?
  // But wait, "CUP" is Main Category. 
  // It seems we have Main Category and Sub Category.
  // For now, to keep it simple and consistent with our data:
  // Code = [Category]-[Brand]-[Material/Collection/Extra]-[Color]-[Year]-[Sequence]

  // Let's stick to the user's explicit request:
  // [نوع المنتج]-[العلامة التجارية]-[المجموعة]-[اللون]-[السنة]-[التسلسل]
  // [Category]-[Brand]-[Collection]-[Color]-[Year]-[Sequence]

  let internalCode = `${input.category}-${input.brand}`

  if (input.collection) {
    internalCode += `-${input.collection}`
  } else {
    // If no collection, maybe skip or put placeholder? User example showed it.
    // Let's add it if present.
  }

  internalCode += `-${input.color}-${year}-${sequence}`


  // --- BARCODE GENERATION (NUMERIC) ---
  const barcodeElements = settings.barcodeOrder?.elements || []
  let barcodeBase = ""
  let barcodeBreakdown: any = {}

  // Generate values for dynamic elements
  const dynamicValues = {
    saudiCode: "628",
    companyCode: "1057",
    year,
    month,
    sequence,
    categoryNum: settings.categories[input.category]?.numeric || "00",
    brandNum: settings.brands[input.brand]?.numeric || "00", // Added if needed
    colorNum: settings.colors[input.color]?.numeric || "00",
    collectionNum: input.collection ? settings.collections[input.collection]?.numeric || "00" : "00",
  }

  // Build barcode according to custom order
  barcodeElements.forEach(element => {
    if (element.enabled && !element.fixed) {
      // @ts-ignore
      let value = element.value || dynamicValues[element.id] || ""
      barcodeBase += value.padStart(element.length, '0')
      barcodeBreakdown[element.id] = value.padStart(element.length, '0')
    }
  })

  // Calculate and add checksum (always at the end for fixed elements)
  const checksum = calculateChecksum(barcodeBase)
  const barcode = barcodeBase + checksum
  barcodeBreakdown.checksum = checksum

  // Add fixed elements to breakdown
  barcodeElements.forEach(element => {
    if (element.enabled && element.fixed) {
      barcodeBreakdown[element.id] = element.id === 'checksum' ? checksum : element.value
    }
  })

  // --- NAME GENERATION (COMPOUND NAMES) ---
  // Rules provided:
  // Chocolates (BOX): "[Name] [Color] [Collection] [Qty][Unit]" -> "Mix Brand Box Brown Pattern 36pcs"
  // Bags (BAG): "[Brand] Bag [Collection] [Color] [Qty][Unit]"
  // Cups (CUP): "[Brand] [Qty][Unit] Paper Cup [Collection]"
  // Stickers (STK): "[Brand] [Type??] Sticker [Color]"

  const categoryData = settings.categories[input.category]
  const brandData = settings.brands[input.brand]
  const colorData = settings.colors[input.color]
  const collectionData = input.collection ? settings.collections[input.collection] : null
  const unitData = input.unit ? settings.units.find(u => u.code === input.unit) : null
  const materialData = input.material ? settings.materials?.find((m: any) => m.code === input.material) : null

  let fullNameEnglish = ""
  let fullNameArabic = ""

  // Logic based on Category Code
  if (input.category === 'BOX') {
    // "Mix Brand Box Brown Pattern 36pcs"
    // [Brand] [Category] [Color] [Collection] [Qty]
    const brandEn = brandData?.en || input.brand
    const brandAr = brandData?.ar || input.brand

    const catEn = categoryData?.en || "Box"
    const catAr = categoryData?.ar || "علبة"

    const colorEn = colorData?.en || ""
    const colorAr = colorData?.ar || ""

    const collEn = collectionData?.en || ""
    const collAr = collectionData?.ar || ""

    const qtyEn = input.quantity ? `${input.quantity}${unitData?.en || input.unit || ""}` : ""
    const qtyAr = input.quantity ? `${input.quantity}${unitData?.ar || input.unit || ""}` : ""

    fullNameEnglish = `${brandEn} ${catEn} ${colorEn} ${collEn} ${qtyEn}`.trim().replace(/\s+/g, ' ')
    fullNameArabic = `${catAr} ${brandAr} ${colorAr} ${collAr} ${qtyAr}`.trim().replace(/\s+/g, ' ')

  } else if (input.category === 'BAG') {
    // "[Brand] Bag [Collection] [Color] [Qty][Unit]"
    const brandEn = brandData?.en || input.brand
    const brandAr = brandData?.ar || input.brand

    const catEn = "Bag" // Hardcoded as per pattern
    const catAr = "كيس"

    const colorEn = colorData?.en || ""
    const colorAr = colorData?.ar || ""

    const collEn = collectionData?.en || ""
    const collAr = collectionData?.ar || ""

    const qtyEn = input.quantity ? `${input.quantity}${unitData?.en || input.unit || ""}` : ""
    const qtyAr = input.quantity ? `${input.quantity}${unitData?.ar || input.unit || ""}` : ""

    fullNameEnglish = `${brandEn} ${catEn} ${collEn} ${colorEn} ${qtyEn}`.trim().replace(/\s+/g, ' ')
    fullNameArabic = `${catAr} ${brandAr} ${collAr} ${colorAr} ${qtyAr}`.trim().replace(/\s+/g, ' ')

  } else if (input.category === 'CUP') {
    // "[Brand] [Qty][Unit] Paper Cup [Collection]"
    // Note: "Paper" might be from Material or hardcoded "Paper Cup"
    const brandEn = brandData?.en || input.brand
    const brandAr = brandData?.ar || input.brand

    const matEn = materialData?.en || "Paper"
    const matAr = materialData?.ar || "ورق"

    const _catEn = "Cup"
    const _catAr = "كوب"

    const collEn = collectionData?.en || ""
    const collAr = collectionData?.ar || ""

    const qtyEn = input.quantity ? `${input.quantity}${unitData?.en || input.unit || ""}` : ""
    const qtyAr = input.quantity ? `${input.quantity}${unitData?.ar || input.unit || ""}` : ""

    fullNameEnglish = `${brandEn} ${qtyEn} ${matEn} Cup ${collEn}`.trim().replace(/\s+/g, ' ')
    fullNameArabic = `${_catAr} ${matAr} ${brandAr} ${qtyAr} ${collAr}`.trim().replace(/\s+/g, ' ')

  } else {
    // Fallback to Order Settings
    // ... (Original logic as fallback)
    const namingOrder = settings.namingOrder || {
      arabic: [],
      english: []
    }
    // Quick rebuild using original logic for fallback
    let _ar = ""
    namingOrder.arabic.filter(e => e.enabled).forEach(e => {
      let v = ""
      if (e.value === 'brand') v = brandData?.ar || ""
      if (e.value === 'category') v = categoryData?.ar || ""
      if (e.value === 'color') v = colorData?.ar || ""
      if (e.value === 'collection') v = collectionData?.ar || ""
      if (e.value === 'productName') v = input.productName || ""
      if (v) _ar += (_ar ? " " : "") + v
    })
    if (input.quantity) _ar += ` ${input.quantity}${unitData?.ar || ""}`
    fullNameArabic = _ar

    let _en = ""
    namingOrder.english.filter(e => e.enabled).forEach(e => {
      let v = ""
      if (e.value === 'brand') v = brandData?.en || ""
      if (e.value === 'category') v = categoryData?.en || ""
      if (e.value === 'color') v = colorData?.en || ""
      if (e.value === 'collection') v = collectionData?.en || ""
      if (e.value === 'productName') v = input.productNameEnglish || input.productName || ""
      if (v) _en += (_en ? " " : "") + v
    })
    if (input.quantity) _en += ` ${input.quantity}${unitData?.en || ""}`
    fullNameEnglish = _en
  }

  return {
    internalCode,
    barcode,
    fullNameArabic,
    fullNameEnglish,
    barcodeBreakdown,
  }
}

// Function to generate sequence number from current time
function generateSequence(): string {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, "0")
  const minutes = now.getMinutes().toString().padStart(2, "0")
  // We can add seconds or random to make it more unique if needed for High Frequency
  // For now stick to user pattern
  return `${hours}${minutes}`
}

function calculateChecksum(code: string): string {
  let sum = 0
  for (let i = 0; i < code.length; i++) {
    const digit = Number.parseInt(code[i])
    sum += digit * (i % 2 === 0 ? 1 : 3)
  }
  const checksum = (10 - (sum % 10)) % 10
  return checksum.toString()
}

export function resetCounter() {
  productCounter = 1
}
