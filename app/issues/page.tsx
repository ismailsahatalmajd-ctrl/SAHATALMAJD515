"use client"

import { useMemo, useState, useEffect } from "react"
import { Plus, Search, FileText, Undo2, Download, Edit, Package, Barcode, Check } from 'lucide-react'
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DualText } from "@/components/ui/dual-text"
import { Header } from "@/components/header"
import { BulkIssueDialog } from "@/components/bulk-issue-dialog"
import { ReturnDialog } from "@/components/return-dialog"
import { db } from "@/lib/db"
import { getIssues, getReturns, getProducts, setIssueDelivered, getIssueDrafts, deleteIssueDraft, clearAllIssues, saveIssues, restoreIssues } from "@/lib/storage"
import type { Issue, Return, Product } from "@/lib/types"
import { generateIssuePDF } from "@/lib/pdf-generator"
import { generateAssemblyPDF } from "@/lib/assembly-pdf-generator"
import { getNumericInvoiceNumber, formatArabicGregorianDate, formatEnglishNumber, getSafeImageSrc, downloadJSON } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useRef } from "react"
import { useIssues, useReturns, useProducts } from "@/hooks/use-firestore"
import { syncIssue, syncProduct, syncReturn } from "@/lib/sync-api"
import { useAuth } from "@/components/auth-provider"

export default function IssuesPage() {
  const settings = useInvoiceSettings()
  const { t } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()

  // Real-time data hooks
  const { data: cloudIssues, loading: issuesLoading } = useIssues()
  const { data: cloudReturns, loading: returnsLoading } = useReturns()
  const { data: cloudProducts, loading: productsLoading } = useProducts()

  const [localIssues, setLocalIssues] = useState<Issue[]>([])
  const [localReturns, setLocalReturns] = useState<Return[]>([])
  const [localProducts, setLocalProducts] = useState<Product[]>([])

  // Derived state that prefers cloud data if logged in
  const issues = user ? cloudIssues : localIssues
  const returns = user ? cloudReturns : localReturns
  const products = user ? cloudProducts : localProducts

  const [searchTerm, setSearchTerm] = useState("")
  const [invoiceNumberSearch, setInvoiceNumberSearch] = useState("")
  const [issuesLimit, setIssuesLimit] = useState<string>("15")
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([])
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<Issue | undefined>(undefined)
  const [hasDrafts, setHasDrafts] = useState(false)
  const [deliverDialogIssueId, setDeliverDialogIssueId] = useState<string | null>(null)
  const [sessionBranchId, setSessionBranchId] = useState<string>("")

  // Invoice filters
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [minQty, setMinQty] = useState<string>("")
  const [maxQty, setMaxQty] = useState<string>("")
  const [productSearch, setProductSearch] = useState<string>("")
  const [productSelectedId, setProductSelectedId] = useState<string>("")
  // Branch & Product filters (session-persistent)
  const [branchMode, setBranchMode] = useState<"all" | "specific">("all")
  const [branchSelected, setBranchSelected] = useState<string>("")
  const [productMode, setProductMode] = useState<"all" | "specific">("all")

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if ((user as any)?.role === 'branch') {
      setSessionBranchId((user as any).branchId || "")
    }
  }, [user])

  const loadData = () => {
    // Only load local data if user is not logged in, or as fallback
    if (!user) {
      setLocalIssues(getIssues())
      setLocalReturns(getReturns())
      setLocalProducts(getProducts())
    }
    try {
      const drafts = getIssueDrafts()
      setHasDrafts(drafts.length > 0)
    } catch { setHasDrafts(false) }
  }

  useEffect(() => {
    let list = issues
    if (searchTerm) {
      list = list.filter(
        (issue) =>
          String(issue.branchName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          String(issue.id || "").includes(searchTerm) ||
          issue.products.some((p) => String(p.productName || "").toLowerCase().includes(searchTerm.toLowerCase())),
      )
    }
    if (invoiceNumberSearch.trim().length > 0) {
      const q = invoiceNumberSearch.trim()
      list = list.filter((iss) => getNumericInvoiceNumber(iss.id, new Date(iss.createdAt)).includes(q))
    }
    if (branchMode === "specific" && branchSelected) {
      list = list.filter((i) => i.branchName === branchSelected)
    }
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      list = list.filter((i) => {
        const d = new Date(i.createdAt)
        return d >= start && d <= end
      })
    }
    setFilteredIssues(list)
  }, [searchTerm, invoiceNumberSearch, branchMode, branchSelected, startDate, endDate, issues])

  const handleIssueAdded = () => {
    loadData()
    setIsIssueDialogOpen(false)
    setEditingIssue(undefined)
  }

  const handleEditIssue = (issue: Issue) => {
    setEditingIssue(issue)
    setIsIssueDialogOpen(true)
  }

  const handleConfirmDelivered = async () => {
    if (!deliverDialogIssueId) return

    // Update Local (Optimistic)
    const updated = setIssueDelivered(deliverDialogIssueId, "admin")

    if (updated) {
      if (user) {
        // Cloud Sync
        try {
          const issue = getIssues().find(i => i.id === deliverDialogIssueId)
          if (issue) {
            await syncIssue(issue)
            // Sync updated products (stock deducted)
            for (const ip of issue.products) {
              const p = getProducts().find(prod => prod.id === ip.productId)
              if (p) await syncProduct(p)
            }
          }
        } catch (e) {
          console.error("Cloud sync failed", e)
          toast({ title: "Sync Warning", description: "Updated locally but cloud sync failed", variant: "destructive" })
        }
      }

      toast({ title: "تم التسليم", description: "تم خصم الكميات من المخزون بنجاح" })
      // Force reload to reflect stock changes from server (Optional now with realtime, but good for safety)
      // setTimeout(() => window.location.reload(), 1000) // Removed reload as realtime hooks should update UI
    } else {
      toast({ title: "فشل العملية", description: "تعذر خصم الكميات. تحقق من المخزون المتوفر", variant: "destructive" })
    }
    setDeliverDialogIssueId(null)
  }

  const handleReturnAdded = () => {
    loadData()
    setIsReturnDialogOpen(false)
  }

  const handlePrintInvoice = async (issue: Issue) => {
    // Validate stock before printing
    for (const item of issue.products) {
      const product = products.find(p => p.id === item.productId)
      if (product) {
        // If already delivered, we add back the quantity to simulate "pre-delivery" stock state for validation
        // If not delivered, we rely on current stock
        const effectiveStock = (product.currentStock || 0) + (issue.delivered ? (item.quantity || 0) : 0)

        if ((item.quantity || 0) > effectiveStock) {
          toast({
            title: t("common.error"),
            description: `${t("bulkIssue.error.insufficientStock")}: ${product.productName || item.productName}`,
            variant: "destructive"
          })
          return
        }
      }
    }

    await generateIssuePDF(issue)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePrintAssembly = async (issue: Issue) => {
    await generateAssemblyPDF(issue)
  }

  const handleBackupIssues = () => {
    downloadJSON(issues, `issues-backup-${new Date().toISOString().split('T')[0]}`)
  }

  const handleRestoreIssues = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        if (Array.isArray(json)) {
          await restoreIssues(json)
          loadData()
          toast({ title: t("common.success"), description: "تم استعادة البيانات بنجاح" })
        } else {
          toast({ title: "خطأ", description: "ملف غير صالح", variant: "destructive" })
        }
      } catch (err) {
        toast({ title: "خطأ", description: "فشل قراءة الملف", variant: "destructive" })
      }
    }
    reader.readAsText(file)
    // Reset input
    e.target.value = ""
  }

  const handleFactoryResetIssues = async () => {
    if (confirm(t("common.confirmReset", "هل أنت متأكد من حذف جميع بيانات الصرف؟ لا يمكن التراجع عن هذا الإجراء."))) {
      await clearAllIssues()
      loadData()
      toast({ title: t("common.success"), description: "تم حذف البيانات بنجاح" })
    }
  }

  const totalIssuesValue = filteredIssues.reduce((sum, issue) => sum + issue.totalValue, 0)
  const totalReturnsValue = returns.reduce((sum, ret) => sum + ret.totalValue, 0)

  // Branch names for dropdown
  const branchNames = useMemo(() => {
    return Array.from(new Set(issues.map((i) => i.branchName).filter(Boolean)))
  }, [issues])

  // Persist filter selections in session (Dexie)
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const key = "issuesInvoiceFilters"
        let saved: any = null

        // Try Dexie first
        const setting = await db.settings.get(key)
        if (setting?.value) {
          saved = setting.value
        } else {
          // Fallback/Migrate localStorage
          const raw = localStorage.getItem(key)
          if (raw) {
            saved = JSON.parse(raw)
            await db.settings.put({ key, value: saved })
            localStorage.removeItem(key)
          }
        }

        if (saved) {
          if (saved.startDate) setStartDate(saved.startDate)
          if (saved.endDate) setEndDate(saved.endDate)
          if (saved.categoryFilter) setCategoryFilter(saved.categoryFilter)
          if (saved.minQty) setMinQty(String(saved.minQty))
          if (saved.maxQty) setMaxQty(String(saved.maxQty))
          if (saved.productSearch) setProductSearch(saved.productSearch)
          if (saved.productSelectedId) setProductSelectedId(saved.productSelectedId)
          if (saved.branchMode) setBranchMode(saved.branchMode)
          if (saved.branchSelected) setBranchSelected(saved.branchSelected)
          if (saved.productMode) setProductMode(saved.productMode)
        }
      } catch { }
    }
    loadFilters()
  }, [])

  useEffect(() => {
    const payload = {
      startDate,
      endDate,
      categoryFilter,
      minQty,
      maxQty,
      productSearch,
      productSelectedId,
      branchMode,
      branchSelected,
      productMode,
    }
    const saveFilters = async () => {
      try { await db.settings.put({ key: "issuesInvoiceFilters", value: payload }) } catch { }
    }
    saveFilters()
  }, [startDate, endDate, categoryFilter, minQty, maxQty, productSearch, productSelectedId, branchMode, branchSelected, productMode])

  const handleResetFilters = () => {
    setStartDate("")
    setEndDate("")
    setCategoryFilter("all")
    setMinQty("")
    setMaxQty("")
    setProductSearch("")
    setProductSelectedId("")
    setBranchMode("all")
    setBranchSelected("")
    setProductMode("all")
    const reset = async () => {
      try { await db.settings.delete("issuesInvoiceFilters") } catch { }
      try { localStorage.removeItem("issuesInvoiceFilters") } catch { }
    }
    reset()
  }

  // Aggregated issued products for invoice section
  const filteredIssuesForInvoice = useMemo(() => {
    let list = issues
    const start = startDate ? new Date(startDate) : undefined
    const end = endDate ? new Date(endDate) : undefined
    if (start && end) {
      list = list.filter((i) => {
        const d = new Date(i.createdAt)
        return d >= start && d <= end
      })
    }
    return list
  }, [issues, startDate, endDate])

  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((p) => map.set(p.id, p.category))
    return map
  }, [products])

  // Map المنتج -> الصورة لاستخدامها في الفاتورة والمعرض
  const productImageMap = useMemo(() => {
    const m = new Map<string, string | undefined>()
    products.forEach((p) => m.set(p.id, p.image))
    return m
  }, [products])

  // Map المنتج -> الاسم لضمان عرض الاسم حتى لو غاب productName في بيانات الصرف
  const productNameById = useMemo(() => {
    const m = new Map<string, string>()
    products.forEach((p) => m.set(p.id, (p as any).productName ?? (p as any).name ?? ""))
    return m
  }, [products])

  // إظهار عمود/معرض الصور فقط عند تفعيل أي فلتر
  const filtersActive = useMemo(() => {
    const hasRange = !!startDate && !!endDate
    const hasQty = !!minQty || !!maxQty
    const hasCategory = categoryFilter !== "all"
    const hasProductSpecific = productMode === "specific" && (productSearch.trim().length > 0 || !!productSelectedId)
    const hasBranchSpecific = branchMode === "specific" && !!branchSelected
    return hasRange || hasQty || hasCategory || hasProductSpecific || hasBranchSpecific
  }, [startDate, endDate, minQty, maxQty, categoryFilter, productMode, productSearch, productSelectedId, branchMode, branchSelected])

  const aggregatedInvoiceRows = useMemo(() => {
    type Row = { productId: string; productName: string; unitPrice: number; quantity: number; subtotal: number; category?: string; unit?: string; image?: string; overRequested?: boolean }
    const acc = new Map<string, Row>()
    const min = minQty ? Number(minQty) : undefined
    const max = maxQty ? Number(maxQty) : undefined
    const nameSearch = productSearch.trim().toLowerCase()
    const category = categoryFilter

    filteredIssuesForInvoice.forEach((iss) => {
      // Branch filter: include only selected branch when specific
      if (branchMode === "specific" && branchSelected && iss.branchName !== branchSelected) return
      iss.products.forEach((ip) => {
        // Product filter: when specific, include only matching name or productCode
        if (productMode === "specific") {
          const q = productSearch.trim().toLowerCase()
          if (productSelectedId) {
            if (ip.productId !== productSelectedId) return
          } else if (q) {
            const ipName = (ip.productName || productNameById.get(ip.productId) || "").toLowerCase()
            const ipCode = String(ip.productCode || "").toLowerCase()
            if (!(ipName.includes(q) || ipCode.includes(q))) {
              return
            }
          }
        }
        const row = acc.get(ip.productId) || {
          productId: ip.productId,
          productName: ip.productName || productNameById.get(ip.productId) || "",
          unitPrice: ip.unitPrice,
          image: productImageMap.get(ip.productId),
          quantity: 0,
          subtotal: 0,
          category: productCategoryMap.get(ip.productId),
          unit: ip.unit,
        }
        row.quantity += ip.quantity
        // تعليم الصف إذا تجاوزت الكمية المخزون عند وقت الصرف
        const availableAtIssue = typeof (ip as any).currentStock === "number" ? (ip as any).currentStock : 0
        const isOver = (ip.quantity || 0) > availableAtIssue
        row.overRequested = row.overRequested || isOver
        // آخر سعر وحدة معقول، أو يمكن حساب متوسط سعري لاحقًا
        row.unitPrice = ip.unitPrice || row.unitPrice || 0
        row.subtotal = row.quantity * row.unitPrice
        acc.set(ip.productId, row)
      })
    })

    let rows = Array.from(acc.values())
    rows = rows.filter((r) => {
      const matchesName = nameSearch ? r.productName.toLowerCase().includes(nameSearch) : true
      const matchesSelected = productSelectedId ? r.productId === productSelectedId : true
      const matchesCat = category === "all" ? true : (r.category || "").toLowerCase() === category.toLowerCase()
      const matchesMin = min !== undefined ? r.quantity >= min : true
      const matchesMax = max !== undefined ? r.quantity <= max : true
      return matchesName && matchesSelected && matchesCat && matchesMin && matchesMax
    })
    // Sort by quantity desc for readability
    rows.sort((a, b) => b.quantity - a.quantity)
    return rows
  }, [filteredIssuesForInvoice, productCategoryMap, minQty, maxQty, productSearch, productSelectedId, categoryFilter, branchMode, branchSelected, productMode])

  const totalProductsCount = aggregatedInvoiceRows.length
  const totalInvoiceAmount = aggregatedInvoiceRows.reduce((sum, r) => sum + r.subtotal, 0)

  const formatCurrency = (val: number) => `${formatEnglishNumber(val.toFixed(2))} ${t("common.currency")}`

  const exportInvoiceCSV = () => {
    const confirmed = window.confirm(t("issues.invoice.confirm.saveBeforeExport"))
    if (!confirmed) return
    const headers = [
      t("issues.invoice.table.productName"),
      t("issues.invoice.table.unit"),
      t("issues.invoice.table.issuedQty"),
      t("issues.invoice.table.unitPrice"),
      t("issues.invoice.table.subtotal")
    ]
    const rows = aggregatedInvoiceRows.map((r) => [r.productName, r.unit || "-", String(r.quantity), String(r.unitPrice), String(r.subtotal)])
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${t("issues.invoice.title").replace(/\s+/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printInvoicePDF = () => {
    const confirmed = window.confirm(t("issues.invoice.confirm.saveBeforePrint"))
    if (!confirmed) return
    const period = startDate && endDate
      ? `${formatArabicGregorianDate(new Date(startDate))} - ${formatArabicGregorianDate(new Date(endDate))}`
      : t("reports.period.all")
    const rowsHtml = aggregatedInvoiceRows.map((r, idx) => `
      <tr>
        <td class="index">${idx + 1}</td>
        <td class="name">${r.productName}</td>
        ${settings.showUnit ? `<td>${r.unit || '-'}</td>` : ''}
        ${settings.showQuantity ? `<td class="qty">${formatEnglishNumber(r.quantity)}</td>` : ''}
        ${settings.showPrice ? `<td>${formatEnglishNumber(r.unitPrice)}</td>` : ''}
        ${settings.showTotal ? `<td class="subtotal">${formatEnglishNumber(r.subtotal.toFixed(2))}</td>` : ''}
      </tr>
    `).join("")
    const html = `<!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>فاتورة إجمالية للمنتجات المصروفة</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#0f172a;padding:28px}
        .header{border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}
        .title{color:#2563eb;font-size:24px;font-weight:700}
        .meta{color:#334155;font-size:13px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #e2e8f0;padding:8px;text-align:right;font-size:13px}
        thead th{background:#f1f5f9;font-weight:600}
        .index{width:36px;text-align:center;color:#475569}
        .qty{color:#16a34a;print-color-adjust: exact; -webkit-print-color-adjust: exact;}
        .subtotal{color:#16a34a;print-color-adjust: exact; -webkit-print-color-adjust: exact;}
        .subtotal.neg{color:#ef4444}
        .footer{margin-top:16px;display:flex;gap:12px}
        .box{background:#f8fafc;border-right:4px solid #2563eb;border-radius:8px;padding:12px}
        @page{size:A4;margin:18mm}
        @media print{body{padding:0}}
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${t("issues.invoice.title")}</div>
        <div class="meta"><strong>${t("reports.period")}:</strong> ${period}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${t("issues.invoice.table.productName")}</th>
            ${settings.showUnit ? `<th>${t("issues.invoice.table.unit")}</th>` : ''}
            ${settings.showQuantity ? `<th>${t("issues.invoice.table.issuedQty")}</th>` : ''}
            ${settings.showPrice ? `<th>${t("issues.invoice.table.unitPrice")}</th>` : ''}
            ${settings.showTotal ? `<th>${t("issues.invoice.table.subtotal")}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="footer">
        <div class="box"><strong>${t("issues.invoice.summary.totalProducts")}:</strong> ${formatEnglishNumber(totalProductsCount)}</div>
        <div class="box"><strong>${t("issues.invoice.summary.totalAmount")}:</strong> ${formatEnglishNumber(totalInvoiceAmount.toFixed(2))} ${t("common.currency")}</div>
      </div>
    </body>
    </html>`
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold"><DualText k="issues.title" /></h1>
              <p className="text-muted-foreground"><DualText k="issues.subtitle" /> (v1.1)</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex gap-2 mr-2 border-r pr-2">
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleRestoreIssues} />
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title={t("common.restore", "استعادة")}>
                  <Undo2 className="h-4 w-4 rotate-180" style={{ transform: 'scaleX(-1)' }} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleBackupIssues} title={t("common.backup", "نسخ احتياطي")}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleFactoryResetIssues} title={t("common.reset", "استعادة ضبط المصنع")} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                  <Undo2 className="h-4 w-4" />
                </Button>
              </div>
              {sessionBranchId && (
                <Button asChild variant="secondary">
                  <Link href={`/branch/${sessionBranchId}`}><DualText k="nav.branchRequests" /></Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/issues/verification-logs">
                  <Barcode className="ml-2 h-4 w-4" />
                  <DualText k="issues.verificationLogs" />
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setIsReturnDialogOpen(true)}>
                <Undo2 className="ml-2 h-4 w-4" />
                <DualText k="issues.addReturn" />
              </Button>
              {hasDrafts && (
                <Button variant="outline" onClick={() => { setEditingIssue(undefined); setIsIssueDialogOpen(true) }}>
                  <Edit className="ml-2 h-4 w-4" />
                  <DualText k="issues.resumeDraft" />
                </Button>
              )}
              <Button onClick={() => setIsIssueDialogOpen(true)}>
                <Plus className="ml-2 h-4 w-4" />
                <DualText k="issues.issueProducts" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle suppressHydrationWarning className="text-sm font-medium"><DualText k="issues.metrics.totalIssues" /></CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEnglishNumber(totalIssuesValue.toFixed(2))} <DualText k="common.currency" /></div>
                <p className="text-xs text-muted-foreground">{formatEnglishNumber(filteredIssues.length)} <DualText k="issues.metrics.operationsLabel" /></p>
                {hasDrafts && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline"><DualText k="issues.draftsAvailable" /></Badge>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingIssue(undefined); setIsIssueDialogOpen(true) }}><DualText k="common.continue" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { const drafts = getIssueDrafts(); if (drafts.length) { deleteIssueDraft(drafts[0].id); setHasDrafts(getIssueDrafts().length > 0) } }}><DualText k="issues.deleteDraft" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle suppressHydrationWarning className="text-sm font-medium"><DualText k="issues.metrics.totalReturns" /></CardTitle>
                <Undo2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEnglishNumber(totalReturnsValue.toFixed(2))} <DualText k="common.currency" /></div>
                <p className="text-xs text-muted-foreground">{formatEnglishNumber(returns.length)} <DualText k="issues.metrics.returnOperationsLabel" /></p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle suppressHydrationWarning className="text-sm font-medium"><DualText k="issues.metrics.net" /></CardTitle>
                <Download className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEnglishNumber((totalIssuesValue - totalReturnsValue).toFixed(2))} <DualText k="common.currency" /></div>
                <p className="text-xs text-muted-foreground"><DualText k="issues.metrics.afterReturns" /></p>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const list = getIssueDrafts()
            return list.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle><DualText k="issues.drafts" /></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]"><DualText k="issues.table.drafts.id" /></TableHead>
                          <TableHead className="min-w-[150px]"><DualText k="issues.table.issues.columns.branch" /></TableHead>
                          <TableHead className="min-w-[120px]"><DualText k="issues.table.issues.columns.productsCount" /></TableHead>
                          <TableHead className="min-w-[140px]"><DualText k="issues.table.drafts.lastUpdate" /></TableHead>
                          <TableHead className="text-left min-w-[120px]"><DualText k="common.actions" /></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.slice().sort((a, b) => new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime() - new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime()).map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">{getNumericInvoiceNumber(d.id, new Date((d as any).createdAt || Date.now()))}</TableCell>
                            <TableCell><Badge variant="outline">{(d as any).branchName || '-'}</Badge></TableCell>
                            <TableCell>{formatEnglishNumber(((d as any).products || []).length)}</TableCell>
                            <TableCell>{formatArabicGregorianDate(new Date((d as any).updatedAt || (d as any).createdAt || Date.now()))}</TableCell>
                            <TableCell className="text-left">
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="ghost" onClick={() => { setEditingIssue(undefined); try { localStorage.setItem('issueDraftLoadId', d.id) } catch { }; setIsIssueDialogOpen(true) }}><DualText k="common.continue" /></Button>
                                <Button size="sm" variant="destructive" onClick={() => { deleteIssueDraft(d.id); setLocalIssues(getIssues()); }}><DualText k="common.delete" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : null
          })()}

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <CardTitle suppressHydrationWarning><DualText k="issues.table.issues.title" /></CardTitle>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t("issues.table.issues.search")}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10 w-full"
                    />
                  </div>
                  <Input
                    placeholder={t("issues.invoiceNumber")}
                    value={invoiceNumberSearch}
                    onChange={(e) => setInvoiceNumberSearch(e.target.value)}
                    className="w-full md:w-40"
                  />
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full md:w-40" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full md:w-40" />
                  <select className="border rounded h-9 px-2 w-full md:w-auto" value={issuesLimit} onChange={(e) => setIssuesLimit(e.target.value)}>
                    <option value="15">{t("issues.filter.limit.15")}</option>
                    <option value="30">{t("issues.filter.limit.30")}</option>
                    <option value="60">{t("issues.filter.limit.60")}</option>
                    <option value="all">{t("issues.filter.limit.all")}</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]"><DualText k="issues.table.issues.columns.id" /></TableHead>
                      <TableHead className="min-w-[150px]"><DualText k="issues.table.issues.columns.branch" /></TableHead>
                      <TableHead className="min-w-[120px]"><DualText k="issues.table.issues.columns.productsCount" /></TableHead>
                      <TableHead className="min-w-[140px]"><DualText k="issues.table.issues.columns.total" /></TableHead>
                      <TableHead className="min-w-[120px]"><DualText k="issues.table.issues.columns.date" /></TableHead>
                      <TableHead className="min-w-[100px]">Status / الحالة</TableHead>
                      <TableHead className="min-w-[150px]"><DualText k="issues.table.issues.columns.notes" /></TableHead>
                      <TableHead className="text-left min-w-[100px]"><DualText k="issues.table.issues.columns.actions" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const sorted = [...filteredIssues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      const limitNum = issuesLimit === "all" ? sorted.length : Number(issuesLimit || 15)
                      const limited = sorted.slice(0, limitNum)
                      return limited.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            <DualText k="issues.table.issues.empty" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        limited.map((issue) => (
                          <TableRow key={issue.id}>
                            <TableCell className="font-medium">{getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{issue.branchName}</Badge>
                            </TableCell>
                            <TableCell>{formatEnglishNumber(issue.products.length)} <DualText k="common.product" /></TableCell>
                            <TableCell className="font-semibold">{formatEnglishNumber(issue.totalValue.toFixed(2))} <DualText k="common.currency" /></TableCell>
                            <TableCell>{formatArabicGregorianDate(new Date(issue.createdAt))}</TableCell>
                            <TableCell>
                              {issue.delivered ? (
                                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                                  <Check className="w-3 h-3 mr-1" />
                                  <DualText k="issues.status.delivered" />
                                </Badge>
                              ) : issue.branchReceived ? (
                                <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">
                                  <Check className="w-3 h-3 mr-1" />
                                  <DualText k="issues.status.branchReceived" />
                                </Badge>
                              ) : (
                                <Badge variant="secondary"><DualText k="issues.status.pending" /></Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {issue.notes || "-"}
                            </TableCell>
                            <TableCell className="text-left">
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => handlePrintAssembly(issue)}>
                                  <Package className="h-4 w-4 ml-1" />
                                  <DualText k="issues.actions.assemble" />
                                </Button>
                                <Link href={`/issues/verify?id=${issue.id}`}>
                                  <Button size="sm" variant="ghost">
                                    <Barcode className="h-4 w-4 ml-1" />
                                    <DualText k="issues.verify" />
                                  </Button>
                                </Link>
                                <Button size="sm" variant="ghost" onClick={() => handlePrintInvoice(issue)}>
                                  <FileText className="h-4 w-4 ml-1" />
                                  <DualText k="issues.actions.printIssue" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleEditIssue(issue)}>
                                  <Edit className="h-4 w-4 ml-1" />
                                  <DualText k="common.edit" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant={issue.delivered ? "secondary" : "default"}
                                  disabled={!!issue.delivered}
                                  onClick={() => setDeliverDialogIssueId(issue.id)}
                                  className={issue.delivered ? "opacity-70 cursor-not-allowed" : ""}
                                >
                                  {issue.delivered ? <DualText k="issues.status.delivered" /> : <DualText k="issues.status.delivered" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Delivery confirmation dialog */}
          <Dialog open={!!deliverDialogIssueId} onOpenChange={(open) => !open && setDeliverDialogIssueId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle><DualText k="issues.confirmDelivery.title" /></DialogTitle>
                <DialogDescription><DualText k="issues.confirmDelivery.desc" /></DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeliverDialogIssueId(null)}><DualText k="common.no" /></Button>
                <Button onClick={handleConfirmDelivered}><DualText k="common.yes" /></Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning><DualText k="issues.table.returns.title" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]"><DualText k="issues.table.returns.columns.id" /></TableHead>
                        <TableHead className="min-w-[150px]"><DualText k="issues.table.returns.columns.branch" /></TableHead>
                        <TableHead className="min-w-[120px]"><DualText k="issues.table.returns.columns.productsCount" /></TableHead>
                        <TableHead className="min-w-[120px]"><DualText k="issues.table.returns.columns.value" /></TableHead>
                        <TableHead className="min-w-[200px]"><DualText k="issues.table.returns.columns.reason" /></TableHead>
                        <TableHead className="min-w-[120px]"><DualText k="issues.table.returns.columns.date" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returns.map((returnItem) => (
                        <TableRow key={returnItem.id}>
                          <TableCell className="font-medium">{getNumericInvoiceNumber(returnItem.id, new Date(returnItem.createdAt))}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{returnItem.branchName}</Badge>
                          </TableCell>
                          <TableCell>{formatEnglishNumber(returnItem.products.length)}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(returnItem.totalValue)}</TableCell>
                          <TableCell className="text-muted-foreground">{returnItem.reason}</TableCell>
                          <TableCell>{formatArabicGregorianDate(new Date(returnItem.createdAt))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice for issued products (moved below issues/returns) */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle suppressHydrationWarning className="text-xl font-bold"><DualText k="issues.invoice.title" /></CardTitle>
                <p className="text-muted-foreground"><DualText k="issues.invoice.desc" /></p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={printInvoicePDF}>
                  <FileText className="ml-2 h-4 w-4" />
                  <DualText k="issues.invoice.actions.exportPrint" />
                </Button>
                <Button onClick={exportInvoiceCSV}>
                  <Download className="ml-2 h-4 w-4" />
                  <DualText k="issues.invoice.actions.exportExcel" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                {/* Sidebar filters */}
                <div className="space-y-4 md:col-span-1">
                  <div>
                    <label className="block text-sm mb-1"><DualText k="issues.invoice.filters.period" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="تاريخ البدء" />
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="تاريخ الانتهاء" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-1"><DualText k="issues.invoice.filters.category" /></label>
                    <select className="w-full border rounded h-9 px-2" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label={t("issues.invoice.filters.category")}>
                      <option value="all">{t("common.all")}</option>
                      {Array.from(new Set(products.map((p) => p.category).filter(Boolean))).map((cat) => (
                        <option key={cat} value={cat!}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1"><DualText k="issues.invoice.filters.branches" /></label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={branchMode === 'all'} onChange={() => setBranchMode('all')} aria-label={t("issues.invoice.filters.allBranches")} />
                        <DualText k="issues.invoice.filters.allBranches" />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={branchMode === 'specific'} onChange={() => setBranchMode('specific')} aria-label={t("issues.invoice.filters.specificBranch")} />
                        <DualText k="issues.invoice.filters.specificBranch" />
                      </label>
                    </div>
                    {branchMode === 'specific' && (
                      <select className="w-full border rounded h-9 px-2 mt-2" value={branchSelected} onChange={(e) => setBranchSelected(e.target.value)} aria-label={t("issues.invoice.filters.selectBranch")}>
                        <option value="">{t("issues.invoice.filters.selectBranch")}</option>
                        {branchNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm mb-1"><DualText k="issues.invoice.filters.qtyRange" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min={0} value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder={t("issues.invoice.filters.min")} aria-label={t("issues.invoice.filters.min")} />
                      <Input type="number" min={0} value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder={t("issues.invoice.filters.max")} aria-label={t("issues.invoice.filters.max")} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-1"><DualText k="issues.invoice.filters.productFilter" /></label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={productMode === 'all'} onChange={() => setProductMode('all')} aria-label={t("issues.invoice.filters.allProducts")} />
                        <DualText k="issues.invoice.filters.allProducts" />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" checked={productMode === 'specific'} onChange={() => setProductMode('specific')} aria-label={t("issues.invoice.filters.specificProduct")} />
                        <DualText k="issues.invoice.filters.specificProduct" />
                      </label>
                    </div>
                    {productMode === 'specific' && (
                      <>
                        <Input className="mt-2" placeholder={t("issues.invoice.filters.search")} value={productSearch} onChange={(e) => setProductSearch(e.target.value)} aria-label={t("issues.invoice.filters.search")} />
                        <select
                          className="w-full border rounded h-9 px-2 mt-2"
                          value={productSelectedId}
                          onChange={(e) => setProductSelectedId(e.target.value)}
                          aria-label={t("issues.invoice.filters.selectProductFromList")}
                        >
                          <option value="">{t("issues.invoice.filters.selectProductFromList")}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.productName} ({p.productCode})</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <div>
                    <Button variant="outline" className="w-full" onClick={handleResetFilters} aria-label={t("issues.invoice.filters.reset")}><DualText k="issues.invoice.filters.reset" /></Button>
                  </div>
                </div>

                {/* Invoice table and summary */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {filtersActive && (
                            <TableHead className="min-w-[100px]"><DualText k="issues.invoice.table.image" /></TableHead>
                          )}
                          <TableHead className="min-w-[200px]"><DualText k="issues.invoice.table.productName" /></TableHead>
                          {settings.showUnit && <TableHead className="min-w-[100px]"><DualText k="issues.invoice.table.unit" /></TableHead>}
                          {settings.showQuantity && <TableHead className="min-w-[120px]"><DualText k="issues.invoice.table.issuedQty" /></TableHead>}
                          {settings.showPrice && <TableHead className="min-w-[120px]"><DualText k="issues.invoice.table.unitPrice" /></TableHead>}
                          {settings.showTotal && <TableHead className="min-w-[140px]"><DualText k="issues.invoice.table.subtotal" /></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aggregatedInvoiceRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground"><DualText k="issues.invoice.table.empty" /></TableCell>
                          </TableRow>
                        ) : (
                          aggregatedInvoiceRows.map((row) => {
                            const subtotalPos = row.subtotal >= 0
                            return (
                              <TableRow key={row.productId} className={row.overRequested ? "text-red-600" : undefined}>
                                {filtersActive && (
                                  <TableCell>
                                    <img
                                      src={getSafeImageSrc(row.image || "/placeholder.svg")}
                                      alt={row.productName}
                                      className="w-12 h-12 object-cover rounded"
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg" }}
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="font-medium">{row.productName}</TableCell>
                                {settings.showUnit && <TableCell>{row.unit || '-'}</TableCell>}
                                {settings.showQuantity && <TableCell className="font-semibold">{formatEnglishNumber(row.quantity)}</TableCell>}
                                {settings.showPrice && <TableCell>{formatCurrency(row.unitPrice)}</TableCell>}
                                {settings.showTotal && (
                                  <TableCell className={subtotalPos ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                    {formatCurrency(row.subtotal)}
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle suppressHydrationWarning className="text-sm"><DualText k="issues.invoice.summary.totalProducts" /></CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatEnglishNumber(totalProductsCount)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle suppressHydrationWarning className="text-sm"><DualText k="issues.invoice.summary.totalAmount" /></CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-700">{formatCurrency(totalInvoiceAmount)}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      {/* Image gallery shows only when filters are active */}
      {filtersActive && aggregatedInvoiceRows.length > 0 && (
        <div className="container mx-auto px-4 pb-10">
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning><DualText k="issues.invoice.gallery.title" /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {aggregatedInvoiceRows.map((row) => (
                  <div key={row.productId} className="flex flex-col items-center gap-2">
                    <img
                      src={getSafeImageSrc(row.image || "/placeholder.svg")}
                      alt={row.productName}
                      className="w-24 h-24 object-cover rounded border"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg" }}
                    />
                    <div className="text-xs text-center text-muted-foreground">{row.productName}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <BulkIssueDialog
        open={isIssueDialogOpen}
        onOpenChange={(open) => {
          setIsIssueDialogOpen(open)
          if (!open) setEditingIssue(undefined)
        }}
        onSuccess={handleIssueAdded}
        issueToEdit={editingIssue}
      />
      <ReturnDialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen} onSuccess={handleReturnAdded} />
    </div>
  )
}
