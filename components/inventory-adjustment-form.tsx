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
import type { Product, InventoryAdjustment } from "@/lib/types"

interface InventoryAdjustmentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (adjustment: Omit<InventoryAdjustment, "id" | "createdAt" | "difference">) => void
  products: Product[]
}

export function InventoryAdjustmentForm({ open, onOpenChange, onSubmit, products }: InventoryAdjustmentFormProps) {
  const [formData, setFormData] = useState({
    productId: "",
    newQuantity: 0,
    reason: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const product = products.find((p) => p.id === formData.productId)
    if (!product) return

    const adjustment: Omit<InventoryAdjustment, "id" | "createdAt" | "difference"> = {
      productId: formData.productId,
      productName: product.productName,
      oldQuantity: product.currentStock,
      newQuantity: formData.newQuantity,
      reason: formData.reason,
    }

    onSubmit(adjustment)
    onOpenChange(false)
    setFormData({
      productId: "",
      newQuantity: 0,
      reason: "",
    })
  }

  const selectedProduct = products.find((p) => p.id === formData.productId)
  const difference = selectedProduct ? formData.newQuantity - selectedProduct.currentStock : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل المخزون</DialogTitle>
          <DialogDescription>قم بتعديل كمية المخزون للمنتج المحدد</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product">المنتج</Label>
              <Select
                value={formData.productId}
                onValueChange={(value) => setFormData({ ...formData, productId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المنتج" />
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

            {selectedProduct && (
              <div className="rounded-lg border bg-muted p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">المخزون الحالي:</span>
                  <span className="font-medium">
                    {selectedProduct.currentStock} {selectedProduct.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">المخزون الجديد:</span>
                  <span className="font-medium">
                    {formData.newQuantity} {selectedProduct.unit}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-sm font-medium">الفرق:</span>
                  <span
                    className={`font-bold ${difference > 0 ? "text-green-600" : difference < 0 ? "text-red-600" : ""}`}
                  >
                    {difference > 0 ? "+" : ""}
                    {difference} {selectedProduct.unit}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newQuantity">الكمية الجديدة</Label>
              <Input
                id="newQuantity"
                type="number"
                value={formData.newQuantity}
                onChange={(e) => setFormData({ ...formData, newQuantity: Number(e.target.value) })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">سبب التعديل</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="مثال: تلف، فقدان، خطأ في الجرد..."
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={!formData.productId}>
              حفظ التعديل
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
