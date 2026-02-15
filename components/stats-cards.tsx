"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'
import type { Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"

interface StatsCardsProps {
  products: Product[]
  visible?: Partial<{
    totalProducts: boolean
    totalUnits: boolean
    inventoryValue: boolean
    lowStock: boolean
    outOfStock: boolean
  }>
}

// StatsCards component
export function StatsCards({ products = [], visible }: StatsCardsProps) {
  const { t } = useI18n()
  const { totalProducts, totalItems, totalValue, lowStockCount, lowStockValue, outOfStockCount } = useMemo(() => {
    const safeProducts = products ?? []
    const totalProducts = safeProducts.length

    // Calculate low stock based on percentage threshold
    const lowStockItems = safeProducts.filter((p) => {
      const currentStock = Number(p.currentStock || 0)
      if (currentStock <= 0) return false
      if (p.isLowStock !== undefined) return p.isLowStock
      const threshold = Number(p.lowStockThresholdPercentage || 33.33)
      const limit = (Number(p.openingStock || 0) + Number(p.purchases || 0) + Number(p.returns || 0)) * (threshold / 100)
      return currentStock <= limit
    })
    const lowStockCount = lowStockItems.length
    const lowStockValue = lowStockItems.reduce((sum, p) => sum + (Number(p.currentStock || 0) * Number(p.price || 0)), 0)

    const outOfStockCount = safeProducts.filter((p) => Number(p.currentStock || 0) <= 0).length

    const totalValue = safeProducts.reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)
    const totalItems = safeProducts.reduce((sum, p) => sum + Number(p.currentStock || 0), 0)

    return { totalProducts, totalItems, totalValue, lowStockCount, lowStockValue, outOfStockCount }
  }, [products])

  const v = {
    totalProducts: true,
    totalUnits: true,
    inventoryValue: true,
    lowStock: true,
    outOfStock: true,
    ...(visible || {}),
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      {v.totalProducts && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium"><DualText k="dashboard.totalProducts.title" /></CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground"><DualText k="dashboard.totalProducts.subtitle" /></p>
          </CardContent>
        </Card>
      )}

      {v.totalUnits && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium"><DualText k="dashboard.totalUnits.title" /></CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground"><DualText k="dashboard.totalUnits.subtitle" /></p>
          </CardContent>
        </Card>
      )}

      {v.inventoryValue && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium"><DualText k="dashboard.inventoryValue.title" /></CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalValue.toFixed(2)} <DualText k="common.currency" /></div>
            <p className="text-xs text-muted-foreground"><DualText k="dashboard.inventoryValue.subtitle" /></p>
          </CardContent>
        </Card>
      )}

      {v.lowStock && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium"><DualText k="dashboard.lowStock.title" /></CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground"><DualText k="dashboard.lowStock.valuePrefix" /> {lowStockValue.toFixed(2)} <DualText k="common.currency" /></p>
          </CardContent>
        </Card>
      )}

      {v.outOfStock && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium"><DualText k="dashboard.outOfStock.title" /></CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{outOfStockCount}</div>
            <p className="text-xs text-muted-foreground"><DualText k="dashboard.outOfStock.subtitle" /></p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
