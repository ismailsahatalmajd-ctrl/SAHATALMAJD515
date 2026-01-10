"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getIssues, getReturns, getTransactions, addReturn, clearAllReturns, saveReturns, restoreReturns, approveReturn } from "@/lib/storage"
import { getBranchRequests, approveBranchRequest, setRequestStatus } from "@/lib/branch-request-storage"
import type { Issue, IssueProduct, Return, Transaction } from "@/lib/types"
import type { BranchRequest } from "@/lib/branch-request-types"
import { useToast } from "@/hooks/use-toast"
import { Search, Undo2, FileText, Download, Printer } from "lucide-react"
import { generateReturnPDF } from "@/lib/return-pdf-generator"
import { generateBranchRequestPDF } from "@/lib/branch-request-pdf-generator"
import { formatArabicGregorianDate, downloadJSON } from "@/lib/utils"
import { useRef } from "react"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useAuth } from "@/components/auth-provider"
import { useReturns, useIssues, useTransactions, useBranchRequests, useProducts, saveDocument, batchSave } from "@/hooks/use-firestore"

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

  const [returnsSearchTerm, setReturnsSearchTerm] = useState("")
  const filteredReturns = useMemo(() => {
    if (!returnsSearchTerm) return returns
    const q = returnsSearchTerm.toLowerCase()
    return returns.filter(r =>
      r.id.toLowerCase().includes(q) ||
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
    const item: IssueProduct = {
      productId: t.productId,
      productCode: "",
      productName: t.productName,
      quantity: qty,
      unitPrice: t.unitPrice,
      totalPrice: t.unitPrice * qty,
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
    const items = issue.products.map((p) => ({
      ...p,
      quantity: Math.min(1, p.quantity),
      totalPrice: p.unitPrice * Math.min(1, p.quantity),
    }))
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

  const handleSubmit = async () => {
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

    // تجهيز البيانات
    const payload: Omit<Return, "id" | "createdAt"> = {
      sourceType,
      issueId: sourceType === "issue" ? selectedIssueId : undefined,
      sourceTransactionId: sourceType === "purchase" ? "multiple" : undefined,
      branchId: selectedIssue?.branchId ?? "main",
      branchName: selectedIssue?.branchName ?? "الرئيسي",
      products: returnItems,
      totalValue: totalValue,
      reason: t(reasonKey, reasonKey),
      refundMethod: sourceType === "purchase" ? (refundMethod as Return["refundMethod"]) : undefined,
      status: "pending",
      customerPhone: customerPhone || undefined,
      originalInvoiceNumber: originalInvoiceNumber || undefined,
      responsibleName: responsibleName || undefined,
    }

    if (user) {
      // Cloud
      const returnId = Date.now().toString()
      const newReturn = { ...payload, id: returnId, createdAt: new Date().toISOString() }
      await saveDocument("returns", newReturn)
    } else {
      // Local
      addReturn(payload)
      setLocalReturns(getReturns())
    }

    toast({
      title: getDualString("common.success"),
      description: getDualString("returns.added"),
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
  }

  const handleApproveRequest = async (req: BranchRequest) => {
    if (user) {
      // Cloud
      const returnProducts = req.items.map((it) => {
        const p = cloudProducts.find((x) => x.id === it.productId || x.productCode === it.productCode)
        const unitPrice = p?.averagePrice ?? p?.price ?? 0
        const quantity = Math.max(0, Math.floor(it.requestedQuantity || it.quantity || 0))

        return {
          productId: p?.id || it.productId,
          productCode: p?.productCode || it.productCode,
          productName: p?.productName || it.productName,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
          image: p?.image || it.image || "",
          currentStock: p?.currentStock ?? 0,
          unit: p?.unit || it.unit || "",
        }
      })

      const totalValue = returnProducts.reduce((sum, x) => sum + x.totalPrice, 0)
      const returnId = Date.now().toString()

      const newReturn = {
        id: returnId,
        branchId: req.branchId,
        branchName: req.branchName,
        products: returnProducts,
        totalValue,
        reason: req.notes || "مرتجع من الفرع (طلب)",
        sourceType: "issue",
        status: "approved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Prepare Batch Operations
      const ops: any[] = [
        { collection: "returns", data: newReturn, type: "set" },
        { collection: "branchRequests", data: { ...req, status: "approved", approvedBy: "admin", updatedAt: new Date().toISOString() }, type: "update" }
      ]

      // Add Product Stock Adjustments (Atomic Increments)
      const { doc, updateDoc, increment } = await import("firebase/firestore");
      const { db: firestore } = await import("@/lib/firebase");

      if (firestore) {
        for (const p of returnProducts) {
          const productRef = doc(firestore, "products", p.productId);
          await updateDoc(productRef, {
            currentStock: increment(p.quantity),
            issues: increment(-p.quantity),
            issuesValue: increment(-p.totalPrice)
          }).catch(console.error);
        }
      }

      await batchSave(ops)
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
  }

  const handleRejectRequest = async (req: BranchRequest) => {
    if (user) {
      // Cloud
      await saveDocument("branchRequests", { ...req, status: "cancelled", rejectedBy: "admin", updatedAt: new Date().toISOString() })
    } else {
      // Local
      setRequestStatus(req.id, "cancelled", "admin")
      setLocalBranchRequests(prev => prev.filter(r => r.id !== req.id))
    }
    toast({
      title: getDualString("common.success"),
      description: getDualString("returns.request.rejected")
    })
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><DualText k="returns.request.branch" fallback="الفرع" /></TableHead>
                        <TableHead><DualText k="returns.request.items" fallback="عدد الأصناف" /></TableHead>
                        <TableHead><DualText k="returns.request.notes" fallback="ملاحظات" /></TableHead>
                        <TableHead><DualText k="returns.request.date" fallback="تاريخ الطلب" /></TableHead>
                        <TableHead className="text-right"><DualText k="common.actions" fallback="الإجراءات" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchReturnRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.branchName}</TableCell>
                          <TableCell>{req.items.length}</TableCell>
                          <TableCell className="text-muted-foreground">{req.notes || "-"}</TableCell>
                          <TableCell>{formatArabicGregorianDate(new Date(req.createdAt))}</TableCell>
                          <TableCell className="text-right space-x-2 rtl:space-x-reverse">
                            <Button size="sm" variant="outline" onClick={async () => await generateBranchRequestPDF(req)} title={t("common.print", "طباعة")}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button size="sm" onClick={() => handleApproveRequest(req)} className="bg-green-600 hover:bg-green-700">
                              <DualText k="common.approve" fallback="قبول" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRejectRequest(req)}>
                              <DualText k="common.reject" fallback="رفض" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

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
                              {settings.showPrice && <TableCell>{p.unitPrice.toFixed(2)} <DualText k="common.currency" /></TableCell>}
                              {settings.showTotal && <TableCell className="font-semibold">{(p.unitPrice * p.quantity).toFixed(2)} <DualText k="common.currency" /></TableCell>}
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
                            {settings.showPrice && <TableCell>{tx.unitPrice.toFixed(2)} <DualText k="common.currency" /></TableCell>}
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
                                      min={0}
                                      max={maxQty}
                                      value={p.quantity}
                                      onChange={(e) => updateItemQty(p.productId, Number(e.target.value), maxQty)}
                                    />
                                  </TableCell>
                                )}
                                {settings.showPrice && <TableCell>{p.unitPrice.toFixed(2)} <DualText k="common.currency" /></TableCell>}
                                {settings.showTotal && <TableCell className="font-semibold">{(p.unitPrice * p.quantity).toFixed(2)} <DualText k="common.currency" /></TableCell>}
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><DualText k="returns.history.columns.returnNo" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.source" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.phone" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.originalInvoice" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.branch" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.itemsCount" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.value" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.reason" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.method" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.status" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.date" /></TableHead>
                      <TableHead><DualText k="returns.history.columns.print" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground"><DualText k="issues.table.returns.empty" /></TableCell>
                      </TableRow>
                    ) : (
                      filteredReturns.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">#{r.id.slice(-6)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.sourceType === "purchase" ? <DualText k="purchases.title" /> : <DualText k="issues.issueProducts" />}</Badge>
                          </TableCell>
                          <TableCell>{r.customerPhone || '-'}</TableCell>
                          <TableCell>{r.originalInvoiceNumber || '-'}</TableCell>
                          <TableCell>{r.branchName}</TableCell>
                          <TableCell>{r.products.length}</TableCell>
                          <TableCell className="font-semibold">{r.totalValue.toFixed(2)} <DualText k="common.currency" /></TableCell>
                          <TableCell className="text-muted-foreground"><DualText k={r.reason} /></TableCell>
                          <TableCell>{r.refundMethod ? <DualText k={REFUND_METHODS.find(m => m.value === r.refundMethod)?.key || "common.unknown"} /> : "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline"><DualText k={`returns.status.${r.status || 'pending'}`} /></Badge>
                          </TableCell>
                          <TableCell>{formatArabicGregorianDate(new Date(r.createdAt))}</TableCell>
                          <TableCell className="text-left">
                            <div className="flex items-center gap-1">
                              {r.status === 'pending' && (
                                <Button size="sm" onClick={async () => {
                                  if (user) {
                                    // Cloud Approval
                                    // We need to implement cloud approval logic if not exists, 
                                    // but for now let's focus on local or reuse branchRequest logic adapted?
                                    // Actually, for strict inventory, we need a similar function for cloud.
                                    // But user seems to rely on local for this part or I should update cloud too.
                                    // Given time constraints, I will add a TO-DO or simple alert if cloud.
                                    // Wait, I can just update the document in firestore.
                                    const { doc, updateDoc, getDoc, increment } = await import("firebase/firestore");
                                    const { db: firestore } = await import("@/lib/firebase");
                                    if (!firestore) return;

                                    // Update Return Status
                                    const returnRef = doc(firestore, "returns", r.id);
                                    await updateDoc(returnRef, {
                                      status: "approved",
                                      approvedBy: user.email,
                                      updatedAt: new Date().toISOString()
                                    });

                                    // Update Stock for each product
                                    for (const p of r.products) {
                                      const pRef = doc(firestore, "products", p.productId);
                                      await updateDoc(pRef, {
                                        currentStock: increment(p.quantity),
                                        issues: increment(-p.quantity),
                                        issuesValue: increment(-(p.totalPrice || (p.unitPrice * p.quantity)))
                                      });
                                    }
                                    toast({ title: t("common.success"), description: t("returns.approved") });
                                    // Force refresh or let realtime handle it
                                  } else {
                                    // Local Approval
                                    const success = await approveReturn(r.id, "admin");
                                    if (success) {
                                      setLocalReturns(getReturns());
                                      toast({ title: t("common.success"), description: t("returns.approved") });
                                    }
                                  }
                                }}>
                                  <DualText k="common.approve" fallback="قبول" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => generateReturnPDF(r)}>
                                <FileText className="ml-2 h-4 w-4" />
                                <DualText k="returns.invoice.button" />
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
        </div>
      </main>
    </div>
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
