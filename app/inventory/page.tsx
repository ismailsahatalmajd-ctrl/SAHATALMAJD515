"use client"

import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Printer, Search, FileText, Calendar, Building2, ClipboardList, Loader2, Download, Edit, Trash2, Save, X, Package, DollarSign } from "lucide-react"
import { generateInventoryReportPDF } from "@/lib/inventory-report-pdf-generator"
import { exportInventoryReportToExcel } from "@/lib/inventory-excel-generator"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { format } from "date-fns"
import { convertNumbersToEnglish, formatCurrency } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { BranchInventoryReport, BranchInventoryReportItem, Product } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/components/language-provider"
import { syncBranchInventoryReport } from "@/lib/firebase-sync-engine"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"
import { UnitCombobox } from "@/components/unit-combobox"

export default function InventoryPage() {
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState("")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingReport, setEditingReport] = useState<BranchInventoryReport | null>(null)
  const [editedItems, setEditedItems] = useState<BranchInventoryReportItem[]>([])
  const [productsMap, setProductsMap] = useState<Record<string, Product>>({})

  const reports = useLiveQuery(async () => {
    try {
      const all = await db.branchInventoryReports.toArray()
      
      // Pre-fetch products for pricing info
      const productIds = new Set<string>()
      all.forEach(r => r.items.forEach(it => productIds.add(it.productId)))
      const products = await db.products.where('id').anyOf(Array.from(productIds)).toArray()
      const pMap: Record<string, Product> = {}
      products.forEach(p => pMap[p.id] = p)
      setProductsMap(pMap)

      // Sort by date descending
      return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (err) {
      console.error("InventoryPage: LiveQuery Fetch Error:", err);
      return [];
    }
  })

  // If reports is undefined, it's still loading from Dexie
  const isInitialLoading = reports === undefined;
  const reportsList = reports || [];

  const filteredReports = reportsList.filter(r => 
    (r.branchName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.reportCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handlePrint = (report: BranchInventoryReport) => {
    generateInventoryReportPDF(report)
  }

  const handleExportExcel = (report: BranchInventoryReport) => {
    exportInventoryReportToExcel(report)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this report? / هل أنت متأكد من حذف هذا التقرير؟")) {
      try {
        await db.branchInventoryReports.delete(id)
        toast({ title: "Report deleted / تم حذف التقرير" })
      } catch (err) {
        toast({ title: "Delete failed / فشل الحذف", variant: "destructive" })
      }
    }
  }

  const openEditDialog = (report: BranchInventoryReport) => {
    setEditingReport(report)
    setEditedItems([...report.items])
    setIsEditDialogOpen(true)
  }

  const handleUpdateItemField = (productId: string, field: keyof BranchInventoryReportItem, value: any) => {
    setEditedItems(prev => prev.map(item => 
      item.productId === productId ? { ...item, [field]: value } : item
    ))
  }

  const handleSaveEdit = async () => {
    if (!editingReport) return

    try {
      const updatedReport = {
        ...editingReport,
        items: editedItems,
        updatedAt: new Date().toISOString()
      }

      await db.branchInventoryReports.put(updatedReport)
      
      // Optional: Sync to cloud
      if (typeof window !== 'undefined') {
        syncBranchInventoryReport(updatedReport).catch(console.error)
      }

      toast({ title: "Report updated / تم تحديث التقرير بنجاح" })
      setIsEditDialogOpen(false)
      setEditingReport(null)
    } catch (err) {
      console.error("Update report error:", err)
      toast({ title: "Update failed / فشل التحديث", variant: "destructive" })
    }
  }

  const calculateTotalValue = (items: BranchInventoryReportItem[]) => {
    return items.reduce((sum, item) => {
      // Use item-specific price if available, else current master price
      const price = item.price ?? productsMap[item.productId]?.price ?? 0
      return sum + (price * item.quantity)
    }, 0)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-blue-600" />
              تقارير جرد الفروع <br/> Branch Inventory Reports
            </h1>
            <p className="text-slate-500 mt-1">View and export inventory audit reports from branches / عرض وتصدير تقارير الجرد المرفوعة من الفروع</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search by branch or code... / ابحث بالفرع أو الكود..." 
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="w-[180px] border-r border-slate-100 text-center">كود التقرير <br/> Report Code</TableHead>
                    <TableHead className="border-r border-slate-100 text-center">الفرع <br/> Branch</TableHead>
                    <TableHead className="border-r border-slate-100 text-center">التاريخ <br/> Date</TableHead>
                    <TableHead className="border-r border-slate-100 text-center">الأصناف <br/> Items</TableHead>
                    <TableHead className="border-r border-slate-100 text-center">القيمة <br/> Value</TableHead>
                    <TableHead className="border-r border-slate-100 text-center">الملاحظات <br/> Notes</TableHead>
                    <TableHead className="text-center">Actions Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isInitialLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>Loading reports... / جاري تحميل التقارير</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredReports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                        {reportsList.length === 0 ? "No inventory reports found / لا توجد تقارير جرد" : "No matching reports / لا توجد تقارير مطابقة"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReports.map((report) => (
                      <TableRow key={report.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-mono font-bold text-blue-600 border-r border-slate-100 text-center">
                          {report.reportCode}
                        </TableCell>
                        <TableCell className="border-r border-slate-100 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="font-semibold">{report.branchName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="border-r border-slate-100 text-center">
                          <div className="flex items-center justify-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            {convertNumbersToEnglish(new Date(report.createdAt).toLocaleDateString('ar-EG'))}
                          </div>
                        </TableCell>
                        <TableCell className="border-r border-slate-100 text-center">
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold">
                            {report.items.length} {report.items.length === 1 ? "Item" : "Items"}
                          </span>
                        </TableCell>
                        <TableCell className="border-r border-slate-100 font-bold text-emerald-600 text-center">
                          {formatCurrency(calculateTotalValue(report.items))}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-slate-500 text-sm border-r border-slate-100 text-center">
                          {report.notes || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="bg-white hover:bg-blue-50 border-slate-200"
                              onClick={() => openEditDialog(report)}
                              title="Edit / تعديل"
                            >
                              <Edit className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="bg-white hover:bg-emerald-50 border-slate-200"
                              onClick={() => handleExportExcel(report)}
                              title="Excel / اكسل"
                            >
                              <Download className="w-4 h-4 text-emerald-600" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="bg-white hover:bg-orange-50 border-slate-200"
                              onClick={() => handlePrint(report)}
                              title="Print / PDF"
                            >
                              <Printer className="w-4 h-4 text-orange-600" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="bg-white hover:bg-red-50 border-slate-200"
                              onClick={() => handleDelete(report.id)}
                              title="Delete / حذف"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent 
            className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !w-screen !h-screen !max-w-none !max-h-none !m-0 !p-0 bg-white !overflow-hidden !rounded-none z-[100] flex flex-col !border-none"
            showCloseButton={true}
          >
            <div className="flex flex-col h-full w-full overflow-y-auto p-6 md:p-10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <Edit className="w-6 h-6 text-blue-600" />
                Edit Inventory Report / تعديل تقرير الجرد
                <Badge variant="outline" className="ml-2 font-mono">
                  {editingReport?.reportCode}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <Building2 className="w-10 h-10 text-slate-400 bg-white p-2 rounded shadow-sm" />
                  <div>
                    <Label className="text-xs text-slate-500">Branch / الفرع</Label>
                    <p className="font-bold">{editingReport?.branchName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-10 h-10 text-slate-400 bg-white p-2 rounded shadow-sm" />
                  <div>
                    <Label className="text-xs text-slate-500">Date / التاريخ</Label>
                    <p className="font-bold">{editingReport && format(new Date(editingReport.createdAt), "yyyy-MM-dd HH:mm")}</p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-[80px] border-r text-center">Image / الصورة</TableHead>
                      <TableHead className="border-r text-center">Item / الصنف</TableHead>
                      <TableHead className="w-[120px] text-center border-r">Base Unit / الوحدة</TableHead>
                      <TableHead className="w-[150px] text-center border-r">Optional / الوحدة 2</TableHead>
                      <TableHead className="w-[150px] text-center border-r">Count / الكمية</TableHead>
                      <TableHead className="w-[150px] text-center border-r">Price / السعر</TableHead>
                      <TableHead className="w-[150px] text-center border-r">Total / الإجمالي</TableHead>
                      <TableHead className="w-[200px] border-r text-center">Item Notes / ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedItems.map((item) => {
                      const product = productsMap[item.productId]
                      const currentPrice = product?.price || 0
                      const itemPrice = item.price ?? currentPrice

                      return (
                        <TableRow key={item.productId} className="hover:bg-slate-50/50">
                          <TableCell className="border-r text-center">
                            <ProductImageThumbnail 
                              src={item.image} 
                              alt={item.productName} 
                              size="sm"
                              className="mx-auto"
                            />
                          </TableCell>
                          <TableCell className="border-r text-center">
                            <div className="font-semibold text-sm">{item.productName}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">{item.productCode}</div>
                          </TableCell>
                          <TableCell className="text-center border-r">
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[10px] py-0 px-1">
                              {item.unit}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center border-r px-2 min-w-[120px]">
                            <UnitCombobox 
                              value={item.optionalUnit || ""} 
                              onChange={(val) => handleUpdateItemField(item.productId, "optionalUnit", val)}
                              className="h-9 text-xs border border-slate-200"
                            />
                          </TableCell>
                          <TableCell className="border-r text-center px-2">
                            <Input 
                              type="number"
                              step="any"
                              className="text-center font-bold h-9 bg-white"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemField(item.productId, "quantity", parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-center border-r px-2 font-mono">
                            <div className="flex items-center gap-1">
                               <Input 
                                type="number"
                                step="any"
                                className="text-center font-mono h-9 bg-white"
                                value={itemPrice}
                                onChange={(e) => handleUpdateItemField(item.productId, "price", parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-center border-r font-bold text-emerald-600 bg-emerald-50/10 text-sm">
                            {formatCurrency(itemPrice * item.quantity)}
                          </TableCell>
                          <TableCell className="border-r text-center px-2">
                            <Input 
                              className="text-xs text-center h-9 bg-white"
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateItemField(item.productId, "notes", e.target.value)}
                              placeholder="Notes..."
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span className="text-slate-400">Total Value / القيمة الإجمالية:</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(calculateTotalValue(editedItems))}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-8 gap-3 border-t pt-6">
              <Button variant="outline" className="gap-2" onClick={() => setIsEditDialogOpen(false)}>
                <X className="w-4 h-4" />
                Cancel / إلغاء
              </Button>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleSaveEdit}>
                <Save className="w-4 h-4" />
                Save Changes / حفظ التعديلات
              </Button>
            </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
