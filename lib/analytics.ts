import { db } from "@/lib/db"
import { BranchInventory, ConsumptionRecord, Product } from "@/lib/types"

export interface StockHealthInsight {
    inventoryId: string
    productId: string
    productName: string
    currentStock: number
    dailyRate: number          // Average Daily Consumption (units/day)
    daysRemaining: number      // Estimated days until stockout
    runOutDate: Date | null    // Estimated date of stockout
    status: 'stable' | 'warning' | 'critical'
    recommendedRestock: number // Suggested quantity to order
}

export interface BranchHealthSummary {
    branchId: string
    criticalItems: number
    warningItems: number
    healthyItems: number
    insights: StockHealthInsight[]
}

// Configuration
const ANALYSIS_PERIOD_DAYS = 30
const WARNING_THRESHOLD_DAYS = 14
const CRITICAL_THRESHOLD_DAYS = 7
const TARGET_STOCK_DAYS = 30

/**
 * Core Engine: Analyze consumption and predict stock health for a single branch
 */
export async function analyzeBranchRisks(branchId: string): Promise<BranchHealthSummary> {
    const now = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - ANALYSIS_PERIOD_DAYS)

    // 1. Fetch Data
    const inventory = await db.branchInventory.where("branchId").equals(branchId).toArray()
    const consumption = await db.consumptionRecords
        .where("branchId").equals(branchId)
        .filter(c => new Date(c.date) >= thirtyDaysAgo)
        .toArray()

    // 2. Group consumption by Inventory ID
    const consumptionMap = new Map<string, number>() // inventoryId -> totalQuantity
    consumption.forEach(c => {
        const current = consumptionMap.get(c.branchInventoryId) || 0
        consumptionMap.set(c.branchInventoryId, current + c.quantity)
    })

    // 3. Generate Insights
    const insights: StockHealthInsight[] = inventory.map(item => {
        const totalConsumed = consumptionMap.get(item.id) || 0

        // Calculate Daily Rate (ADC)
        // Note: For items new to the system (< 30 days), accurate rate might require creation date check.
        // For simplicity, we stick to the 30-day window divisor or min 1.
        const dailyRate = totalConsumed / ANALYSIS_PERIOD_DAYS

        // Avoid division by zero
        const effectiveRate = dailyRate === 0 ? 0 : dailyRate

        let daysRemaining = 999
        let runOutDate: Date | null = null

        if (effectiveRate > 0) {
            daysRemaining = item.currentStock / effectiveRate
            const d = new Date()
            d.setDate(d.getDate() + Math.ceil(daysRemaining))
            runOutDate = d
        }

        // Determine Status
        let status: StockHealthInsight['status'] = 'stable'
        if (effectiveRate > 0) {
            if (daysRemaining <= CRITICAL_THRESHOLD_DAYS) status = 'critical'
            else if (daysRemaining <= WARNING_THRESHOLD_DAYS) status = 'warning'
        }

        // Calculate Recommendation
        // Target: Have enough for TARGET_STOCK_DAYS
        // Needed = (Rate * Target) - Current
        let recommendedRestock = 0
        if (effectiveRate > 0) {
            const targetLevel = effectiveRate * TARGET_STOCK_DAYS
            if (item.currentStock < targetLevel) {
                recommendedRestock = Math.ceil(targetLevel - item.currentStock)
            }
        }

        return {
            inventoryId: item.id,
            productId: item.productId,
            productName: item.productName,
            currentStock: item.currentStock,
            dailyRate: parseFloat(effectiveRate.toFixed(2)),
            daysRemaining: Math.floor(daysRemaining),
            runOutDate,
            status,
            recommendedRestock
        }
    })

    // Sort by Urgency (Critical first, then lowest days remaining)
    insights.sort((a, b) => a.daysRemaining - b.daysRemaining)

    return {
        branchId,
        criticalItems: insights.filter(i => i.status === 'critical').length,
        warningItems: insights.filter(i => i.status === 'warning').length,
        healthyItems: insights.filter(i => i.status === 'stable').length,
        insights
    }
}

/**
 * Analyze risks across all branches for Admin Dashboard
 */
export async function analyzeNetworkRisks(): Promise<BranchHealthSummary[]> {
    const branches = await db.branches.toArray()
    const summaries: BranchHealthSummary[] = []

    for (const branch of branches) {
        const summary = await analyzeBranchRisks(branch.id)
        if (summary.criticalItems > 0 || summary.warningItems > 0) {
            summaries.push(summary)
        }
    }

    // Sort by most critical first
    return summaries.sort((a, b) => b.criticalItems - a.criticalItems)
}

export interface WarehouseProcurementInsight {
    productId: string
    productCode: string
    productName: string
    currentWarehouseStock: number
    networkDailyConsumption: number
    daysOfCover: number
    status: 'good' | 'low' | 'critical'
    recommendedOrder: number
}

/**
 * Supply Chain Logic: Analyze Total Network Consumption vs Warehouse Stock
 */
export async function analyzeWarehouseProcurementNeeds(): Promise<WarehouseProcurementInsight[]> {
    const ANALYSIS_DAYS = 30
    const MIN_COVER_DAYS = 15 // Warehouse should have at least 15 days of stock
    const TARGET_COVER_DAYS = 45 // Target 45 days of stock

    const now = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - ANALYSIS_DAYS)

    // 1. Fetch Warehouse Stock (Products)
    const products = await db.products.toArray()

    // 2. Fetch All Consumption from All Branches
    const allConsumption = await db.consumptionRecords
        .filter(c => new Date(c.date) >= thirtyDaysAgo)
        .toArray()

    // 3. Aggregate Consumption by Product ID
    const consumptionMap = new Map<string, number>()
    allConsumption.forEach(c => {
        const current = consumptionMap.get(c.productId) || 0
        consumptionMap.set(c.productId, current + c.quantity)
    })

    // 4. Generate Insights
    const insights: WarehouseProcurementInsight[] = products.map(p => {
        const totalConsumed = consumptionMap.get(p.id) || 0
        const dailyRate = totalConsumed / ANALYSIS_DAYS

        // Days of Cover = Stock / Daily Rate
        let daysOfCover = 999
        if (dailyRate > 0) {
            daysOfCover = p.currentStock / dailyRate
        }

        let status: WarehouseProcurementInsight['status'] = 'good'
        if (daysOfCover < 7) status = 'critical'
        else if (daysOfCover < MIN_COVER_DAYS) status = 'low'

        // Only recommend if status is not good
        let recommendedOrder = 0
        if (status !== 'good' && dailyRate > 0) {
            const targetStock = dailyRate * TARGET_COVER_DAYS
            recommendedOrder = Math.ceil(targetStock - p.currentStock)
        }

        return {
            productId: p.id,
            productCode: p.productCode,
            productName: p.productName,
            currentWarehouseStock: p.currentStock,
            networkDailyConsumption: parseFloat(dailyRate.toFixed(2)),
            daysOfCover: Math.floor(daysOfCover),
            status,
            recommendedOrder
        }
    })

    // Filter to show only items needing attention (low or critical)
    // and sort by urgency (lowest days of cover)
    return insights
        .filter(i => i.status !== 'good' && i.recommendedOrder > 0)
        .sort((a, b) => a.daysOfCover - b.daysOfCover)
}
