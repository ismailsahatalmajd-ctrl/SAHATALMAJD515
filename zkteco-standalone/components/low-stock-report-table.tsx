"use client"

import { useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { convertNumbersToEnglish } from "@/lib/utils"

interface LowStockReportTableProps {
  products: Product[]
}

export function LowStockReportTable({ products }: LowStockReportTableProps) {
  const { t } = useI18n()

  const lowStockItems = useMemo(() => {
    return products
      .filter((p) => {
        if (p.isLowStock !== undefined) return p.isLowStock
        // Fallback calculation if isLowStock is not set
        const threshold = p.lowStockThresholdPercentage || 33.33
        const limit = (p.openingStock + p.purchases) * (threshold / 100)
        return p.currentStock <= limit
      })
      .sort((a, b) => {
        // Sort by detected date desc, then by stock level asc
        const dateA = a.lowStockDetectedAt ? new Date(a.lowStockDetectedAt).getTime() : 0
        const dateB = b.lowStockDetectedAt ? new Date(b.lowStockDetectedAt).getTime() : 0
        if (dateA !== dateB) return dateB - dateA
        return a.currentStock - b.currentStock
      })
  }, [products])

  if (lowStockItems.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">{t("common.noData")}</div>
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">{t("tables.productName")}</TableHead>
            <TableHead className="text-right">{t("tables.category")}</TableHead>
            <TableHead className="text-right">{t("dashboard.lowStock.title")}</TableHead>
            <TableHead className="text-right">الحد الأدنى</TableHead>
            <TableHead className="text-right">تاريخ التنبيه</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lowStockItems.map((product) => {
             const threshold = product.lowStockThresholdPercentage || 33.33
             const limit = (product.openingStock + product.purchases) * (threshold / 100)
             
             return (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.productName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{product.category}</Badge>
                </TableCell>
                <TableCell className="font-bold text-destructive">
                  {convertNumbersToEnglish(product.currentStock)}
                </TableCell>
                <TableCell>
                  {convertNumbersToEnglish(Math.floor(limit))} <span className="text-xs text-muted-foreground">({threshold}%)</span>
                </TableCell>
                <TableCell>
                  {product.lowStockDetectedAt 
                    ? new Date(product.lowStockDetectedAt).toLocaleDateString('ar-SA') 
                    : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">
                    {product.currentStock <= 0 ? t("products.status.outOfStock") : t("common.low")}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
