"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { getProducts, saveProducts } from "@/lib/storage"

type Product = {
  id: string
  productCode?: string
  productName?: string
  gallery?: string[]
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif"]
const MAX_SIZE_MB = 5

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function tryUpdateSql(productId: string, imageDataUrl: string) {
  // Supabase code removed
}

export default function GlobalImageDropzone() {
  const [open, setOpen] = useState(false)
  const [pendingImages, setPendingImages] = useState<{ dataUrl: string; filename: string }[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const { toast } = useToast()
  const lastDragRef = useRef<number>(0)

  const products = useMemo(() => getProducts(), [open])

  useEffect(() => {
    // تم تعطيل الإسقاط العام؛ الإسقاط الآن محصور داخل خلايا الصور في جدول المنتجات.
  }, [])

  async function assignImagesToProduct(productId: string, imgs: { dataUrl: string; filename: string }[]) {
    const list = getProducts()
    const idx = list.findIndex((p) => p.id === productId)
    if (idx === -1) return
    const p = list[idx]
    const gallery = Array.isArray(p.gallery) ? p.gallery.slice() : []
    for (const img of imgs) {
      gallery.unshift(img.dataUrl)
    }
    list[idx] = { ...p, gallery }
    saveProducts(list)
    for (const img of imgs) {
      await tryUpdateSql(productId, img.dataUrl)
    }
    setOpen(false)
    setPendingImages([])
    toast({ title: "تم حفظ الصور", description: "ظهرت الصور في حقل المنتج مباشرة" })
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إسقاط صور المنتجات</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">اختر المنتج لإسناد الصور المسقطة.</p>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر المنتج" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.productCode ? `${p.productCode} - ` : ""}{p.productName ?? p.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 flex-wrap">
            {pendingImages.map((im, i) => (
              <img key={i} src={im.dataUrl} alt={im.filename} className="h-16 w-16 object-cover rounded-md border" />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!selectedProductId} onClick={() => assignImagesToProduct(selectedProductId, pendingImages)}>حفظ</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}