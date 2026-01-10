"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useInvoiceSettings, saveInvoiceSettings, DEFAULT_INVOICE_SETTINGS } from "@/lib/invoice-settings-store"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InvoicePreview } from "@/components/invoice-preview"

export function InvoiceSettingsTab() {
  const settings = useInvoiceSettings()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [availableColumns, setAvailableColumns] = useState<string[]>(DEFAULT_INVOICE_SETTINGS.columns)

  useEffect(() => {
    // Load available columns from products
    try {
      const raw = localStorage.getItem("inventory_products")
      if (raw) {
        const products = JSON.parse(raw) as Array<Record<string, unknown>>
        if (Array.isArray(products) && products.length > 0) {
          const keys = Array.from(new Set(products.flatMap((p) => Object.keys(p))))
          const merged = Array.from(new Set([...DEFAULT_INVOICE_SETTINGS.columns, ...keys]))
          setAvailableColumns(merged)
        }
      }
    } catch { }
  }, [])

  const handleSave = async (partial: Partial<typeof settings>) => {
    setSaving(true)
    try {
      await saveInvoiceSettings(partial)
      toast({
        title: "تم الحفظ",
        description: "تم تحديث إعدادات الفواتير بنجاح",
        duration: 2000,
      })
    } catch (e) {
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات",
        variant: "destructive",
      })
    } finally {
      setTimeout(() => setSaving(false), 500)
    }
  }

  const reset = () => {
    handleSave(DEFAULT_INVOICE_SETTINGS)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">تخصيص الفواتير</h3>
        {saving && (
          <div className="flex items-center text-sm text-muted-foreground animate-pulse">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            جاري الحفظ...
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>نوع الفاتورة الافتراضي</Label>
            <select
              value={settings.type}
              onChange={(e) => handleSave({ type: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option>فاتورة صرف</option>
              <option>فاتورة تجميع</option>
              <option>فاتورة مشتريات</option>
              <option>طلبات فروع</option>
              <option>طلبات مشتريات جديدة</option>
              <option>نوع آخر</option>
            </select>
          </div>

          {settings.type === "نوع آخر" && (
            <div className="space-y-2">
              <Label>اسم النوع المخصص</Label>
              <Input
                value={settings.customType}
                onChange={(e) => handleSave({ customType: e.target.value })}
                placeholder="أدخل اسم النوع"
              />
            </div>
          )}
        </div>

        <Separator />

        <InvoiceTemplateSelector
          value={settings.template || 'classic'}
          onChange={(v) => handleSave({ template: v })}
        />

        <Separator />

        <div className="space-y-3">
          <Label className="text-base">خيارات العرض</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="showPrice"
                checked={settings.showPrice}
                onCheckedChange={(c) => handleSave({ showPrice: c })}
              />
              <Label htmlFor="showPrice">إظهار السعر</Label>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="showQuantity"
                checked={settings.showQuantity}
                onCheckedChange={(c) => handleSave({ showQuantity: c })}
              />
              <Label htmlFor="showQuantity">إظهار الكمية</Label>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="showUnit"
                checked={settings.showUnit}
                onCheckedChange={(c) => handleSave({ showUnit: c })}
              />
              <Label htmlFor="showUnit">إظهار الوحدة</Label>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="showTotal"
                checked={settings.showTotal}
                onCheckedChange={(c) => handleSave({ showTotal: c })}
              />
              <Label htmlFor="showTotal">إظهار الإجمالي</Label>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-base">الأعمدة الظاهرة</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableColumns.map((key) => {
              const labels: Record<string, string> = {
                id: "المعرف",
                productCode: "رمز المنتج",
                itemNumber: "الرقم التسلسلي",
                productName: "اسم المنتج",
                price: "السعر",
                averagePrice: "متوسط السعر",
                quantity: "الكمية",
                unit: "الوحدة",
                category: "الفئة",
                location: "الموقع",
                total: "الإجمالي"
              }
              const label = labels[key] || key
              const checked = settings.columns.includes(key)

              return (
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(val) => {
                      const isOn = Boolean(val)
                      const newCols = isOn
                        ? [...settings.columns, key]
                        : settings.columns.filter((k) => k !== key)
                      handleSave({ columns: newCols })
                    }}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>نص الرأس (يظهر أعلى الفاتورة)</Label>
            <Input
              value={settings.headerText}
              onChange={(e) => handleSave({ headerText: e.target.value })}
              placeholder="مثال: بسم الله الرحمن الرحيم"
            />
          </div>
          <div className="space-y-2">
            <Label>نص التذييل (يظهر أسفل الفاتورة)</Label>
            <Input
              value={settings.footerText}
              onChange={(e) => handleSave({ footerText: e.target.value })}
              placeholder="مثال: شكراً لتعاملكم معنا"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={reset}>استعادة الافتراضي</Button>
        </div>
      </div>

      <Separator />

      <div className="pt-4">
        <ImageMigrationTool />
      </div>
    </div>
  )
}
import { ImageMigrationTool } from "@/components/image-migration-tool"
import { InvoiceTemplateSelector } from "@/components/invoice-template-selector"
