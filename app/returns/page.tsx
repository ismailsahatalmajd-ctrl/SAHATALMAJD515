"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { db as localDb } from "@/lib/db"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getIssues, getReturns, getProducts, getTransactions, addReturn, clearAllReturns, saveReturns, restoreReturns, approveReturn, deleteReturn, markReturnPrinted } from "@/lib/storage"
import { getBranchRequests, approveBranchRequest, setRequestStatus, updateBranchRequest, appendRequestHistory } from "@/lib/branch-request-storage"
import { syncBranchRequest } from "@/lib/sync-api"
import type { Issue, IssueProduct, Product, Return, Transaction } from "@/lib/types"
import type { BranchRequest, BranchRequestItem } from "@/lib/branch-request-types"
import { useToast } from "@/hooks/use-toast"
import {
  Search,
  Undo2,
  FileText,
  Download,
  Printer,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react"
import { generateReturnPDF } from "@/lib/return-pdf-generator"
import { generateBranchRequestPDF } from "@/lib/branch-request-pdf-generator"
import { formatArabicGregorianDate, formatArabicGregorianDateTime, downloadJSON, catalogValuationUnitPrice } from "@/lib/utils"
// Import ID generator for returns
import { formatInvoiceNumber } from "@/lib/id-generator"
import { useRef } from "react"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useAuth } from "@/components/auth-provider"
import { useReturns, useIssues, useTransactions, useBranchRequests, useProducts, batchSave, saveDocument, deleteDocument } from "@/hooks/use-firestore"
import { ProductImage } from "@/components/product-image"

type SourceType = "issue" | "purchase"

const REASON_KEYS = [
  "returns.reason.damaged",
  "returns.reason.orderError",
  "returns.reason.expired",
  "returns.reason.notMatching",
  "returns.reason.other",
] as const

const REFUND_METHODS = [
  { value: "cash", key: "returns.refund.cash" },
  { value: "wallet", key: "returns.refund.wallet" },
  { value: "bank_transfer", key: "returns.refund.bank" },
  { value: "voucher", key: "returns.refund.voucher" },
] as const

export default function ReturnsPage() {
  const { t } = useI18n()
  const settings = useInvoiceSettings()
  const { toast } = useToast()
  const { user } = useAuth()

  // Cloud Hooks
  const { data: cloudReturns } = useReturns()
  const { data: cloudIssues } = useIssues()
  const { data: cloudTransactions } = useTransactions()
  const { data: cloudBranchRequests } = useBranchRequests()
  const { data: cloudProducts } = useProducts()

  const [localReturns, setLocalReturns] = useState<Return[]>([])
  const [localIssues, setLocalIssues] = useState<Issue[]>([])
  const [localPurchases, setLocalPurchases] = useState<Transaction[]>([])
  const [localBranchRequests, setLocalBranchRequests] = useState<BranchRequest[]>([])

  // Derived State
  const returns = user ? cloudReturns : localReturns
  const issues = user ? cloudIssues : localIssues
  const purchases = user ? cloudTransactions.filter(t => t.type === 'purchase') : localPurchases
  const branchReturnRequests = user
    ? cloudBranchRequests.filter(r => r.type === "return" && r.status === "submitted")
    : localBranchRequests

  const [sourceType, setSourceType] = useState<SourceType>("purchase")
  const [selectedIssueId, setSelectedIssueId] = useState("")
  const [reasonKey, setReasonKey] = useState<typeof REASON_KEYS[number]>(REASON_KEYS[0])
  const [refundMethod, setRefundMethod] = useState<string>(REFUND_METHODS[0].value)
  const [searchTerm, setSearchTerm] = useState("")
  // بيانات العميل والفاتورة الأصلية
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState("")
  const [responsibleName, setResponsibleName] = useState("")

  // عناصر المرتجع المختارة
  const [returnItems, setReturnItems] = useState<IssueProduct[]>([])
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const processedRequestIds = useRef<Set<string>>(new Set())

  const [requestEditOpen, setRequestEditOpen] = useState(false)
  const [editingBranchRequest, setEditingBranchRequest] = useState<BranchRequest | null>(null)
  const [editRequestItems, setEditRequestItems] = useState<BranchRequestItem[]>([])
  const [editRequestNotes, setEditRequestNotes] = useState("")
  const [requestProductSearch, setRequestProductSearch] = useState("")

  const safeNumber = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const stripUndefinedDeep = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map(stripUndefinedDeep)
    }
    if (value && typeof value === "object") {
      const cleaned: Record<string, any> = {}
      Object.entries(value).forEach(([k, v]) => {
        if (v !== undefined) {
          cleaned[k] = stripUndefinedDeep(v)
        }
      })
      return cleaned
    }
    return value
  }

  useEffect(() => {
    // تحميل البيانات
    let isMounted = true
    if (user) return // Skip local load if cloud active

    const allReturns = getReturns()
    const allIssues = getIssues()
    const tx = getTransactions().filter((t) => t.type === "purchase")
    const brRequests = getBranchRequests().filter((r) => r.type === "return" && r.status === "submitted")

    if (isMounted) {
      setLocalReturns(allReturns)
      setLocalIssues(allIssues)
      setLocalPurchases(tx)
      setLocalBranchRequests(brRequests)
    }
    return () => { isMounted = false }
  }, [user])

  const filteredPurchases = useMemo(() => {
    if (!searchTerm) return purchases
    const q = searchTerm.toLowerCase()
    return purchases.filter(
      (t) => t.productName.toLowerCase().includes(q) || t.id.includes(searchTerm)
    )
  }, [purchases, searchTerm])

  const requestCatalog = useMemo(() => {
    return user ? cloudProducts ?? [] : getProducts()
  }, [user, cloudProducts])

  const requestCatalogById = useMemo(() => {
    return new Map(requestCatalog.map((product) => [product.id, product]))
  }, [requestCatalog])

  const filteredProductsForRequest = useMemo(() => {
    if (!requestProductSearch.trim()) return requestCatalog.slice(0, 40)
    const q = requestProductSearch.toLowerCase()
    return requestCatalog
      .filter(
        (p) =>
          (p.productName || "").toLowerCase().includes(q) ||
          (p.productCode || "").toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [requestCatalog, requestProductSearch])

  const [returnsSearchTerm, setReturnsSearchTerm] = useState("")
  const filteredReturns = useMemo(() => {
    if (!returnsSearchTerm) return returns
    const q = returnsSearchTerm.toLowerCase()
    return returns.filter(r =>
      r.id.toLowerCase().includes(q) ||
      (r.returnCode || "").toLowerCase().includes(q) ||
      (r.branchName || "").toLowerCase().includes(q) ||
      (r.customerPhone || "").toLowerCase().includes(q) ||
      (r.originalInvoiceNumber || "").toLowerCase().includes(q)
    )
  }, [returns, returnsSearchTerm])

  const selectedIssue = useMemo(() => issues.find((i) => i.id === selectedIssueId), [issues, selectedIssueId])

  const totalValue = useMemo(
    () => returnItems.reduce((sum, p) => sum + (p.totalPrice || p.unitPrice * p.quantity), 0),
    [returnItems]
  )

  const addPurchaseToReturn = (t: Transaction) => {
    const existingIndex = returnItems.findIndex((ri) => ri.productId === t.productId)
    const qty = Math.min(1, t.quantity) // إضافة قطعة واحدة كبداية
    const prod = requestCatalogById.get(t.productId)
    const unitPrice = catalogValuationUnitPrice(prod, t.unitPrice)
    const item: IssueProduct = {
      productId: t.productId,
      productCode: "",
      productName: t.productName,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty,
    }
    setReturnItems((prev) => {
      if (existingIndex !== -1) {
        const next = [...prev]
        const maxQty = t.quantity
        const newQty = Math.min(maxQty, next[existingIndex].quantity + 1)
        next[existingIndex].quantity = newQty
        next[existingIndex].totalPrice = newQty * next[existingIndex].unitPrice
        return next
      }
      return [...prev, item]
    })
  }

  const addIssueProductsToReturn = (issue: Issue) => {
    // يبدأ بإضافة كل المنتجات بكمية 1، ويمكن تعديلها لاحقًا
    const items = issue.products.map((p) => {
      const prod = requestCatalogById.get(p.productId)
      const unitPrice = catalogValuationUnitPrice(prod, p.unitPrice)
      const q = Math.min(1, p.quantity)
      return { ...p, unitPrice, quantity: q, totalPrice: unitPrice * q }
    })
    setReturnItems(items)
  }

  const updateItemQty = (productId: string, qty: number, maxQty?: number) => {
    setReturnItems((prev) => {
      const next = prev.map((p) =>
        p.productId === productId
          ? {
            ...p,
            quantity: Math.max(0, Math.min(maxQty ?? Number.MAX_SAFE_INTEGER, qty)),
            totalPrice: p.unitPrice * Math.max(0, Math.min(maxQty ?? Number.MAX_SAFE_INTEGER, qty)),
          }
          : p,
      )
      return next.filter((p) => p.quantity > 0)
    })
  }

  const removeItem = (productId: string) => {
    setReturnItems((prev) => prev.filter((p) => p.productId !== productId))
  }

  const openEditBranchRequest = (req: BranchRequest) => {
    const items: BranchRequestItem[] = (req.items || []).map((it) => ({
      ...it,
      id: it.id || self.crypto.randomUUID(),
    }))
    setEditingBranchRequest(req)
    setEditRequestItems(items)
    setEditRequestNotes(req.notes || "")
    setRequestProductSearch("")
    setRequestEditOpen(true)
  }

  const updateRequestItemQty = (rowId: string, qty: number) => {
    const q = Math.max(0, qty)
    setEditRequestItems((prev) =>
      prev.map((it) => {
        if ((it.id || it.productId) !== rowId) return it
        const prevReq = Math.max(0, Number(it.requestedQuantity) || 0)
        const prevBase = Number(it.quantityBase)
        const ratio =
          prevReq > 0 && Number.isFinite(prevBase) && prevBase > 0 ? prevBase / prevReq : 1
        const nextBase = prevBase > 0 && prevReq > 0 ? Math.max(0, q * ratio) : q
        return {
          ...it,
          requestedQuantity: q,
          quantity: q,
          quantityBase: nextBase,
        }
      }),
    )
  }

  const removeRequestEditItem = (rowId: string) => {
    setEditRequestItems((prev) => prev.filter((it) => (it.id || it.productId) !== rowId))
  }

  const addProductToBranchRequest = (p: Product) => {
    const exists = editRequestItems.some((it) => it.productId === p.id)
    if (exists) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("returns.request.editDuplicateProduct"),
        variant: "destructive",
      })
      return
    }
    const row: BranchRequestItem = {
      id: self.crypto.randomUUID(),
      productId: p.id,
      productCode: p.productCode || "",
      productName: p.productName,
      unit: p.unit,
      image: p.image,
      requestedQuantity: 1,
      quantity: 1,
      availableQuantity: p.currentStock,
      quantityBase: 1,
    }
    setEditRequestItems((prev) => [...prev, row])
  }

  const getRequestEditProduct = (item: BranchRequestItem) => {
    return requestCatalogById.get(item.productId)
  }

  const saveBranchRequestEdit = async () => {
    if (!editingBranchRequest || editRequestItems.length === 0) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("returns.error.addItemsFirst"),
        variant: "destructive",
      })
      return
    }
    const normalized = editRequestItems
      .map((it) => ({
        ...it,
        requestedQuantity: Math.max(0, Number(it.requestedQuantity) || 0),
        quantity: Math.max(0, Number(it.requestedQuantity) || 0),
        quantityBase:
          it.quantityBase != null
            ? Math.max(0, Number(it.quantityBase))
            : Math.max(0, Number(it.requestedQuantity) || 0),
      }))
      .filter((it) => it.requestedQuantity > 0)
    if (normalized.length === 0) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("returns.request.editNeedOneLine"),
        variant: "destructive",
      })
      return
    }
    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const histEntry = {
        id: self.crypto.randomUUID(),
        action: "updated_items" as const,
        message: "تعديل أصناف طلب المرتجع قبل التحويل لمستند",
        timestamp: now,
        actor: user?.email || "admin",
      }
      if (user) {
        await saveDocument(
          "branchRequests",
          stripUndefinedDeep({
            ...editingBranchRequest,
            items: normalized,
            notes: editRequestNotes,
            updatedAt: now,
            history: [...(editingBranchRequest.history || []), histEntry],
          }),
        )
      } else {
        updateBranchRequest(editingBranchRequest.id, {
          items: normalized,
          notes: editRequestNotes,
        })
        appendRequestHistory(editingBranchRequest.id, {
          action: "updated_items",
          message: histEntry.message,
          actor: histEntry.actor,
        })
        const refreshed = getBranchRequests().find((r) => r.id === editingBranchRequest.id)
        if (refreshed) await syncBranchRequest(refreshed).catch(console.error)
        setLocalBranchRequests(getBranchRequests().filter((r) => r.type === "return" && r.status === "submitted"))
      }
      setRequestEditOpen(false)
      setEditingBranchRequest(null)
      toast({
        title: getDualString("common.success"),
        description: getDualString("returns.request.editSaved"),
      })
    } catch (e) {
      console.error(e)
      toast({ title: getDualString("common.error"), variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePrintReturn = async (r: Return) => {
    const actor = user?.email || "local"
    const printedAt = new Date().toISOString()
    try {
      if (user) {
        await saveDocument(
          "returns",
          stripUndefinedDeep({
            ...r,
            printedAt,
            printedBy: actor,
            updatedAt: printedAt,
          }),
        )
        await generateReturnPDF({ ...r, printedAt, printedBy: actor })
      } else {
        const stamped = await markReturnPrinted(r.id, actor)
        const forPdf = stamped ?? { ...r, printedAt, printedBy: actor }
        await generateReturnPDF(forPdf)
        setLocalReturns(getReturns())
      }
    } catch (e) {
      console.error(e)
      toast({ title: getDualString("common.error"), variant: "destructive" })
    }
  }

  const handleDeleteReturn = async (r: Return) => {
    if (!confirm(getDualString("returns.delete.confirm"))) return
    setIsSubmitting(true)
    try {
      if (user) {
        if (r.requestId) {
          const req = (cloudBranchRequests || []).find((x) => x.id === r.requestId)
          if (req) {
            await saveDocument("branchRequests", {
              ...req,
              status: "submitted",
              updatedAt: new Date().toISOString(),
            })
          }
        }
        await deleteDocument("returns", r.id)
      } else {
        await deleteReturn(r.id, "admin")
        setLocalReturns(getReturns())
        setLocalBranchRequests(getBranchRequests().filter((br) => br.type === "return" && br.status === "submitted"))
      }
      toast({ title: getDualString("common.success") })
    } catch (e) {
      console.error(e)
      toast({ title: getDualString("common.error"), variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReceiveReturn = async (r: Return) => {
    if (isSubmitting || submittingRef.current) return
    const opRequestId = self.crypto.randomUUID()
    setIsSubmitting(true)
    submittingRef.current = true
    try {
      await localDb.operationRequests.put({
        id: opRequestId,
        operationType: "return_receive",
        status: "pending",
        payload: { returnId: r.id },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any)
      const ok = await approveReturn(r.id, user?.email || "admin")
      await localDb.operationRequests.update(opRequestId, {
        status: ok ? "synced" : "failed",
        entityId: r.id,
        updatedAt: new Date().toISOString(),
      } as any)
      if (!user) setLocalReturns(getReturns())
      if (ok) {
        toast({ title: getDualString("common.success"), description: getDualString("returns.receive.success") })
      }
    } catch (e) {
      console.error(e)
      try {
        await localDb.operationRequests.update(opRequestId, {
          status: "failed",
          error: e instanceof Error ? e.message : "receive_failed",
          updatedAt: new Date().toISOString(),
        } as any)
      } catch {
        /* ignore */
      }
      toast({ title: getDualString("common.error"), variant: "destructive" })
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting || submittingRef.current) return
    if (returnItems.length === 0) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("returns.error.addItemsFirst"),
        variant: "destructive"
      })
      return
    }

    if (!reasonKey) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("returns.enterReason"),
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)
    submittingRef.current = true
    const opRequestId = self.crypto.randomUUID()
    try {
      await localDb.operationRequests.put({
        id: opRequestId,
        operationType: "return",
        status: "pending",
        payload: { sourceType, itemsCount: returnItems.length, selectedIssueId },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any)
      // تجهيز البيانات
      const payload: Omit<Return, "id" | "createdAt"> = {
        sourceType,
        issueId: sourceType === "issue" ? selectedIssueId : "",
        sourceTransactionId: sourceType === "purchase" ? "multiple" : "",
        branchId: selectedIssue?.branchId ?? "main",
        branchName: selectedIssue?.branchName ?? "الرئيسي",
        products: returnItems,
        totalValue: totalValue,
        reason: t(reasonKey, reasonKey),
        refundMethod: sourceType === "purchase" ? (refundMethod as Return["refundMethod"]) : "cash", // Fallback to cash or omit
        status: "pending",
        customerPhone: customerPhone || "",
        originalInvoiceNumber: originalInvoiceNumber || "",
        responsibleName: responsibleName || "",
      }

      const newReturn = await addReturn(payload)
      await localDb.operationRequests.update(opRequestId, {
        status: "synced",
        entityId: newReturn.id,
        updatedAt: new Date().toISOString()
      } as any)
      if (!user) setLocalReturns(getReturns())

      toast({
        title: getDualString("common.success"),
        description: getDualString("returns.createdPending"),
        duration: 3000
      })

      // إعادة تعيين النموذج
      setReturnItems([])
      setSelectedIssueId("")
      setReasonKey(REASON_KEYS[0])
      setRefundMethod(REFUND_METHODS[0].value)
      setCustomerPhone("")
      setOriginalInvoiceNumber("")
      setResponsibleName("")
    } catch (error) {
      console.error('Error creating return:', error)
      await localDb.operationRequests.update(opRequestId, {
        status: "failed",
        error: error instanceof Error ? error.message : "return_submit_failed",
        updatedAt: new Date().toISOString()
      } as any)
      toast({
        title: getDualString("common.error"),
        description: "فشل إنشاء المرتجع",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleApproveRequest = async (req: BranchRequest) => {
    // [IDEMPOTENCY GUARD]
    if (isSubmitting || submittingRef.current || processedRequestIds.current.has(req.id)) {
      console.warn("⚠️ Request approval already in progress for:", req.id)
      return
    }

    console.log("🚀 Starting Approval for Branch Return Request:", req.requestNumber)
    setIsSubmitting(true)
    submittingRef.current = true

    try {
      if (user) {
        // Cloud
        const returnProducts = req.items.map((it) => {
          const p = cloudProducts.find((x) => x.id === it.productId || x.productCode === it.productCode)
          const unitPrice = catalogValuationUnitPrice(p, 0)
          const quantityCarton = Math.max(0, it.requestedQuantity || it.quantity || 0)
          const finalQuantity = (it as any).quantityBase || quantityCarton

          return {
            productId: p?.id || it.productId,
            productCode: p?.productCode || it.productCode,
            productName: p?.productName || it.productName,
            quantity: finalQuantity,
            unitPrice,
            totalPrice: unitPrice * finalQuantity,
            image: p?.image || it.image || "",
            currentStock: p?.currentStock ?? 0,
            unit: p?.unit || it.unit || "",
            quantityBase: (it as any).quantityBase
          }
        })

        const totalValue = returnProducts.reduce((sum, x) => sum + x.totalPrice, 0)
        const returnId = Date.now().toString()
        // Generate Return Receipt Code (Global)
        const returnCode = await formatInvoiceNumber("RR", req.branchId)

        const newReturn = {
          id: returnId,
          returnCode,
          requestCode: req.requestNumber,
          requestId: req.id,
          branchId: req.branchId,
          branchName: req.branchName,
          products: returnProducts,
          totalValue,
          reason: req.notes || "مرتجع من الفرع (طلب)",
          sourceType: "issue" as const,
          issueId: "",
          status: "pending" as const,
          refundMethod: "cash" as const,
          customerPhone: "",
          originalInvoiceNumber: "",
          responsibleName: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const ops: any[] = [
          { collection: "returns", data: stripUndefinedDeep(newReturn), type: "set" },
          {
            collection: "branchRequests",
            data: stripUndefinedDeep({
              ...req,
              status: "approved",
              approvedBy: user?.email || "admin",
              updatedAt: new Date().toISOString(),
            }),
            type: "update",
          },
        ]

        await batchSave(ops)
        processedRequestIds.current.add(req.id)

        // Optimistic UI Update: إخفاء الطلب فوراً من القائمة
        setLocalBranchRequests(prev => prev.filter(r => r.id !== req.id))
      } else {
        // Local
        const res = await approveBranchRequest(req.id, "admin")
        if (res.approved) {
          setLocalBranchRequests(prev => prev.filter(r => r.id !== req.id))
          setLocalReturns(getReturns())
        }
      }

      toast({
        title: getDualString("common.success"),
        description: getDualString("returns.request.approved")
      })
    } catch (error: any) {
      console.error("❌ Approval Error:", error)
      toast({
        title: getDualString("common.error"),
        description: "فشل في قبول المرتجع: " + error.message,
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleRejectRequest = async (req: BranchRequest) => {
    if (isSubmitting || submittingRef.current || processedRequestIds.current.has(req.id)) return
    
    setIsSubmitting(true)
    submittingRef.current = true

    try {
      if (user) {
        // Cloud
        await saveDocument("branchRequests", { ...req, status: "cancelled", rejectedBy: "admin", updatedAt: new Date().toISOString() })

        // Optimistic UI Update: إخفاء الطلب فوراً من القائمة
        setLocalBranchRequests(prev => prev.filter(r => r.id !== req.id))
      } else {
        // Local
        setRequestStatus(req.id, "cancelled", "admin")
        setLocalBranchRequests(prev => prev.filter(r => r.id !== req.id))
      }
      toast({
        title: getDualString("common.success"),
        description: getDualString("returns.request.rejected")
      })
    } catch (error) {
       console.error("Reject Error:", error)
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleBackupReturns = () => {
    downloadJSON(returns, `returns-backup-${new Date().toISOString().split('T')[0]}`)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRestoreReturns = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        if (Array.isArray(json)) {
          await restoreReturns(json)
          setLocalReturns(getReturns())
          toast({ title: getDualString("common.success"), description: getDualString("issues.toast.restoreSuccess") })
        } else {
          toast({ title: getDualString("common.error"), description: getDualString("issues.toast.restoreErrorFile"), variant: "destructive" })
        }
      } catch (err) {
        toast({ title: getDualString("common.error"), description: getDualString("issues.toast.restoreErrorRead"), variant: "destructive" })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleFactoryResetReturns = async () => {
    if (confirm(getDualString("sync.hardResetConfirm"))) {
      await clearAllReturns()
      setLocalReturns([])
      toast({ title: getDualString("common.success"), description: getDualString("common.success") })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold"><DualText k="returns.title" /></h1>
              <p className="text-muted-foreground"><DualText k="returns.subtitle" /></p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleRestoreReturns} />
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title={t("common.restore", "استعادة")}>
                <Undo2 className="h-4 w-4 rotate-180" style={{ transform: 'scaleX(-1)' }} />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleBackupReturns} title={t("common.backup", "نسخ احتياطي")}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleFactoryResetReturns} title={t("common.reset", "استعادة ضبط المصنع")} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                <Undo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Branch Return Requests Section */}
          {branchReturnRequests.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <CardHeader>
                <CardTitle className="text-orange-700 flex items-center gap-2">
                  <Undo2 className="h-5 w-5" />
                  <DualText k="returns.requests.title" fallback="طلبات استرجاع من الفروع" />
                  <Badge variant="secondary" className="bg-orange-200 text-orange-800 hover:bg-orange-300">
                    {branchReturnRequests.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px] border-x text-center font-bold text-blue-600">رقم العملية (Op No)</TableHead>
                        <TableHead className="w-[150px] border-x text-center font-bold">نوع العملية (Type)</TableHead>
                        <TableHead className="w-[100px] border-x text-center"><DualText k="returns.request.branch" fallback="الفرع" /></TableHead>
                        <TableHead className="w-[80px] border-x text-center"><DualText k="returns.request.itemsCount" fallback="عدد العناصر" /></TableHead>
                        <TableHead className="w-[150px] border-x text-center"><DualText k="returns.request.notes" fallback="ملاحظات" /></TableHead>
                        <TableHead className="w-[180px] border-x text-center"><DualText k="returns.request.date" fallback="التاريخ" /></TableHead>
                        <TableHead className="text-center w-[100px] border-x"><DualText k="common.actions" fallback="الإجراءات" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchReturnRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground border-x">
                            <DualText k="returns.request.empty" fallback="لا توجد طلبات" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        branchReturnRequests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium border-x text-center font-mono text-blue-600" dir="ltr">{req.requestNumber || req.id.slice(0, 8)}</TableCell>
                            <TableCell className="border-x text-center">
                              <Badge variant="secondary">طلب مرتجع (Return Request)</Badge>
                            </TableCell>
                            <TableCell className="font-medium border-x text-center">{req.branchName}</TableCell>
                            <TableCell className="border-x text-center">{req.items.length}</TableCell>
                            <TableCell className="text-muted-foreground border-x text-center">{req.notes || "-"}</TableCell>
                            <TableCell className="border-x text-center">{formatArabicGregorianDateTime(new Date(req.createdAt))}</TableCell>
                            <TableCell className="text-center border-x flex flex-wrap justify-center gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openEditBranchRequest(req)}
                                disabled={isSubmitting}
                              >
                                <Pencil className="h-4 w-4 ml-1" />
                                <DualText k="returns.request.editButton" fallback="تعديل" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={async () => await generateBranchRequestPDF(req)} title={t("common.print", "طباعة")}>
                                <Printer className="h-4 w-4" />
                              </Button>
                                <Button size="sm" onClick={() => handleApproveRequest(req)} className="bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DualText k="returns.request.convertButton" fallback="تحويل لمستند مرتجع" />}
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleRejectRequest(req)} disabled={isSubmitting}>
                                <DualText k="common.reject" fallback="رفض" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )
          }

          <Card>
            <CardHeader>
              <CardTitle><DualText k="returns.create.title" /></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label><DualText k="returns.source.label" /></Label>
                  <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("returns.source.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase"><DualText k="returns.source.purchase" /></SelectItem>
                      <SelectItem value="issue"><DualText k="returns.source.issue" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label><DualText k="returns.reason.label" /></Label>
                  <Select value={reasonKey} onValueChange={(v) => setReasonKey(v as typeof REASON_KEYS[number])}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("returns.reason.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_KEYS.map((rk) => (
                        <SelectItem key={rk} value={rk}><DualText k={rk} /></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {sourceType === "purchase" && (
                  <div>
                    <Label><DualText k="returns.refundMethod.label" /></Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("returns.refundMethod.placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {REFUND_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}><DualText k={m.key} /></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label><DualText k="returns.customer.phone" /></Label>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="05xxxxxxxx" />
                </div>
                <div>
                  <Label><DualText k="returns.originalInvoice" /></Label>
                  <Input value={originalInvoiceNumber} onChange={(e) => setOriginalInvoiceNumber(e.target.value)} placeholder="#INV-000123" />
                </div>
                <div>
                  <Label><DualText k="returns.responsible" /></Label>
                  <Input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder={t("returns.responsible.placeholder")} />
                </div>
              </div>

              {sourceType === "issue" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label><DualText k="returns.issue.label" /></Label>
                    <Select value={selectedIssueId} onValueChange={(v) => {
                      setSelectedIssueId(v)
                      const iss = issues.find((i) => i.id === v)
                      if (iss) addIssueProductsToReturn(iss)
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("returns.issue.placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {issues.map((issue) => (
                          <SelectItem key={issue.id} value={issue.id}>
                            #{issue.invoiceNumber || issue.id.slice(-6)} - {issue.branchName} ({issue.totalValue.toFixed(2)} {t("common.currency")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedIssue && (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead><DualText k="returns.items.product" /></TableHead>
                            {settings.showQuantity && <TableHead><DualText k="returns.items.issuedQty" /></TableHead>}
                            {settings.showQuantity && <TableHead><DualText k="returns.items.returnQty" /></TableHead>}
                            {settings.showPrice && <TableHead><DualText k="returns.items.unitPrice" /></TableHead>}
                            {settings.showTotal && <TableHead><DualText k="returns.items.total" /></TableHead>}
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {returnItems.map((p) => (
                            <TableRow key={p.productId}>
                              <TableCell className="font-medium">{p.productName}</TableCell>
                              {settings.showQuantity && (
                                <TableCell className="text-muted-foreground">
                                  {selectedIssue.products.find((x) => x.productId === p.productId)?.quantity}
                                </TableCell>
                              )}
                              {settings.showQuantity && (
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="any"
                                    min={0}
                                    max={selectedIssue.products.find((x) => x.productId === p.productId)?.quantity || 0}
                                    value={p.quantity}
                                    onChange={(e) =>
                                      updateItemQty(
                                        p.productId,
                                        Number(e.target.value),
                                        selectedIssue.products.find((x) => x.productId === p.productId)?.quantity || 0,
                                      )
                                    }
                                  />
                                </TableCell>
                              )}
                              {settings.showPrice && <TableCell>{safeNumber(p.unitPrice).toFixed(2)} <DualText k="common.currency" /></TableCell>}
                              {settings.showTotal && <TableCell className="font-semibold">{(safeNumber(p.unitPrice) * safeNumber(p.quantity)).toFixed(2)} <DualText k="common.currency" /></TableCell>}
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => removeItem(p.productId)}>
                                  <DualText k="common.delete" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label><DualText k="returns.pickFromPurchases" /></Label>
                    <div className="relative w-64">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t("returns.search.productPlaceholder")} className="pr-10" />
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead><DualText k="purchases.table.operation" /></TableHead>
                          <TableHead><DualText k="purchases.table.product" /></TableHead>
                          {settings.showQuantity && <TableHead><DualText k="purchases.table.quantity" /></TableHead>}
                          {settings.showPrice && <TableHead><DualText k="purchases.table.unitPrice" /></TableHead>}
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchases.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-medium">#{tx.id.slice(-6)}</TableCell>
                            <TableCell>{tx.productName}</TableCell>
                            {settings.showQuantity && <TableCell>{tx.quantity}</TableCell>}
                            {settings.showPrice && <TableCell>{safeNumber(tx.unitPrice).toFixed(2)} <DualText k="common.currency" /></TableCell>}
                            <TableCell className="text-left">
                              <Button size="sm" variant="outline" onClick={() => addPurchaseToReturn(tx)}>
                                <DualText k="common.add" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {returnItems.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead><DualText k="returns.items.product" /></TableHead>
                            {settings.showQuantity && <TableHead><DualText k="returns.items.returnQty" /></TableHead>}
                            {settings.showPrice && <TableHead><DualText k="returns.items.unitPrice" /></TableHead>}
                            {settings.showTotal && <TableHead><DualText k="returns.items.total" /></TableHead>}
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {returnItems.map((p) => {
                            const purchase = purchases.find((tx) => tx.productId === p.productId)
                            const maxQty = purchase?.quantity ?? Number.MAX_SAFE_INTEGER
                            return (
                              <TableRow key={p.productId}>
                                <TableCell className="font-medium">{p.productName}</TableCell>
                                {settings.showQuantity && (
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="any"
                                      min={0}
                                      max={maxQty}
                                      value={p.quantity}
                                      onChange={(e) => updateItemQty(p.productId, Number(e.target.value), maxQty)}
                                    />
                                  </TableCell>
                                )}
                                {settings.showPrice && <TableCell>{safeNumber(p.unitPrice).toFixed(2)} <DualText k="common.currency" /></TableCell>}
                                {settings.showTotal && <TableCell className="font-semibold">{(safeNumber(p.unitPrice) * safeNumber(p.quantity)).toFixed(2)} <DualText k="common.currency" /></TableCell>}
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => removeItem(p.productId)}>
                                    <DualText k="common.delete" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Undo2 className="h-4 w-4" />
                  <span><DualText k="returns.total" /></span>
                  {settings.showTotal && <span className="font-semibold text-foreground">{totalValue.toFixed(2)} <DualText k="common.currency" /></span>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setReturnItems([])}><DualText k="returns.reset" /></Button>
                  <Button onClick={handleSubmit}><DualText k="returns.create.button" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <CardTitle><DualText k="returns.history.title" /></CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={returnsSearchTerm} onChange={(e) => setReturnsSearchTerm(e.target.value)} placeholder={t("returns.history.search.placeholder")} className="pr-10" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px] border-x text-center font-bold text-blue-600">رقم العملية (Op No)</TableHead>
                      <TableHead className="w-[120px] border-x text-center font-bold">نوع العملية (Type)</TableHead>
                      <TableHead className="w-[100px] border-x text-center"><DualText k="returns.history.columns.source" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="returns.history.columns.phone" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="returns.history.columns.originalInvoice" /></TableHead>
                      <TableHead className="w-[100px] border-x text-center"><DualText k="returns.history.columns.branch" /></TableHead>
                      <TableHead className="w-[80px] border-x text-center"><DualText k="returns.history.columns.itemsCount" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="returns.history.columns.value" /></TableHead>
                      <TableHead className="w-[150px] border-x text-center"><DualText k="returns.history.columns.reason" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="returns.history.columns.method" /></TableHead>
                      <TableHead className="w-[100px] border-x text-center"><DualText k="returns.history.columns.status" /></TableHead>
                      <TableHead className="w-[180px] border-x text-center"><DualText k="returns.history.columns.date" /></TableHead>
                      <TableHead className="min-w-[260px] border-x text-center"><DualText k="returns.history.columns.actions" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground border-x"><DualText k="issues.table.returns.empty" /></TableCell>
                      </TableRow>
                    ) : (
                      filteredReturns.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium border-x text-center font-mono text-blue-600" dir="ltr">{r.returnCode || r.returnNumber || `RR-OLD-${r.id.slice(-6)}`}</TableCell>
                          <TableCell className="border-x text-center">
                            <Badge variant="outline">استلام مرتجع (Return Receipt)</Badge>
                          </TableCell>
                          <TableCell className="border-x text-center">
                            <Badge variant="outline">{r.sourceType === "purchase" ? <DualText k="purchases.title" /> : <DualText k="issues.issueProducts" />}</Badge>
                          </TableCell>
                          <TableCell className="border-x text-center">{r.customerPhone || '-'}</TableCell>
                          <TableCell className="border-x text-center">{r.originalInvoiceNumber || '-'}</TableCell>
                          <TableCell className="border-x text-center">{r.branchName}</TableCell>
                          <TableCell className="border-x text-center">{r.products.length}</TableCell>
                          <TableCell className="font-semibold border-x text-center">{r.totalValue.toFixed(2)} <DualText k="common.currency" /></TableCell>
                          <TableCell className="text-muted-foreground border-x text-center"><DualText k={r.reason} /></TableCell>
                          <TableCell className="border-x text-center">{r.refundMethod ? <DualText k={REFUND_METHODS.find(m => m.value === r.refundMethod)?.key || "common.unknown"} /> : "-"}</TableCell>
                          <TableCell className="border-x text-center">
                            <Badge variant="outline">
                              {r.status === "pending" ? (
                                <DualText k="returns.status.awaitingReceipt" />
                              ) : (
                                <DualText k={`returns.status.${r.status || "pending"}`} />
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="border-x text-center">{formatArabicGregorianDateTime(new Date(r.createdAt))}</TableCell>
                          <TableCell className="text-center border-x">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {r.status === "pending" && (
                                <>
                                  <Button size="sm" variant="destructive" onClick={() => handleDeleteReturn(r)} disabled={isSubmitting}>
                                    <Trash2 className="ml-1 h-3 w-3" />
                                    <DualText k="common.delete" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handlePrintReturn(r)} disabled={isSubmitting}>
                                    <FileText className="ml-1 h-3 w-3" />
                                    <DualText k="returns.invoice.button" />
                                  </Button>
                                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleReceiveReturn(r)} disabled={isSubmitting}>
                                    <DualText k="returns.receive.button" />
                                  </Button>
                                </>
                              )}
                              {r.status !== "pending" && (
                                <Button size="sm" variant="outline" onClick={() => handlePrintReturn(r)} disabled={isSubmitting}>
                                  <FileText className="ml-1 h-3 w-3" />
                                  <DualText k="returns.invoice.button" />
                                </Button>
                              )}
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

          <Dialog open={requestEditOpen} onOpenChange={setRequestEditOpen}>
            <DialogContent className="!w-[98vw] !sm:w-[95vw] !md:w-[92vw] !lg:w-[90vw] !xl:w-[88vw] !max-w-[1450px] max-h-[95vh] overflow-y-auto p-6">
              <DialogHeader>
                <DialogTitle className="text-xl">
                  <DualText k="returns.request.editTitle" fallback="تعديل طلب المرتجع" />
                  {editingBranchRequest?.requestNumber ? (
                    <span className="block text-sm font-normal text-muted-foreground font-mono" dir="ltr">
                      {editingBranchRequest.requestNumber}
                    </span>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                <DualText k="returns.request.editHint" fallback="عدّل الأصناف ثم احفظ، وبعدها استخدم «تحويل لمستند مرتجع»." />
              </p>
              <div className="space-y-5 py-2">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">
                      {t("bulkIssue.branch", "الفرع")}
                    </div>
                    <div className="mt-1 text-lg font-semibold">{editingBranchRequest?.branchName || "-"}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {editingBranchRequest?.branchId || ""}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">
                      {t("returns.productsCount", "عدد الأصناف")}
                    </div>
                    <div className="mt-2 text-2xl font-bold">{editRequestItems.length}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">
                      {t("returns.request.editQty", "إجمالي الكمية")}
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      {editRequestItems.reduce((sum, item) => sum + (Number(item.requestedQuantity) || 0), 0)}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label><DualText k="returns.request.notes" fallback="ملاحظات" /></Label>
                  <Textarea value={editRequestNotes} onChange={(e) => setEditRequestNotes(e.target.value)} rows={3} className="bg-white" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label><DualText k="returns.request.editAddProduct" fallback="إضافة صنف من المخزن" /></Label>
                    <span className="text-xs text-muted-foreground">
                      {filteredProductsForRequest.length} {t("common.product", "منتج")}
                    </span>
                  </div>
                  <Input
                    value={requestProductSearch}
                    onChange={(e) => setRequestProductSearch(e.target.value)}
                    placeholder={t("returns.search.productPlaceholder")}
                    className="pr-10 bg-white"
                  />
                  <div className="max-h-56 overflow-y-auto rounded-xl border bg-white text-sm">
                    {filteredProductsForRequest.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b px-3 py-2 text-right hover:bg-muted"
                        onClick={() => addProductToBranchRequest(p)}
                      >
                        <ProductImage
                          product={{ id: p.id, image: p.image, productName: p.productName }}
                          className="h-10 w-10 rounded-md border bg-muted"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.productName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{p.productCode || "-"}</div>
                        </div>
                        <div className="shrink-0 text-left">
                          <div className="text-xs text-muted-foreground">{t("common.available", "المتوفر")}</div>
                          <div className="font-semibold text-emerald-600">{p.currentStock ?? 0}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px] text-center">#</TableHead>
                        <TableHead className="w-[72px] text-center"><DualText k="common.image" fallback="الصورة" /></TableHead>
                        <TableHead><DualText k="returns.items.product" /></TableHead>
                        <TableHead className="w-[120px] text-center"><DualText k="common.available" fallback="المتوفر" /></TableHead>
                        <TableHead className="w-[120px]"><DualText k="returns.request.editQty" fallback="الكمية" /></TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editRequestItems.map((it, index) => {
                        const rowId = it.id || it.productId
                        const catalogProduct = getRequestEditProduct(it)
                        const availableQty = Number(it.availableQuantity ?? catalogProduct?.currentStock ?? 0)
                        const image = it.image || catalogProduct?.image
                        return (
                          <TableRow key={rowId}>
                            <TableCell className="text-center font-medium">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex justify-center">
                                <ProductImage
                                  product={{ id: it.productId, image, productName: it.productName }}
                                  className="h-10 w-10 rounded-md border bg-muted"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="font-medium align-top">
                              <div>{it.productName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{it.productCode || catalogProduct?.productCode || "-"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{it.unit || catalogProduct?.unit || "-"}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={availableQty > 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
                                {availableQty}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="any"
                                min={0}
                                value={it.requestedQuantity}
                                className="bg-white font-semibold"
                                onChange={(e) => updateRequestItemQty(rowId, Number(e.target.value))}
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" type="button" onClick={() => removeRequestEditItem(rowId)}>
                                <DualText k="common.delete" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" type="button" onClick={() => setRequestEditOpen(false)}>
                  <DualText k="common.cancel" />
                </Button>
                <Button type="button" onClick={() => void saveBranchRequestEdit()} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DualText k="returns.request.editSave" fallback="حفظ الطلب" />}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div >
      </main >
    </div >
  )
}

function statusLabel(s: NonNullable<Return["status"]>, t?: (key: string, fallback?: string) => string) {
  const map: Record<string, string> = {
    pending: t ? t("returns.status.pending", "قيد المعالجة") : "قيد المعالجة",
    approved: t ? t("returns.status.approved", "موافق عليه") : "موافق عليه",
    rejected: t ? t("returns.status.rejected", "مرفوض") : "مرفوض",
    completed: t ? t("returns.status.completed", "مكتمل") : "مكتمل",
  }
  return map[s] ?? s
}
