"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { Plus, Pencil, Trash2, MapPin, Phone, User, Search, Download, FileText, AlertTriangle, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { addBranch, updateBranch, deleteBranch } from "@/lib/storage"
import { hashPassword } from "@/lib/pwd"
import { addAuditLog } from "@/lib/audit-log"
import type { Branch } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import * as XLSX from "xlsx"
import { useBranchesRealtime } from "@/hooks/use-store"
import { syncBranch, deleteBranchApi } from "@/lib/sync-api"
import { useRef } from "react"
import { Upload } from "lucide-react"

export function BranchManager() {
  const { t } = useI18n()
  const { toast } = useToast()

  // Realtime Data
  const { data: branches } = useBranchesRealtime()

  const [searchTerm, setSearchTerm] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    manager: "",
    phone: "",
    username: "",
    password: "",
  })

  const filteredBranches = useMemo(() => {
    if (searchTerm) {
      return branches.filter(
        (b) =>
          b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          b.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (b.username && b.username.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }
    return branches
  }, [branches, searchTerm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (!formData.name || !formData.location || (!editingBranch && (!formData.username || !formData.password))) {
        toast({
          title: "خطأ في البيانات",
          description: "يرجى تعبئة جميع الحقول المطلوبة (الاسم، الموقع، اسم المستخدم، كلمة المرور)",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      if (editingBranch) {
        const updates: Partial<Branch> = {
          name: formData.name,
          location: formData.location,
          manager: formData.manager || undefined,
          phone: formData.phone || undefined,
          username: formData.username || undefined,
        }

        if (formData.password) {
          updates.passwordHash = await hashPassword(formData.password)
        }

        const updated = updateBranch(editingBranch.id, updates)
        if (updated) {
          syncBranch(updated).catch(console.error)
          addAuditLog("admin", "Admin User", "update", "branch", updated.id, updated.name, undefined, { updates: Object.keys(updates) })
          toast({ title: "تم التحديث", description: "تم تحديث بيانات الفرع بنجاح" })
        }
      } else {
        // Check if username exists
        if (branches.some(b => b.username === formData.username)) {
          toast({
            title: "اسم المستخدم مستخدم",
            description: "يرجى اختيار اسم مستخدم آخر",
            variant: "destructive",
          })
          setIsLoading(false)
          return
        }

        const passwordHash = await hashPassword(formData.password)
        const newBranch = addBranch({
          name: formData.name,
          location: formData.location,
          manager: formData.manager || undefined,
          phone: formData.phone || undefined,
          username: formData.username,
          passwordHash,
        })
        syncBranch(newBranch).catch(console.error)
        addAuditLog("admin", "Admin User", "create", "branch", newBranch.id, newBranch.name)
        toast({ title: "تم الإضافة", description: "تم إضافة الفرع الجديد بنجاح" })
      }
      setIsOpen(false)
      resetForm()
    } catch (error) {
      console.error(error)
      toast({ title: "خطأ", description: "حدث خطأ غير متوقع", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch)
    setFormData({
      name: branch.name,
      location: branch.location,
      manager: branch.manager || "",
      phone: branch.phone || "",
      username: branch.username || "",
      password: "", // Always empty for security
    })
    setIsOpen(true)
  }

  const handleDelete = () => {
    if (deleteId) {
      const branch = branches.find(b => b.id === deleteId)
      if (branch) {
        deleteBranch(deleteId)
        deleteBranchApi(deleteId).catch(console.error)
        addAuditLog("admin", "Admin User", "delete", "branch", branch.id, branch.name)
        toast({ title: "تم الحذف", description: "تم حذف الفرع بنجاح" })
      }
      setDeleteId(null)
    }
  }

  const resetForm = () => {
    setFormData({ name: "", location: "", manager: "", phone: "", username: "", password: "" })
    setEditingBranch(null)
  }

  const exportToCSV = () => {
    const data = branches.map(b => ({
      "الاسم": b.name,
      "الموقع": b.location,
      "المدير": b.manager || "-",
      "الهاتف": b.phone || "-",
      "اسم المستخدم": b.username || "-",
      "تاريخ الإنشاء": new Date(b.createdAt).toLocaleDateString('ar-SA')
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "الفروع")
    XLSX.writeFile(wb, "branches_list.xlsx")

    addAuditLog("admin", "Admin User", "export", "branch", "all", "All Branches")
  }

  const printBranches = () => {
    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>قائمة الفروع</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #2563eb; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
          th { background-color: #f8fafc; color: #1e293b; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>قائمة الفروع</h1>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الفرع</th>
              <th>الموقع</th>
              <th>المدير</th>
              <th>رقم الهاتف</th>
              <th>اسم المستخدم</th>
            </tr>
          </thead>
          <tbody>
            ${branches.map((b, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${b.name}</td>
                <td>${b.location}</td>
                <td>${b.manager || "-"}</td>
                <td>${b.phone || "-"}</td>
                <td>${b.username || "-"}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
          تم الطباعة في: ${new Date().toLocaleString('ar-SA')}
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      for (const row of jsonData) {
        // Map Arabic/English headers
        const name = row['اسم الفرع'] || row['Name'] || row['name']
        const location = row['الموقع'] || row['Location'] || row['location']
        const username = row['اسم المستخدم'] || row['Username'] || row['username']
        let password = row['كلمة المرور'] || row['Password'] || row['password']

        // Optional
        const manager = row['المدير'] || row['Manager'] || row['manager'] || ""
        const phone = row['رقم الهاتف'] || row['Phone'] || row['phone'] || ""

        if (!name || !location || !username || !password) {
          failCount++
          continue
        }

        // Convert password to string explicitly to avoid issues with numeric passwords
        password = String(password)

        // Check duplicates
        if (branches.some(b => b.username === username)) {
          failCount++
          errors.push(`اسم المستخدم ${username} موجود مسبقاً`)
          continue
        }

        try {
          const passwordHash = await hashPassword(password)
          const newBranch = addBranch({
            name,
            location,
            manager,
            phone,
            username,
            passwordHash,
          })
          await syncBranch(newBranch)
          addAuditLog("admin", "Admin User", "create", "branch", newBranch.id, newBranch.name, undefined, { method: 'bulk_import' })
          successCount++
        } catch (err) {
          console.error(err)
          failCount++
        }
      }

      toast({
        title: "تم الاستيراد",
        description: `تم إضافة ${successCount} فرع بنجاح. ${failCount > 0 ? `فشل ${failCount} (تحقق من البيانات المكررة أو الناقصة)` : ''}`,
        variant: failCount > 0 ? "default" : "default" // Keep default unless critical failure? User might want to know about failures prominently.
      })

      if (errors.length > 0) {
        console.error("Import Errors:", errors)
      }

    } catch (err) {
      console.error("Import Failed", err)
      toast({ title: "فشل الاستيراد", description: "تأكد من صيغة الملف (Excel)", variant: "destructive" })
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const downloadTemplate = () => {
    const headers = [
      { "اسم الفرع": "فرع الرياض 1", "الموقع": "الرياض - حي العليا", "المدير": "أحمد محمد", "رقم الهاتف": "0500000000", "اسم المستخدم": "riyadh1", "كلمة المرور": "123456" },
      { "اسم الفرع": "فرع جدة 1", "الموقع": "جدة - التحلية", "المدير": "سعيد علي", "رقم الهاتف": "0550000000", "اسم المستخدم": "jeddah1", "كلمة المرور": "password" }
    ]
    const ws = XLSX.utils.json_to_sheet(headers)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, "branches_import_template.xlsx")
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن فرع..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={printBranches}>
            <Printer className="ml-2 h-4 w-4" />
            طباعة / PDF
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="ml-2 h-4 w-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" onClick={downloadTemplate} title="تحميل نموذج الإكسل">
            <FileText className="ml-2 h-4 w-4" />
            نموذج
          </Button>
          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <Button variant="secondary" onClick={handleImportClick} disabled={isLoading}>
              <Upload className="ml-2 h-4 w-4" />
              {isLoading ? "جاري الاستيراد..." : "استيراد إكسل"}
            </Button>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-2 h-4 w-4" />
                إضافة فرع
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingBranch ? "تعديل بيانات الفرع" : "إضافة فرع جديد"}</DialogTitle>
                <DialogDescription>
                  قم بإدخال تفاصيل الفرع ومعلومات تسجيل الدخول أدناه.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">اسم الفرع *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">الموقع *</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manager">المدير المسؤول</Label>
                    <Input
                      id="manager"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    بيانات الدخول
                  </h4>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">اسم المستخدم {editingBranch ? "(اختياري)" : "*"}</Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        required={!editingBranch}
                        dir="ltr"
                        className="text-left"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">
                        كلمة المرور {editingBranch ? "(اتركها فارغة للإبقاء على الحالية)" : "*"}
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!editingBranch}
                        dir="ltr"
                        className="text-left"
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "جاري الحفظ..." : (editingBranch ? "حفظ التغييرات" : "إضافة الفرع")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredBranches.map((branch) => (
          <Card key={branch.id} className="overflow-hidden">
            <CardHeader className="bg-muted/50 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{branch.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {branch.location}
                  </CardDescription>
                </div>
                <Badge variant={branch.username ? "default" : "secondary"}>
                  {branch.username ? "مفعل" : "بدون حساب"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">المدير:</span>
                  <span className="font-medium">{branch.manager || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الهاتف:</span>
                  <span className="font-medium" dir="ltr">{branch.phone || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">اسم المستخدم:</span>
                  <span className="font-medium font-mono">{branch.username || "-"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(branch)}>
                  <Pencil className="mr-2 h-3 w-3" />
                  تعديل
                </Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => setDeleteId(branch.id)}>
                  <Trash2 className="mr-2 h-3 w-3" />
                  حذف
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredBranches.length === 0 && (
          <div className="col-span-full py-12 text-center border rounded-lg border-dashed">
            <p className="text-muted-foreground">لا توجد فروع مطابقة للبحث</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[95vw] w-full sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من رغبتك في حذف هذا الفرع؟ لا يمكن التراجع عن هذا الإجراء، وسيتم حذف جميع البيانات المرتبطة به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  )
}
