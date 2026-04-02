"use client"

import { useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { Transaction, Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"

interface TopProductsTableProps {
  transactions: Transaction[]
  products: Product[]
  period: string
  threshold?: number
}

export function TopProductsTable({ transactions, products, period, threshold = 5 }: TopProductsTableProps) {
  const settings = useInvoiceSettings()
  const { t } = useI18n()
  const topProducts = useMemo(() => {
    const productSales: { [key: string]: { name: string; quantity: number; revenue: number; category: string } } = {}

    const now = new Date()
    let startDate: Date | undefined

    switch (period) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7))
        break
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1))
        break
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1))
        break
    }

    transactions
      .filter((t) => {
        if (t.type !== "sale") return false
        if (!startDate) return true
        return new Date(t.createdAt) >= startDate
      })
      .forEach((transaction) => {
        if (!productSales[transaction.productId]) {
          const product = products.find((p) => p.id === transaction.productId)
          productSales[transaction.productId] = {
            name: transaction.productName,
            quantity: 0,
            revenue: 0,
            category: product?.category || t("tables.unassigned"),
          }
        }
        productSales[transaction.productId].quantity += transaction.quantity
        productSales[transaction.productId].revenue += transaction.totalAmount
      })

    return Object.values(productSales)
      .filter((p) => p.quantity >= threshold)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [transactions, products, period, threshold])

  if (topProducts.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">{t("tables.noSalesForPeriod")}</div>
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">{t("tables.rank")}</TableHead>
            <TableHead className="text-right">{t("tables.productName")}</TableHead>
            <TableHead className="text-right">{t("tables.category")}</TableHead>
            {settings.showQuantity && <TableHead className="text-right">{t("tables.soldQuantity")}</TableHead>}
            {settings.showTotal && <TableHead className="text-right">{t("tables.revenue")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {topProducts.map((product, index) => (
            <TableRow key={index}>
              <TableCell className="font-bold text-primary">{index + 1}</TableCell>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{product.category}</Badge>
              </TableCell>
              {settings.showQuantity && <TableCell>{product.quantity}</TableCell>}
              {settings.showTotal && <TableCell className="font-medium">{product.revenue.toFixed(2)} {t("common.currency")}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
