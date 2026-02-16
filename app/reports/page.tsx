"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Input } from "@/components/ui/input"
import { MultiSelect } from "@/components/ui/multi-select"
import { Search } from "lucide-react"
import type { Product, Transaction, FinancialSummary, Branch } from "@/lib/types"
import { getProducts, getTransactions, getCategories, getIssues, getReturns, getPurchaseOrders, getAdjustments, getAuditLogs, getBranches } from "@/lib/storage"
import { StockMovementReportTable, StockMovement } from "@/components/stock-movement-report-table"
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
  const [categories, setCategories] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [issues, setIssues] = useState<any[]>([])
  const [returns, setReturns] = useState<any[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const [branches, setBranches] = useState<Branch[]>([]) // Added branches state
  const [period, setPeriod] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLocation, setSelectedLocation] = useState<string>("all")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  // New States for Advanced Filters
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [searchInvoice, setSearchInvoice] = useState<string>("")


  const [hideZeroStock, setHideZeroStock] = useState(false)
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false)
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [mergeIdentical, setMergeIdentical] = useState(false)
  const [bestSellerThreshold, setBestSellerThreshold] = useState(5)

  const loadData = async () => {
    try {
      const [productsData, transactionsData, issuesData, returnsData, posData, adjustmentsData, auditData, categoriesData] = await Promise.all([
        getProducts(),
        getTransactions(),
        getIssues(),
        getReturns(),
        getPurchaseOrders(),
        getAdjustments(),
        getAuditLogs(),
        getCategories(),
        getBranches()
      ])
      setProducts(productsData)
      setTransactions(transactionsData)
      setIssues(issuesData)
      setReturns(returnsData)
      setPurchaseOrders(posData)
      setAdjustments(adjustmentsData)
      setAuditLogs(auditData)
      setCategories(categoriesData.map((c) => c.name))
      setBranches(categoriesData[2] || []) // Correction: Promise.all array index matching
      // Let's fix the indexing properly
      setCategories(categoriesData.map((c) => c.name))
      // Actually `getBranches` is the 9th item (index 8)
      const branchesData = await getBranches()
      setBranches(branchesData)

      const uniqueLocations = [...new Set(productsData.map((p) => p.location).filter(Boolean))]
      setLocations(uniqueLocations)
    } catch (error) {
      console.error("Failed to load report data", error)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const {
    totalInventoryValue,
    totalItems,
    lowStockCount,
    categoryStats
  } = useMemo(() => {
    const totalValue = products.reduce((sum, p) => sum + (p.currentStock * (p.averagePrice || p.price || 0)), 0)
    const items = products.reduce((sum, p) => sum + p.currentStock, 0)
    const lowStock = products.filter(p => p.isLowStock || (p.currentStock <= (p.minStockLimit || 5))).length

    const catStats: Record<string, { count: number, value: number }> = {}
    products.forEach(p => {
      const cat = p.category || "Uncategorized"
      if (!catStats[cat]) catStats[cat] = { count: 0, value: 0 }
      catStats[cat].count += p.currentStock
      catStats[cat].value += (p.currentStock * (p.averagePrice || p.price || 0))
    })

    return {
      totalInventoryValue: totalValue,
      totalItems: items,
      lowStockCount: lowStock,
      categoryStats: catStats
    }
  }, [products])

  // Generate Stock Movements
  const stockMovements = useMemo(() => {
    const allProducts = products
    const allTransactions = transactions
    const movements: StockMovement[] = []

    // Helper to check if movement already exists (deduplication)
    const exists = (id: string, type: string) => movements.some(m => m.id === id || (m.reference === id && m.type === type as any));

    // 1. Audit Logs (Add / Edit / Delete Product)
    // Replaces the "Synthetic Initial Stock" with real "Create" events
    auditLogs.forEach(log => {
      if (log.entity === 'product') {
        let type: any = 'edit';
        if (log.action === 'create') type = 'add';
        if (log.action === 'delete') type = 'delete';
        if (log.action === 'update') type = 'edit';

        // Attempt to find product snapshot or current product
        // If deleted, product might not exist in current list, so rely on log metadata if available
        const product = allProducts.find(p => p.id === log.entityId)

        const FIELD_NAMES: Record<string, string> = {
          productName: "اسم المنتج / Product Name",
          productCode: "كود المنتج / Product Code",
          currentStock: "المخزون الحالي / Current Stock",
          currentStockValue: "قيمة المخزون / Stock Value",
          price: "السعر / Price",
          openingStock: "المخزون الافتتاحي / Opening Stock",
          quantity: "الكمية / Quantity",
          category: "التصنيف / Category",
          unit: "الوحدة / Unit",
          image: "الصورة / Image"
        }

        // Format details from changes
        const changeDetails = log.changes?.map((c: any) => ({
          name: `${product?.productName || ''} - ${FIELD_NAMES[c.field] || c.field}: ${c.oldValue} -> ${c.newValue}`,
          quantity: 0,
          price: 0,
          total: 0
        })) || []

        // If 'create', we might want to show opening stock if documented in changes
        let quantityChange = 0
        let valueChange = 0

        // If it's a creation, and we have openingStock in changes?
        if (log.action === 'create' && product) {
          quantityChange = product.openingStock || 0
          valueChange = quantityChange * (product.price || 0)
          if (quantityChange > 0) {
            changeDetails.push({
              name: `Opening Stock (at creation)`,
              quantity: quantityChange,
              price: product.price || 0,
              total: valueChange
            })
          }
        }

        movements.push({
          id: log.id,
          date: log.timestamp as string,
          type: type,
          reference: log.userName === 'System' ? 'تلقائي / AUTO' : 'يدوي / MANUAL',
          description: `${log.action} - ${log.userName || 'System'}`,
          itemsCount: 1,
          totalQuantity: quantityChange,
          totalAmount: valueChange,
          status: 'Completed',
          details: changeDetails.length > 0 ? changeDetails : [{
            name: product?.productName || log.entityName || "Product",
            quantity: quantityChange,
            price: 0,
            total: 0
          }]
        })
      }
    })

    // 2. Legacy Transactions (Purchases & Manual Adjustments stored in 'transactions' table)
    // This catches "Missing Purchases" that are not POs.
    allTransactions.forEach(t => {
      // Avoid duplicating if we handle these via other tables (e.g. Issues/Returns might generate transactions)
      // We'll focus on 'purchase' and 'adjustment' types here primarily,
      // as Issues/Returns have richer data in their own tables.
      if (t.type === 'purchase' || t.type === 'adjustment') {
        const prod = allProducts.find(p => p.id === t.productId)
        // If it comes from a PO, we might have handled it in PO section?
        // Strategy: Use THIS transaction as truth for purchases if distinct.
        // For simplicity, we add all 'purchase' transactions.
        // If user sees duplicates with POs, we can refine. Usually systems use one or other.

        movements.push({
          id: t.id,
          date: t.date || t.createdAt,
          type: t.type as any, // 'purchase' or 'adjustment'
          reference: t.type === 'purchase' ? 'PURCHASE' : 'ADJUST',
          itemsCount: 1,
          totalQuantity: t.quantity, // Purchase is +, Adj can be +/-
          totalAmount: t.totalAmount,
          description: `${t.type === 'purchase' ? 'Purchase' : 'Adjustment'}: ${prod?.productName || 'Unknown'}`,
          status: 'Completed',
          details: [{
            name: prod?.productName || "Unknown Product",
            quantity: t.quantity,
            price: t.unitPrice || 0,
            total: t.totalAmount
          }]
        })
      }
    })

    // 3. Map Issues (Sales/Transfers Out) - Delivered Only
    issues.forEach(i => {
      if (i.delivered) {
        if (exists(i.id, 'issue')) return; // Skip if handled

        const moveDetails = i.products.map(p => {
          const product = allProducts.find(prod => prod.id === p.productId)
          const cost = product?.averagePrice || product?.price || 0
          return {
            name: product?.productName || "Unknown Product",
            quantity: -(p.quantity),
            price: cost,
            total: -(p.quantity * cost)
          }
        })

        const totalValueChange = moveDetails.reduce((sum, d) => sum + d.total, 0)
        const totalQtyChange = moveDetails.reduce((sum, d) => sum + d.quantity, 0)

        movements.push({
          id: i.id,
          date: i.deliveredAt || i.updatedAt || i.createdAt,
          type: 'issue',
          reference: i.invoiceNumber || i.id.slice(0, 8),
          itemsCount: i.products.length,
          totalQuantity: totalQtyChange,
          totalAmount: Math.abs(totalValueChange),
          description: i.branchName,
          status: 'Delivered',
          details: moveDetails
        })
      }
    })

    // 4. Map Returns
    returns.forEach(r => {
      if (exists(r.id, 'return')) return;

      const moveDetails = r.products.map(p => {
        const product = allProducts.find(prod => prod.id === p.productId)
        const cost = product?.averagePrice || product?.price || 0
        const qty = p.quantityBase || p.quantity
        return {
          name: product?.productName || "Unknown Product",
          quantity: qty,
          price: cost,
          total: qty * cost
        }
      })

      const totalValueChange = moveDetails.reduce((sum, d) => sum + d.total, 0)
      const totalQtyChange = moveDetails.reduce((sum, d) => sum + d.quantity, 0)

      movements.push({
        id: r.id,
        date: r.createdAt,
        type: 'return',
        reference: r.returnNumber || r.id.slice(0, 8),
        itemsCount: r.products.length,
        totalQuantity: totalQtyChange,
        totalAmount: totalValueChange,
        description: r.customerName || r.branchName || "Return",
        status: r.status,
        details: moveDetails
      })
    })

    // 5. Purchase Orders (Only if NOT already in transactions)
    // Some systems create a Transaction for every PO item. If so, section 2 covers it.
    // If not, we add POs here. We'll verify by ID or loose matching?
    // Safe bet: Add POs that are 'received' but check if we have a huge duplication. 
    // Given the user said "Missing Purchases", likely they are NOT in transactions, or only in POs.
    // We will add POs but try to merge if needed. For now, assuming distinct data sources.
    purchaseOrders.forEach(p => {
      if ((p.status === 'received' || p.status === 'completed') && !exists(p.id, 'purchase')) {
        const moveDetails = p.items.map((item: any) => {
          const product = allProducts.find(prod => prod.id === item.productId)
          const cost = item.unitPrice || product?.averagePrice || product?.price || 0
          return {
            name: product?.productName || "Unknown Product",
            quantity: item.receivedQuantity || item.requestedQuantity,
            price: cost,
            total: (item.receivedQuantity || item.requestedQuantity) * cost
          }
        })

        const totalValueChange = moveDetails.reduce((sum: number, d: any) => sum + d.total, 0)
        const totalQtyChange = moveDetails.reduce((sum: number, d: any) => sum + d.quantity, 0)

        movements.push({
          id: p.id,
          date: p.updatedAt || p.createdAt,
          type: 'purchase',
          reference: 'PO-' + p.id.slice(0, 8),
          itemsCount: p.items.length,
          totalQuantity: totalQtyChange,
          totalAmount: totalValueChange,
          description: p.supplierName || "Purchase Order",
          status: 'Received',
          details: moveDetails
        })
      }
    })

    // 6. Inventory Adjustments (Specific Table)
    adjustments.forEach(a => {
      if (exists(a.id, 'adjustment')) return;
      const product = allProducts.find(p => p.id === a.productId)
      if (product) {
        const cost = product.averagePrice || product.price || 0
        const valueChange = a.difference * cost

        movements.push({
          id: a.id,
          date: a.createdAt,
          type: 'adjustment',
          reference: 'ADJ',
          itemsCount: 1,
          totalQuantity: a.difference,
          totalAmount: Math.abs(valueChange),
          description: a.reason || "Stock Adjustment",
          status: 'Completed',
          details: [{
            name: product.productName,
            quantity: a.difference,
            price: cost,
            total: valueChange
          }]
        })
      }
    })

    // Sort Descending (Newest First)
    movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // 7. Calculate Running Balance (Inventory Value History)
    let runningValue = allProducts.reduce((sum, p) => sum + (p.currentStock * (p.averagePrice || p.price || 0)), 0)

    movements.forEach(m => {
      m.inventoryValueAfter = runningValue

      // Calculate Net Value Change
      const netChange = m.details?.reduce((sum, d) => sum + d.total, 0) || 0

      // Backward calculation: Value Before = Value After - Change
      // Issue (-50) -> Before = After - (-50) = After + 50
      // Purchase (+100) -> Before = After - 100
      m.inventoryValueBefore = runningValue - netChange

      runningValue = m.inventoryValueBefore

      m.inventoryValueAfter = Math.round(m.inventoryValueAfter * 100) / 100
      m.inventoryValueBefore = Math.round(m.inventoryValueBefore * 100) / 100
    })

    return movements
  }, [products, transactions, issues, returns, purchaseOrders, adjustments, auditLogs])

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

  const { filteredTransactions, filteredStockMovements, financialSummary } = useMemo(() => {
    let filtered = [...transactions]
    let filteredMovements = [...stockMovements]
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
        const tDate = new Date(t.createdAt || "")
        return tDate >= calcStartDate! && tDate <= calcEndDate!
      })
      // We do not filter movements by date here anymore, we do it below with all other filters
    }

    // Apply Advanced Filters to Stock Movements
    filteredMovements = filteredMovements.filter(m => {
      // Date Range
      if (calcStartDate && calcEndDate) {
        const mDate = new Date(m.date)
        // Reset times for accurate comparison if needed, but usually strictly >= <= matches well with logic above
        if (mDate < calcStartDate || mDate > calcEndDate) return false
      } else if (startDate && endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        const mDate = new Date(m.date)
        if (mDate < start || mDate > end) return false
      }

      // Branch Filter (Text match on description or reference until we have explicit branchId on movement)
      if (selectedBranches.length > 0) {
        // Issues/Returns usually have branch name in description
        // Purchases have supplier name. Adjustments have reason.
        // This is "best effort" text matching for now unless we add `branchId` to StockMovement type.
        // However, issues/returns usually have branchId property on the source object.
        // Accessing source object is hard here as we effectively flattened it.
        // Let's rely on string matching branch names in 'description' or 'details' for Issues/Returns.
        const branchNames = selectedBranches.map(id => branches.find(b => b.id === id)?.name).filter(Boolean)
        const matches = branchNames.some(name => m.description.includes(name || ''))
        if (!matches && (m.type === 'issue' || m.type === 'return')) return false
        // For other types like 'purchase', branch filter might not apply, so we might HIDE them if branch is selected?
        // Usually Branch Report implies "activity related to this branch".
        // If user selects a branch, only show issues/returns for that branch?
        if (selectedBranches.length > 0 && m.type !== 'issue' && m.type !== 'return') return false
      }

      // Status Filter
      // StockMovement has 'status' (Completed, Delivered, Received, etc.)
      if (selectedStatuses.length > 0) {
        // Map UI status to internal status
        // Pending, Received, Delivered
        const status = m.status?.toLowerCase() || ''
        const matches = selectedStatuses.some(s => status.includes(s.toLowerCase()))
        if (!matches) return false
      }

      // Type Filter
      if (selectedTypes.length > 0) {
        // m.type is 'add','edit','delete','purchase','sale','issue','return','adjustment'
        if (!selectedTypes.includes(m.type)) return false
      }

      // Invoice Search
      if (searchInvoice) {
        const q = searchInvoice.toLowerCase()
        const matchRef = m.reference?.toLowerCase().includes(q)
        const matchId = m.id.toLowerCase().includes(q)
        const matchDesc = m.description?.toLowerCase().includes(q)
        if (!matchRef && !matchId && !matchDesc) return false
      }

      // Product Filter
      if (selectedProducts.length > 0) {
        // Check if ANY detail item matches selected products
        // details: { name, ... } - strictly we don't have productId in details :(
        // We need to match by Name.
        // Let's map selected IDs to Names
        const selectedNames = selectedProducts.map(id => products.find(p => p.id === id)?.productName).filter(Boolean)
        const hasProduct = m.details?.some(d => selectedNames.some(n => d.name.includes(n || '')))
        if (!hasProduct) return false
      }

      // Category Filter
      if (selectedCategories.length > 0) {
        // Again, need to check if products in this movement belong to category
        // We have product names in details.
        // Map detail names back to products -> category
        const hasCategory = m.details?.some(d => {
          const prod = products.find(p => d.name.includes(p.productName))
          return prod && prod.category && selectedCategories.includes(prod.category)
        })
        if (!hasCategory) return false
      }

      // Location Filter
      if (selectedLocations.length > 0) {
        const hasLocation = m.details?.some(d => {
          const prod = products.find(p => d.name.includes(p.productName))
          return prod && prod.location && selectedLocations.includes(prod.location)
        })
        if (!hasLocation) return false
      }

      return true
    })


    // Calculate financial summary
    const totalPurchases = filtered.filter(t => t.type === 'purchase').reduce((sum, t) => sum + t.totalAmount, 0)
    const totalSales = filtered.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.totalAmount, 0)
    const profit = totalSales - totalPurchases

    const summary: FinancialSummary = {
      totalPurchases,
      totalSales,
      totalInventoryValue: 0, // Will be overridden or ignored in UI if we use the main totalInventoryValue
      profit,
      period: period === 'custom' ? `${startDate} - ${endDate}` : period
    }

    return {
      filteredTransactions: filtered,
      filteredStockMovements: filteredMovements,
      financialSummary: summary
    }
  }, [period, transactions, stockMovements, startDate, endDate, selectedBranches, selectedStatuses, selectedTypes, selectedCategories, selectedLocations, selectedProducts, searchInvoice, branches, products])



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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

                {/* Branch Filter */}
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.branch" fallback="Branch / الفرع" /></Label>
                  <MultiSelect
                    options={branches.map(b => ({ label: b.name, value: b.id }))}
                    selected={selectedBranches}
                    onChange={setSelectedBranches}
                    placeholder={t("reports.filters.selectBranch", "Select Branch / اختر الفرع")}
                  />
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.status" fallback="Status / الحالة" /></Label>
                  <MultiSelect
                    options={[
                      { label: `${t("common.pending")} / Pending`, value: "pending" },
                      { label: `${t("common.received")} / Received`, value: "received" },
                      { label: `${t("common.delivered")} / Delivered`, value: "delivered" },
                      { label: `${t("common.completed")} / Completed`, value: "completed" },
                    ]}
                    selected={selectedStatuses}
                    onChange={setSelectedStatuses}
                    placeholder={t("reports.filters.selectStatus", "Select Status / اختر الحالة")}
                  />
                </div>

                {/* Type Filter */}
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.type" fallback="Type / النوع" /></Label>
                  <MultiSelect
                    options={[
                      { label: "Purchase / شراء", value: "purchase" },
                      { label: "Issue / صرف", value: "issue" },
                      { label: "Return / مرتجع", value: "return" },
                      { label: "Adjustment / تسوية", value: "adjustment" },
                      { label: "Add / إضافة", value: "add" },
                      { label: "Edit / تعديل", value: "edit" },
                      { label: "Delete / حذف", value: "delete" },
                    ]}
                    selected={selectedTypes}
                    onChange={setSelectedTypes}
                    placeholder={t("reports.filters.selectType", "Select Type / اختر النوع")}
                  />
                </div>

                {/* Category Filter */}
                <div className="space-y-2">
                  <Label><DualText k="reports.category" fallback="Category / التصنيف" /></Label>
                  <MultiSelect
                    options={categories.map(c => ({ label: c, value: c }))}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    placeholder={t("reports.filters.selectCategory", "Select Category / اختر التصنيف")}
                  />
                </div>

                {/* Location Filter */}
                <div className="space-y-2">
                  <Label><DualText k="reports.location" fallback="Location / الموقع" /></Label>
                  <MultiSelect
                    options={locations.map(l => ({ label: l, value: l }))}
                    selected={selectedLocations}
                    onChange={setSelectedLocations}
                    placeholder={t("reports.filters.selectLocation", "Select Location / اختر الموقع")}
                  />
                </div>

                {/* Product Filter */}
                <div className="space-y-2 lg:col-span-2">
                  <Label><DualText k="reports.products" fallback="Products / المنتجات (Optional)" /></Label>
                  <MultiSelect
                    options={products.map(p => ({ label: p.productName + (p.productCode ? ` (${p.productCode})` : ''), value: p.id }))}
                    selected={selectedProducts}
                    onChange={setSelectedProducts}
                    placeholder={t("reports.filters.selectProducts", "Select specific products / اختر منتجات محددة")}
                  />
                </div>

                {/* Date and Invoice Search */}
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.custom.from" /></Label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPeriod('custom') }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label><DualText k="reports.filters.custom.to" /></Label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPeriod('custom') }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                {/* Invoice Search */}
                <div className="space-y-2 md:col-span-2">
                  <Label><DualText k="reports.filters.invoiceSearch" fallback="Invoice Search / بحث رقم الفاتورة" /></Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search invoice number..."
                      className="pl-8"
                      value={searchInvoice}
                      onChange={e => setSearchInvoice(e.target.value)}
                    />
                  </div>
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
                  {products.length} <DualText k="common.product" /> ({lowStockCount} <DualText k="common.low" />)
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-4 mb-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground"><DualText k="reports.openingBalance" fallback="رصيد البداية (للفترة)" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {filteredStockMovements.length > 0
                    ? filteredStockMovements[filteredStockMovements.length - 1].inventoryValueBefore?.toFixed(2)
                    : (stockMovements.length > 0 ? stockMovements[stockMovements.length - 1].inventoryValueBefore?.toFixed(2) : "0.00")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground"><DualText k="reports.totalIncrease" fallback="إجمالي الزيادة" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {filteredStockMovements.reduce((sum, m) => {
                    if (m.type === 'purchase' || m.type === 'return' || (m.type === 'adjustment' && m.totalQuantity > 0)) {
                      return sum + m.totalAmount
                    }
                    return sum
                  }, 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground"><DualText k="reports.totalDecrease" fallback="إجمالي النقص" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {filteredStockMovements.reduce((sum, m) => {
                    if (m.type === 'issue' || (m.type === 'adjustment' && m.totalQuantity < 0)) {
                      return sum + m.totalAmount
                    }
                    return sum
                  }, 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground"><DualText k="reports.closingBalance" fallback="رصيد النهاية" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {filteredStockMovements.length > 0
                    ? filteredStockMovements[0].inventoryValueAfter?.toFixed(2)
                    : (stockMovements.length > 0 ? stockMovements[0].inventoryValueAfter?.toFixed(2) : "0.00")}
                </div>
              </CardContent>
            </Card>
          </div>

          <StockMovementReportTable movements={filteredStockMovements} limit={1000} />

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
