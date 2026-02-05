"use client"
export const dynamic = "force-static"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
// (reverted) إزالة أدوات تشخيص تسلسل الفواتير
import { Settings, Package, ShoppingCart, Receipt, BarChart3, Building2, Barcode, Cloud, Users } from "lucide-react"
import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { BackupRestoreDialog } from "@/components/backup-restore-dialog"
import { BackupSettingsDialog } from "@/components/backup-settings-dialog"
import { getProducts, saveProducts } from "@/lib/storage"
import { db } from "@/lib/db"
import { store, notify } from "@/lib/storage"
import { BranchManager } from "@/components/branch-manager"
import { InvoiceSettingsTab } from "@/components/invoice-settings-tab"
import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { DevicesManager } from "@/components/devices-manager"
import { ProductCodingSettings } from "@/components/product-coding-settings"
import { BarcodeSettingsTab } from "@/components/barcode-settings-tab"
import { updateSettings as updateGlobalSettings, getSettings as getGlobalSettings } from "@/lib/settings-store"
import { Protect } from "@/components/protect"

export default function SettingsPage() {
  const { lang } = useI18n()

  async function handlePush() {
    if (!supabaseUrl || !supabaseKey) {
      toast({ title: "خطأ", description: "يرجى إدخال رابط ومفتاح Supabase أولاً", variant: "destructive" })
      return
    }

    try {
      setLoading(true)
      // Force save first to ensure credentials are in store
      await saveSettings()

      const { pushAllData } = await import('@/lib/sync-api')
      const total = await pushAllData()
      toast({ title: "تم الرفع", description: `تم رفع ${total} سجل إلى السحابة بنجاح.` })
    } catch (e: any) {
      console.error(e)
      toast({ title: "فشل الرفع", description: e?.message || "تحقق من الإعدادات وصلاحيات الجداول", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handlePull() {
    if (!supabaseUrl || !supabaseKey) {
      toast({ title: "خطأ", description: "يرجى إدخال رابط ومفتاح Supabase أولاً", variant: "destructive" })
      return
    }

    if (!confirm("تحذير: هذا الإجراء سيقوم بتحديث جميع بياناتك المحلية ببيانات السحابة. هل تريد المتابعة؟")) {
      return
    }

    try {
      setLoading(true)
      // Force save first
      await saveSettings()

      const { pullAllData } = await import('@/lib/sync-api')
      const total = await pullAllData()
      toast({ title: "تم السحب", description: `تم استرجاع ${total} سجل من السحابة بنجاح.` })

      // Notify cache to clear/refill or just reload
      const { clearAppCache } = await import('@/lib/storage')
      await clearAppCache()

      window.location.reload()
    } catch (e: any) {
      console.error(e)
      toast({ title: "فشل السحب", description: e?.message || "تحقق من الإعدادات.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleTestConnection() {
    if (!supabaseUrl || !supabaseKey) {
      toast({ title: "تنبيه", description: "أدخل البيانات أولاً", variant: "destructive" })
      return
    }
    try {
      setTesting(true)
      await saveSettings() // Save current UI state to engine
      const { testSupabaseConnection } = await import('@/lib/storage')
      const res = await testSupabaseConnection()
      if (res.success) {
        toast({ title: "نجاح الاتصال", description: "تم الاتصال بقاعدة البيانات بنجاح ✅" })
      } else {
        toast({ title: "فشل الاتصال", description: res.error, variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)

  // General Settings
  const [companyName, setCompanyName] = useState("اسم الشركة")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")

  // Notification Settings
  const [lowStockNotifications, setLowStockNotifications] = useState(true)
  const [orderNotifications, setOrderNotifications] = useState(true)
  const [dailyReports, setDailyReports] = useState(false)

  // Security Settings
  const [requireAuth, setRequireAuth] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState("60")

  // System Settings
  const [defaultCurrency, setDefaultCurrency] = useState("ريال")
  const [dateFormat, setDateFormat] = useState("gregorian")
  const [numberFormat, setNumberFormat] = useState("english")

  // Cloud Sync Settings
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseKey, setSupabaseKey] = useState("")

  // Invoice Settings - managed by separate component/store
  // Workflow settings
  const [autoBranchInvoiceOnApproval, setAutoBranchInvoiceOnApproval] = useState<boolean>(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const record = await db.settings.get("app_settings")
      let settings: any = {}

      if (record?.value) {
        settings = record.value
      } else {
        // Migration
        const saved = localStorage.getItem("app_settings")
        if (saved) {
          settings = JSON.parse(saved)
          await db.settings.put({ key: "app_settings", value: settings })
          localStorage.removeItem("app_settings")
        }
      }

      setCompanyName(settings.companyName || "اسم الشركة")
      setCompanyPhone(settings.companyPhone || "")
      setCompanyAddress(settings.companyAddress || "")
      setLowStockNotifications(settings.lowStockNotifications ?? true)
      setOrderNotifications(settings.orderNotifications ?? true)
      setDailyReports(settings.dailyReports ?? false)
      setRequireAuth(settings.requireAuth ?? false)
      setSessionTimeout(settings.sessionTimeout || "60")
      setDefaultCurrency(settings.defaultCurrency || "ريال")
      setDateFormat(settings.dateFormat || "gregorian")
      setNumberFormat(settings.numberFormat || "english")
      setSupabaseUrl(settings.supabaseUrl || "")
      setSupabaseKey(settings.supabaseKey || "")

      // Invoice settings are handled by store, but we load workflow here
      const wf = settings.workflow || {}
      setAutoBranchInvoiceOnApproval(wf.autoBranchInvoiceOnApproval ?? true)
    } catch { }
  }

  const saveSettings = async () => {
    setLoading(true)

    // Get latest invoice settings to preserve them
    const currentInvoiceSettings = await getInvoiceSettings()

    const settings = {
      companyName,
      companyPhone,
      companyAddress,
      lowStockNotifications,
      orderNotifications,
      dailyReports,
      requireAuth,
      sessionTimeout,
      defaultCurrency,
      dateFormat,
      numberFormat,
      supabaseUrl,
      supabaseKey,
      invoiceSettings: currentInvoiceSettings,
      workflow: {
        autoBranchInvoiceOnApproval,
      },
    }

    try {
      await db.settings.put({ key: "app_settings", value: settings })

      // Also update the global settings used by Supabase client and barcode generator
      const global = getGlobalSettings()
      updateGlobalSettings({
        ...global,
        supabaseUrl,
        supabaseKey
      })

      toast({
        title: "تم الحفظ",
        description: "تم حفظ الإعدادات بنجاح",
      })
    } catch (e) {
      toast({
        title: "خطأ",
        description: "فشل حفظ الإعدادات",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const resetSettings = async () => {
    if (confirm("هل أنت متأكد من إعادة تعيين جميع الإعدادات؟")) {
      await db.settings.delete("app_settings")
      localStorage.removeItem("app_settings")
      loadSettings()
      toast({
        title: "تم إعادة التعيين",
        description: "تم إعادة تعيين الإعدادات إلى القيم الافتراضية",
      })
    }
  }

  const clearAppRam = async () => {
    try {
      await import('@/lib/storage').then(m => m.clearAppCache())
    } catch { }
  }


  // النسخ الاحتياطي والاستعادة
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)

  const formatTimestamp = (date = new Date()) => {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
      date.getMinutes(),
    )}${pad(date.getSeconds())}`
  }

  const buildBackup = () => {
    const keys = [
      "inventory_products",
      "inventory_categories",
      "inventory_transactions",
      "inventory_adjustments",
      "inventory_branches",
      "inventory_units",
      "inventory_issues",
      "inventory_returns",
      "inventory_locations",
      "app_settings",
    ]
    const snapshot: Record<string, unknown> = { version: "v1", createdAt: new Date().toISOString() }
    for (const k of keys) {
      const raw = localStorage.getItem(k)
      snapshot[k] = raw ? JSON.parse(raw) : null
    }
    return snapshot
  }

  const onDownloadBackup = () => {
    try {
      setExporting(true)
      const snapshot = buildBackup()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `backup-${formatTimestamp()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "تم إنشاء النسخة", description: "تم تنزيل ملف النسخة الاحتياطية" })
    } catch (e) {
      toast({ title: "فشل النسخ", description: "تعذر إنشاء النسخة", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const onSaveBackupToProject = async () => {
    try {
      setExporting(true)
      const snapshot = buildBackup()
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `backup-${formatTimestamp()}.json`, data: snapshot }),
      })
      if (!res.ok) throw new Error("تعذر حفظ النسخة داخل مجلد المشروع")
      toast({ title: "تم الحفظ", description: "تم حفظ النسخة في مجلد: نسخة احتياطية" })
    } catch (e) {
      toast({ title: "فشل الحفظ", description: "تحقق من صلاحيات الكتابة للمجلد", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const onImportBackup = async (file: File) => {
    try {
      setImporting(true)
      const text = await file.text()
      const snapshot = JSON.parse(text)
      const keys = [
        "inventory_products",
        "inventory_categories",
        "inventory_transactions",
        "inventory_adjustments",
        "inventory_branches",
        "inventory_units",
        "inventory_issues",
        "inventory_returns",
        "inventory_locations",
        "app_settings",
      ]
      for (const k of keys) {
        if (snapshot[k] !== undefined && snapshot[k] !== null) {
          localStorage.setItem(k, JSON.stringify(snapshot[k]))
        } else {
          localStorage.removeItem(k)
        }
      }
      toast({ title: "تم الاستعادة", description: "تم استعادة البيانات والصور من النسخة" })
    } catch (e) {
      toast({ title: "فشل الاستعادة", description: "تعذر قراءة ملف النسخة", variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  function ConflictsManager() {
    const { toast } = useToast()
    const [conflicts, setConflicts] = useState<any[]>([])
    const [tableFilter, setTableFilter] = useState<string>("")
    const [showResolved, setShowResolved] = useState<boolean>(false)
    const [loadingConf, setLoadingConf] = useState<boolean>(false)

    const loadConflicts = async () => {
      try {
        setLoadingConf(true)
        const arr = await db.conflictLogs.toArray()
        setConflicts(arr.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))))
      } catch {
      } finally {
        setLoadingConf(false)
      }
    }

    useEffect(() => { loadConflicts() }, [])

    const getTarget = (table: string) => {
      if (table === "products") return { list: "products", store: db.products, event: "products_change" as const }
      if (table === "transactions") return { list: "transactions", store: db.transactions, event: "transactions_change" as const }
      if (table === "branches") return { list: "branches", store: db.branches, event: "branches_change" as const }
      if (table === "issues") return { list: "issues", store: db.issues, event: "issues_change" as const }
      if (table === "returns") return { list: "returns", store: db.returns, event: "returns_change" as const }
      if (table === "branch_requests" || table === "branchRequests") return { list: "branchRequests", store: db.branchRequests, event: "branch_requests_change" as const }
      if (table === "inventory_adjustments") return { list: "adjustments", store: db.inventoryAdjustments, event: "change" as const }
      return null
    }

    const acceptCloud = async (item: any) => {
      const target = getTarget(item.table)
      if (!target) return
      const { list, store: dexieStore, event } = target
      const cloud = item.oldValue
      if (!cloud || !cloud.id) return
      try {
        const arr = (store.cache as any)[list] as any[]
        const idx = arr.findIndex(x => x.id === cloud.id)
        if (idx >= 0) arr[idx] = { ...arr[idx], ...cloud }
        else arr.push(cloud)
        await (dexieStore as any).put(cloud)
        notify(event)
        await db.conflictLogs.put({ ...item, resolved: true, resolvedAt: new Date().toISOString(), resolution: "cloud" })
        toast({ title: "تم اعتماد السحابي", description: `تم تحديث سجل ${item.entityId}` })
        loadConflicts()
      } catch {
        toast({ title: "فشل الاعتماد", description: "تعذر اعتماد النسخة السحابية", variant: "destructive" })
      }
    }

    const acceptLocal = async (item: any) => {
      try {
        await db.conflictLogs.put({ ...item, resolved: true, resolvedAt: new Date().toISOString(), resolution: "local" })
        toast({ title: "تم اعتماد المحلي", description: `تم اعتماد السجل المحلي ${item.entityId}` })
        loadConflicts()
      } catch {
        toast({ title: "فشل الاعتماد", description: "تعذر اعتماد النسخة المحلية", variant: "destructive" })
      }
    }

    const filtered = conflicts.filter(c => {
      if (tableFilter && c.table !== tableFilter) return false
      if (!showResolved && c.resolved) return false
      return true
    })

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label>الجدول</Label>
            <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="rounded-md border px-3 py-2">
              <option value="">الكل</option>
              <option value="products">المنتجات</option>
              <option value="transactions">العمليات</option>
              <option value="branches">الفروع</option>
              <option value="issues">الصرف</option>
              <option value="returns">المرتجعات</option>
              <option value="branch_requests">طلبات الفروع</option>
              <option value="inventory_adjustments">تعديلات المخزون</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={showResolved} onCheckedChange={(v) => setShowResolved(Boolean(v))} />
            <span className="text-sm text-muted-foreground">إظهار المحلولة</span>
          </div>
          <Button variant="secondary" onClick={loadConflicts} disabled={loadingConf}>
            {loadingConf ? "جاري التحديث..." : "تحديث"}
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-2">المعرف</th>
                <th className="text-start p-2">الجدول</th>
                <th className="text-start p-2">سجل</th>
                <th className="text-start p-2">السبب</th>
                <th className="text-start p-2">الزمن</th>
                <th className="text-start p-2">الحالة</th>
                <th className="text-start p-2">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد تعارضات</td>
                </tr>
              )}
              {filtered.map(item => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">{String(item.id).slice(-8)}</td>
                  <td className="p-2">{item.table}</td>
                  <td className="p-2">{item.entityId}</td>
                  <td className="p-2">{item.reason || "-"}</td>
                  <td className="p-2">{item.ts ? new Date(item.ts).toLocaleString() : "-"}</td>
                  <td className="p-2">{item.resolved ? "محلول" : "قيد المراجعة"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => acceptLocal(item)} disabled={item.resolved}>اعتماد المحلي</Button>
                      <Button size="sm" onClick={() => acceptCloud(item)} disabled={item.resolved}>اعتماد السحابي</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-8 w-8" />
          <h1 className="text-3xl font-bold"><DualText k="settings.system.title" /></h1>
        </div>

        <Tabs defaultValue="general" className="space-y-4">
          <div className="overflow-x-auto pb-2">
            <TabsList className="w-full justify-start h-auto flex-wrap sm:flex-nowrap">
              <TabsTrigger value="general"><DualText k="settings.tabs.general" /></TabsTrigger>
              <TabsTrigger value="notifications"><DualText k="settings.tabs.notifications" /></TabsTrigger>
              <TabsTrigger value="security"><DualText k="settings.tabs.security" /></TabsTrigger>
              <TabsTrigger value="system"><DualText k="settings.tabs.system" /></TabsTrigger>
              <TabsTrigger value="branches"><DualText k="settings.tabs.branches" /></TabsTrigger>
              <TabsTrigger value="invoice"><DualText k="settings.tabs.invoice" /></TabsTrigger>
              {/* تمت إزالة تبويب النسخ الاحتياطي؛ أدوات النسخ موجودة ضمن تبويب صفحات الموقع */}
              <TabsTrigger value="site"><DualText k="settings.tabs.site" /></TabsTrigger>
              <TabsTrigger value="conflicts"><DualText k="settings.tabs.conflicts" /></TabsTrigger>
              <TabsTrigger value="devices">الأجهزة</TabsTrigger>
              <TabsTrigger value="barcode">الباركود</TabsTrigger>
              <TabsTrigger value="sync">الربط السحابي</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="settings.general.title" /></CardTitle>
                <CardDescription><DualText k="settings.general.desc" /></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName"><DualText k="settings.general.companyName" /></Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={getDualString("settings.general.companyNamePlaceholder", undefined, lang)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPhone"><DualText k="settings.general.phone" /></Label>
                  <Input
                    id="companyPhone"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder={getDualString("settings.general.phonePlaceholder", undefined, lang)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress"><DualText k="settings.general.address" /></Label>
                  <Input
                    id="companyAddress"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder={getDualString("settings.general.addressPlaceholder", undefined, lang)}
                  />
                </div>
              </CardContent>
            </Card>
            {/* ربط قاعدة البيانات */}
            <div className="rounded-md border p-4 space-y-3 mt-4">
              <h3 className="font-semibold"><DualText k="settings.db.title" /></h3>
              <p className="text-sm text-muted-foreground"><DualText k="settings.db.desc" /></p>
              <div className="flex flex-wrap gap-2">
                <button onClick={handlePush} className="btn btn-primary"><DualText k="settings.db.push" /></button>
                <button onClick={handlePull} className="btn btn-secondary"><DualText k="settings.db.pull" /></button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-blue-500" />
                  إعدادات الربط السحابي (Cloud Sync)
                </CardTitle>
                <CardDescription>اربط النظام بقاعدة بيانات Supabase للمزامنة الفورية</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>رابط المشروع (Project URL)</Label>
                  <Input
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xyz.supabase.co"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-3">
                  <Label>مفتاح API (Anon Key)</Label>
                  <Input
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    type="password"
                    placeholder="eyJh..."
                    className="font-mono"
                  />
                </div>

                <Separator />

                <div className="rounded-md bg-slate-50 border p-4">
                  <h3 className="font-semibold mb-2">إجراءات المزامنة اليدوية</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleTestConnection} variant="secondary" disabled={testing}>
                      {testing ? "جاري الاختبار..." : "اختبار الاتصال بالقاعدة"}
                    </Button>
                    <Button onClick={handlePush} className="gap-2" disabled={loading}>
                      <Cloud className="w-4 h-4" />
                      رفع جميع البيانات للسحابة
                    </Button>
                    <Button variant="outline" onClick={handlePull} className="gap-2" disabled={loading}>
                      <Cloud className="w-4 h-4" />
                      سحب جميع البيانات من السحابة
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    تنبيه: محرك المزامنة التلقائي يعمل فورياً بمجرد ظهور العلامة الخضراء في أسفل الشاشة.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branches">
            <Card>
              <CardHeader>
                <CardTitle>إدارة الفروع</CardTitle>
                <CardDescription>إضافة وتعديل وحذف الفروع وتعيين كلمات المرور</CardDescription>
              </CardHeader>
              <CardContent>
                <BranchManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conflicts">
            <Card>
              <CardHeader>
                <CardTitle>إدارة التعارضات</CardTitle>
                <CardDescription>اعتماد النسخة المحلية أو السحابية لكل تعارض</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConflictsManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <DevicesManager />
          </TabsContent>

          <TabsContent value="barcode">
            <BarcodeSettingsTab />
          </TabsContent>

          <TabsContent value="site">
            <Card>
              <CardHeader>
                <CardTitle>صفحات الموقع</CardTitle>
                <CardDescription>روابط سريعة إلى الصفحات الرئيسية في النظام</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <Button onClick={() => setBackupOpen(true)}><DualText k="settings.site.backup" /></Button>
                  <Button variant="secondary" onClick={() => setBackupOpen(true)}><DualText k="settings.site.restore" /></Button>
                  <BackupSettingsDialog />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Link href="/" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <Package className="h-5 w-5" />
                    <div>
                      <div className="font-medium">المنتجات</div>
                      <div className="text-sm text-muted-foreground">إدارة المنتجات والمخزون</div>
                    </div>
                  </Link>

                  <Link href="/purchases" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <ShoppingCart className="h-5 w-5" />
                    <div>
                      <div className="font-medium">المشتريات</div>
                      <div className="text-sm text-muted-foreground">طلبات وفواتير الشراء</div>
                    </div>
                  </Link>

                  <Link href="/issues" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <Receipt className="h-5 w-5" />
                    <div>
                      <div className="font-medium">الصرف</div>
                      <div className="text-sm text-muted-foreground">فواتير صرف المخزون</div>
                    </div>
                  </Link>

                  <Link href="/returns" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <Receipt className="h-5 w-5" />
                    <div>
                      <div className="font-medium">المرتجعات</div>
                      <div className="text-sm text-muted-foreground">إدارة مرتجعات المخزون</div>
                    </div>
                  </Link>

                  <Link href="/reports" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <BarChart3 className="h-5 w-5" />
                    <div>
                      <div className="font-medium">التقارير</div>
                      <div className="text-sm text-muted-foreground">تقارير المخزون والمعاملات</div>
                    </div>
                  </Link>

                  <Link href="/branches" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <Building2 className="h-5 w-5" />
                    <div>
                      <div className="font-medium">الفروع</div>
                      <div className="text-sm text-muted-foreground">دليل وإدارة الفروع</div>
                    </div>
                  </Link>

                  {/* تمت إزالة صفحة طلبات الفروع العامة والاكتفاء بصفحة الفرع الخاصة */}

                  <Link href="/barcodes" className="flex items-center gap-3 p-4 border rounded-md hover:bg-muted">
                    <Barcode className="h-5 w-5" />
                    <div>
                      <div className="font-medium">الباركود</div>
                      <div className="text-sm text-muted-foreground">توليد وطباعة الباركود</div>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="settings.notifications.title" /></CardTitle>
                <CardDescription><DualText k="settings.notifications.desc" /></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label><DualText k="settings.notifications.lowStock" /></Label>
                    <p className="text-sm text-muted-foreground"><DualText k="settings.notifications.lowStockDesc" /></p>
                  </div>
                  <Switch checked={lowStockNotifications} onCheckedChange={setLowStockNotifications} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label><DualText k="settings.notifications.orders" /></Label>
                    <p className="text-sm text-muted-foreground"><DualText k="settings.notifications.ordersDesc" /></p>
                  </div>
                  <Switch checked={orderNotifications} onCheckedChange={setOrderNotifications} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label><DualText k="settings.notifications.daily" /></Label>
                    <p className="text-sm text-muted-foreground"><DualText k="settings.notifications.dailyDesc" /></p>
                  </div>
                  <Switch checked={dailyReports} onCheckedChange={setDailyReports} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="settings.security.title" /></CardTitle>
                <CardDescription><DualText k="settings.security.desc" /></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label><DualText k="settings.security.auth" /></Label>
                    <p className="text-sm text-muted-foreground"><DualText k="settings.security.authDesc" /></p>
                  </div>
                  <Switch checked={requireAuth} onCheckedChange={setRequireAuth} />
                </div>
                <Separator />

                {/* Temporary: Exposed for initial setup */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>إدارة المستخدمين والصلاحيات</Label>
                    <p className="text-sm text-muted-foreground">إضافة موظفين، تحديد الأدوار، وتخصيص الصلاحيات</p>
                  </div>
                  <Link href="/settings/users">
                    <Button variant="outline" className="gap-2">
                      <Users className="w-4 h-4" />
                      إدارة المستخدمين
                    </Button>
                  </Link>
                </div>
                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout"><DualText k="settings.security.timeout" /></Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    placeholder="60"
                  />
                  <p className="text-sm text-muted-foreground"><DualText k="settings.security.timeoutDesc" /></p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="settings.system.title" /></CardTitle>
                <CardDescription><DualText k="settings.system.desc" /></CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultCurrency"><DualText k="settings.system.currency" /></Label>
                  <Input
                    id="defaultCurrency"
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    placeholder="ريال"
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <Button variant="destructive" onClick={clearAppRam} className="w-full sm:w-auto">
                    تفريغ الذاكرة العشوائية (Reload)
                  </Button>
                  <p className="text-xs text-muted-foreground">يقوم بإعادة تحميل التطبيق وتفريغ الذاكرة المؤقتة</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateFormat"><DualText k="settings.system.dateFormat" /></Label>
                  <select
                    id="dateFormat"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="gregorian">{getDualString("settings.system.dateGregorian")}</option>
                    <option value="hijri">{getDualString("settings.system.dateHijri")}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numberFormat"><DualText k="settings.system.numberFormat" /></Label>
                  <select
                    id="numberFormat"
                    value={numberFormat}
                    onChange={(e) => setNumberFormat(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="english">{getDualString("settings.system.numEnglish")}</option>
                    <option value="arabic">{getDualString("settings.system.numArabic")}</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoice">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="settings.invoice.title" /></CardTitle>
                <CardDescription><DualText k="settings.invoice.desc" /></CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <InvoiceSettingsTab />

                <Separator className="my-6" />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label><DualText k="settings.invoice.auto" /></Label>
                    <p className="text-sm text-muted-foreground"><DualText k="settings.invoice.autoDesc" /></p>
                  </div>
                  <Switch checked={autoBranchInvoiceOnApproval} onCheckedChange={setAutoBranchInvoiceOnApproval} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <DevicesManager />
          </TabsContent>

          {/* تمت إزالة محتوى تبويب النسخ الاحتياطي؛ أدوات النسخ والاستعادة ضمن تبويب صفحات الموقع */}
        </Tabs>

        <BackupRestoreDialog open={backupOpen} onOpenChange={setBackupOpen} />

        <div className="flex gap-4 mt-6">
          <Button onClick={saveSettings} disabled={loading} className="flex-1">
            {loading ? <DualText k="settings.actions.saving" /> : <DualText k="settings.actions.save" />}
          </Button>
          <Button onClick={resetSettings} variant="outline">
            <DualText k="settings.actions.reset" />
          </Button>
        </div>
      </main>
    </div>
  )
}
