"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react"
import type { Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

interface InventoryMovementAnalysisProps {
  products: Product[]
}

export function InventoryMovementAnalysis({ products }: InventoryMovementAnalysisProps) {
  const { t } = useI18n()
  // Calculate movement speed based on issues vs current stock
  const analyzeMovement = (product: Product) => {
    const turnoverRatio = product.currentStock > 0 ? product.issues / product.currentStock : 0

    // User Rules: Fast > 1, Normal > 0.35, Slow > 0, Stagnant 0
    if (turnoverRatio > 1) return "fast"
    if (turnoverRatio > 0.35) return "normal"
    if (turnoverRatio > 0) return "slow"
    return "stagnant"
  }

  const fastMoving = products.filter((p) => analyzeMovement(p) === "fast")
  const normalMoving = products.filter((p) => analyzeMovement(p) === "normal")
  const slowMoving = products.filter((p) => analyzeMovement(p) === "slow")
  const stagnant = products.filter((p) => analyzeMovement(p) === "stagnant")

  const fastValue = fastMoving.reduce((sum, p) => sum + p.currentStockValue, 0)
  const normalValue = normalMoving.reduce((sum, p) => sum + p.currentStockValue, 0)
  const slowValue = slowMoving.reduce((sum, p) => sum + p.currentStockValue, 0)
  const stagnantValue = stagnant.reduce((sum, p) => sum + p.currentStockValue, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inventory.analysis.title")}</CardTitle>
        <CardDescription>{t("inventory.analysis.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-900 dark:text-green-100">{t("inventory.analysis.fast")}</span>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{fastMoving.length}</p>
              <p className="text-xs text-green-700 dark:text-green-300">{t("common.product")}</p>
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">{fastValue.toFixed(2)} {t("common.currency")}</p>
            </div>
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
              {t("inventory.analysis.badge.fast")}
            </Badge>
          </div>

          <div className="space-y-2 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">{t("inventory.analysis.normal")}</span>
              <Minus className="h-4 w-4 text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{normalMoving.length}</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">{t("common.product")}</p>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{normalValue.toFixed(2)} {t("common.currency")}</p>
            </div>
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
              {t("inventory.analysis.badge.normal")}
            </Badge>
          </div>

          <div className="space-y-2 p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-900 dark:text-orange-100">{t("inventory.analysis.slow")}</span>
              <TrendingDown className="h-4 w-4 text-orange-600" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{slowMoving.length}</p>
              <p className="text-xs text-orange-700 dark:text-orange-300">{t("common.product")}</p>
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">{slowValue.toFixed(2)} {t("common.currency")}</p>
            </div>
            <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
              {t("inventory.analysis.badge.slow")}
            </Badge>
          </div>

          <div className="space-y-2 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-900 dark:text-red-100">{t("inventory.analysis.stagnant")}</span>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{stagnant.length}</p>
              <p className="text-xs text-red-700 dark:text-red-300">{t("common.product")}</p>
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">{stagnantValue.toFixed(2)} {t("common.currency")}</p>
            </div>
            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
              {t("inventory.analysis.badge.stagnant")}
            </Badge>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-lg bg-muted">
          <h4 className="font-semibold mb-2">{t("inventory.analysis.criteria.title")}</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>{t("inventory.analysis.criteria.fast")}</li>
            <li>{t("inventory.analysis.criteria.normal")}</li>
            <li>{t("inventory.analysis.criteria.slow")}</li>
            <li>{t("inventory.analysis.criteria.stagnant")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
