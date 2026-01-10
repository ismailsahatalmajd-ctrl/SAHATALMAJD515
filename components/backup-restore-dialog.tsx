"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download, Upload, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { db } from "@/lib/db"
import { syncProductToCloud } from "@/lib/firebase-sync-engine"
import { db as firestore } from "@/lib/firebase"
import { setDoc, doc, Timestamp } from "firebase/firestore"

interface BackupRestoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Map UI keys to DB table names
const TABLE_MAPPING: Record<string, string> = {
  inventory_products: 'products',
  inventory_categories: 'categories',
  inventory_branches: 'branches',
  inventory_transactions: 'transactions',
  inventory_issues: 'issues',
  inventory_returns: 'returns',
  inventory_units: 'units',
  inventory_locations: 'locations',
  inventory_issue_drafts: 'issueDrafts',
  inventory_purchase_orders: 'purchaseOrders',
  inventory_verification_logs: 'verificationLogs',
  inventory_adjustments: 'inventoryAdjustments',
  inventory_branch_invoices: 'branchInvoices',
  inventory_branch_requests: 'branchRequests',
  inventory_purchase_requests: 'purchaseRequests',
}

const UI_LABELS: Record<string, string> = {
  inventory_products: "المنتجات",
  inventory_categories: "التصنيفات",
  inventory_branches: "الفروع",
  inventory_transactions: "المعاملات",
  inventory_issues: "الصرف",
  inventory_returns: "المرتجعات",
  inventory_units: "الوحدات",
  inventory_locations: "المواقع",
  inventory_purchase_orders: "طلبات الشراء",
  inventory_verification_logs: "سجلات المطابقة",
  inventory_adjustments: "تسويات المخزون",
  inventory_branch_invoices: "فواتير الفروع",
  inventory_branch_requests: "طلبات الفروع",
  inventory_purchase_requests: "طلبات شراء (جديد)",
  app_settings: "إعدادات التطبيق",
}

export function BackupRestoreDialog({ open, onOpenChange }: BackupRestoreDialogProps) {
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [excludeImages, setExcludeImages] = useState(false) // Default to false (Include images by default)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isSavingToProject, setIsSavingToProject] = useState(false)
  const { toast } = useToast()
  const [progress, setProgress] = useState(0)

  const [selected, setSelected] = useState<Record<string, boolean>>({
    inventory_products: true,
    inventory_categories: true,
    inventory_branches: true,
    inventory_transactions: true,
    inventory_issues: true,
    inventory_returns: true,
    inventory_units: true,
    inventory_locations: true,
    inventory_purchase_orders: true,
    inventory_verification_logs: true,
    inventory_adjustments: true,
    inventory_branch_invoices: true,
    inventory_branch_requests: true,
    inventory_purchase_requests: true,
    app_settings: true,
  })

  // Universal sync function for any table
  const syncToFirebase = async (tableName: string, data: any) => {
    try {
      if (!data.id) return

      // Map table names to Firebase collections
      const collectionMap: Record<string, string> = {
        'products': COLLECTIONS.PRODUCTS,
        'categories': COLLECTIONS.CATEGORIES,
        'branches': COLLECTIONS.BRANCHES,
        'transactions': COLLECTIONS.TRANSACTIONS,
        'issues': COLLECTIONS.ISSUES,
        'returns': COLLECTIONS.RETURNS,
        'units': COLLECTIONS.UNITS,
        'locations': COLLECTIONS.LOCATIONS,
        'purchaseOrders': COLLECTIONS.PURCHASE_ORDERS,
        'verificationLogs': COLLECTIONS.VERIFICATION_LOGS,
        'inventoryAdjustments': COLLECTIONS.INVENTORY_ADJUSTMENTS,
        'branchInvoices': COLLECTIONS.BRANCH_INVOICES,
        'branchRequests': COLLECTIONS.BRANCH_REQUESTS,
        'purchaseRequests': COLLECTIONS.PURCHASE_REQUESTS,
      }

      const collection = collectionMap[tableName]
      if (!collection) {
        console.warn(`No Firebase collection mapping for table: ${tableName}`)
        return
      }

      // Special handling for products
      if (tableName === 'products') {
        return await syncProductToCloud(data)
      }

      // Generic sync for other tables
      const ref = doc(firestore, collection, data.id)
      await setDoc(ref, { ...data, lastSyncedAt: Timestamp.now() }, { merge: true })
    } catch (error) {
      console.error(`Failed to sync ${tableName}:`, error)
      throw error
    }
  }

  const keysOrder = Object.keys(UI_LABELS)

  const handleBackup = async () => {
    setIsBackingUp(true)
    setProgress(0)
    try {
      if (typeof window !== "undefined") {
        const ok = window.confirm("هل تريد إنشاء نسخة احتياطية؟")
        if (!ok) { setIsBackingUp(false); return }
      }

      const keys = keysOrder.filter((k) => selected[k])
      const total = keys.length
      let done = 0

      const backupData: any = {
        version: "2.1",
        timestamp: new Date().toISOString(),
        tables: {},
        settings: {}
      }

      for (const key of keys) {
        if (key === 'app_settings') {
          const s = await db.settings.get('app_settings')
          if (s) backupData.settings['app_settings'] = s.value
        } else {
          const tableName = TABLE_MAPPING[key]
          if (tableName) {
            // @ts-ignore
            const table = db[tableName]
            if (table) {
              let rows = await table.toArray()

              // Filter out images if requested
              if (excludeImages && (tableName === 'products' || tableName === 'product_images')) {
                rows = rows.map((r: any) => {
                  const { image, ...rest } = r
                  // Keep image only if it's NOT a huge base64 string
                  const isHugeBase64 = typeof image === 'string' && image.length > 500 && image.startsWith('data:')
                  return isHugeBase64 ? rest : r
                })
              }

              backupData.tables[tableName] = rows
            }
          }
        }
        done++
        setProgress(Math.round((done / total) * 100))
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `inventory-backup-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "تم إنشاء النسخة الاحتياطية",
        description: "تم تصدير جميع البيانات بنجاح",
      })
    } catch (error) {
      console.error(error)
      toast({
        title: "فشل في إنشاء النسخة الاحتياطية",
        description: "حدث خطأ أثناء التصدير, ربما بسبب حجم الصور.",
        variant: "destructive",
      })
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleSaveToProject = async () => {
    // Only works in dev mode with Next.js API
    try {
      setIsSavingToProject(true)
      if (typeof window !== "undefined") {
        const ok = window.confirm("هذه الميزة تعمل فقط في وضع التطوير. هل تريد المتابعة؟")
        if (!ok) { setIsSavingToProject(false); return }
      }

      const keys = keysOrder.filter((k) => selected[k])
      const backupData: any = {
        version: "2.0",
        timestamp: new Date().toISOString(),
        tables: {},
        settings: {}
      }

      for (const key of keys) {
        if (key === 'app_settings') {
          const s = await db.settings.get('app_settings')
          if (s) backupData.settings['app_settings'] = s.value
        } else {
          const tableName = TABLE_MAPPING[key]
          if (tableName) {
            // @ts-ignore
            const table = db[tableName]
            if (table) {
              backupData.tables[tableName] = await table.toArray()
            }
          }
        }
      }

      const fmt = (n: number) => String(n).padStart(2, "0")
      const d = new Date()
      const filename = `backup-${d.getFullYear()}${fmt(d.getMonth() + 1)}${fmt(d.getDate())}-${fmt(
        d.getHours(),
      )}${fmt(d.getMinutes())}${fmt(d.getSeconds())}.json`

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, data: backupData }),
      })

      if (!res.ok) throw new Error("backup-save-failed")

      toast({ title: "تم الحفظ", description: "تم حفظ النسخة داخل مجلد النسخ الاحتياطية" })
    } catch (error) {
      toast({ title: "فشل الحفظ", description: "تعذر الاتصال بالخادم", variant: "destructive" })
    } finally {
      setIsSavingToProject(false)
    }
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsRestoring(true)
    setProgress(0)
    try {
      if (typeof window !== "undefined") {
        const ok = window.confirm("سيتم استبدال البيانات الحالية بالعناصر المحددة. هل تريد المتابعة؟")
        if (!ok) { setIsRestoring(false); return }
      }
      const text = await file.text()
      const backup = JSON.parse(text)

      if (!backup.version && !backup.data) {
        throw new Error("Invalid backup file format")
      }

      const isLegacy = !backup.version || backup.version === "1.0"

      // Determine keys to restore based on selection
      const allowedKeys = new Set(keysOrder.filter((k) => selected[k]))

      if (!isLegacy && (backup.version === "2.0" || backup.version === "2.1")) {
        // V2 Restore
        const tables = backup.tables || {}
        const total = Object.keys(tables).length + 1
        let done = 0

        for (const [tableName, rows] of Object.entries(tables)) {
          const isAllowed = Array.from(allowedKeys).some(k => TABLE_MAPPING[k] === tableName)
          if (isAllowed && Array.isArray(rows)) {
            // @ts-ignore
            const table = db[tableName]
            if (table) {
              await table.clear()
              await table.bulkPut(rows)

              // 🔥 CRITICAL FIX: Sync restored data to Firebase
              console.log(`Syncing ${rows.length} items from ${tableName} to Firebase...`)
              for (const row of rows) {
                try {
                  await syncToFirebase(tableName, row)
                } catch (syncError) {
                  console.error(`Failed to sync ${tableName} item:`, syncError)
                  // Continue with other items even if one fails
                }
              }
              console.log(`✅ Synced ${tableName} to Firebase`)
            }
          }
          done++
          setProgress(Math.round((done / total) * 100))
        }

        if (backup.settings && allowedKeys.has('app_settings')) {
          for (const [k, v] of Object.entries(backup.settings)) {
            await db.settings.put({ key: k, value: v })
          }
        }
      } else {
        // Legacy V1 Restore...
        const data = backup.data || {}
        const idbData = backup.idb || {}
        const total = Object.keys(data).length + Object.keys(idbData).length
        let done = 0

        for (const [key, value] of Object.entries(data)) {
          if (allowedKeys.has(key)) {
            if (key === 'app_settings') {
              if (typeof value === 'string') {
                const parsed = JSON.parse(value)
                await db.settings.put({ key: 'app_settings', value: parsed })
              }
            } else {
              const tableName = TABLE_MAPPING[key]
              if (tableName && typeof value === 'string') {
                const rows = JSON.parse(value)
                // @ts-ignore
                const table = db[tableName]
                if (table && Array.isArray(rows)) {
                  await table.clear()
                  await table.bulkPut(rows)

                  // 🔥 FIX: Sync to Firebase
                  console.log(`Syncing ${rows.length} items from ${tableName} (legacy) to Firebase...`)
                  for (const row of rows) {
                    try {
                      await syncToFirebase(tableName, row)
                    } catch (syncError) {
                      console.error(`Failed to sync ${tableName} item:`, syncError)
                    }
                  }
                  console.log(`✅ Synced ${tableName} (legacy) to Firebase`)
                }
              }
            }
          }
          done++
          setProgress(Math.round((done / total) * 100))
        }

        for (const [tableName, rows] of Object.entries(idbData)) {
          // @ts-ignore
          const table = db[tableName]
          if (table && Array.isArray(rows)) {
            await table.bulkPut(rows)

            // 🔥 FIX: Sync to Firebase
            console.log(`Syncing ${rows.length} items from ${tableName} (idb) to Firebase...`)
            for (const row of rows) {
              try {
                await syncToFirebase(tableName, row)
              } catch (syncError) {
                console.error(`Failed to sync ${tableName} item:`, syncError)
              }
            }
            console.log(`✅ Synced ${tableName} (idb) to Firebase`)
          }
          done++
          setProgress(Math.round((done / total) * 100))
        }
      }

      toast({
        title: "تم استعادة البيانات",
        description: "تم استيراد جميع البيانات بنجاح. سيتم تحديث الصفحة...",
      })

      setTimeout(() => { window.location.reload() }, 1200)
    } catch (error) {
      console.error(error)
      toast({
        title: "فشل في استعادة البيانات",
        description: "تأكد من أن الملف صحيح وحاول مرة أخرى",
        variant: "destructive",
      })
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>النسخ الاحتياطي واستعادة البيانات</DialogTitle>
          <DialogDescription>قم بإنشاء نسخة احتياطية (يمكنك استثناء الصور لتسريع العملية)</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2 space-x-reverse border p-4 rounded-lg bg-yellow-50/50 border-yellow-100">
            <Checkbox id="excludeImages" checked={excludeImages} onCheckedChange={(c) => setExcludeImages(!!c)} />
            <div className="grid gap-1.5 leading-none mr-2">
              <label
                htmlFor="excludeImages"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                استثناء الصور (تقليل الحجم)
              </label>
              <p className="text-xs text-muted-foreground">
                حدد هذا الخيار إذا كان الملف كبيراً جداً، ولكن لن يتم حفظ صور المنتجات.
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium">البيانات المشمولة</h4>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => {
                  const all = {} as any;
                  keysOrder.forEach(k => all[k] = true);
                  setSelected(all);
                }} className="text-xs h-7">تحديد الكل</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected({})} className="text-xs h-7">إلغاء الكل</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {keysOrder.map((k) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                  <Checkbox checked={!!selected[k]} onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [k]: Boolean(v) }))} />
                  <span className="text-sm">{UI_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <Button onClick={handleBackup} disabled={isBackingUp} className="w-full gap-2" size="lg">
              <Download className="h-4 w-4" />
              {isBackingUp ? "جاري التصدير..." : "تحميل النسخة الاحتياطية"}
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleRestore}
                disabled={isRestoring}
                className="hidden"
                id="restore-file"
              />
              <Button asChild disabled={isRestoring} variant="outline" className="w-full gap-2 border-dashed" size="lg">
                <label htmlFor="restore-file" className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  {isRestoring ? "جاري الاستعادة..." : "استعادة نسخة من ملف"}
                </label>
              </Button>
            </div>
          </div>

          {(isBackingUp || isRestoring || isSavingToProject) && (
            <div className="space-y-2 animate-in fade-in zoom-in">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">{progress}%</p>
            </div>
          )}
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            تحذير: استعادة النسخة الاحتياطية ستستبدل البيانات الحالية.
          </AlertDescription>
        </Alert>


        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  )
}
