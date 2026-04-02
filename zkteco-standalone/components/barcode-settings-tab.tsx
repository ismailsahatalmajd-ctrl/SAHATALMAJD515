"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getSettings, updateSettings, DEFAULT_SETTINGS, type SettingsData } from "@/lib/settings-store"
import { ProductNamingOrder } from "@/components/product-naming-order"
import { BarcodeCompositionOrder } from "@/components/barcode-composition-order"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as XLSX from "xlsx"
import { Upload, Download } from "lucide-react"

export function BarcodeSettingsTab() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)

  // State for adding new items
  const [newItem, setNewItem] = useState({
    code: "",
    arabicName: "",
    englishName: "",
    numericCode: "",
  })

  // State for active element sub-section
  const [activeElementSection, setActiveElementSection] = useState<"brands" | "colors" | "collections" | "units">("brands")

  useEffect(() => {
    // Load settings on mount to ensure we have the latest from localStorage
    const saved = getSettings()
    setSettings(saved)
  }, [])

  const handleAddItem = (sectionKey: string) => {
    if (!newItem.code || !newItem.arabicName || !newItem.englishName) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      })
      return
    }

    if (sectionKey === "units") {
      const updatedUnits = [...settings.units, { code: newItem.code, ar: newItem.arabicName, en: newItem.englishName }]
      const newSettings = { ...settings, units: updatedUnits }
      setSettings(newSettings)
      updateSettings(newSettings)
    } else {
      if (!newItem.numericCode) {
        toast({
          title: "خطأ",
          description: "يرجى إدخال الكود الرقمي",
          variant: "destructive",
        })
        return
      }

      const section = settings[sectionKey as keyof SettingsData] as Record<string, any>
      const updatedSection = {
        ...section,
        [newItem.code]: {
          numeric: newItem.numericCode,
          ar: newItem.arabicName,
          en: newItem.englishName,
        },
      }

      const newSettings = { ...settings, [sectionKey]: updatedSection }
      setSettings(newSettings)
      updateSettings(newSettings)
    }

    setNewItem({ code: "", arabicName: "", englishName: "", numericCode: "" })

    toast({
      title: "تم الإضافة",
      description: "تم إضافة العنصر بنجاح",
    })
  }

  const handleDeleteItem = (sectionKey: string, code: string) => {
    if (sectionKey === "units") {
      const updatedUnits = settings.units.filter((u) => u.code !== code)
      const newSettings = { ...settings, units: updatedUnits }
      setSettings(newSettings)
      updateSettings(newSettings)
    } else {
      const section = { ...(settings[sectionKey as keyof SettingsData] as Record<string, any>) }
      delete section[code]
      const newSettings = { ...settings, [sectionKey]: section }
      setSettings(newSettings)
      updateSettings(newSettings)
    }

    toast({
      title: "تم الحذف",
      description: "تم حذف العنصر بنجاح",
    })
  }

  const handleExportExcel = (sectionKey: string) => {
    let data: any[] = []

    if (sectionKey === "units") {
      data = settings.units.map(item => ({
        Code: item.code,
        ArabicName: item.ar,
        EnglishName: item.en
      }))
    } else {
      const items = settings[sectionKey as keyof SettingsData] as Record<string, any>
      data = Object.entries(items).map(([code, details]) => ({
        Code: code,
        NumericCode: details.numeric,
        ArabicName: details.ar,
        EnglishName: details.en
      }))
    }

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sectionKey)
    XLSX.writeFile(wb, `${sectionKey}_export.xlsx`)

    toast({
      title: "تم التصدير",
      description: "تم تصدير الملف بنجاح",
    })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>, sectionKey: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]

        if (sectionKey === "units") {
          const newUnits = [...settings.units]
          data.forEach(row => {
            const code = row.Code || row.code
            if (code && !newUnits.find(u => u.code === code)) {
              newUnits.push({
                code: code,
                ar: row.ArabicName || row.arabicName || "",
                en: row.EnglishName || row.englishName || ""
              })
            }
          })
          const newSettings = { ...settings, units: newUnits }
          setSettings(newSettings)
          updateSettings(newSettings)
        } else {
          const section = { ...(settings[sectionKey as keyof SettingsData] as Record<string, any>) }
          data.forEach(row => {
            const code = row.Code || row.code
            if (code) {
              section[code] = {
                numeric: row.NumericCode || row.numericCode || "00",
                ar: row.ArabicName || row.arabicName || "",
                en: row.EnglishName || row.englishName || ""
              }
            }
          })
          const newSettings = { ...settings, [sectionKey]: section }
          setSettings(newSettings)
          updateSettings(newSettings)
        }

        toast({
          title: "تم الاستيراد",
          description: "تم استيراد البيانات بنجاح",
        })
      } catch (error) {
        console.error(error)
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء قراءة الملف",
          variant: "destructive"
        })
      }
    }
    reader.readAsBinaryString(file)
    // Reset input
    e.target.value = ""
  }

  // Helper to render the management UI for a specific section
  const renderManagementUI = (sectionKey: "categories" | "brands" | "colors" | "collections" | "units") => {
    const getTitle = () => {
      const titles = {
        categories: "الفئات",
        brands: "البراندات",
        colors: "الألوان",
        collections: "المجموعات",
        units: "الوحدات"
      }
      return titles[sectionKey]
    }

    const renderList = () => {
      if (sectionKey === "units") {
        return settings.units.map((item) => (
          <div key={item.code} className="flex items-center justify-between rounded-lg border p-4 mb-2">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{item.code}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold">{item.ar}</span>
                <span className="mx-2">•</span>
                <span>{item.en}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(sectionKey, item.code)} className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      }

      const items = settings[sectionKey as keyof SettingsData] as Record<string, any>
      return Object.entries(items).map(([code, data]: [string, any]) => (
        <div key={code} className="flex items-center justify-between rounded-lg border p-4 mb-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{code}</span>
              <span className="rounded bg-secondary px-2 py-1 font-mono text-xs">{data.numeric}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold">{data.ar}</span>
              <span className="mx-2">•</span>
              <span>{data.en}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(sectionKey, code)} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))
    }

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2 flex justify-end gap-2 mb-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExportExcel(sectionKey)}>
              <Download className="ml-2 h-4 w-4" /> تصدير Excel
            </Button>
            <div className="relative">
              <Input
                type="file"
                accept=".xlsx, .xls"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => handleImportExcel(e, sectionKey)}
              />
              <Button variant="outline" size="sm">
                <Upload className="ml-2 h-4 w-4" /> استيراد Excel
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>إضافة {getTitle()}</CardTitle>
            <CardDescription>أضف عنصر جديد إلى {getTitle()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>الكود *</Label>
              <Input
                placeholder="مثال: BOX, MIXB"
                value={newItem.code}
                onChange={(e) => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })}
              />
            </div>

            {sectionKey !== "units" && (
              <div className="space-y-2">
                <Label>الكود الرقمي *</Label>
                <Input
                  placeholder="مثال: 01, 101"
                  value={newItem.numericCode}
                  onChange={(e) => setNewItem({ ...newItem, numericCode: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم بالعربية *</Label>
                <Input
                  placeholder="مثال: علبة"
                  value={newItem.arabicName}
                  onChange={(e) => setNewItem({ ...newItem, arabicName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>الاسم بالإنجليزية *</Label>
                <Input
                  placeholder="Example: Box"
                  value={newItem.englishName}
                  onChange={(e) => setNewItem({ ...newItem, englishName: e.target.value })}
                />
              </div>
            </div>

            <Button onClick={() => handleAddItem(sectionKey)} className="w-full">
              <Plus className="ml-2 h-4 w-4" />
              إضافة
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>قائمة {getTitle()}</CardTitle>
            <CardDescription>العناصر الحالية في {getTitle()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">{renderList()}</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="elements" dir="rtl" className="w-full">
        <TabsList className="w-full justify-start h-auto p-2 flex-wrap gap-2 bg-muted/50 rounded-lg mb-6">
          <TabsTrigger value="elements" className="flex-1 py-3 text-base">إدارة العناصر</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 py-3 text-base">إدارة الأقسام الرئيسية</TabsTrigger>
          <TabsTrigger value="naming" className="flex-1 py-3 text-base">ترتيب التسمية</TabsTrigger>
          <TabsTrigger value="barcode" className="flex-1 py-3 text-base">ترتيب الباركود</TabsTrigger>
        </TabsList>

        <TabsContent value="elements" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardContent className="p-0 pb-6">
              <div className="flex flex-wrap gap-2 bg-white p-2 rounded-lg border w-fit mx-auto lg:mx-0">
                <Button
                  variant={activeElementSection === "brands" ? "default" : "ghost"}
                  onClick={() => setActiveElementSection("brands")}
                  size="sm"
                >
                  البراندات
                </Button>
                <Button
                  variant={activeElementSection === "colors" ? "default" : "ghost"}
                  onClick={() => setActiveElementSection("colors")}
                  size="sm"
                >
                  الألوان
                </Button>
                <Button
                  variant={activeElementSection === "collections" ? "default" : "ghost"}
                  onClick={() => setActiveElementSection("collections")}
                  size="sm"
                >
                  المجموعات
                </Button>
                <Button
                  variant={activeElementSection === "units" ? "default" : "ghost"}
                  onClick={() => setActiveElementSection("units")}
                  size="sm"
                >
                  الوحدات
                </Button>
              </div>
            </CardContent>
          </Card>
          {renderManagementUI(activeElementSection)}
        </TabsContent>

        <TabsContent value="categories">
          {renderManagementUI("categories")}
        </TabsContent>

        <TabsContent value="naming">
          <ProductNamingOrder />
        </TabsContent>

        <TabsContent value="barcode">
          <BarcodeCompositionOrder />
        </TabsContent>
      </Tabs>
    </div>
  )
}
