"use client"

import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

interface LowStockAlertProps {
  products: Product[]
}

export function LowStockAlert({ products }: LowStockAlertProps) {
  const { t } = useI18n()

  const { outOfStockCount, lowStockCount } = products.reduce(
    (acc, p) => {
      // Out of Stock check
      if (p.currentStock <= 0) {
        acc.outOfStockCount++
        return acc
      }

      // Low Stock check (matching Report logic)
      // Use stored isLowStock if available, otherwise calculate
      if (p.isLowStock !== undefined) {
        if (p.isLowStock) acc.lowStockCount++
      } else {
        const threshold = p.lowStockThresholdPercentage || 33.33
        const limit = (p.openingStock + p.purchases) * (threshold / 100)
        if (p.currentStock <= limit) {
          acc.lowStockCount++
        }
      }

      return acc
    },
    { outOfStockCount: 0, lowStockCount: 0 }
  )

  if (outOfStockCount === 0 && lowStockCount === 0) return null

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{t("home.lowStockAlert.title")}</AlertTitle>
      <AlertDescription>
        <div className="mt-2 flex flex-col gap-2">
          {lowStockCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("home.lowStockAlert.lowStockCount")}</span>
              <span className="font-bold text-lg">{lowStockCount}</span>
            </div>
          )}
          {outOfStockCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("home.lowStockAlert.outOfStockCount")}</span>
              <span className="font-bold text-lg">{outOfStockCount}</span>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
