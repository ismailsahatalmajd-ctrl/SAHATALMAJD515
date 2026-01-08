"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Product, Transaction } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (transaction: Omit<Transaction, "id" | "createdAt">) => void
  products: Product[]
}

export function TransactionForm({ open, onOpenChange, onSubmit, products }: TransactionFormProps) {
  const { t } = useI18n()
  const settings = useInvoiceSettings()
  const [formData, setFormData] = useState({
    productId: "",
    type: "purchase" as Transaction["type"],
    quantity: 0,
    unitPrice: 0,
    notes: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const product = products.find((p) => p.id === formData.productId)
    if (!product) return

    const transaction: Omit<Transaction, "id" | "createdAt"> = {
      productId: formData.productId,
      productName: product.productName,
      type: formData.type,
      quantity: formData.quantity,
      unitPrice: formData.unitPrice,
      totalAmount: formData.quantity * formData.unitPrice,
      notes: formData.notes,
    }

    onSubmit(transaction)
    onOpenChange(false)
    setFormData({
      productId: "",
      type: "purchase",
      quantity: 0,
      unitPrice: 0,
      notes: "",
    })
  }

  const selectedProduct = products.find((p) => p.id === formData.productId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("form.transaction.title")}</DialogTitle>
          <DialogDescription>{t("form.transaction.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product">{t("form.product.label")}</Label>
              <Select
                value={formData.productId}
                onValueChange={(value) => setFormData({ ...formData, productId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("form.product.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.productName} - {product.currentStock} {product.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t("form.type.label")}</Label>
              <Select
                value={formData.type}
                onValueChange={(value: Transaction["type"]) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">{t("form.type.purchase")}</SelectItem>
                  <SelectItem value="sale">{t("form.type.sale")}</SelectItem>
                  <SelectItem value="return">{t("form.type.return")}</SelectItem>
                  <SelectItem value="adjustment">{t("form.type.adjustment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">{t("form.quantity.label")}</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                  required
                />
                {selectedProduct && settings.showUnit && (
                  <p className="text-xs text-muted-foreground">
                    {t("form.availablePrefix")} {selectedProduct.currentStock} {selectedProduct.unit}
                  </p>
                )}
              </div>
              {settings.showPrice && (
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">{t("form.unitPrice.label")}</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
                    required
                  />
                </div>
              )}
            </div>

            {settings.showTotal && (
              <div className="space-y-2">
                <Label>{t("form.totalAmount")}</Label>
                <div className="text-2xl font-bold text-primary">
                  {(formData.quantity * formData.unitPrice).toFixed(2)} {t("common.currency")}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{t("form.notes.label")}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("form.notes.placeholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!formData.productId || formData.quantity <= 0}>
              {t("form.saveTransaction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
