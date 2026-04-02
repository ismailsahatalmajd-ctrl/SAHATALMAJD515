import type { Product } from "./types"
import { db } from "./db"
import { store } from "./data-store"
import { notify } from "./events"
import { syncProductsBatch } from "./firebase-sync-engine"
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
 * 1. Generate PDF report
 * 2. Reset purchases to 0
 * 3. Reset issues to 0
 * 4. Reset issuesValue to 0
 * 5. Set openingStock = currentStock
 * 6. Save closing record
 */
export async function closeMonth(onProgress?: (curr: number, total: number, msg: string) => void): Promise<MonthClosingRecord> {
    const products = await db.products.toArray()
    if (onProgress) onProgress(0, products.length, "جاري توليد تقرير PDF...")
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

    // Step 2-5: Update all products
    if (onProgress) onProgress(0, products.length, "جاري حساب القيم الجديدة...")
    const updates = products.map(product => {
        const opening = Number(product.openingStock) || 0
        const purchases = Number(product.purchases) || 0
        const issues = Number(product.issues) || 0
        const theoreticalCurrent = opening + purchases - issues
        const inventoryCount = Number(product.inventoryCount) || 0
        const storedCurrent = Number(product.currentStock)
        const hasStoredCurrent = !Number.isNaN(storedCurrent)
        const baseStock = inventoryCount > 0
            ? inventoryCount
            : (hasStoredCurrent ? storedCurrent : theoreticalCurrent)
        const price = Number(product.price || 0)
        const averagePrice = Number(product.averagePrice ?? price ?? 0)

        return {
            ...product,
            openingStock: baseStock,
            currentStock: baseStock,
            purchases: 0, // 2. Reset purchases
            issues: 0, // 3. Reset issues
            issuesValue: 0, // 4. Reset issuesValue (quantity is already 0)
            currentStockValue: baseStock * averagePrice,
            inventoryCount: 0, // Reset inventory count too, as it has been applied
            lastActivity: now.toISOString(),
        }
    })

    // Save to local database
    if (onProgress) onProgress(products.length, products.length, "جاري الحفظ في قاعدة البيانات...")
    try {
        if (db && db.products && typeof db.products.bulkPut === 'function') {
            // Use transaction to ensure atomicity
            await db.transaction('rw', db.products, async () => {
                await db.products.bulkPut(updates)
            })
            console.log(`✅ Saved ${updates.length} products to local database`)

            // Verify the write immediately
            if (updates.length > 0) {
                const check = await db.products.get(updates[0].id!)
                if (check && check.openingStock !== updates[0].openingStock) {
                    throw new Error("DB write verification failed")
                }
            }

            // Update Cache
            if (store && store.cache) {
                store.cache.products = updates
                notify('products_change')
                notify('change')
            }
        } else {
            console.warn('Local database not available, syncing directly to cloud')
        }
    } catch (dbErr) {
        console.error('Failed to save to local database:', dbErr)
        throw dbErr
    }

    // Sync all updated products to cloud (Blocking to ensure consistency as requested)
    if (onProgress) onProgress(products.length, products.length, "جاري المزامنة مع السحابة...")
    try {
        await syncProductsBatch(updates)
        console.log(`✅ Successfully synced ${updates.length} products to cloud`)
    } catch (e) {
        console.error('Cloud sync failed:', e)
        // We don't throw here to allow local closing to complete even if cloud fails (it will be queued)
    }


    // Step 6: Save closing record
    const record: MonthClosingRecord = {
        date: now.toISOString(),
        totalProducts: products.length,
        month: monthStr,
    }

    try {
        if (db && db.settings && typeof db.settings.put === 'function') {
            await db.settings.put({
                key: LAST_CLOSING_KEY,
                value: record,
            })
        }
    } catch (dbErr) {
        console.warn('Failed to save closing record to local database:', dbErr)
    }

    return record
}
