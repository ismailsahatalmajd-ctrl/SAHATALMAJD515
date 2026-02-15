"use client"

import { useMemo, useState, useEffect } from "react"
import { Plus, Search, FileText, Undo2, Download, Edit, Package, Barcode, Check, MoreHorizontal, Trash2, Settings2 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { Header } from "@/components/header"
import { BulkIssueDialog } from "@/components/bulk-issue-dialog"
import { ReturnDialog } from "@/components/return-dialog"
import { db } from "@/lib/db"
import { getIssues, getReturns, getProducts, setIssueDelivered, getIssueDrafts, deleteIssueDraft, clearAllIssues, saveIssues, restoreIssues, deleteIssue } from "@/lib/storage"
import type { Issue, Return, Product } from "@/lib/types"
import { generateIssuePDF } from "@/lib/pdf-generator"
import { generateAssemblyPDF } from "@/lib/assembly-pdf-generator"
import { getNumericInvoiceNumber, formatArabicGregorianDate, formatArabicGregorianDateTime, formatEnglishNumber, getSafeImageSrc, downloadJSON } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useRef } from "react"
import { useIssues, useReturns, useProducts } from "@/hooks/use-firestore"
import { syncIssue, syncProduct, syncReturn } from "@/lib/sync-api"
import { useAuth } from "@/components/auth-provider"
import { AdminAnalyticsDashboard } from "@/components/admin-analytics-dashboard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

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
  const [statusFilters, setStatusFilters] = useState<string[]>(['pending', 'received', 'delivered'])
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([])
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<Issue | undefined>(undefined)
  const [hasDrafts, setHasDrafts] = useState(false)
  const [deliverDialogIssueId, setDeliverDialogIssueId] = useState<string | null>(null)
  const [sessionBranchId, setSessionBranchId] = useState<string>("")

  // Smart Assembly Selection State
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([])
  const [isAssemblyDialogOpen, setIsAssemblyDialogOpen] = useState(false)
  const [assemblySettings, setAssemblySettings] = useState({
    mode: 'merged' as 'merged' | 'detailed',
    showImages: true,
    showPrice: true,
    showTotal: true
  })

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
    // Filter by Status (Split Statuses)
    if (statusFilters.length < 3) {
      list = list.filter(i => {
        const isPending = !i.delivered && !i.branchReceived
        const isReceived = !i.delivered && i.branchReceived
        const isDelivered = !!i.delivered

        if (statusFilters.includes('pending') && isPending) return true
        if (statusFilters.includes('received') && isReceived) return true
        if (statusFilters.includes('delivered') && isDelivered) return true
        return false
      })
    }
    setFilteredIssues(list)
  }, [searchTerm, invoiceNumberSearch, branchMode, branchSelected, startDate, endDate, issues, statusFilters])

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
    const updated = await setIssueDelivered(deliverDialogIssueId, "admin")

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
        }
      }

      toast({
        title: getDualString("issues.toast.delivered"),
        description: getDualString("issues.toast.deliveredDesc")
      })
    } else {
      toast({
        title: getDualString("common.error"),
        description: getDualString("issues.toast.deliveryError"),
        variant: "destructive"
      })
    }
    setDeliverDialogIssueId(null)
  }

  const handleDeleteIssue = async (issue: Issue) => {
    const invoiceNum = getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))
    if (confirm(`${t("common.delete")} ${t("issues.invoiceNumber")} ${invoiceNum}?`)) {
      const success = await deleteIssue(issue.id)
      if (success) {
        toast({
          title: getDualString("common.success"),
          description: getDualString("common.deleted")
        })
        loadData()
      } else {
        toast({
          title: getDualString("common.error"),
          description: getDualString("common.error"),
          variant: "destructive"
        })
      }
    }
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
          const productName = product.productName || item.productName
          toast({
            title: getDualString("common.error"),
            description: `${getDualString("bulkIssue.error.insufficientStock")}: ${productName}. ${getDualString("bulkIssue.error.adjustQuantity")}`,
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
          toast({ title: getDualString("common.success"), description: getDualString("issues.toast.restoreSuccess") })
        } else {
          toast({ title: getDualString("common.error"), description: getDualString("issues.toast.restoreErrorFile"), variant: "destructive" })
        }
      } catch (err) {
        toast({ title: getDualString("common.error"), description: getDualString("issues.toast.restoreErrorRead"), variant: "destructive" })
      }
    }
    reader.readAsText(file)
    // Reset input
    e.target.value = ""
  }

  const handleFactoryResetIssues = async () => {
    if (confirm(t("home.maintenance.dbReset.confirm"))) {
      await clearAllIssues()
      loadData()
      toast({ title: getDualString("common.success"), description: getDualString("common.success") })
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const sorted = [...filteredIssues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const limitNum = issuesLimit === "all" ? sorted.length : Number(issuesLimit || 15)
      const limited = sorted.slice(0, limitNum)
      setSelectedIssueIds(limited.map(i => i.id))
    } else {
      setSelectedIssueIds([])
    }
  }

  const toggleSelectIssue = (id: string) => {
    setSelectedIssueIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
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

  // Map المنتج -> الاسم لضمان عرض الاسم حتى لو غاب productName في بيانات الصرف
  const productNameById = useMemo(() => {
    const m = new Map<string, string>()
    products.forEach((p) => m.set(p.id, (p as any).productName ?? (p as any).name ?? ""))
    return m
  }, [products])

  const aggregatedInvoiceRows = useMemo(() => {
    type Row = { productId: string; productCode: string; productName: string; unitPrice: number; quantity: number; subtotal: number; category?: string; unit?: string; image?: string; overRequested?: boolean }
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
          productCode: ip.productCode || "",
          productName: ip.productName || productNameById.get(ip.productId) || "",
          unitPrice: ip.unitPrice,
          unit: ip.unit,
          quantity: 0,
          subtotal: 0,
          category: productCategoryMap.get(ip.productId),
          image: ip.image,
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
  }, [filteredIssuesForInvoice, productCategoryMap, minQty, maxQty, productSearch, productSelectedId, categoryFilter, branchMode, branchSelected, productMode, productNameById])

  const totalProductsCount = aggregatedInvoiceRows.length
  const totalInvoiceAmount = aggregatedInvoiceRows.reduce((sum, r) => sum + r.subtotal, 0)

  const formatCurrency = (val: number) => `${formatEnglishNumber(val.toFixed(2))} ${t("common.currency")}`

  const exportInvoiceCSV = () => {
    const confirmed = window.confirm(getDualString("issues.invoice.confirm.saveBeforeExport"))
    if (!confirmed) return
    const headers = [
      t("issues.invoice.table.productCode") || "الكود / Code",
      t("issues.invoice.table.productName"),
      t("issues.invoice.table.unit"),
      t("issues.invoice.table.issuedQty"),
      t("issues.invoice.table.unitPrice"),
      t("issues.invoice.table.subtotal")
    ]
    const rows = aggregatedInvoiceRows.map((r) => [r.productCode, r.productName, r.unit || "-", String(r.quantity), String(r.unitPrice), String(r.subtotal)])
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
    const confirmed = window.confirm(getDualString("issues.invoice.confirm.saveBeforePrint"))
    if (!confirmed) return

    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`
      <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
        <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
        <p style="color:#64748b;">جاري تجهيز الفاتورة الإجمالية... (Preparing Aggregated Invoice...)</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `)

    const period = startDate && endDate
      ? `${formatArabicGregorianDate(new Date(startDate))} - ${formatArabicGregorianDate(new Date(endDate))}`
      : t("reports.period.all")
    const rowsHtml = aggregatedInvoiceRows.map((r, idx) => `
      <tr>
        <td class="index">${idx + 1}</td>
        <td>${r.productCode}</td>
        <td class="name">${r.productName}</td>
        ${settings.showUnit ? `<td>${r.unit || '-'}</td>` : ''}
        ${settings.showQuantity ? `<td class="qty">${formatEnglishNumber(r.quantity)}</td>` : ''}
        ${settings.showPrice ? `<td>${formatEnglishNumber(r.unitPrice)}</td>` : ''}
        ${settings.showTotal ? `<td>${formatEnglishNumber(r.subtotal.toFixed(2))}</td>` : ''}
      </tr>
    `).join("")
    const html = `<!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${t("issues.invoice.pdfTitle")}</title>
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
            <th>${t("issues.invoice.table.productCode") || "الكود / Code"}</th>
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

    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 350)
  }

  const handlePrintAssemblyFromAggregated = async () => {
    if (aggregatedInvoiceRows.length === 0) {
      toast({
        title: t("common.error"),
        description: t("issues.invoice.table.empty"),
        variant: "destructive"
      })
      return
    }

    // Create a virtual issue for the assembly generator
    const virtualIssue: Issue = {
      id: `agg-${Date.now()}`,
      branchId: "all",
      branchName: t("common.all"),
      products: aggregatedInvoiceRows.map(r => ({
        productId: r.productId,
        productCode: r.productCode,
        productName: r.productName,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        totalPrice: r.subtotal,
        unit: r.unit,
        image: r.image
      })),
      totalValue: totalInvoiceAmount,
      createdAt: new Date().toISOString(),
      delivered: false
    }

    await generateAssemblyPDF(virtualIssue, {
      mode: 'merged',
      showImages: true,
      showPrice: false,
      showTotal: false
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {(user as any)?.role !== 'branch' && <AdminAnalyticsDashboard />}

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
                            <TableCell>{formatArabicGregorianDateTime(new Date((d as any).updatedAt || (d as any).createdAt || Date.now()))}</TableCell>
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
                      placeholder="Search / بحث في العمليات..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10 w-full"
                    />
                  </div>
                  <Input
                    placeholder="Invoice No / رقم الفاتورة"
                    value={invoiceNumberSearch}
                    onChange={(e) => setInvoiceNumberSearch(e.target.value)}
                    className="w-full md:w-40"
                  />
                  {/* Status Filter Multi-Select */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full md:w-auto justify-between px-3">
                        <span className="truncate text-sm">
                          {statusFilters.length === 3
                            ? "All / الكل"
                            : statusFilters.length === 0
                              ? "All / الكل"
                              : `${statusFilters.length} Selected / تم تحديد`}
                        </span>
                        <Settings2 className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuLabel>Filter by Status / تصفية بالحالة</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <div className="flex items-center space-x-2 w-full">
                          <Checkbox
                            id="status-pending"
                            checked={statusFilters.includes('pending')}
                            onCheckedChange={(checked) => {
                              setStatusFilters(prev => checked ? [...prev, 'pending'] : prev.filter(s => s !== 'pending'))
                            }}
                          />
                          <label htmlFor="status-pending" className="flex-1 cursor-pointer ml-2 text-sm">Pending / انتظار</label>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <div className="flex items-center space-x-2 w-full">
                          <Checkbox
                            id="status-received"
                            checked={statusFilters.includes('received')}
                            onCheckedChange={(checked) => {
                              setStatusFilters(prev => checked ? [...prev, 'received'] : prev.filter(s => s !== 'received'))
                            }}
                          />
                          <label htmlFor="status-received" className="flex-1 cursor-pointer ml-2 text-sm">Branch Received / استلام فرع</label>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <div className="flex items-center space-x-2 w-full">
                          <Checkbox
                            id="status-delivered"
                            checked={statusFilters.includes('delivered')}
                            onCheckedChange={(checked) => {
                              setStatusFilters(prev => checked ? [...prev, 'delivered'] : prev.filter(s => s !== 'delivered'))
                            }}
                          />
                          <label htmlFor="status-delivered" className="flex-1 cursor-pointer ml-2 text-sm">Delivered / تم التسليم</label>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full md:w-40" aria-label="From Date / من تاريخ" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full md:w-40" aria-label="To Date / إلى تاريخ" />
                  <select className="border rounded h-9 px-2 w-full md:w-auto" value={issuesLimit} onChange={(e) => setIssuesLimit(e.target.value)}>
                    <option value="15">Latest 15 / أحدث 15</option>
                    <option value="30">Latest 30 / أحدث 30</option>
                    <option value="60">Latest 60 / أحدث 60</option>
                    <option value="all">All / الكل</option>
                  </select>
                  {selectedIssueIds.length > 0 && (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setIsAssemblyDialogOpen(true)}
                    >
                      <Package className="ml-2 h-4 w-4" />
                      <span>تجميع / Assemble ({selectedIssueIds.length})</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] border-x text-center">
                        <Checkbox
                          checked={selectedIssueIds.length > 0 && selectedIssueIds.length === (issuesLimit === "all" ? filteredIssues.length : Math.min(filteredIssues.length, Number(issuesLimit)))}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="issues.table.issues.columns.id" /></TableHead>
                      <TableHead className="w-[150px] border-x text-center"><DualText k="issues.table.issues.columns.branch" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="issues.table.issues.columns.productsCount" /></TableHead>
                      <TableHead className="w-[140px] border-x text-center"><DualText k="issues.table.issues.columns.total" /></TableHead>
                      <TableHead className="w-[180px] border-x text-center"><DualText k="issues.table.issues.columns.date" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center text-xs text-muted-foreground font-bold">
                        Branch Received / استلام الفرع
                      </TableHead>
                      <TableHead className="w-[120px] border-x text-center text-xs text-muted-foreground font-bold">
                        Warehouse Delivered / تسليم المستودع
                      </TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="issues.table.issues.columns.source" /></TableHead>
                      <TableHead className="w-[150px] border-x text-center"><DualText k="issues.table.issues.columns.notes" /></TableHead>
                      <TableHead className="text-center w-[280px] border-x"><DualText k="issues.table.issues.columns.actions" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const sorted = [...filteredIssues].sort((a, b) => {
                        const score = (i: Issue) => {
                          // 3: Pending (Highest)
                          if (!i.delivered && !i.branchReceived) return 3
                          // 2: Branch Received, Waiting Warehouse Delivery
                          if (!i.delivered && i.branchReceived) return 2
                          // 1: Delivered (Lowest)
                          return 1
                        }
                        const scoreA = score(a)
                        const scoreB = score(b)
                        if (scoreA !== scoreB) return scoreB - scoreA // Descending Score

                        // Tie-break: Date Newest
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      })

                      const limitNum = issuesLimit === "all" ? sorted.length : Number(issuesLimit || 15)
                      const limited = sorted.slice(0, limitNum)
                      return limited.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-muted-foreground">
                            <DualText k="issues.table.issues.empty" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        limited.map((issue) => {
                          // Check if issue was modified after creation (tolerance 2 seconds)
                          const created = new Date(issue.createdAt).getTime()
                          const updated = new Date(issue.updatedAt).getTime()
                          const isModified = (updated - created) > 2000

                          return (
                            <TableRow
                              key={issue.id}
                              className={`
                                ${selectedIssueIds.includes(issue.id) ? "bg-blue-50/50" : ""}
                                ${isModified && !selectedIssueIds.includes(issue.id) ? "bg-amber-50 hover:bg-amber-100/80" : ""}
                              `}
                            >
                              <TableCell className="border-x text-center">
                                <Checkbox
                                  checked={selectedIssueIds.includes(issue.id)}
                                  onCheckedChange={() => toggleSelectIssue(issue.id)}
                                />
                              </TableCell>
                              <TableCell className="font-medium border-x text-center">{getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))}</TableCell>
                              <TableCell className="border-x text-center">
                                <Badge variant="outline">{issue.branchName}</Badge>
                              </TableCell>
                              <TableCell className="border-x text-center">{formatEnglishNumber(issue.products.length)} <DualText k="common.product" /></TableCell>
                              <TableCell className="font-semibold border-x text-center">{formatEnglishNumber(issue.totalValue.toFixed(2))} <DualText k="common.currency" /></TableCell>
                              <TableCell className="border-x text-center">{formatArabicGregorianDateTime(new Date(issue.createdAt))}</TableCell>

                              {/* Branch Status Column */}
                              <TableCell className="border-x text-center">
                                {issue.branchReceived ? (
                                  <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50 flex items-center justify-center gap-1 w-fit mx-auto">
                                    <Check className="w-3 h-3" />
                                    <span>Received / تم الاستلام</span>
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-gray-100 text-gray-500 w-fit mx-auto">
                                    Pending / قيد الانتظار
                                  </Badge>
                                )}
                              </TableCell>

                              {/* Warehouse Status Column */}
                              <TableCell className="border-x text-center">
                                {issue.delivered ? (
                                  <Badge variant="default" className="bg-green-600 hover:bg-green-700 flex items-center justify-center gap-1 w-fit mx-auto">
                                    <Check className="w-3 h-3" />
                                    <span>Delivered / تم التسليم</span>
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-orange-100 text-orange-600 w-fit mx-auto">
                                    Waiting / انتظار
                                  </Badge>
                                )}
                              </TableCell>

                              <TableCell className="border-x text-center">
                                {(issue.requestId || issue.createdBy === 'branch' || /فرع/i.test(String(issue.notes || ''))) ? (
                                  <Badge variant="outline" className="text-blue-600 border-blue-600 bg-blue-50">
                                    <DualText k="issues.source.request" />
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-purple-600 border-purple-600 bg-purple-50">
                                    <DualText k="issues.source.direct" />
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground border-x text-center">
                                {issue.notes || "-"}
                              </TableCell>
                              <TableCell className="text-center border-x">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                      <span className="sr-only">Open menu</span>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel><DualText k="common.actions" /></DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handlePrintAssembly(issue)}>
                                      <Package className="mr-2 h-4 w-4" />
                                      <span><DualText k="issues.actions.assemble" /></span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <Link href={`/issues/verify?id=${issue.id}`} className="w-full cursor-pointer">
                                        <Barcode className="mr-2 h-4 w-4" />
                                        <span><DualText k="issues.verify" /></span>
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handlePrintInvoice(issue)}>
                                      <FileText className="mr-2 h-4 w-4" />
                                      <span><DualText k="issues.actions.printIssue" /></span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleEditIssue(issue)}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      <span><DualText k="common.edit" /></span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeliverDialogIssueId(issue.id)}
                                      disabled={!!issue.delivered}
                                      className={issue.delivered ? "opacity-50 cursor-not-allowed" : ""}
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      <span><DualText k="issues.status.delivered" /></span>
                                    </DropdownMenuItem>
                                    {!issue.delivered && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => handleDeleteIssue(issue)}
                                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          <span><DualText k="common.delete" /></span>
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          )
                        })
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

          {/* Smart Assembly Settings Dialog */}
          <Dialog open={isAssemblyDialogOpen} onOpenChange={setIsAssemblyDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-blue-600" />
                  <span>{getDualString('issues.actions.assemble')}</span>
                </DialogTitle>
                <DialogDescription>
                  {getDualString('issues.assembly.desc')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Selection Summary */}
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center justify-between text-sm">
                  <span className="font-medium text-blue-800">{getDualString('issues.assembly.selectedCount')}:</span>
                  <Badge variant="secondary" className="bg-blue-600 text-white border-none">
                    {selectedIssueIds.length} {getDualString('issues.metrics.operationsLabel')}
                  </Badge>
                </div>

                {/* Assembly Mode */}
                <div className="space-y-3">
                  <Label className="text-base font-bold">{getDualString('issues.assembly.mode.title')}</Label>
                  <RadioGroup
                    value={assemblySettings.mode}
                    onValueChange={(val: any) => setAssemblySettings(prev => ({ ...prev, mode: val }))}
                    className="grid grid-cols-2 gap-4"
                  >
                    <div>
                      <RadioGroupItem value="merged" id="merged" className="peer sr-only" />
                      <Label
                        htmlFor="merged"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 [&:has([data-state=checked])]:border-blue-600 cursor-pointer"
                      >
                        <Package className="mb-2 h-6 w-6" />
                        <span className="text-sm font-medium">{getDualString('issues.assembly.mode.merged')}</span>
                        <span className="text-[10px] text-muted-foreground mt-1 text-center">{getDualString('issues.assembly.mode.mergedDesc')}</span>
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="detailed" id="detailed" className="peer sr-only" />
                      <Label
                        htmlFor="detailed"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-blue-600 [&:has([data-state=checked])]:border-blue-600 cursor-pointer"
                      >
                        <FileText className="mb-2 h-6 w-6" />
                        <span className="text-sm font-medium">{getDualString('issues.assembly.mode.detailed')}</span>
                        <span className="text-[10px] text-muted-foreground mt-1 text-center">{getDualString('issues.assembly.mode.detailedDesc')}</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Display Options */}
                <div className="space-y-4 pt-2 border-t">
                  <Label className="text-base font-bold">{getDualString('issues.assembly.options.title')}</Label>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-images">{getDualString('issues.assembly.options.showImages')}</Label>
                    </div>
                    <Switch
                      id="show-images"
                      checked={assemblySettings.showImages}
                      onCheckedChange={(checked) => setAssemblySettings(prev => ({ ...prev, showImages: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-price">{getDualString('issues.assembly.options.showPrice')}</Label>
                    </div>
                    <Switch
                      id="show-price"
                      checked={assemblySettings.showPrice}
                      onCheckedChange={(checked) => setAssemblySettings(prev => ({ ...prev, showPrice: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-total">{getDualString('issues.assembly.options.showTotal')}</Label>
                    </div>
                    <Switch
                      id="show-total"
                      checked={assemblySettings.showTotal}
                      onCheckedChange={(checked) => setAssemblySettings(prev => ({ ...prev, showTotal: checked }))}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAssemblyDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={async () => {
                    const selectedIssues = issues.filter(i => selectedIssueIds.includes(i.id))
                    await generateAssemblyPDF(selectedIssues, assemblySettings)
                    setIsAssemblyDialogOpen(false)
                    setSelectedIssueIds([])
                  }}
                >
                  <Download className="ml-2 h-4 w-4" />
                  {t('common.print')}
                </Button>
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
                          <TableCell>{formatArabicGregorianDateTime(new Date(returnItem.createdAt))}</TableCell>
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
                <Button variant="outline" onClick={handlePrintAssemblyFromAggregated} className="border-blue-200 hover:bg-blue-50 text-blue-700">
                  <Package className="ml-2 h-4 w-4" />
                  <DualText k="issues.actions.assemble" />
                </Button>
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
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label={t("reports.date.start")} />
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={t("reports.date.end")} />
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
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px] border-x text-center"><DualText k="issues.invoice.table.productCode" /></TableHead>
                          <TableHead className="w-[200px] border-x text-center"><DualText k="issues.invoice.table.productName" /></TableHead>
                          {settings.showUnit && <TableHead className="w-[100px] border-x text-center"><DualText k="issues.invoice.table.unit" /></TableHead>}
                          {settings.showQuantity && <TableHead className="w-[120px] border-x text-center"><DualText k="issues.invoice.table.issuedQty" /></TableHead>}
                          {settings.showPrice && <TableHead className="w-[120px] border-x text-center"><DualText k="issues.invoice.table.unitPrice" /></TableHead>}
                          {settings.showTotal && <TableHead className="w-[140px] border-x text-center"><DualText k="issues.invoice.table.subtotal" /></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aggregatedInvoiceRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground border-x"><DualText k="issues.invoice.table.empty" /></TableCell>
                          </TableRow>
                        ) : (
                          aggregatedInvoiceRows.map((row) => {
                            const subtotalPos = row.subtotal >= 0
                            return (
                              <TableRow key={row.productId} className={row.overRequested ? "text-red-600" : undefined}>
                                <TableCell className="font-medium border-x text-center">{row.productCode}</TableCell>
                                <TableCell className="font-medium border-x text-center">{row.productName}</TableCell>
                                {settings.showUnit && <TableCell className="border-x text-center">{row.unit || '-'}</TableCell>}
                                {settings.showQuantity && <TableCell className="font-semibold border-x text-center">{formatEnglishNumber(row.quantity)}</TableCell>}
                                {settings.showPrice && <TableCell className="border-x text-center">{formatCurrency(row.unitPrice)}</TableCell>}
                                {settings.showTotal && (
                                  <TableCell className={`border-x text-center ${subtotalPos ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}`}>
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
