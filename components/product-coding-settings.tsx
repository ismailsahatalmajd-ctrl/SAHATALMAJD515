"use client"

import { useState, useEffect, useRef } from "react"
import * as XLSX from "xlsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Settings, Plus, Trash2, ArrowLeft, Edit2, GripVertical, Save, X, FolderPlus, Download, Upload, Barcode, ArrowUp, ArrowDown, Edit } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getSettings, updateSettings, type SettingsData, type SectionConfig } from "@/lib/settings-store"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"

interface SortableItemProps {
  id: string
  code: string
  data: any
  onEdit: (code: string) => void
  onDelete: (code: string) => void
  isUnit?: boolean
}

function SortableItem({ id, code, data, onEdit, onDelete, isUnit }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-lg border p-4 bg-background hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center gap-3 flex-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{code}</span>
            {!isUnit && <span className="rounded bg-secondary px-2 py-1 font-mono text-xs">{data.numeric}</span>}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold">{data.ar}</span>
            <span className="mx-2">•</span>
            <span>{data.en}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onEdit(code)}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(code)} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface SortableSectionProps {
  id: string
  section: SectionConfig
  onEdit: (key: string) => void
  onDelete: (key: string) => void
}

function SortableSection({ id, section, onEdit, onDelete }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-lg border p-4 bg-background hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center gap-3 flex-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{section.key}</span>
            {section.hasNumericCode && (
              <span className="rounded bg-green-100 dark:bg-green-900 px-2 py-1 text-xs">يحتوي على كود رقمي</span>
            )}
            {section.numericCode && (
              <span className="rounded bg-blue-100 dark:bg-blue-900 px-2 py-1 text-xs font-mono">
                كود: {section.numericCode}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold">{section.nameAr}</span>
            <span className="mx-2">•</span>
            <span>{section.nameEn}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onEdit(section.key)}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(section.key)} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface SortableBarcodeElementProps {
  id: string
  element: any
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  index: number
}

function SortableBarcodeElement({ id, element, onEdit, onDelete, index }: SortableBarcodeElementProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
        element.enabled ? "bg-background" : "bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{element.id}</span>
            <span className="rounded bg-secondary px-2 py-1 font-mono text-xs">{element.length} chars</span>
            {!element.enabled && <span className="rounded bg-destructive/10 text-destructive px-2 py-1 text-xs">معطل</span>}
            {element.fixed && <span className="rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-2 py-1 text-xs">ثابت في النهاية</span>}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold">{element.nameAr}</span>
            <span className="mx-2">•</span>
            <span>{element.nameEn}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onEdit(index)}>
          <Edit2 className="h-4 w-4" />
        </Button>
        {!element.fixed && (
            <Button variant="ghost" size="icon" onClick={() => onDelete(index)} className="text-destructive">
            <Trash2 className="h-4 w-4" />
            </Button>
        )}
      </div>
    </div>
  )
}

interface SortableNamingElementProps {
    id: string
    element: any
    onEdit: (index: number) => void
    onDelete: (index: number) => void
    index: number
}
  
function SortableNamingElement({ id, element, onEdit, onDelete, index }: SortableNamingElementProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }
  
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
          element.enabled ? "bg-background" : "bg-muted/50"
        }`}
      >
        <div className="flex items-center gap-3 flex-1">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold">{element.id}</span>
              {!element.enabled && <span className="rounded bg-destructive/10 text-destructive px-2 py-1 text-xs">معطل</span>}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold">{element.nameAr}</span>
              <span className="mx-2">•</span>
              <span>{element.nameEn}</span>
            </div>
            {element.value && <div className="text-xs text-muted-foreground">قيمة ثابتة: {element.value}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(index)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(index)} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
}

export function ProductCodingSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<SettingsData>(getSettings())
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"sections" | "items" | "naming" | "barcode">("items")

  const [newItem, setNewItem] = useState({
    code: "",
    arabicName: "",
    englishName: "",
    numericCode: "",
  })

  const [editItem, setEditItem] = useState({
    code: "",
    arabicName: "",
    englishName: "",
    numericCode: "",
  })

  const [newSection, setNewSection] = useState({
    key: "",
    nameAr: "",
    nameEn: "",
    hasNumericCode: true,
    numericCode: "",
  })

  const [editSection, setEditSection] = useState({
    key: "",
    nameAr: "",
    nameEn: "",
    hasNumericCode: true,
    numericCode: "",
  })

  // Naming order management states
  const [newNamingElement, setNewNamingElement] = useState({
    nameAr: "",
    nameEn: "",
    value: "",
    description: "",
  })
  const [editNamingElement, setEditNamingElement] = useState({
    id: "",
    nameAr: "",
    nameEn: "",
    value: "",
    description: "",
    enabled: true,
  })
  const [editingNamingElement, setEditingNamingElement] = useState<string | null>(null)
  const [addingNamingElement, setAddingNamingElement] = useState<"arabic" | "english" | null>(null)

  const [activeSection, setActiveSection] = useState<string>(settings.sections[0]?.key || "categories")

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    const saved = getSettings()
    setSettings(saved)
    if (saved.sections.length > 0) {
      setActiveSection(saved.sections[0].key)
    }
  }, [])

  const handleDragEndSections = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = settings.sections.findIndex((section) => section.key === active.id)
    const newIndex = settings.sections.findIndex((section) => section.key === over.id)

    const newSections = arrayMove(settings.sections, oldIndex, newIndex)
    const newSettings = { ...settings, sections: newSections }
    setSettings(newSettings)
    updateSettings(newSettings)

    toast({
      title: "تم إعادة الترتيب",
      description: "تم حفظ ترتيب الأقسام الجديد بنجاح",
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const currentSection = settings.sections.find((s) => s.key === activeSection)
    if (!currentSection) return

    if (!currentSection.hasNumericCode) {
      // Units section
      const oldIndex = settings[activeSection].findIndex((item: any) => item.code === active.id)
      const newIndex = settings[activeSection].findIndex((item: any) => item.code === over.id)

      const newUnits = arrayMove(settings[activeSection], oldIndex, newIndex)
      const newSettings = { ...settings, [activeSection]: newUnits }
      setSettings(newSettings)
      updateSettings(newSettings)
    } else {
      const items = Object.entries(settings[activeSection])
      const oldIndex = items.findIndex(([code]) => code === active.id)
      const newIndex = items.findIndex(([code]) => code === over.id)

      const reorderedItems = arrayMove(items, oldIndex, newIndex)
      const newSection = Object.fromEntries(reorderedItems)

      const newSettings = { ...settings, [activeSection]: newSection }
      setSettings(newSettings)
      updateSettings(newSettings)
    }

    toast({
      title: "تم إعادة الترتيب",
      description: "تم حفظ الترتيب الجديد بنجاح",
    })
  }

  const handleAddSection = () => {
    if (!newSection.key || !newSection.nameAr || !newSection.nameEn) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      })
      return
    }

    // Check if section key already exists
    if (settings.sections.some((s) => s.key === newSection.key)) {
      toast({
        title: "خطأ",
        description: "مفتاح القسم موجود مسبقاً",
        variant: "destructive",
      })
      return
    }

    const updatedSections = [...settings.sections, { ...newSection }]
    const newSettings = {
      ...settings,
      sections: updatedSections,
      [newSection.key]: newSection.hasNumericCode ? {} : [],
    }
    setSettings(newSettings)
    updateSettings(newSettings)

    setNewSection({ key: "", nameAr: "", nameEn: "", hasNumericCode: true, numericCode: "" })

    toast({
      title: "تم الإضافة",
      description: "تم إضافة القسم الجديد بنجاح",
    })
  }

  const handleEditSectionClick = (key: string) => {
    const section = settings.sections.find((s) => s.key === key)
    if (section) {
      setEditingSection(key)
      setEditSection({ ...section })
    }
  }

  const handleSaveSectionEdit = () => {
    if (!editSection.nameAr || !editSection.nameEn) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      })
      return
    }

    const updatedSections = settings.sections.map((s) =>
      s.key === editingSection ? { ...s, nameAr: editSection.nameAr, nameEn: editSection.nameEn, hasNumericCode: editSection.hasNumericCode, numericCode: editSection.numericCode } : s,
    )

    const newSettings = { ...settings, sections: updatedSections }
    setSettings(newSettings)
    updateSettings(newSettings)

    setEditingSection(null)
    setEditSection({ key: "", nameAr: "", nameEn: "", hasNumericCode: true, numericCode: "" })

    toast({
      title: "تم التحديث",
      description: "تم تحديث القسم بنجاح",
    })
  }

  const handleCancelSectionEdit = () => {
    setEditingSection(null)
    setEditSection({ key: "", nameAr: "", nameEn: "", hasNumericCode: true, numericCode: "" })
  }

  const handleDeleteSection = (key: string) => {
    const updatedSections = settings.sections.filter((s) => s.key !== key)
    const newSettings = { ...settings, sections: updatedSections }
    delete newSettings[key]

    setSettings(newSettings)
    updateSettings(newSettings)

    if (activeSection === key && updatedSections.length > 0) {
      setActiveSection(updatedSections[0].key)
    }

    toast({
      title: "تم الحذف",
      description: "تم حذف القسم بنجاح",
    })
  }

  // Export to Excel
  const handleExportToExcel = () => {
    try {
      const workbook = XLSX.utils.book_new()

      // Create sections sheet
      const sectionsData = settings.sections.map((section) => ({
        "المفتاح (Key)": section.key,
        "الاسم بالعربية": section.nameAr,
        "الاسم بالإنجليزية": section.nameEn,
        "يحتوي على كود رقمي": section.hasNumericCode ? "نعم" : "لا",
        "الكود الرقمي": section.numericCode || "",
      }))
      const sectionsSheet = XLSX.utils.json_to_sheet(sectionsData)
      XLSX.utils.book_append_sheet(workbook, sectionsSheet, "الأقسام الرئيسية")

      // Create a sheet for each section with its items
      settings.sections.forEach((section) => {
        const sectionData = settings[section.key]
        if (sectionData) {
          let itemsData: any[] = []

          if (section.hasNumericCode) {
            // For sections with numeric codes (object format)
            itemsData = Object.entries(sectionData).map(([code, data]: [string, any]) => ({
              "الكود": code,
              "الكود الرقمي": data.numeric || "",
              "الاسم بالعربية": data.ar || "",
              "الاسم بالإنجليزية": data.en || "",
            }))
          } else {
            // For sections without numeric codes (array format)
            itemsData = (sectionData as any[]).map((item: any) => ({
              "الكود": item.code || "",
              "الاسم بالعربية": item.ar || "",
              "الاسم بالإنجليزية": item.en || "",
            }))
          }

          if (itemsData.length > 0) {
            const itemsSheet = XLSX.utils.json_to_sheet(itemsData)
            XLSX.utils.book_append_sheet(workbook, itemsSheet, section.nameAr)
          }
        }
      })

      // Add barcode order sheet
      const barcodeOrderData = settings.barcodeOrder?.elements?.map((element) => ({
        "المعرف (ID)": element.id,
        "الاسم بالعربية": element.nameAr,
        "الاسم بالإنجليزية": element.nameEn,
        "القيمة": element.value || "<ديناميكي>",
        "الطول": element.length,
        "نشط": element.enabled ? "نعم" : "لا",
        "ثابت": element.fixed ? "نعم" : "لا",
        "الوصف": element.description,
      })) || []
      const barcodeOrderSheet = XLSX.utils.json_to_sheet(barcodeOrderData)
      XLSX.utils.book_append_sheet(workbook, barcodeOrderSheet, "ترتيب الباركود")

      // Add naming order sheet
      const namingOrderData = [
        // Arabic naming elements
        ...(settings.namingOrder?.arabic?.map((element, index) => ({
          "اللغة": "عربية",
          "الترتيب": index + 1,
          "المعرّف": element.id,
          "الاسم": element.nameAr,
          "الاسم الإنجليزي": element.nameEn,
          "القيمة": element.value,
          "الوصف": element.description,
          "مفعل": element.enabled ? "نعم" : "لا",
        })) || []),
        // English naming elements
        ...(settings.namingOrder?.english?.map((element, index) => ({
          "اللغة": "إنجليزية",
          "الترتيب": index + 1,
          "المعرّف": element.id,
          "الاسم": element.nameAr,
          "الاسم الإنجليزي": element.nameEn,
          "القيمة": element.value,
          "الوصف": element.description,
          "مفعل": element.enabled ? "نعم" : "لا",
        })) || []),
      ]
      const namingOrderSheet = XLSX.utils.json_to_sheet(namingOrderData)
      XLSX.utils.book_append_sheet(workbook, namingOrderSheet, "ترتيب التسمية")

      // Generate and download file
      XLSX.writeFile(workbook, "settings-export.xlsx")

      toast({
        title: "✅ تم التصدير",
        description: "تم تصدير البيانات إلى ملف Excel بنجاح",
      })
    } catch (error) {
      console.error("Export error:", error)
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تصدير البيانات",
        variant: "destructive",
      })
    }
  }

  // Import from Excel
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Barcode element management state
  const [editingBarcodeElement, setEditingBarcodeElement] = useState<number | null>(null)
  const [addingBarcodeElement, setAddingBarcodeElement] = useState(false)
  const [barcodeElementForm, setBarcodeElementForm] = useState({
    id: "",
    nameAr: "",
    nameEn: "",
    value: "",
    length: 2,
    enabled: true,
    fixed: false,
    description: "",
  })

  const handleImportFromExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })

        // Read sections sheet
        const sectionsSheetName = "الأقسام الرئيسية"
        if (!workbook.SheetNames.includes(sectionsSheetName)) {
          toast({
            title: "خطأ",
            description: "الملف لا يحتوي على ورقة 'الأقسام الرئيسية'",
            variant: "destructive",
          })
          return
        }

        const sectionsSheet = workbook.Sheets[sectionsSheetName]
        const sectionsJson = XLSX.utils.sheet_to_json(sectionsSheet)

        const newSections: SectionConfig[] = sectionsJson.map((row: any) => ({
          key: row["المفتاح (Key)"],
          nameAr: row["الاسم بالعربية"],
          nameEn: row["الاسم بالإنجليزية"],
          hasNumericCode: row["يحتوي على كود رقمي"] === "نعم",
          numericCode: row["الكود الرقمي"] || "",
        }))

        // Read items for each section
        const newSettings: any = { sections: newSections }

        newSections.forEach((section) => {
          const sheetName = section.nameAr
          if (workbook.SheetNames.includes(sheetName)) {
            const itemsSheet = workbook.Sheets[sheetName]
            const itemsJson = XLSX.utils.sheet_to_json(itemsSheet)

            if (section.hasNumericCode) {
              // Object format
              const itemsObject: any = {}
              itemsJson.forEach((row: any) => {
                const code = row["الكود"]
                itemsObject[code] = {
                  numeric: row["الكود الرقمي"] || "",
                  ar: row["الاسم بالعربية"] || "",
                  en: row["الاسم بالإنجليزية"] || "",
                }
              })
              newSettings[section.key] = itemsObject
            } else {
              // Array format
              const itemsArray = itemsJson.map((row: any) => ({
                code: row["الكود"] || "",
                ar: row["الاسم بالعربية"] || "",
                en: row["الاسم بالإنجليزية"] || "",
              }))
              newSettings[section.key] = itemsArray
            }
          } else {
            // Initialize empty data structure
            newSettings[section.key] = section.hasNumericCode ? {} : []
          }
        })

        // Import barcode order if exists
        if (workbook.SheetNames.includes("ترتيب الباركود")) {
          const barcodeSheet = workbook.Sheets["ترتيب الباركود"]
          const barcodeJson = XLSX.utils.sheet_to_json(barcodeSheet)
          
          const barcodeElements = barcodeJson.map((row: any) => ({
            id: row["المعرف (ID)"],
            nameAr: row["الاسم بالعربية"],
            nameEn: row["الاسم بالإنجليزية"],
            value: row["القيمة"] === "<ديناميكي>" ? "" : row["القيمة"],
            length: parseInt(row["الطول"]) || 2,
            enabled: row["نشط"] === "نعم",
            fixed: row["ثابت"] === "نعم",
            description: row["الوصف"] || "",
          }))
          
          newSettings.barcodeOrder = { elements: barcodeElements }
        }

        // Import naming order if exists
        // (Implementation can be added similarly)

        // Merge with existing settings (or replace)
        const finalSettings = { ...settings, ...newSettings }
        setSettings(finalSettings)
        updateSettings(finalSettings)

        toast({
          title: "تم الاستيراد",
          description: "تم استيراد الإعدادات بنجاح",
        })
      } catch (error) {
        console.error("Import error:", error)
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء قراءة الملف",
          variant: "destructive",
        })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleAddItem = () => {
      const currentSection = settings.sections.find(s => s.key === activeSection)
      if (!currentSection) return
  
      if (!newItem.code || !newItem.arabicName || !newItem.englishName) {
        toast({
          title: "خطأ",
          description: "يرجى ملء جميع الحقول المطلوبة",
          variant: "destructive",
        })
        return
      }
  
      if (!currentSection.hasNumericCode) {
        // Units (array format)
        const updatedItems = [...(settings[activeSection] || []), { code: newItem.code, ar: newItem.arabicName, en: newItem.englishName }]
        const newSettings = { ...settings, [activeSection]: updatedItems }
        setSettings(newSettings)
        updateSettings(newSettings)
      } else {
        // Object format
        if (!newItem.numericCode) {
          toast({
            title: "خطأ",
            description: "يرجى إدخال الكود الرقمي",
            variant: "destructive",
          })
          return
        }
  
        const section = settings[activeSection] || {}
        const updatedSection = {
          ...section,
          [newItem.code]: {
            numeric: newItem.numericCode,
            ar: newItem.arabicName,
            en: newItem.englishName,
          },
        }
  
        const newSettings = { ...settings, [activeSection]: updatedSection }
        setSettings(newSettings)
        updateSettings(newSettings)
      }
  
      setNewItem({ code: "", arabicName: "", englishName: "", numericCode: "" })
  
      toast({
        title: "تم الإضافة",
        description: "تم إضافة العنصر بنجاح",
      })
  }
  
  const handleDeleteItem = (code: string) => {
      const currentSection = settings.sections.find(s => s.key === activeSection)
      if (!currentSection) return
  
      if (!currentSection.hasNumericCode) {
        // Array format
        const updatedItems = (settings[activeSection] || []).filter((u: any) => u.code !== code)
        const newSettings = { ...settings, [activeSection]: updatedItems }
        setSettings(newSettings)
        updateSettings(newSettings)
      } else {
        // Object format
        const section = { ...settings[activeSection] }
        delete section[code]
        const newSettings = { ...settings, [activeSection]: section }
        setSettings(newSettings)
        updateSettings(newSettings)
      }
  
      toast({
        title: "تم الحذف",
        description: "تم حذف العنصر بنجاح",
      })
  }

  const renderItems = () => {
    const currentSection = settings.sections.find(s => s.key === activeSection)
    if (!currentSection) return null

    if (!currentSection.hasNumericCode) {
        // Array format (like units)
        const items = settings[activeSection] || []
        return (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={items.map((i: any) => i.code)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {items.map((item: any) => (
                    <SortableItem
                      key={item.code}
                      id={item.code}
                      code={item.code}
                      data={item}
                      onEdit={(code) => {
                        setEditingItem(code)
                        setEditItem({
                          code: item.code,
                          arabicName: item.ar,
                          englishName: item.en,
                          numericCode: "",
                        })
                      }}
                      onDelete={handleDeleteItem}
                      isUnit={true}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
        )
    }

    // Object format
    const items = settings[activeSection] || {}
    const itemsList = Object.entries(items)
    
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={itemsList.map(([code]) => code)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                {itemsList.map(([code, data]: [string, any]) => (
                    <SortableItem
                    key={code}
                    id={code}
                    code={code}
                    data={data}
                    onEdit={(code) => {
                        setEditingItem(code)
                        setEditItem({
                            code: code,
                            arabicName: data.ar,
                            englishName: data.en,
                            numericCode: data.numeric,
                        })
                    }}
                    onDelete={handleDeleteItem}
                    />
                ))}
                </div>
            </SortableContext>
        </DndContext>
    )
  }

  // Handle saving item edits
  const handleSaveItemEdit = () => {
      if (!editingItem) return
      
      const currentSection = settings.sections.find(s => s.key === activeSection)
      if (!currentSection) return
  
      if (!editItem.arabicName || !editItem.englishName) {
         toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" })
         return
      }
  
      if (!currentSection.hasNumericCode) {
          const updatedItems = (settings[activeSection] || []).map((item: any) => 
            item.code === editingItem ? { ...item, ar: editItem.arabicName, en: editItem.englishName } : item
          )
          const newSettings = { ...settings, [activeSection]: updatedItems }
          setSettings(newSettings)
          updateSettings(newSettings)
      } else {
          if (!editItem.numericCode) {
            toast({ title: "خطأ", description: "الكود الرقمي مطلوب", variant: "destructive" })
            return
          }
          const section = { ...settings[activeSection] }
          section[editingItem] = {
              numeric: editItem.numericCode,
              ar: editItem.arabicName,
              en: editItem.englishName
          }
          const newSettings = { ...settings, [activeSection]: section }
          setSettings(newSettings)
          updateSettings(newSettings)
      }
  
      setEditingItem(null)
      toast({ title: "تم التحديث", description: "تم تحديث العنصر بنجاح" })
  }

  // --- Barcode Drag and Drop ---
  const handleBarcodeDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
  
      const elements = settings.barcodeOrder?.elements || []
      const oldIndex = elements.findIndex(e => e.id === active.id)
      const newIndex = elements.findIndex(e => e.id === over.id)
  
      if (oldIndex !== -1 && newIndex !== -1) {
          const newElements = arrayMove(elements, oldIndex, newIndex)
          const newSettings = { ...settings, barcodeOrder: { ...settings.barcodeOrder, elements: newElements } }
          setSettings(newSettings)
          updateSettings(newSettings)
      }
  }

  const handleAddBarcodeElement = () => {
      if (!barcodeElementForm.id || !barcodeElementForm.nameAr || !barcodeElementForm.nameEn) {
          toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" })
          return
      }
      const elements = settings.barcodeOrder?.elements || []
      const newElements = [...elements, { ...barcodeElementForm }]
      const newSettings = { ...settings, barcodeOrder: { ...settings.barcodeOrder, elements: newElements } }
      setSettings(newSettings)
      updateSettings(newSettings)
      setAddingBarcodeElement(false)
      setBarcodeElementForm({
        id: "",
        nameAr: "",
        nameEn: "",
        value: "",
        length: 2,
        enabled: true,
        fixed: false,
        description: "",
      })
  }

  const handleSaveBarcodeElementEdit = () => {
      if (editingBarcodeElement === null) return
      const elements = [...(settings.barcodeOrder?.elements || [])]
      elements[editingBarcodeElement] = { ...barcodeElementForm }
      const newSettings = { ...settings, barcodeOrder: { ...settings.barcodeOrder, elements: elements } }
      setSettings(newSettings)
      updateSettings(newSettings)
      setEditingBarcodeElement(null)
      setBarcodeElementForm({
        id: "",
        nameAr: "",
        nameEn: "",
        value: "",
        length: 2,
        enabled: true,
        fixed: false,
        description: "",
      })
  }

  const handleDeleteBarcodeElement = (index: number) => {
      const elements = [...(settings.barcodeOrder?.elements || [])]
      elements.splice(index, 1)
      const newSettings = { ...settings, barcodeOrder: { ...settings.barcodeOrder, elements: elements } }
      setSettings(newSettings)
      updateSettings(newSettings)
  }

  // --- Naming Drag and Drop ---
  const handleNamingDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      
      // Determine if we are sorting arabic or english based on active ID or state
      // Simplification: We need two contexts or separate handlers if ids are not unique across lists
      // For now, let's assume unique IDs or separate tabs
      
      // Since we have separate lists for Arabic and English naming, we need to know which one we are dragging.
      // We can infer it from the container or state.
      // Here, let's implement for both by checking existence
      
      const arabicList = settings.namingOrder?.arabic || []
      const englishList = settings.namingOrder?.english || []
      
      const oldIndexAr = arabicList.findIndex(e => e.id === active.id)
      if (oldIndexAr !== -1) {
          const newIndexAr = arabicList.findIndex(e => e.id === over.id)
          const newArabic = arrayMove(arabicList, oldIndexAr, newIndexAr)
          const newSettings = { ...settings, namingOrder: { ...settings.namingOrder, arabic: newArabic } }
          setSettings(newSettings)
          updateSettings(newSettings)
          return
      }
      
      const oldIndexEn = englishList.findIndex(e => e.id === active.id)
      if (oldIndexEn !== -1) {
          const newIndexEn = englishList.findIndex(e => e.id === over.id)
          const newEnglish = arrayMove(englishList, oldIndexEn, newIndexEn)
          const newSettings = { ...settings, namingOrder: { ...settings.namingOrder, english: newEnglish } }
          setSettings(newSettings)
          updateSettings(newSettings)
          return
      }
  }

  const handleAddNamingElement = () => {
      if (!newNamingElement.nameAr || !newNamingElement.nameEn) return
      
      const id = `custom_${Date.now()}`
      const element = { ...newNamingElement, id, enabled: true }
      
      // Add to both lists
      const newArabic = [...(settings.namingOrder?.arabic || []), element]
      const newEnglish = [...(settings.namingOrder?.english || []), element]
      
      const newSettings = { ...settings, namingOrder: { ...settings.namingOrder, arabic: newArabic, english: newEnglish } }
      setSettings(newSettings)
      updateSettings(newSettings)
      
      setAddingNamingElement(null)
      setNewNamingElement({ nameAr: "", nameEn: "", value: "", description: "" })
  }


  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
        <div className="flex justify-between items-center">
            <TabsList>
                <TabsTrigger value="items">العناصر</TabsTrigger>
                <TabsTrigger value="sections">الأقسام</TabsTrigger>
                <TabsTrigger value="naming">ترتيب التسمية</TabsTrigger>
                <TabsTrigger value="barcode">ترتيب الباركود</TabsTrigger>
            </TabsList>
            
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    استيراد
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={handleImportFromExcel}
                />
                <Button variant="outline" size="sm" onClick={handleExportToExcel}>
                    <Download className="mr-2 h-4 w-4" />
                    تصدير
                </Button>
            </div>
        </div>

        <TabsContent value="items" className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>إدارة العناصر</CardTitle>
                    <CardDescription>إضافة وتعديل العناصر في الأقسام المختلفة</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Section Selector */}
                    <div className="flex flex-wrap gap-2 pb-4 border-b">
                        {settings.sections.map((section) => (
                            <Button
                                key={section.key}
                                variant={activeSection === section.key ? "default" : "outline"}
                                onClick={() => setActiveSection(section.key)}
                                className="min-w-[100px]"
                            >
                                {section.nameAr}
                            </Button>
                        ))}
                    </div>
                    
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Add New Item Form */}
                        <div className="space-y-4 border rounded-lg p-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                إضافة عنصر جديد
                            </h3>
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label>الكود (Code)</Label>
                                    <Input 
                                        value={newItem.code} 
                                        onChange={e => setNewItem({...newItem, code: e.target.value.toUpperCase()})}
                                        placeholder="مثال: BLK" 
                                    />
                                </div>
                                {settings.sections.find(s => s.key === activeSection)?.hasNumericCode && (
                                    <div className="grid gap-2">
                                        <Label>الكود الرقمي</Label>
                                        <Input 
                                            value={newItem.numericCode} 
                                            onChange={e => setNewItem({...newItem, numericCode: e.target.value})}
                                            placeholder="مثال: 01" 
                                        />
                                    </div>
                                )}
                                <div className="grid gap-2">
                                    <Label>الاسم بالعربية</Label>
                                    <Input 
                                        value={newItem.arabicName} 
                                        onChange={e => setNewItem({...newItem, arabicName: e.target.value})}
                                        placeholder="مثال: أسود" 
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>الاسم بالإنجليزية</Label>
                                    <Input 
                                        value={newItem.englishName} 
                                        onChange={e => setNewItem({...newItem, englishName: e.target.value})}
                                        placeholder="مثال: Black" 
                                    />
                                </div>
                                <Button onClick={handleAddItem}>إضافة</Button>
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="space-y-4">
                            <h3 className="font-semibold">قائمة العناصر</h3>
                            <div className="max-h-[500px] overflow-y-auto pr-2">
                                {renderItems()}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="sections" className="space-y-4">
             <Card>
                <CardHeader>
                    <CardTitle>إدارة الأقسام</CardTitle>
                    <CardDescription>إضافة وترتيب الأقسام الرئيسية لتكوين الباركود</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                         {/* Add Section Form */}
                         <div className="space-y-4 border rounded-lg p-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                إضافة قسم جديد
                            </h3>
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label>مفتاح القسم (Key)</Label>
                                    <Input 
                                        value={newSection.key} 
                                        onChange={e => setNewSection({...newSection, key: e.target.value})}
                                        placeholder="مثال: materials" 
                                    />
                                    <p className="text-xs text-muted-foreground">يجب أن يكون بالإنجليزية وبدون مسافات</p>
                                </div>
                                <div className="grid gap-2">
                                    <Label>الاسم بالعربية</Label>
                                    <Input 
                                        value={newSection.nameAr} 
                                        onChange={e => setNewSection({...newSection, nameAr: e.target.value})}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>الاسم بالإنجليزية</Label>
                                    <Input 
                                        value={newSection.nameEn} 
                                        onChange={e => setNewSection({...newSection, nameEn: e.target.value})}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch 
                                        checked={newSection.hasNumericCode} 
                                        onCheckedChange={c => setNewSection({...newSection, hasNumericCode: c})} 
                                    />
                                    <Label>يحتوي على كود رقمي</Label>
                                </div>
                                {newSection.hasNumericCode && (
                                     <div className="grid gap-2">
                                        <Label>الكود الرقمي للقسم (اختياري)</Label>
                                        <Input 
                                            value={newSection.numericCode} 
                                            onChange={e => setNewSection({...newSection, numericCode: e.target.value})}
                                            placeholder="مثال: 90"
                                        />
                                    </div>
                                )}
                                <Button onClick={handleAddSection}>إضافة قسم</Button>
                            </div>
                         </div>

                         {/* Sections List */}
                         <div className="space-y-4">
                             <h3 className="font-semibold">ترتيب الأقسام</h3>
                             <DndContext 
                                sensors={sensors} 
                                collisionDetection={closestCenter} 
                                onDragEnd={handleDragEndSections}
                             >
                                <SortableContext items={settings.sections.map(s => s.key)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2">
                                        {settings.sections.map(section => (
                                            <SortableSection 
                                                key={section.key} 
                                                id={section.key} 
                                                section={section}
                                                onEdit={handleEditSectionClick}
                                                onDelete={handleDeleteSection}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                             </DndContext>
                         </div>
                    </div>
                </CardContent>
             </Card>
        </TabsContent>

        <TabsContent value="barcode" className="space-y-4">
             <Card>
                <CardHeader>
                    <div className="flex justify-between">
                        <div>
                            <CardTitle>تكوين الباركود</CardTitle>
                            <CardDescription>ترتيب وتخصيص عناصر الباركود</CardDescription>
                        </div>
                        <Button onClick={() => setAddingBarcodeElement(true)} size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            إضافة عنصر
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {addingBarcodeElement && (
                        <div className="mb-6 p-4 border rounded-lg bg-muted/20">
                             <h4 className="font-semibold mb-4">إضافة عنصر باركود</h4>
                             <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="space-y-2">
                                    <Label>المعرف (ID)</Label>
                                    <Input value={barcodeElementForm.id} onChange={e => setBarcodeElementForm({...barcodeElementForm, id: e.target.value})} placeholder="مثال: category_code" />
                                </div>
                                <div className="space-y-2">
                                    <Label>الطول</Label>
                                    <Input type="number" value={barcodeElementForm.length} onChange={e => setBarcodeElementForm({...barcodeElementForm, length: parseInt(e.target.value)})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>الاسم بالعربية</Label>
                                    <Input value={barcodeElementForm.nameAr} onChange={e => setBarcodeElementForm({...barcodeElementForm, nameAr: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>الاسم بالإنجليزية</Label>
                                    <Input value={barcodeElementForm.nameEn} onChange={e => setBarcodeElementForm({...barcodeElementForm, nameEn: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>القيمة (اختياري)</Label>
                                    <Input value={barcodeElementForm.value} onChange={e => setBarcodeElementForm({...barcodeElementForm, value: e.target.value})} placeholder="اتركه فارغاً للقيم الديناميكية" />
                                </div>
                                <div className="space-y-2">
                                    <Label>الوصف</Label>
                                    <Input value={barcodeElementForm.description} onChange={e => setBarcodeElementForm({...barcodeElementForm, description: e.target.value})} />
                                </div>
                             </div>
                             <div className="flex gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    <Switch checked={barcodeElementForm.enabled} onCheckedChange={c => setBarcodeElementForm({...barcodeElementForm, enabled: c})} />
                                    <Label>مفعل</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={barcodeElementForm.fixed} onCheckedChange={c => setBarcodeElementForm({...barcodeElementForm, fixed: c})} />
                                    <Label>ثابت (لا يمكن تحريكه)</Label>
                                </div>
                             </div>
                             <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setAddingBarcodeElement(false)}>إلغاء</Button>
                                <Button onClick={handleAddBarcodeElement}>حفظ</Button>
                             </div>
                        </div>
                    )}

                    <DndContext 
                        sensors={sensors} 
                        collisionDetection={closestCenter} 
                        onDragEnd={handleBarcodeDragEnd}
                    >
                        <SortableContext items={(settings.barcodeOrder?.elements || []).map(e => e.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {(settings.barcodeOrder?.elements || []).map((element, index) => (
                                    <SortableBarcodeElement
                                        key={element.id}
                                        id={element.id}
                                        element={element}
                                        index={index}
                                        onEdit={(idx) => {
                                            setEditingBarcodeElement(idx)
                                            setBarcodeElementForm({ ...element })
                                            setAddingBarcodeElement(true)
                                        }}
                                        onDelete={(idx) => handleDeleteBarcodeElement(idx)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </CardContent>
             </Card>
        </TabsContent>

        <TabsContent value="naming" className="space-y-4">
             <Card>
                 <CardHeader>
                     <div className="flex justify-between">
                         <div>
                             <CardTitle>تكوين تسمية المنتج</CardTitle>
                             <CardDescription>ترتيب أجزاء اسم المنتج (عربي / إنجليزي)</CardDescription>
                         </div>
                     </div>
                 </CardHeader>
                 <CardContent>
                     <div className="grid md:grid-cols-2 gap-8">
                         {/* Arabic Naming */}
                         <div className="space-y-4">
                             <h4 className="font-semibold flex items-center gap-2">
                                 <span className="text-primary">AR</span>
                                 ترتيب الاسم العربي
                             </h4>
                             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleNamingDragEnd}>
                                 <SortableContext items={(settings.namingOrder?.arabic || []).map(e => e.id)} strategy={verticalListSortingStrategy}>
                                     <div className="space-y-2">
                                         {(settings.namingOrder?.arabic || []).map((element, index) => (
                                             <SortableNamingElement
                                                 key={element.id}
                                                 id={element.id}
                                                 element={element}
                                                 index={index}
                                                 onEdit={() => {}}
                                                 onDelete={() => {}}
                                             />
                                         ))}
                                     </div>
                                 </SortableContext>
                             </DndContext>
                         </div>

                         {/* English Naming */}
                         <div className="space-y-4">
                             <h4 className="font-semibold flex items-center gap-2">
                                 <span className="text-primary">EN</span>
                                 ترتيب الاسم الإنجليزي
                             </h4>
                             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleNamingDragEnd}>
                                 <SortableContext items={(settings.namingOrder?.english || []).map(e => e.id)} strategy={verticalListSortingStrategy}>
                                     <div className="space-y-2">
                                         {(settings.namingOrder?.english || []).map((element, index) => (
                                             <SortableNamingElement
                                                 key={element.id}
                                                 id={element.id}
                                                 element={element}
                                                 index={index}
                                                 onEdit={() => {}}
                                                 onDelete={() => {}}
                                             />
                                         ))}
                                     </div>
                                 </SortableContext>
                             </DndContext>
                         </div>
                     </div>
                 </CardContent>
             </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialogs would go here - simplified for this extraction */}
      {editingItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <Card className="w-[400px]">
                  <CardHeader>
                      <CardTitle>تعديل العنصر</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="grid gap-2">
                          <Label>الاسم بالعربية</Label>
                          <Input value={editItem.arabicName} onChange={e => setEditItem({...editItem, arabicName: e.target.value})} />
                      </div>
                      <div className="grid gap-2">
                          <Label>الاسم بالإنجليزية</Label>
                          <Input value={editItem.englishName} onChange={e => setEditItem({...editItem, englishName: e.target.value})} />
                      </div>
                      {settings.sections.find(s => s.key === activeSection)?.hasNumericCode && (
                          <div className="grid gap-2">
                              <Label>الكود الرقمي</Label>
                              <Input value={editItem.numericCode} onChange={e => setEditItem({...editItem, numericCode: e.target.value})} />
                          </div>
                      )}
                      <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setEditingItem(null)}>إلغاء</Button>
                          <Button onClick={handleSaveItemEdit}>حفظ</Button>
                      </div>
                  </CardContent>
              </Card>
          </div>
      )}

      {editingSection && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <Card className="w-[400px]">
                  <CardHeader>
                      <CardTitle>تعديل القسم</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="grid gap-2">
                          <Label>الاسم بالعربية</Label>
                          <Input value={editSection.nameAr} onChange={e => setEditSection({...editSection, nameAr: e.target.value})} />
                      </div>
                      <div className="grid gap-2">
                          <Label>الاسم بالإنجليزية</Label>
                          <Input value={editSection.nameEn} onChange={e => setEditSection({...editSection, nameEn: e.target.value})} />
                      </div>
                      <div className="flex items-center gap-2">
                          <Switch checked={editSection.hasNumericCode} onCheckedChange={c => setEditSection({...editSection, hasNumericCode: c})} />
                          <Label>يحتوي على كود رقمي</Label>
                      </div>
                      {editSection.hasNumericCode && (
                           <div className="grid gap-2">
                              <Label>الكود الرقمي للقسم</Label>
                              <Input value={editSection.numericCode} onChange={e => setEditSection({...editSection, numericCode: e.target.value})} />
                          </div>
                      )}
                      <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={handleCancelSectionEdit}>إلغاء</Button>
                          <Button onClick={handleSaveSectionEdit}>حفظ</Button>
                      </div>
                  </CardContent>
              </Card>
          </div>
      )}
    </div>
  )
}
