"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Plus, Trash2, Search } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DualText, getDualString } from "@/components/ui/dual-text"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getProducts, getBranches, addIssue, updateIssue, getIssueDrafts, updateIssueDraft, deleteIssueDraft, addIssueDraft, getActiveIssueDraftId, clearActiveIssueDraftId, upsertIssueDraft } from "@/lib/storage"
import { getSafeImageSrc } from "@/lib/utils"
import type { Product, Branch, IssueProduct, Issue } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useAuth } from "@/components/auth-provider"
import { syncIssue } from "@/lib/sync-api"
import { useProductsRealtime } from "@/hooks/use-store"
import { useI18n } from "@/components/language-provider"

interface BulkIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  issueToEdit?: Issue
}

import { ProductImage } from "@/components/product-image"
import { ProductCombobox } from "@/components/product-combobox"

export function BulkIssueDialog({ open, onOpenChange, onSuccess, issueToEdit }: BulkIssueDialogProps) {
  const settings = useInvoiceSettings()
  const { user } = useAuth()
  const { t } = useI18n()
  const { data: productsRaw } = useProductsRealtime()

  // Use realtime data, falling back to cache if loading (prevents empty flash)
  const products = useMemo(() => {
    if (productsRaw && productsRaw.length > 0) return productsRaw as Product[]
    return getProducts() || []
  }, [productsRaw])

  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState("")
  const [issueProducts, setIssueProducts] = useState<IssueProduct[]>([])
  const [notes, setNotes] = useState("")
  const [extractorName, setExtractorName] = useState("")
  const [inspectorName, setInspectorName] = useState("")
  const { toast } = useToast()
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState<boolean>(false)

  useEffect(() => {
    if (open) {
      // Products are now updated via realtime hook
      // setProducts(getProducts()) 
      setBranches(getBranches())

      if (issueToEdit) {
        setSelectedBranchId(issueToEdit.branchId)
        setIssueProducts(issueToEdit.products)
        setNotes(issueToEdit.notes || "")
        setExtractorName(issueToEdit.extractorName || "")
        setInspectorName(issueToEdit.inspectorName || "")
        setCurrentDraftId(null)
        setDraftSaved(false)
      } else {
        // حمّل المسودة النشطة إن وجدت، وإلا أحدث مسودة
        try {
          const drafts = getIssueDrafts()
          if (drafts.length > 0) {
            const activeId = getActiveIssueDraftId()
            let target = (activeId ? drafts.find(d => d.id === activeId) || null : null) || drafts.slice().sort((a, b) => {
              const ba = new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime()
              const aa = new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime()
              return ba - aa
            })[0]
            try {
              const wantedId = localStorage.getItem('issueDraftLoadId')
              if (wantedId) {
                const found = drafts.find(d => d.id === wantedId)
                if (found) target = found
                localStorage.removeItem('issueDraftLoadId')
              }
            } catch { }
            setSelectedBranchId((target as any).branchId || "")
            setIssueProducts(target.products || [])
            setNotes(target.notes || "")
            setExtractorName(target.extractorName || "")
            setInspectorName(target.inspectorName || "")
            setCurrentDraftId(target.id)
            setDraftSaved(true)
          } else {
            resetForm()
          }
        } catch {
          resetForm()
        }
      }
    }
  }, [open, issueToEdit])

  /* Virtualizer Logic Moved to ProductCombobox */

  const addProductRow = () => {
    setIssueProducts([
      ...issueProducts,
      {
        productId: "",
        productCode: "",
        productName: "",
        quantity: 0,
        unitPrice: 0,
        totalPrice: 0,
        image: "",
        unit: "",
      },
    ])
  }

  const removeProductRow = (index: number) => {
    setIssueProducts(issueProducts.filter((_, i) => i !== index))
  }

  const updateProductRow = (index: number, field: keyof IssueProduct, value: string | number) => {
    const updated = [...issueProducts]
    updated[index] = { ...updated[index], [field]: value }

    if (field === "productId") {
      const product = products.find((p) => p.id === value)
      if (product) {
        updated[index].productCode = product.productCode
        updated[index].productName = product.productName
        updated[index].unitPrice = product.price
        updated[index].image = product.image || ""
        updated[index].unit = product.unit
        // Ensure totalPrice reflects current quantity when product (unitPrice) changes
        updated[index].totalPrice = (updated[index].quantity || 0) * (product.price || 0)
      }
    }

    if (field === "quantity" || field === "unitPrice") {
      updated[index].totalPrice = updated[index].quantity * updated[index].unitPrice
    }

    setIssueProducts(updated)
  }

  // حفظ تلقائي للمسودة عند تغيّر البيانات
  useEffect(() => {
    if (!open || issueToEdit) return
    const timer = setTimeout(() => {
      try {
        const payload = {
          branchId: selectedBranchId || undefined,
          branchName: branches.find((b) => b.id === selectedBranchId)?.name || undefined,
          products: issueProducts,
          notes,
          extractorName,
          inspectorName,
        }
        const saved = currentDraftId
          ? updateIssueDraft(currentDraftId as string, payload as any)
          : addIssueDraft(payload as any)
        if (saved) {
          setCurrentDraftId(saved.id)
          setDraftSaved(true)
        }
      } catch { }
    }, 400)
    return () => clearTimeout(timer)
  }, [open, issueToEdit, selectedBranchId, issueProducts, notes, extractorName, inspectorName, branches, currentDraftId])

  useEffect(() => {
    if (!open || issueToEdit) return
    const handler = () => {
      try {
        const payload = {
          branchId: selectedBranchId || undefined,
          branchName: branches.find((b) => b.id === selectedBranchId)?.name || undefined,
          products: issueProducts,
          notes,
          extractorName,
          inspectorName,
        }
        const saved = currentDraftId ? updateIssueDraft(currentDraftId as string, payload as any) : addIssueDraft(payload as any)
        if (saved) setCurrentDraftId(saved.id)
      } catch { }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [open, issueToEdit, selectedBranchId, issueProducts, notes, extractorName, inspectorName, branches, currentDraftId])

  const handleSubmit = async () => {
    if (!selectedBranchId) {
      toast({ title: getDualString("common.error"), description: getDualString("bulkIssue.error.selectBranch"), variant: "destructive" })
      return
    }

    if (issueProducts.length === 0 || issueProducts.some((p) => !p.productId || p.quantity <= 0)) {
      toast({ title: getDualString("common.error"), description: getDualString("bulkIssue.error.noProducts"), variant: "destructive" })
      return
    }

    for (const issueProduct of issueProducts) {
      const product = products.find((p) => p.id === issueProduct.productId)

      // Check if product has zero stock
      if (product && product.currentStock === 0) {
        toast({
          title: getDualString("common.error"),
          description: `${getDualString("bulkIssue.error.zeroStock")}: ${product.productName}. ${getDualString("bulkIssue.error.adjustQuantity")}`,
          variant: "destructive",
        })
        return
      }

      // Check if requested quantity exceeds available stock
      if (product && product.currentStock < issueProduct.quantity) {
        toast({
          title: getDualString("common.error"),
          description: `${getDualString("bulkIssue.error.insufficientStock")}: ${product.productName}. ${getDualString("bulkIssue.error.adjustQuantity")}`,
          variant: "destructive",
        })
        return
      }
    }

    const branch = branches.find((b) => b.id === selectedBranchId)
    if (!branch) return

    const totalValue = issueProducts.reduce((sum, p) => sum + p.totalPrice, 0)

    if (issueToEdit) {
      const updatedIssue = {
        ...issueToEdit,
        branchId: selectedBranchId,
        branchName: branch.name,
        products: issueProducts,
        totalValue,
        notes,
        extractorName,
        inspectorName,
        updatedAt: new Date().toISOString()
      }

      updateIssue(issueToEdit.id, updatedIssue)

      if (user) {
        try { syncIssue(updatedIssue) } catch (e) { console.error("Sync failed", e) }
      }

      toast({ title: getDualString("common.success"), description: getDualString("bulkIssue.success.updated") })
    } else {
      const newIssue = await addIssue({
        branchId: selectedBranchId,
        branchName: branch.name,
        products: issueProducts,
        totalValue,
        notes,
        extractorName,
        inspectorName,
        status: "pending",
      })

      if (user) {
        try { await syncIssue(newIssue) } catch (e) { console.error("Sync failed", e) }
      }

      toast({ title: getDualString("common.success"), description: getDualString("bulkIssue.success.issued") })
    }

    // احذف المسودة المرتبطة بعد الحفظ النهائي
    if (currentDraftId) {
      try { deleteIssueDraft(currentDraftId) } catch { }
      setCurrentDraftId(null)
      setDraftSaved(false)
    }

    resetForm()
    onSuccess()
  }

  const resetForm = () => {
    setSelectedBranchId("")
    setIssueProducts([])
    setNotes("")
    setExtractorName("")
    setInspectorName("")
    setDraftSaved(false)
    try { clearActiveIssueDraftId() } catch { }
  }

  const totalValue = issueProducts.reduce((sum, p) => sum + p.totalPrice, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full md:w-auto md:min-w-[700px] lg:min-w-[800px] h-auto max-h-[95vh] overflow-y-auto flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">{issueToEdit ? t("bulkIssue.editTitle") : t("bulkIssue.title")}</DialogTitle>
          <DialogDescription>{issueToEdit ? t("bulkIssue.editDescription") : t("bulkIssue.description")}</DialogDescription>
          {!issueToEdit && (
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => {
                try {
                  const bname = branches.find((b) => b.id === selectedBranchId)?.name
                  const saved = currentDraftId
                    ? upsertIssueDraft({ id: currentDraftId, branchId: selectedBranchId || undefined, branchName: bname, products: issueProducts, notes, extractorName, inspectorName } as any)
                    : addIssueDraft({ branchId: selectedBranchId || undefined, branchName: bname, products: issueProducts, notes, extractorName, inspectorName } as any)
                  setCurrentDraftId(saved.id)
                  setDraftSaved(true)
                  toast({ title: getDualString("bulkIssue.saveAsDraft"), description: getDualString("bulkIssue.autoSaved") })
                } catch { }
              }}>{t("bulkIssue.saveAsDraft")}</Button>
              {currentDraftId && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { if (currentDraftId) { deleteIssueDraft(currentDraftId); setCurrentDraftId(null); setDraftSaved(false); } }}>{t("bulkIssue.deleteDraft")}</Button>
              )}
              {draftSaved && <span className="text-xs text-green-600">{t("bulkIssue.autoSaved")}</span>}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1">
          <div className="space-y-2">
            <Label className="text-base font-semibold">{t("bulkIssue.branch")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between bg-white text-black h-11">
                  {selectedBranchId ? branches.find((b) => b.id === selectedBranchId)?.name : t("bulkIssue.selectBranch")}
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("bulkIssue.searchBranch")} className="text-black" />
                  <CommandList>
                    <CommandEmpty>{t("bulkIssue.noBranchFound")}</CommandEmpty>
                    <CommandGroup>
                      {branches.map((branch) => (
                        <CommandItem
                          key={branch.id}
                          value={branch.name}
                          onSelect={() => setSelectedBranchId(branch.id)}
                          className="text-black"
                        >
                          {branch.name} - {branch.location}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-base font-semibold">{t("bulkIssue.extractorName")}</Label>
              <Input
                placeholder={t("bulkIssue.enterExtractor")}
                value={extractorName}
                onChange={(e) => setExtractorName(e.target.value)}
                className="bg-white text-black"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-base font-semibold">{t("bulkIssue.inspectorName")}</Label>
              <Input
                placeholder={t("bulkIssue.enterInspector")}
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="bg-white text-black"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("bulkIssue.productsTable")}</Label>
              <Button type="button" size="sm" onClick={addProductRow}>
                <Plus className="h-4 w-4 ml-1" />
                {t("bulkIssue.addProducts")}
              </Button>
            </div>

            {issueProducts.length > 0 && (
              <div className="border rounded-lg overflow-auto max-h-[60vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead className="w-[60px]">{t("common.image")}</TableHead>
                      <TableHead className="w-[280px] sm:w-[360px] md:w-[420px] max-w-[420px]">{t("common.product")}</TableHead>
                      {settings.showUnit && <TableHead className="w-[80px]">{t("products.columns.unit")}</TableHead>}
                      <TableHead className="w-[140px]">{t("form.quantity")}</TableHead>
                      {settings.showPrice && <TableHead className="w-[140px]">{t("products.columns.price")}</TableHead>}
                      {settings.showTotal && <TableHead className="w-[140px]">{t("common.total")}</TableHead>}
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issueProducts.map((issueProduct, index) => {
                      const product = products.find((p) => p.id === issueProduct.productId)
                      const availableStock = product?.currentStock || 0
                      const adjustedStock = issueToEdit
                        ? availableStock + (issueToEdit.products.find(p => p.productId === issueProduct.productId)?.quantity || 0)
                        : availableStock

                      const isOverStock = issueProduct.quantity > adjustedStock

                      return (
                        <TableRow key={index}>
                          <TableCell className="text-center font-medium">{index + 1}</TableCell>
                          <TableCell>
                            {issueProduct.image ? (
                              <ProductImage
                                product={{ id: issueProduct.productId, image: issueProduct.image }}
                                className="w-10 h-10 rounded"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                                {t("bulkIssue.noImage")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="w-[280px] sm:w-[360px] md:w-[420px] max-w-[420px] align-top">
                            <ProductCombobox
                              products={products}
                              value={issueProduct.productId}
                              onChange={(val) => updateProductRow(index, "productId", val)}
                            />
                          </TableCell>
                          {settings.showUnit && <TableCell className="text-center">{issueProduct.unit || "-"}</TableCell>}
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={issueProduct.quantity || ""}
                              onChange={(e) => updateProductRow(index, "quantity", Number(e.target.value))}
                              className={`bg-white !text-black font-semibold text-base h-11 border-input ${isOverStock ? "border-red-500 focus-visible:ring-red-500" : ""
                                }`}
                              style={{ color: '#000000 !important' }}
                              placeholder="0"
                            />
                            {isOverStock && (
                              <p className="text-xs text-red-500 mt-1 font-medium">
                                <DualText k="bulkIssue.error.insufficientStock" />
                              </p>
                            )}
                          </TableCell>
                          {settings.showPrice && (
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={issueProduct.unitPrice || ""}
                                readOnly
                                className="bg-gray-100 !text-black font-semibold text-base h-11 border-input"
                                style={{ color: '#000000 !important' }}
                              />
                            </TableCell>
                          )}
                          {settings.showTotal && (
                            <TableCell className="font-bold text-black text-base">
                              {issueProduct.totalPrice.toFixed(2)}
                            </TableCell>
                          )}
                          <TableCell>
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeProductRow(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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

          <div className="space-y-2">
            <Label className="text-base font-semibold">{t("bulkIssue.notes")}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("bulkIssue.extraNotes")}
              className="bg-white !text-black h-11 border-input"
              style={{ color: '#000000 !important' }}
            />
          </div>

          {issueProducts.length > 0 && (
            <div className="rounded-lg bg-muted p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t("bulkIssue.totalValue")}</p>
                  <p className="text-3xl font-bold text-black">{totalValue.toFixed(2)} {t("common.currency")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-1">{t("bulkIssue.totalItems")}</p>
                  <p className="text-2xl font-semibold text-black">{issueProducts.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 px-6">
            {t("bulkIssue.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={issueProducts.length === 0 || !selectedBranchId} className="h-11 px-6">
            {issueToEdit ? t("bulkIssue.updateBtn") : t("bulkIssue.issueBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
