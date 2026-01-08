"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package2, AlertTriangle } from "lucide-react"
import type { Product, Transaction } from "@/lib/types"
import { DualText } from "@/components/ui/dual-text"

interface AdvancedStatsCardsProps {
  products: Product[]
  transactions: Transaction[]
}

export function AdvancedStatsCards({ products, transactions }: AdvancedStatsCardsProps) {
  const { totalRevenue, totalCost, profit, profitMargin, totalOrders, avgOrderValue, lowStockCount, outOfStockCount, topProducts } = useMemo(() => {
    const totalRevenue = transactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.totalAmount, 0)
    const totalCost = transactions.filter((t) => t.type === "purchase").reduce((sum, t) => sum + t.totalAmount, 0)
    const profit = totalRevenue - totalCost
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    const totalOrders = transactions.filter((t) => t.type === "sale").length
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const lowStockCount = products.filter((p) => p.currentStock < (p.minStockLimit || 10)).length
    const outOfStockCount = products.filter((p) => p.currentStock === 0).length
    const topProducts = [...products].sort((a, b) => b.issues - a.issues).slice(0, 5)

    return { totalRevenue, totalCost, profit, profitMargin, totalOrders, avgOrderValue, lowStockCount, outOfStockCount, topProducts }
  }, [products, transactions])

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium"><DualText k="dashboard.totalRevenue" /></CardTitle>
          <DollarSign className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalRevenue.toFixed(2)} ر.س</div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-green-600 font-medium">+{profitMargin.toFixed(1)}%</span> <DualText k="dashboard.profitMargin" />
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium"><DualText k="dashboard.netProfit" /></CardTitle>
          {profit >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
            {profit.toFixed(2)} ر.س
          </div>
          <p className="text-xs text-muted-foreground mt-1"><DualText k="dashboard.revenueMinusCost" /></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium"><DualText k="dashboard.avgOrderValue" /></CardTitle>
          <ShoppingCart className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgOrderValue.toFixed(2)} ر.س</div>
          <p className="text-xs text-muted-foreground mt-1">{totalOrders} <DualText k="dashboard.orders" /></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium"><DualText k="dashboard.stockAlerts" /></CardTitle>
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-red-600 font-medium">{outOfStockCount}</span> <DualText k="dashboard.outOfStock" />
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center">
            <Package2 className="h-4 w-4 ml-2" />
            <DualText k="dashboard.topSelling" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {topProducts.map((product, index) => (
              <div key={product.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">#{index + 1}</span>
                  <span className="font-medium">{product.productName}</span>
                </div>
                <span className="text-muted-foreground">
                  {product.issues} {product.unit}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
