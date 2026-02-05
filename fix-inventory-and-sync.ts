/**
 * Fix Inventory Count Script
 * 
 * Purpose:
 * 1. Ensures all products have correct inventory count based on formula: opening + purchases - issues
 * 2. Syncs all data to Firebase
 * 
 * Formula: Inventory Count = Opening Stock + Purchases - Issues/Returns
 */

import { db } from './lib/db'
import { syncProductsBatch } from './lib/firebase-sync-engine'

async function fixInventoryAndSync() {
    console.log('🔄 Starting inventory count fix and Firebase sync...')

    try {
        // Get all products from IndexedDB
        const products = await db.products.toArray()
        console.log(`📦 Found ${products.length} products`)

        let updated = 0
        const productsToSync: any[] = []

        for (const product of products) {
            const opening = Number(product.openingStock || 0)
            const purchases = Number(product.purchases || 0)
            const issues = Number(product.issues || 0)

            // Calculate correct inventory count (theoretical stock)
            const calculatedCurrentStock = opening + purchases - issues

            // Check if currentStock needs updating
            if (product.currentStock !== calculatedCurrentStock) {
                product.currentStock = calculatedCurrentStock
                product.currentStockValue = calculatedCurrentStock * Number(product.averagePrice || product.price || 0)
                product.updatedAt = new Date().toISOString()
                updated++
            }

            // Make sure inventoryCount exists (physical count)
            // If it doesn't exist, initialize it to the current stock
            if (product.inventoryCount === undefined || product.inventoryCount === null) {
                product.inventoryCount = calculatedCurrentStock
                product.updatedAt = new Date().toISOString()
                updated++
            }

            // Update in local database
            await db.products.put(product)
            productsToSync.push(product)

            console.log(`✅ Updated ${product.productName}: 
  Opening: ${opening}, Purchases: ${purchases}, Issues: ${issues}
  Current Stock: ${calculatedCurrentStock}, Inventory Count: ${product.inventoryCount}`)
        }

        console.log(`✅ Local database updated! Updated ${updated} products.`)

        // Sync all products to Firebase
        console.log(`🌐 Syncing ${productsToSync.length} products to Firebase...`)
        await syncProductsBatch(productsToSync)

        console.log(`✅ All products synced to Firebase!`)
        alert(`تم تحديث ${updated} منتج بنجاح و تم الرفع إلى Firebase!`)

        // Reload page to refresh data
        if (typeof window !== 'undefined') {
            window.location.href = '/'
        }

    } catch (error) {
        console.error('❌ Fix failed:', error)
        alert('فشل التحديث! راجع console للتفاصيل.')
    }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    // Add button to run fix
    const button = document.createElement('button')
    button.textContent = 'Fix Inventory & Sync (إصلاح الجرد ورفع البيانات)'
    button.style.cssText = `
        position:fixed;
        top:10px;
        left:10px;
        z-index:9999;
        padding:10px 20px;
        background:#3b82f6;
        color:white;
        border:none;
        border-radius:5px;
        cursor:pointer;
        font-weight:bold;
        font-size:12px;
    `
    button.onclick = fixInventoryAndSync
    document.body.appendChild(button)

    console.log('💡 Click "Fix Inventory & Sync" button to run')
}

export { fixInventoryAndSync }
