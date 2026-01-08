// Settings storage and management

export interface SectionConfig {
  key: string
  nameAr: string
  nameEn: string
  hasNumericCode: boolean
  numericCode?: string
}

export interface SettingsData {
  sections: SectionConfig[]
  categories: Record<string, { numeric: string; ar: string; en: string }>
  brands: Record<string, { numeric: string; ar: string; en: string }>
  colors: Record<string, { numeric: string; ar: string; en: string }>
  collections: Record<string, { numeric: string; ar: string; en: string }>
  units: Array<{ code: string; ar: string; en: string }>
  usages: Array<{ code: string; ar: string; en: string }>
  materials: Array<{ code: string; ar: string; en: string }>
  [key: string]: any
  namingOrder?: {
    arabic: NamingElement[]
    english: NamingElement[]
  }
  barcodeOrder?: {
    elements: BarcodeElement[]
  }
  supabaseUrl?: string
  supabaseKey?: string
}

export interface BarcodeElement {
  id: string
  nameAr: string
  nameEn: string
  value: string
  length: number
  enabled: boolean
  description: string
  fixed: boolean // Some elements like checksum should be fixed at the end
}

export interface NamingElement {
  id: string
  nameAr: string
  nameEn: string
  value: string
  enabled: boolean
  description: string
}

export const DEFAULT_SETTINGS: SettingsData = {
  sections: [
    { key: "categories", nameAr: "الفئات", nameEn: "Categories", hasNumericCode: true },
    { key: "brands", nameAr: "البراندات", nameEn: "Brands", hasNumericCode: true },
    { key: "colors", nameAr: "الألوان", nameEn: "Colors", hasNumericCode: true },
    { key: "collections", nameAr: "المجموعات", nameEn: "Collections", hasNumericCode: true },
    { key: "units", nameAr: "الوحدات", nameEn: "Units", hasNumericCode: false },
    { key: "usages", nameAr: "الاستخدامات", nameEn: "Usages", hasNumericCode: false },
    { key: "materials", nameAr: "المواد", nameEn: "Materials", hasNumericCode: false },
  ],
  categories: {
    BOX: { numeric: "01", ar: "علبة", en: "Box" },
    BAG: { numeric: "02", ar: "كيس", en: "Bag" },
    CRD: { numeric: "03", ar: "كرتون/بطاقة", en: "Card" },
    CUP: { numeric: "04", ar: "كوب", en: "Cup" },
    STK: { numeric: "05", ar: "ملصق", en: "Sticker" },
    PKG: { numeric: "06", ar: "مواد تغليف", en: "Packaging" },
    TOL: { numeric: "07", ar: "أدوات", en: "Tools" },
    FOD: { numeric: "08", ar: "مواد غذائية", en: "Food" },
  },
  brands: {
    MIXB: { numeric: "101", ar: "ميكس براند", en: "Mix Brand" },
    CARL: { numeric: "102", ar: "كاراميل", en: "Caramel" },
    PECN: { numeric: "103", ar: "بيكان", en: "Pecan" },
    HANO: { numeric: "104", ar: "هانوفريان", en: "Hanoverian" },
    JADL: { numeric: "105", ar: "جديل", en: "Jadeel" },
    SUSM: { numeric: "106", ar: "سسم", en: "Susam" },
    TRAD: { numeric: "107", ar: "تراديشنال", en: "Traditional" },
    TRUF: { numeric: "108", ar: "ترافل", en: "Truffle" },
    MAST: { numeric: "109", ar: "ماستربيس", en: "Masterpiece" },
  },
  colors: {
    BRN: { numeric: "01", ar: "بني", en: "Brown" },
    RED: { numeric: "02", ar: "أحمر", en: "Red" },
    BLU: { numeric: "03", ar: "أزرق", en: "Blue" },
    GRN: { numeric: "04", ar: "أخضر", en: "Green" },
    WHT: { numeric: "05", ar: "أبيض", en: "White" },
    BLK: { numeric: "06", ar: "أسود", en: "Black" },
    YLW: { numeric: "07", ar: "أصفر", en: "Yellow" },
    PNK: { numeric: "08", ar: "وردي", en: "Pink" },
    GLD: { numeric: "09", ar: "ذهبي", en: "Gold" },
    GRY: { numeric: "10", ar: "رمادي", en: "Gray" },
    ORG: { numeric: "11", ar: "برتقالي", en: "Orange" },
    OFF: { numeric: "12", ar: "أوف وايت", en: "Off-White" },
    MVE: { numeric: "13", ar: "موفي", en: "Mauve" },
    SLV: { numeric: "14", ar: "فضي", en: "Silver" },
    LBL: { numeric: "15", ar: "أزرق فاتح", en: "Light Blue" },
    DBL: { numeric: "16", ar: "أزرق غامق", en: "Dark Blue" },
  },
  collections: {
    NATL: { numeric: "01", ar: "اليوم الوطني 2023", en: "National Day 2023" },
    WNTR: { numeric: "02", ar: "سلسلة الشتاء 2025", en: "Winter Series 2025" },
    FETH: { numeric: "05", ar: "ريشة", en: "Feather" },
    BLOS: { numeric: "06", ar: "زهرة", en: "Blossom" },
    ROYL: { numeric: "07", ar: "ملكي", en: "Royal" },
    BIRD: { numeric: "08", ar: "طائر", en: "Bird" },
    SHEL: { numeric: "09", ar: "صدفة", en: "Shell" },
    FLWR: { numeric: "10", ar: "وردة", en: "Flower" },
    LETT: { numeric: "11", ar: "حروف", en: "Letters" },
    BOUQ: { numeric: "12", ar: "باقة", en: "Bouquet" },
    SUMM: { numeric: "13", ar: "الصيف", en: "Summer" },
    EIDC: { numeric: "14", ar: "العيد", en: "Eid" },
    RAMD: { numeric: "15", ar: "رمضان", en: "Ramadan" },
  },
  units: [
    { code: "pcs", ar: "قطعة", en: "pcs" },
    { code: "kg", ar: "كيلو", en: "kg" },
    { code: "g", ar: "جرام", en: "g" },
    { code: "oz", ar: "أونصة", en: "oz" },
    { code: "box", ar: "علبة", en: "box" },
    { code: "rol", ar: "رول", en: "roll" },
    { code: "ctn", ar: "كرتون", en: "cartoon" },
  ],
  usages: [
    { code: "PCK", ar: "تغليف", en: "Packaging" },
    { code: "SRV", ar: "تقديم", en: "Serving" },
    { code: "STR", ar: "تخزين", en: "Storage" },
    { code: "PRS", ar: "شخصي", en: "Personal" },
    { code: "GFT", ar: "هدايا", en: "Gifts" },
    { code: "OCC", ar: "مناسبات", en: "Occasions" },
    { code: "FOD", ar: "تغذية", en: "Food" },
    { code: "RST", ar: "مطعم", en: "Restaurant" },
    { code: "DIS", ar: "توزيع", en: "Distribution" },
    { code: "OFF", ar: "تخفيضات", en: "Offers" },
    { code: "DSP", ar: "عرض", en: "Display" },
  ],
  materials: [
    { code: "PLS", ar: "بلاستيك", en: "Plastic" },
    { code: "PPR", ar: "ورق", en: "Paper" },
    { code: "MET", ar: "معدن", en: "Metal" },
    { code: "GLS", ar: "زجاج", en: "Glass" },
    { code: "WDN", ar: "خشب", en: "Wood" },
    { code: "FAB", ar: "قماش", en: "Fabric" },
  ],
  namingOrder: {
    arabic: [
      { id: "productName", nameAr: "الاسم الأساسي", nameEn: "Product Name", value: "productName", enabled: true, description: "اسم المنتج الأساسي" },
      { id: "category", nameAr: "الفئة", nameEn: "Category", value: "category", enabled: true, description: "فئة المنتج" },
      { id: "brand", nameAr: "الماركة", nameEn: "Brand", value: "brand", enabled: true, description: "ماركة المنتج" },
      { id: "color", nameAr: "اللون", nameEn: "Color", value: "color", enabled: true, description: "لون المنتج" },
      { id: "collection", nameAr: "المجموعة", nameEn: "Collection", value: "collection", enabled: true, description: "مجموعة المنتج" },
    ],
    english: [
      { id: "brand", nameAr: "الماركة", nameEn: "Brand", value: "brand", enabled: true, description: "ماركة المنتج" },
      { id: "color", nameAr: "اللون", nameEn: "Color", value: "color", enabled: true, description: "لون المنتج" },
      { id: "category", nameAr: "الفئة", nameEn: "Category", value: "category", enabled: true, description: "فئة المنتج" },
      { id: "productName", nameAr: "الاسم الأساسي", nameEn: "Product Name", value: "productName", enabled: true, description: "اسم المنتج الأساسي" },
      { id: "collection", nameAr: "المجموعة", nameEn: "Collection", value: "collection", enabled: true, description: "مجموعة المنتج" },
    ],
  },
  barcodeOrder: {
    elements: [
      {
        id: "saudiCode",
        nameAr: "كود الدولة",
        nameEn: "Country Code",
        value: "628",
        length: 3,
        enabled: true,
        description: "كود المملكة العربية السعودية",
        fixed: false
      },
      {
        id: "companyCode",
        nameAr: "كود الشركة",
        nameEn: "Company Code",
        value: "1057",
        length: 4,
        enabled: true,
        description: "معرف فريد للشركة",
        fixed: false
      },
      {
        id: "categoryNum",
        nameAr: "كود الفئة",
        nameEn: "Category Code",
        value: "",
        length: 2,
        enabled: true,
        description: "الكود الرقمي للفئة",
        fixed: false
      },
      {
        id: "internalBase",
        nameAr: "الكود الداخلي",
        nameEn: "Internal Base",
        value: "",
        length: 8, // Extended length to accommodate more complex internal logic if mapped back, but usually numeric.
        // Wait, the user said Barcode: 628 [Company] [Internal Code]
        // But Internal Code is alphanumeric (BOX-MIXB...). Barcode must be numeric.
        // The user example: 628 1057 01 BOX-MIXB... -> This is impossible for EAN-13 or standard barcodes.
        // Ah, "628 [Company] [InternalCode]" pattern is likely for the human readable string or a special QR.
        // For standard barcodes (EAN-13), we need digits.
        // User example: "628 1057 01 [InternalCode]" is likely NOT the barcode content, but the visual representation?
        // NO, look at "628 1057 01 BOX...".
        // Wait, the user said: "نموذج الباركود: 628 [كود الشركة] [الكود الداخلي]"
        // And then "مثال: 628 1057 01 BOX-MIXB-PATT-BRN-23-0036"
        // THIS IS NOT A VALID BARCODE (EAN-13) if it has letters. It must be Code 128 or QR if it has letters.
        // OR the user means the "Barcode Label Text".
        // BUT, previously, we implemented a Numeric Barcode Logic (3 country + 4 company + 2 year...).
        // The user might be confusing "Barcode" with "SKU/Internal Code".
        // Let's stick to the previous Numeric Barcode Logic for the generated stripe, 
        // and use the Alphanumeric code for the "Internal Code" field.
        // I will keep the barcode numeric structure as is (Country, Company, Year, etc.) to ensure valid scanning.
        length: 0,
        enabled: false,
        description: "Reserved",
        fixed: false
      },
      {
        id: "year",
        nameAr: "السنة",
        nameEn: "Year",
        value: "",
        length: 2,
        enabled: true,
        description: "آخر رقمين من السنة الحالية",
        fixed: false
      },
      {
        id: "month",
        nameAr: "الشهر",
        nameEn: "Month",
        value: "",
        length: 2,
        enabled: true,
        description: "رقم الشهر الحالي",
        fixed: false
      },
      {
        id: "sequence",
        nameAr: "رقم التسلسل",
        nameEn: "Sequence",
        value: "",
        length: 4,
        enabled: true,
        description: "رقم تسلسل",
        fixed: false
      },
      {
        id: "checksum",
        nameAr: "رقم التحقق",
        nameEn: "Checksum",
        value: "",
        length: 1,
        enabled: true,
        description: "رقم محسوب للتحقق من صحة الباركود",
        fixed: true
      }
    ]
  },
  supabaseUrl: "",
  supabaseKey: "",
}

const STORAGE_KEY = "product-generator-settings"

export function getSettings(): SettingsData {
  if (typeof window === "undefined") return DEFAULT_SETTINGS

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Ensure sections array exists
      if (!parsed.sections) {
        parsed.sections = DEFAULT_SETTINGS.sections
      }
      // Ensure new sections exist
      if (!parsed.usages) parsed.usages = DEFAULT_SETTINGS.usages
      if (!parsed.materials) parsed.materials = DEFAULT_SETTINGS.materials

      // Ensure naming order exists and migrate old format if needed
      if (!parsed.namingOrder) {
        parsed.namingOrder = DEFAULT_SETTINGS.namingOrder
      } else {
        // Migrate old string array format to new object format
        if (Array.isArray(parsed.namingOrder.arabic) && typeof parsed.namingOrder.arabic[0] === 'string') {
          const oldArabic = parsed.namingOrder.arabic as string[]
          parsed.namingOrder.arabic = oldArabic.map(value => {
            const element = DEFAULT_SETTINGS.namingOrder?.arabic.find(el => el.value === value)
            return element || { id: value, nameAr: value, nameEn: value, value, enabled: true, description: value }
          })
        }
        if (Array.isArray(parsed.namingOrder.english) && typeof parsed.namingOrder.english[0] === 'string') {
          const oldEnglish = parsed.namingOrder.english as string[]
          parsed.namingOrder.english = oldEnglish.map(value => {
            const element = DEFAULT_SETTINGS.namingOrder?.english.find(el => el.value === value)
            return element || { id: value, nameAr: value, nameEn: value, value, enabled: true, description: value }
          })
        }
      }
      // Ensure barcode order exists
      if (!parsed.barcodeOrder) {
        parsed.barcodeOrder = DEFAULT_SETTINGS.barcodeOrder
      }
      return parsed
    }
  } catch (error) {
    console.error("Error loading settings:", error)
  }

  return DEFAULT_SETTINGS
}

export function updateSettings(settings: SettingsData): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error("Error saving settings:", error)
  }
}

export function resetSettings(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error("Error resetting settings:", error)
  }
}
