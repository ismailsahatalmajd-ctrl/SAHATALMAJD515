import type { Product } from "./types"
import { db } from "./db"
import { generateProductsPDF } from "./products-pdf-generator"

export interface MonthClosingRecord {
    date: string
    totalProducts: number
    month: string // "2026-01"
    reportPath?: string
}

const LAST_CLOSING_KEY = "last_month_closing"

/**
 * Get the last month closing date from settings
 */
export async function getLastClosingDate(): Promise<string | null> {
    try {
        const setting = await db.settings.get(LAST_CLOSING_KEY)
        return setting?.value?.date || null
    } catch {
        return null
    }
}

/**
 * Check if we should show closing alert (new month started since last closing)
 */
export async function shouldShowClosingAlert(): Promise<boolean> {
    const lastClosing = await getLastClosingDate()
    if (!lastClosing) return true // Never closed before

    const lastMonth = new Date(lastClosing).getMonth()
    const currentMonth = new Date().getMonth()

    return currentMonth !== lastMonth
}

/**
 * Close the current month:
 * 1. Generate PDF report for current month
 * 2. Update all products: openingStock = currentStock
 * 3. Reset purchases and issues to 0
 * 4. Save closing record
 */
export async function closeMonth(): Promise<MonthClosingRecord> {
    const products = await db.products.toArray()
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Step 1: Generate PDF report for old month BEFORE updating
    try {
        await generateProductsPDF({
            products,
            visibleColumns: {
                image: false,
                productCode: true,
                itemNumber: true,
                productName: true,
                location: true,
                category: true,
                unit: true,
                quantityPerCarton: false,
                cartonDimensions: false,
                openingStock: true,
                purchases: true,
                issues: true,
                inventoryCount: false,
                currentStock: true,
                difference: false,
                price: true,
                averagePrice: true,
                currentStockValue: true,
                issuesValue: true,
                turnoverRate: false,
                status: false,
                lastActivity: false,
            },
            columnLabels: {},
            title: `تقرير المخزون - نهاية ${monthStr}`,
        })
    } catch (error) {
        console.error("Failed to generate closing PDF:", error)
    }

    // Step 2 & 3: Update all products
    const updates = products.map(product => ({
        ...product,
        openingStock: product.currentStock || 0,
        purchases: 0,
        issues: 0,
        issuesValue: 0, // Reset issues value since issues = 0
        lastActivity: now.toISOString(),
    }))

    await db.products.bulkPut(updates)

    // Sync all updated products to cloud (non-blocking, in background)
    // Don't wait for this to avoid UI freeze
    import('./firebase-sync-engine').then(({ syncProduct }) => {
        updates.forEach(product => {
            if (product.id) {
                syncProduct(product).catch(e => console.error('Sync failed for product:', product.id, e))
            }
        })
        console.log(`✅ Started syncing ${updates.length} products to cloud`)
    }).catch(e => console.error('Cloud sync module failed:', e))


    // Step 4: Save closing record
    const record: MonthClosingRecord = {
        date: now.toISOString(),
        totalProducts: products.length,
        month: monthStr,
    }

    await db.settings.put({
        key: LAST_CLOSING_KEY,
        value: record,
    })

    return record
}
