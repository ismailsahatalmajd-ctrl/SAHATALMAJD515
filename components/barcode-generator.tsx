"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Product } from "@/lib/types"
import { generateCodesSheet } from "@/lib/barcode-generator"
import type { BarcodeOptions, BarcodeFormat } from "@/lib/barcode-generator"
import { QrCode, Barcode } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface BarcodeGeneratorProps {
  products: Product[]
  onGenerate?: () => void
}

export function BarcodeGenerator({ products, onGenerate }: BarcodeGeneratorProps) {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [barcodeType, setBarcodeType] = useState<"barcode" | "qr">("barcode")
  const [loading, setLoading] = useState(false)

  const defaultOptions: BarcodeOptions = {
    format: "CODE128",
    showName: true,
    showItemNumber: false,
    showPrice: false,
    showCode: true,
    textPosition: "below",
    darkColor: "#000000",
    lightColor: "#FFFFFF",
    unitWidth: 1.8,
    unitHeight: 50,
    fontSize: 12,
  }
  const [options, setOptions] = useState<BarcodeOptions>(defaultOptions)

  // تحميل آخر إعدادات للمستخدم
  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = localStorage.getItem("app_settings")
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.barcodeSettings) setOptions({ ...options, ...s.barcodeSettings })
      } catch {}
    }
  }, [])

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
  }

  const selectAll = () => {
    setSelectedProducts(products.map((p) => p.id))
  }

  const clearSelection = () => {
    setSelectedProducts([])
  }

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const selected = products.filter((p) => selectedProducts.includes(p.id))
      const fmt: BarcodeFormat = barcodeType === "barcode" ? "CODE128" : "QR"
      
      // حفظ الإعدادات
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("app_settings")
        let current = {}
        try {
          current = raw ? JSON.parse(raw) : {}
        } catch {}
        localStorage.setItem("app_settings", JSON.stringify({ ...current, barcodeSettings: options }))
      }

      await generateCodesSheet(selected, { ...options, format: fmt })
      if (onGenerate) onGenerate()
    } catch (error) {
      console.error("Error generating codes:", error)
      alert("حدث خطأ أثناء إنشاء الرموز")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={barcodeType === "barcode" ? "default" : "outline"}
          onClick={() => setBarcodeType("barcode")}
          className="flex-1"
        >
          <Barcode className="ml-2 h-4 w-4" />
          باركود (CODE128)
        </Button>
        <Button
          variant={barcodeType === "qr" ? "default" : "outline"}
          onClick={() => setBarcodeType("qr")}
          className="flex-1"
        >
          <QrCode className="ml-2 h-4 w-4" />
          رمز QR
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* خيارات التخصيص */}
          <Card>
            <CardHeader>
                <CardTitle className="text-lg">إعدادات التصميم</CardTitle>
                <CardDescription>تخصيص شكل وحجم الباركود</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="font-medium text-sm">العناصر الظاهرة</div>
              <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={options.showName} onCheckedChange={(v) => setOptions({ ...options, showName: !!v })} />
                    <span>اسم المنتج</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={options.showItemNumber}
                      onCheckedChange={(v) => setOptions({ ...options, showItemNumber: !!v })}
                    />
                    <span>رقم المنتج</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={options.showPrice} onCheckedChange={(v) => setOptions({ ...options, showPrice: !!v })} />
                    <span>السعر</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={options.showCode} onCheckedChange={(v) => setOptions({ ...options, showCode: !!v })} />
                    <span>الكود</span>
                  </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="font-medium text-sm">الحجم والألوان</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">عرض الوحدة/حجم QR</label>
                  <Input
                    type="number"
                    value={options.unitWidth}
                    onChange={(e) => setOptions({ ...options, unitWidth: Number(e.target.value) || 1.5 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">ارتفاع الباركود</label>
                  <Input
                    type="number"
                    value={options.unitHeight}
                    onChange={(e) => setOptions({ ...options, unitHeight: Number(e.target.value) || 40 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">حجم الخط</label>
                  <Input
                    type="number"
                    value={options.fontSize}
                    onChange={(e) => setOptions({ ...options, fontSize: Number(e.target.value) || 12 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">موضع النص</label>
                  <Select
                    value={options.textPosition}
                    onValueChange={(v) => setOptions({ ...options, textPosition: v as BarcodeOptions["textPosition"] })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="الموضع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">أعلى الرمز</SelectItem>
                      <SelectItem value="below">أسفل الرمز</SelectItem>
                      <SelectItem value="left">يسار الرمز</SelectItem>
                      <SelectItem value="right">يمين الرمز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">لون الداكن</label>
                  <div className="flex gap-2">
                    <Input type="color" value={options.darkColor} onChange={(e) => setOptions({ ...options, darkColor: e.target.value })} className="w-12 p-1" />
                    <Input type="text" value={options.darkColor} onChange={(e) => setOptions({ ...options, darkColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">لون الخلفية</label>
                  <div className="flex gap-2">
                    <Input type="color" value={options.lightColor} onChange={(e) => setOptions({ ...options, lightColor: e.target.value })} className="w-12 p-1" />
                    <Input type="text" value={options.lightColor} onChange={(e) => setOptions({ ...options, lightColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
              </div>
            </div>
            </CardContent>
          </Card>

          {/* اختيار المنتجات */}
          <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">المنتجات</CardTitle>
                    <div className="flex gap-2">
                        <Button onClick={selectAll} variant="outline" size="sm">تحديد الكل</Button>
                        <Button onClick={clearSelection} variant="outline" size="sm">إلغاء</Button>
                    </div>
                </div>
                <CardDescription>اختر المنتجات المراد طباعة ملصقات لها ({selectedProducts.length} محدد)</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {products.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">لا توجد منتجات</div>
                ) : (
                    products.map((product) => (
                        <div key={product.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                        <Checkbox
                            checked={selectedProducts.includes(product.id)}
                            onCheckedChange={() => toggleProduct(product.id)}
                            id={`prod-${product.id}`}
                        />
                        <label htmlFor={`prod-${product.id}`} className="flex-1 cursor-pointer">
                            <div className="font-medium">{product.productName}</div>
                            <div className="text-xs text-muted-foreground flex gap-2">
                                <span>{product.productCode}</span>
                                {product.price && <span>| {product.price} ريال</span>}
                            </div>
                        </label>
                        </div>
                    ))
                )}
                </div>
            </CardContent>
          </Card>
      </div>

      <div className="flex justify-end p-4 bg-muted/20 rounded-lg">
        <Button
          onClick={handleGenerate}
          disabled={selectedProducts.length === 0 || loading}
          size="lg"
          className="w-full sm:w-auto min-w-[200px]"
        >
          {loading ? "جاري الإنشاء..." : `طباعة / تصدير PDF`}
        </Button>
      </div>
    </div>
  )
}
