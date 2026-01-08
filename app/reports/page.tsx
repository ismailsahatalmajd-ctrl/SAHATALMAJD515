"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Package, Calendar, Filter } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/header"
import dynamic from "next/dynamic"
const SalesChart = dynamic(() => import("@/components/sales-chart").then(m => m.SalesChart), { ssr: false })
const CategoryChart = dynamic(() => import("@/components/category-chart").then(m => m.CategoryChart), { ssr: false })
import { TopProductsTable } from "@/components/top-products-table"
import { InventoryMovementAnalysis } from "@/components/inventory-movement-analysis"
import { LowStockReportTable } from "@/components/low-stock-report-table"
import { generateLowStockPDF } from "@/lib/low-stock-pdf-generator"
import { Switch } from "@/components/ui/switch" // Added Switch
import type { Product, Transaction, FinancialSummary } from "@/lib/types"
import { getProducts, getTransactions, calculateFinancialSummary, getCategories, getIssues } from "@/lib/storage"
import Link from "next/link"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"

export default function ReportsPage() {
  const { t } = useI18n()
  const settings = useInvoiceSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])

  const [period, setPeriod] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLocation, setSelectedLocation] = useState<string>("all")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    totalPurchases: 0,
    totalSales: 0,
    totalInventoryValue: 0,
    profit: 0,
    period: "الكل",
  })

  const [hideZeroStock, setHideZeroStock] = useState(false)
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false)
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [mergeIdentical, setMergeIdentical] = useState(false)
  const [bestSellerThreshold, setBestSellerThreshold] = useState(5)

  useEffect(() => {
    let isMounted = true
    const allProducts = getProducts()
    const allTransactions = getTransactions()
    const allCategories = getCategories()
    const issues = getIssues()

    if (isMounted) {
      setProducts(allProducts)
      setTransactions(allTransactions)
      setCategories(allCategories.map((c) => c.name))

      const uniqueLocations = [...new Set(allProducts.map((p) => p.location).filter(Boolean))]
      setLocations(uniqueLocations)
    }
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    let filtered = [...products]

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((p) => p.category === selectedCategory)
    }

    // Filter by location
    if (selectedLocation !== "all") {
      filtered = filtered.filter((p) => p.location === selectedLocation)
    }

    if (hideZeroStock) {
      filtered = filtered.filter((p) => p.currentStock > 0)
    }

    if (showOnlyOutOfStock) {
      filtered = filtered.filter((p) => p.currentStock <= 0)
    }

    if (showLowStockOnly) {
      filtered = filtered.filter((p) => {
        if (p.currentStock <= 0) return false // Exclude out of stock
        const threshold = p.lowStockThresholdPercentage || 33.33
        const limit = (p.openingStock + p.purchases) * (threshold / 100)
        return p.currentStock <= limit
      })
    }

    if (mergeIdentical) {
      const mergedMap = new Map<string, Product>()
      
      filtered.forEach(p => {
        const key = `${p.productName}-${p.productCode}`
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key)!
          mergedMap.set(key, {
            ...existing,
            currentStock: existing.currentStock + p.currentStock,
            currentStockValue: existing.currentStockValue + p.currentStockValue,
            purchases: existing.purchases + p.purchases,
            issues: existing.issues + p.issues,
            // Weighted average price
            averagePrice: ((existing.averagePrice * existing.currentStock) + (p.averagePrice * p.currentStock)) / (existing.currentStock + p.currentStock || 1)
          })
        } else {
          mergedMap.set(key, { ...p })
        }
      })
      
      filtered = Array.from(mergedMap.values())
    }

    setFilteredProducts(filtered)
  }, [products, selectedCategory, selectedLocation, hideZeroStock, showOnlyOutOfStock, showLowStockOnly, mergeIdentical]) // Added dependencies

  useEffect(() => {
    let filtered = [...transactions]
    let calcStartDate: Date | undefined
    let calcEndDate: Date | undefined

    // Handle custom date range
    if (startDate && endDate) {
      calcStartDate = new Date(startDate)
      calcEndDate = new Date(endDate)
      calcEndDate.setHours(23, 59, 59, 999)
    } else {
      // Handle predefined periods
      const now = new Date()
      switch (period) {
        case "today":
          calcStartDate = new Date(now.setHours(0, 0, 0, 0))
          calcEndDate = new Date(now.setHours(23, 59, 59, 999))
          break
        case "week":
          calcStartDate = new Date(now.setDate(now.getDate() - 7))
          calcEndDate = new Date()
          break
        case "month":
          calcStartDate = new Date(now.setMonth(now.getMonth() - 1))
          calcEndDate = new Date()
          break
        case "year":
          calcStartDate = new Date(now.setFullYear(now.getFullYear() - 1))
          calcEndDate = new Date()
          break
      }
    }

    if (calcStartDate && calcEndDate) {
      filtered = filtered.filter((t) => {
        const tDate = new Date(t.createdAt)
        return tDate >= calcStartDate! && tDate <= calcEndDate!
      })
    }

    setFilteredTransactions(filtered)

    // Calculate financial summary
    const summary = calculateFinancialSummary(calcStartDate, calcEndDate)
    setFinancialSummary(summary)
  }, [period, transactions, startDate, endDate])

  const lowStockCount = filteredProducts.filter((p) => p.currentStock < 10).length
  const totalProducts = filteredProducts.length
  const totalInventoryValue = filteredProducts.reduce((sum, p) => sum + p.currentStockValue, 0)

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link href="/">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="text-3xl font-bold"><DualText k="reports.title" /></h1>
              </div>
              <p className="text-muted-foreground"><DualText k="reports.description" /></p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <DualText k="reports.filters.title" />
              </CardTitle>
              <CardDescription><DualText k="reports.filters.description" /></CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.period" /></Label>
                  <Select
                    value={period}
                    onValueChange={(value) => {
                      setPeriod(value)
                      if (value !== "custom") {
                        setStartDate("")
                        setEndDate("")
                      }
                    }}
                  >
                    <SelectTrigger>
                      <Calendar className="ml-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><DualText k="reports.filters.period.all" /></SelectItem>
                      <SelectItem value="today"><DualText k="reports.filters.period.today" /></SelectItem>
                      <SelectItem value="week"><DualText k="reports.filters.period.week" /></SelectItem>
                      <SelectItem value="month"><DualText k="reports.filters.period.month" /></SelectItem>
                      <SelectItem value="year"><DualText k="reports.filters.period.year" /></SelectItem>
                      <SelectItem value="custom"><DualText k="reports.filters.period.custom" /></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {period === "custom" && (
                  <>
                    <div className="space-y-2">
                      <Label><DualText k="reports.filters.custom.from" /></Label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label><DualText k="reports.filters.custom.to" /></Label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label><DualText k="reports.category" /></Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><DualText k="branches.report.filters.allCategories" /></SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label><DualText k="reports.location" /></Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><DualText k="reports.filters.allLocations" /></SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 mt-4 pt-4 border-t">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Switch 
                    id="hide-zero" 
                    checked={hideZeroStock} 
                    onCheckedChange={(v) => {
                      setHideZeroStock(v)
                      if (v) {
                        setShowOnlyOutOfStock(false)
                        setShowLowStockOnly(false)
                      }
                    }} 
                  />
                  <Label htmlFor="hide-zero"><DualText k="reports.hideZero" /></Label>
                </div>
                
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Switch 
                    id="show-out-of-stock" 
                    checked={showOnlyOutOfStock} 
                    onCheckedChange={(v) => {
                      setShowOnlyOutOfStock(v)
                      if (v) {
                        setHideZeroStock(false)
                        setShowLowStockOnly(false)
                      }
                    }} 
                  />
                  <Label htmlFor="show-out-of-stock"><DualText k="reports.showOnlyOutOfStock" /></Label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Switch 
                    id="show-low-stock" 
                    checked={showLowStockOnly} 
                    onCheckedChange={(v) => {
                      setShowLowStockOnly(v)
                      if (v) {
                        setHideZeroStock(false)
                        setShowOnlyOutOfStock(false)
                      }
                    }} 
                  />
                  <Label htmlFor="show-low-stock"><DualText k="reports.showLowStockOnly" /></Label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Switch id="merge-identical" checked={mergeIdentical} onCheckedChange={setMergeIdentical} />
                  <Label htmlFor="merge-identical"><DualText k="reports.mergeIdentical" /></Label>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="threshold" className="whitespace-nowrap"><DualText k="reports.bestSellerThreshold" /></Label>
                  <input
                    id="threshold"
                    type="number"
                    min="1"
                    value={bestSellerThreshold}
                    onChange={(e) => setBestSellerThreshold(Number(e.target.value))}
                    className="w-20 h-8 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="reports.totalSales" /></CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{financialSummary.totalSales.toFixed(2)} {t("common.currency")}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredTransactions.filter((t) => t.type === "sale").length} <DualText k="reports.sales.operations" />
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="reports.totalPurchases" /></CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{financialSummary.totalPurchases.toFixed(2)} {t("common.currency")}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredTransactions.filter((t) => t.type === "purchase").length} <DualText k="reports.purchases.operations" />
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="reports.netProfit" /></CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${financialSummary.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {financialSummary.profit.toFixed(2)} {t("common.currency")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{financialSummary.profit >= 0 ? <DualText k="reports.profit" /> : <DualText k="reports.loss" />}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="reports.inventoryValue" /></CardTitle>
                <Package className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalInventoryValue.toFixed(2)} {t("common.currency")}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalProducts} <DualText k="common.product" /> ({lowStockCount} <DualText k="common.low" />)
                </p>
              </CardContent>
            </Card>
          </div>

          <InventoryMovementAnalysis products={filteredProducts} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle><DualText k="reports.salesPurchases" /></CardTitle>
                <CardDescription><DualText k="reports.salesPurchases.desc" /></CardDescription>
              </CardHeader>
              <CardContent>
                <SalesChart transactions={filteredTransactions} period={period} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><DualText k="reports.byCategory" /></CardTitle>
                <CardDescription><DualText k="reports.byCategory.desc" /></CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryChart products={filteredProducts} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle><DualText k="reports.topProducts" /></CardTitle>
              <CardDescription><DualText k="reports.topProducts.desc" /></CardDescription>
            </CardHeader>
            <CardContent>
              <TopProductsTable 
                transactions={filteredTransactions} 
                products={filteredProducts} 
                period={period} 
                threshold={bestSellerThreshold} 
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive"><DualText k="reports.lowStockAlerts" /></CardTitle>
              <CardDescription><DualText k="reports.lowStockAlertsDesc" /></CardDescription>
            </CardHeader>
            <CardContent>
              <LowStockReportTable products={filteredProducts} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
