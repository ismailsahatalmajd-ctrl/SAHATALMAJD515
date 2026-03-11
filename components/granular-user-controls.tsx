
"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { getGranularPermissions, saveGranularPermissions, GranularPermissions, DEFAULT_GRANULAR_PERMISSIONS } from "@/lib/granular-permissions"
import { Shield, Eye, Table, ShoppingCart, Receipt, BarChart3, Users, Barcode, Laptop, Database, RefreshCw, Cloud, CloudOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/storage"
import { useLiveQuery } from "dexie-react-hooks"

export function GranularUserControls({ targetUserId = "user_of_123478" }: { targetUserId?: string }) {
  const { toast } = useToast()
  const [perms, setPerms] = useState<GranularPermissions>(DEFAULT_GRANULAR_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const cloudStatus = useLiveQuery(() => db.userPreferences.get(targetUserId))

  const loadData = async () => {
    setLoading(true)
    const p = await getGranularPermissions(targetUserId)
    setPerms(p)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    
    const handleUpdate = (e: any) => {
      if (e.detail?.userId === targetUserId) {
        loadData()
      }
    }
    window.addEventListener('granular_permissions_updated' as any, handleUpdate)
    return () => window.removeEventListener('granular_permissions_updated' as any, handleUpdate)
  }, [targetUserId])

  const handleRefresh = async () => {
    setSyncing(true)
    try {
      const { db: firestore } = await import("@/lib/firebase")
      const { getDoc, doc } = await import("firebase/firestore")
      const snap = await getDoc(doc(firestore, 'granularPermissions', targetUserId))
      if (snap.exists()) {
        const cloudData = snap.data() as GranularPermissions
        await db.userPreferences.put({ ...cloudData, id: targetUserId, userId: targetUserId })
        setPerms({ ...DEFAULT_GRANULAR_PERMISSIONS, ...cloudData })
        toast({ title: "تم التحديث من السحابة", description: "تمت مزامنة أحدث الإعدادات." })
      } else {
        toast({ title: "لا يوجد بيانات سحابية", description: "يتم استخدام الإعدادات الافتراضية حالياً." })
      }
    } catch (e) {
      toast({ title: "فشل التحديث", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  const handleReset = async () => {
    if (confirm("هل أنت متأكد من إعادة الضبط للإعدادات الافتراضية؟")) {
      setPerms(DEFAULT_GRANULAR_PERMISSIONS)
      await saveGranularPermissions(targetUserId, DEFAULT_GRANULAR_PERMISSIONS)
      toast({ title: "تمت إعادة الضبط" })
    }
  }

  const handleToggle = async (path: string, value: boolean) => {
    const next = JSON.parse(JSON.stringify(perms))
    const parts = path.split('.')
    let current = next
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]]
    }
    current[parts[parts.length - 1]] = value
    
    // Optimistic UI update
    setPerms(next)
    
    // Auto-save (async)
    await saveGranularPermissions(targetUserId, next)
    
    toast({
      title: "تم الحفظ تلقائياً",
      description: "تم تحديث الإعدادات بنجاح.",
      duration: 1000,
    })
  }

  if (loading) return <div>جاري التحميل...</div>

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="bg-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              تحكم دقيق في واجهة المستخدم (OF123478)
            </CardTitle>
            <CardDescription>
              تحديد العناصر والصفحات التي تظهر للمستخدم المقيد بشكل تفصيلي. يتم الحفظ تلقائياً.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                مزامنة السحابة
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} className="text-destructive border-destructive/20 hover:bg-destructive/5">
                إعادة تعيين
              </Button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-widest font-black">
              {cloudStatus ? <Cloud className="h-3 w-3 text-green-500" /> : <CloudOff className="h-3 w-3 text-orange-500" />}
              {cloudStatus ? 'Cloud Synced' : 'Local Only'}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="pages" className="flex flex-col md:flex-row min-h-[600px]">
          <TabsList className="flex flex-col h-auto bg-muted/30 border-r rounded-none w-full md:w-64">
            <TabsTrigger value="pages" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Eye className="h-4 w-4" /> الوصول للصفحات
            </TabsTrigger>
            <TabsTrigger value="general" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Shield className="h-4 w-4" /> إعدادات عامة
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Laptop className="h-4 w-4" /> لوحة التحكم (الفرع)
            </TabsTrigger>
            <TabsTrigger value="inventory" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Table className="h-4 w-4" /> صفحة المنتجات
            </TabsTrigger>
            <TabsTrigger value="purchases" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <ShoppingCart className="h-4 w-4" /> المشتريات
            </TabsTrigger>
            <TabsTrigger value="issues" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Receipt className="h-4 w-4" /> الصرف
            </TabsTrigger>
            <TabsTrigger value="reports" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <BarChart3 className="h-4 w-4" /> التقارير
            </TabsTrigger>
            <TabsTrigger value="hr" className="w-full justify-start gap-2 h-12 px-4 data-[state=active]:bg-white">
              <Users className="h-4 w-4" /> الموظفين / الفروع
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 p-6 h-[600px]">
            <TabsContent value="pages" className="m-0 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.keys(perms.showPages).map((page) => (
                  <div key={page} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <Label htmlFor={`page-${page}`} className="font-bold capitalize cursor-pointer">
                      {page === 'inventory' ? 'المنتجات' : 
                       page === 'dashboard' ? 'لوحة التحكم' : 
                       page === 'issues' ? 'الصرف' : 
                       page === 'purchases' ? 'المشتريات' : 
                       page === 'returns' ? 'المرتجعات' : 
                       page === 'reports' ? 'التقارير' : 
                       page === 'branches' ? 'الفروع' : 
                       page === 'employees' ? 'الموظفين' : 
                       page === 'barcodes' ? 'الباركود' : 
                       page === 'history' ? 'السجل' : 
                       page === 'scanner' ? 'الماسح' : 
                       page === 'labelDesigner' ? 'مصمم الملصقات' : page}
                    </Label>
                    <Switch
                      id={`page-${page}`}
                      checked={perms.showPages[page as keyof typeof perms.showPages]}
                      onCheckedChange={(val) => handleToggle(`showPages.${page}`, val)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="general" className="m-0 space-y-6">
              <section className="space-y-4">
                <h3 className="font-black text-lg text-primary border-b pb-1">إعدادات الواجهة العامة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ToggleItem label="زر الرجوع (Back Button)" path="global.backButton" perms={perms} onToggle={handleToggle} />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="inventory" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">العناصر العلوية</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="بطاقات الإحصائيات (Stats)" path="inventoryPage.statsCards" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="العمليات الجماعية (Bulk)" path="inventoryPage.bulkOperations" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الفلاتر (Filters)" path="inventoryPage.filters" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إضافة منتج جديد" path="inventoryPage.addProduct" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إعدادات سريعة / مزامنة" path="inventoryPage.quickSettings" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حقل البحث" path="inventoryPage.search" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">أعمدة الجدول</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <ToggleItem label="الصورة" path="inventoryPage.columns.image" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="كود المنتج" path="inventoryPage.columns.productCode" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="رقم المنتج (Item No)" path="inventoryPage.columns.itemNumber" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="اسم المنتج" path="inventoryPage.columns.productName" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الفئة" path="inventoryPage.columns.category" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الموقع" path="inventoryPage.columns.location" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المخزون الحالي" path="inventoryPage.columns.currentStock" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الوحدة" path="inventoryPage.columns.unit" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الكمية بالكرتون" path="inventoryPage.columns.quantityPerCarton" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="أبعاد الكرتون" path="inventoryPage.columns.cartonDimensions" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المخزون الابتدائي" path="inventoryPage.columns.openingStock" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المشتريات" path="inventoryPage.columns.purchases" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المرتجعات" path="inventoryPage.columns.returns" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المصروفات (العدد)" path="inventoryPage.columns.issues" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الجرد (Equation)" path="inventoryPage.columns.inventoryCount" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الفرق" path="inventoryPage.columns.difference" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="السعر" path="inventoryPage.columns.price" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="متوسط السعر" path="inventoryPage.columns.averagePrice" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="قيمة المخزون" path="inventoryPage.columns.currentStockValue" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="قيمة المصروفات" path="inventoryPage.columns.issuesValue" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="معدل الدوران" path="inventoryPage.columns.turnoverRate" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الحالة (Fast/Slow)" path="inventoryPage.columns.status" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="آخر نشاط" path="inventoryPage.columns.lastActivity" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حد المخزون الأدنى" path="inventoryPage.columns.minStockLimit" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حالة المخزون" path="inventoryPage.columns.stockStatus" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الإجراءات" path="inventoryPage.columns.actions" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">أزرار التحكم</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="تصدير Excel" path="inventoryPage.tableActions.exportExcel" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تصدير PDF" path="inventoryPage.tableActions.exportPdf" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="طباعة الجدول" path="inventoryPage.tableActions.print" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تبديل الأعمدة" path="inventoryPage.tableActions.columnToggles" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

            <TabsContent value="purchases" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">العناصر الرئيسية</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="بطاقات الإحصائيات (Stats)" path="purchasesPage.statsCards" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="مستشار المستودع" path="purchasesPage.warehouseAdvisor" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إجراءات سريعة (Backup/Reset)" path="purchasesPage.quickActions" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إضافة مشتريات" path="purchasesPage.addPurchase" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إضافة سند استلام (GRN)" path="purchasesPage.addGRN" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="سجل سندات الاستلام" path="purchasesPage.historyGRN" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="التبويبات (Tabs)" path="purchasesPage.tabs" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">إجراءات السجل</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="طباعة الفاتورة" path="purchasesPage.historyActions.print" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حذف السجل" path="purchasesPage.historyActions.delete" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

            <TabsContent value="issues" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">العناصر الرئيسية</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="تحليلات المدير (Analytics)" path="issuesPage.analytics" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="بطاقات الإحصائيات (Stats)" path="issuesPage.statsCards" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إجراءات سريعة (Backup/Reset)" path="issuesPage.quickActions" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إضافة مرتجع" path="issuesPage.addReturn" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إضافة عملية صرف" path="issuesPage.addIssue" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="البحث عن الطلبات" path="issuesPage.orderSearch" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="أداة الفواتير المجتمعة" path="issuesPage.invoiceTool" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">إجراءات السجل</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="تأكيد التسليم" path="issuesPage.historyActions.deliver" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="طباعة" path="issuesPage.historyActions.print" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تصدير Odoo" path="issuesPage.historyActions.exportOdoo" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تعديل" path="issuesPage.historyActions.edit" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حذف" path="issuesPage.historyActions.delete" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

            <TabsContent value="dashboard" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">لوحة تحكم الفرع</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="معلومات الفرع (Info)" path="dashboardPage.info" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="إحصائيات الفرع (Stats)" path="dashboardPage.stats" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="نظام الطلبات (Orders)" path="dashboardPage.orderSystem" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="نظام المرتجعات (Returns)" path="dashboardPage.returnSystem" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="سلة التسوق (Cart)" path="dashboardPage.cart" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="سجلات المتابعة (Tracking)" path="dashboardPage.trackingLogs" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="حذف السجل (Clear History)" path="dashboardPage.clearHistory" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

            <TabsContent value="reports" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">التقارير المالية</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="الفلاتر المتقدمة" path="reportsPage.filters" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="الملخص المالي العام" path="reportsPage.financialSummary" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="عرض صافي الربح" path="reportsPage.financialSummary_profit" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">حركة المخزون</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="ملخص حركة المخزون" path="reportsPage.stockMovementsSummary" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="جدول سجل الحركة" path="reportsPage.stockMovementTable" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تحليل حركة المخزون" path="reportsPage.inventoryAnalysis" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">الرسوم والتنبيهات</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="الرسوم البيانية (Charts)" path="reportsPage.charts" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="المنتجات الأكثر مبيعاً" path="reportsPage.topProducts" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تنبيهات المخزون المنخفض" path="reportsPage.lowStockAlerts" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

            <TabsContent value="hr" className="m-0 space-y-8">
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">إعدادات الفروع</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="تبويب التقارير" path="branchesPage.reports" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تبويب الدليل" path="branchesPage.directory" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
                <Separator />
                <section className="space-y-4">
                  <h3 className="font-black text-lg text-primary border-b pb-1">إعدادات الموظفين</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleItem label="تبويب الإضافي (Overtime)" path="employeesPage.overtime" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تبويب الحضور (Attendance)" path="employeesPage.attendance" perms={perms} onToggle={handleToggle} />
                    <ToggleItem label="تبويب التقارير" path="employeesPage.reports" perms={perms} onToggle={handleToggle} />
                  </div>
                </section>
            </TabsContent>

          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ToggleItem({ label, path, perms, onToggle }: { label: string, path: string, perms: GranularPermissions, onToggle: any }) {
  const parts = path.split('.')
  let current: any = perms
  for (const part of parts) {
    current = current[part]
  }
  const checked = current === true

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
      <Label htmlFor={`item-${path}`} className="font-medium cursor-pointer text-sm">
        {label}
      </Label>
      <Switch
        id={`item-${path}`}
        checked={checked}
        onCheckedChange={(val) => onToggle(path, val)}
      />
    </div>
  )
}
