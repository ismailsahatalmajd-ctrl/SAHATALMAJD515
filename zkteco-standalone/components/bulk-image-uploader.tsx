"use client"

import { useState, useMemo } from "react"
import Tesseract from "tesseract.js"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Upload, Filter as FilterIcon, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import type { Product } from "@/lib/types"
import { updateProduct } from "@/lib/storage"
import { useToast } from "@/hooks/use-toast"

type MatchMethod = "code" | "name" | "none"

interface MatchResult {
  file: File
  filename: string
  matchedProduct?: Product
  method: MatchMethod
  reason?: string
}

interface BulkImageUploaderProps {
  products: Product[]
  onProductsUpdate: (products: Product[]) => void
}

export function normalizeText(s: string) {
  const input = (s || "").toString()
  // إزالة التشكيل العربي والرموز المرافقة
  const noMarks = input.normalize("NFKD").replace(/\p{M}/gu, "")
  return noMarks
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) // تحويل الأرقام العربية إلى إنجليزية
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeCode(s: string) {
  // تطبيع الكود: أحرف كبيرة، تحويل الأرقام العربية، إزالة الفواصل، إزالة الأصفار البادئة للأكواد الرقمية
  const t = normalizeText(s)
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\-_.]/g, "")
  // إذا كان الكود رقميًا بالكامل، أزل الأصفار البادئة
  if (/^\d+$/.test(t)) return String(Number(t))
  return t
}

function extractCodeFromFilename(name: string): string | null {
  const base = normalizeText(name.replace(/\.[^.]+$/, ""))
  const cleaned = base.replace(/\s+/g, "")
  // 1) إذا وُجدت سلسلة أرقام طويلة، استخدمها ككود (يدعم العربية بعد التطبيع)
  const digits = cleaned.match(/\d{1,}/)
  if (digits) return normalizeCode(digits[0])
  // 2) وإلا ابحث عن تسلسل أبجدي رقمي مع فواصل اختيارية
  const m = cleaned.match(/[a-z0-9]+[\-_.]*[a-z0-9]+/)
  return m ? normalizeCode(m[0]) : null
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/gif"].includes(file.type)
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function extractProductCodeFromText(text: string): string | null {
  const cleaned = normalizeText(text).replace(/\s+/g, "")
  // أولاً: رقم خالص
  const digits = cleaned.match(/\d{1,}/)
  if (digits) return normalizeCode(digits[0])
  // ثانيًا: نمط أبجدي رقمي
  const m = cleaned.match(/[a-z0-9]+[\-_.]*[a-z0-9]+/)
  return m ? normalizeCode(m[0]) : null
}

export async function performOcrOnFile(file: File): Promise<string | null> {
  try {
    const { data } = await Tesseract.recognize(file, "eng+ara")
    const text = data?.text || ""
    return extractProductCodeFromText(text)
  } catch {
    return null
  }
}

export function BulkImageUploader({ products, onProductsUpdate }: BulkImageUploaderProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [filter, setFilter] = useState("")
  const [results, setResults] = useState<MatchResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [csvFile, setCsvFile] = useState<File | null>(null)

  const filteredProducts = useMemo(() => {
    if (!filter.trim()) return products
    const f = normalizeText(filter)
    return products.filter(p => {
      const name = normalizeText(p.productName)
      const code = normalizeText(p.productCode)
      return name.includes(f) || code.includes(f)
    })
  }, [products, filter])

  const analyzeFiles = (incoming: File[]) => {
    const next: MatchResult[] = []
    for (const file of incoming) {
      const filename = file.name
      if (!isSupportedImage(file)) {
        next.push({ file, filename, method: "none", reason: "صيغة غير مدعومة" })
        continue
      }
      const codeCandidate = extractCodeFromFilename(filename)
      let matched: Product | undefined
      let method: MatchMethod = "none"
      let reason: string | undefined

      // أولاً: المطابقة بالكود إن وجد في اسم الملف
      if (codeCandidate) {
        const candidate = normalizeCode(codeCandidate)
        matched = filteredProducts.find(p => {
          const code = normalizeCode(p.productCode)
          if (code === candidate) return true
          if (/^\d+$/.test(code) && /^\d+$/.test(candidate)) {
            return Number(code) === Number(candidate)
          }
          return false
        })
        if (matched) {
          method = "code"
        } else {
          reason = "لم يتم العثور على مطابقة بالكود"
        }
      }

      // ثانيًا: المطابقة بالاسم من اسم الملف إذا لم نجد بالكود
      if (!matched) {
        const base = filename.replace(/\.[^.]+$/, "")
        const nameCandidate = normalizeText(base)
        matched = filteredProducts.find(p => {
          const productName = normalizeText(p.productName)
          return nameCandidate.includes(productName) || productName.includes(nameCandidate)
        })
        if (matched) {
          method = "name"
        } else if (!reason) {
          reason = "لا توجد مطابقة"
        }
      }

      next.push({ file, filename, matchedProduct: matched, method, reason })
    }
    setResults(next)
  }

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || [])
    setFiles(incoming)
    analyzeFiles(incoming)
  }

  const startUpload = async () => {
    if (!results.length) {
      toast({ title: "لا توجد ملفات", description: "اختر صوراً أولاً" })
      return
    }
    setUploading(true)
    setProgress(0)
    let done = 0
    const updatedProducts: Product[] = [...products]

    for (const r of results) {
      if (!r.matchedProduct || r.method === "none") {
        done++
        setProgress(Math.round((done / results.length) * 100))
        continue
      }
      const file = r.file
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: `حجم كبير: ${r.filename}`, description: "الحد الأقصى 2 ميجابايت" })
        done++
        setProgress(Math.round((done / results.length) * 100))
        continue
      }
      const dataUrl = await fileToBase64(file)
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img.width >= 200 && img.height >= 200)
        img.onerror = () => resolve(false)
        img.src = dataUrl
      })
      if (!ok) {
        toast({ title: `جودة منخفضة: ${r.filename}`, description: "الحد الأدنى للأبعاد 200x200" })
        done++
        setProgress(Math.round((done / results.length) * 100))
        continue
      }

      const updated = updateProduct(r.matchedProduct.id, { image: dataUrl })
      if (updated) {
        const idx = updatedProducts.findIndex(p => p.id === updated.id)
        if (idx !== -1) updatedProducts[idx] = updated
        toast({
          title: `تم الحفظ: ${updated.productName}`,
          description: r.method === "code" ? "تمت المطابقة بالكود" : "تمت المطابقة بالاسم بعد فشل الكود",
        })
      } else {
        toast({ title: "فشل التحديث", description: `تعذر حفظ صورة ${r.filename}` })
      }
      done++
      setProgress(Math.round((done / results.length) * 100))
    }

    onProductsUpdate(updatedProducts)
    setUploading(false)
  }

  async function parseCsv(file: File | null): Promise<Record<string, { name?: string }>> {
    if (!file) return {}
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const map: Record<string, { name?: string }> = {}
    let startIdx = 0
    if (lines[0]?.toLowerCase().includes("code")) startIdx = 1
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",")
      const code = (parts[0] || "").trim()
      const name = (parts[1] || "").trim()
      if (code) map[normalizeText(code)] = { name }
    }
    return map
  }

  const startUploadWithOCR = async () => {
    if (!files.length) {
      toast({ title: "لا توجد صور", description: "اختر صوراً أولاً" })
      return
    }
    setUploading(true)
    setProgress(0)
    const csvMap = await parseCsv(csvFile)
    const updatedProducts: Product[] = [...products]
    let done = 0

    const limit = 3
    let i = 0
    async function process(file: File) {
      const filename = file.name
      if (!isSupportedImage(file)) {
        done++
        setProgress(Math.round((done / files.length) * 100))
        return
      }
      const ocrCode = await performOcrOnFile(file)
      const nameCode = extractCodeFromFilename(filename)
      const effectiveCode = ocrCode || nameCode || null
      let matched: Product | undefined
      if (effectiveCode) {
        const candidate = normalizeCode(effectiveCode)
        matched = filteredProducts.find(p => {
          const code = normalizeCode(p.productCode)
          if (code === candidate) return true
          if (/^\d+$/.test(code) && /^\d+$/.test(candidate)) {
            return Number(code) === Number(candidate)
          }
          return false
        })
        // CSV fallback: if filename code maps to a name in CSV, try name equality
        if (!matched && nameCode) {
          const key = normalizeCode(nameCode)
          const maybe = csvMap[key]?.name
          if (maybe) {
            const n = normalizeText(maybe)
            matched = filteredProducts.find(p => normalizeText(p.productName) === n)
          }
        }
      }
      // Name-based matching from filename when code-based matching fails
      if (!matched) {
        const base = filename.replace(/\.[^.]+$/, "")
        const nameCandidate = normalizeText(base)
        matched = filteredProducts.find(p => {
          const productName = normalizeText(p.productName)
          return nameCandidate.includes(productName) || productName.includes(nameCandidate)
        })
      }
      if (!matched) {
        done++
        setProgress(Math.round((done / files.length) * 100))
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: `حجم كبير: ${filename}`, description: "الحد الأقصى 2 ميجابايت" })
        done++
        setProgress(Math.round((done / files.length) * 100))
        return
      }
      const dataUrl = await fileToBase64(file)
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img.width >= 200 && img.height >= 200)
        img.onerror = () => resolve(false)
        img.src = dataUrl
      })
      if (!ok) {
        toast({ title: `جودة منخفضة: ${filename}`, description: "الحد الأدنى للأبعاد 200x200" })
        done++
        setProgress(Math.round((done / files.length) * 100))
        return
      }
      const updated = updateProduct(matched.id, { image: dataUrl })
      if (updated) {
        const idx = updatedProducts.findIndex(p => p.id === updated.id)
        if (idx !== -1) updatedProducts[idx] = updated
        toast({ title: `تم الحفظ: ${updated.productName}`, description: effectiveCode ? "تمت المطابقة بالكود (OCR/اسم الملف)" : "تمت المطابقة بالاسم" })
      } else {
        toast({ title: "فشل التحديث", description: `تعذر حفظ صورة ${filename}` })
      }
      done++
      setProgress(Math.round((done / files.length) * 100))
    }
    const running: Promise<void>[] = []
    while (i < files.length || running.length) {
      while (running.length < limit && i < files.length) {
        const f = files[i++]
        running.push(process(f))
      }
      await Promise.race(running)
      for (let k = running.length - 1; k >= 0; k--) {
        const p = running[k] as any
        if (p?.status === "fulfilled" || p?.status === "rejected") running.splice(k, 1)
      }
    }
    onProductsUpdate(updatedProducts)
    setUploading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="ml-2 h-4 w-4" />
          رفع صور متعددة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>رفع صور متعددة ومطابقتها</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="فلتر المنتجات للمطابقة التلقائية" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary">
              <label className="cursor-pointer">
                <span className="mr-2">اختيار صور</span>
                <input type="file" multiple accept="image/jpeg,image/png,image/gif" onChange={onFilesSelected} className="hidden" />
              </label>
            </Button>
            {files.length > 0 && (<span className="text-sm text-muted-foreground">{files.length} صورة محددة</span>)}
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <label className="cursor-pointer">
                <span className="mr-2">اختيار ملف CSV (اختياري)</span>
                <input type="file" accept=".csv" onChange={(e) => setCsvFile((e.target.files || [])[0] || null)} className="hidden" />
              </label>
            </Button>
          </div>

          {results.length > 0 && (
            <div className="rounded-md border p-3 max-h-64 overflow-auto text-sm">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="flex-1 truncate">{r.filename}</div>
                  <div className="w-2/5 truncate text-right">
                    {r.matchedProduct ? (
                      <span className="font-medium">{r.matchedProduct.productName} ({r.matchedProduct.productCode})</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="w-1/5 text-right">
                    {r.method === "code" && (<span className="inline-flex items-center text-green-600"><CheckCircle2 className="h-4 w-4 ml-1" /> بالكود</span>)}
                    {r.method === "name" && (<span className="inline-flex items-center text-blue-600"><AlertTriangle className="h-4 w-4 ml-1" /> بالاسم</span>)}
                    {r.method === "none" && (<span className="inline-flex items-center text-red-600"><XCircle className="h-4 w-4 ml-1" /> لا مطابقة</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground">جاري رفع الصور وتحديث المنتجات...</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => { setFiles([]); setResults([]); }}>إلغاء</Button>
            <Button onClick={startUploadWithOCR} disabled={uploading || files.length === 0}>تطبيق الرفع والمطابقة</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
