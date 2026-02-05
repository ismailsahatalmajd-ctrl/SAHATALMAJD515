// Migration Script: Fix Inventory Count for Existing Products
// This script will update inventoryCount for all products based on openingStock + purchases - issues

import { db } from './lib/db'

async function fixInventoryCounts() {
    console.log('🔄 Starting inventory count migration...')

    try {
        // Get all products from IndexedDB
        const products = await db.products.toArray()
        console.log(`📦 Found ${products.length} products`)

        let updated = 0

        for (const product of products) {
            const opening = Number(product.openingStock || 0)
            const purchases = Number(product.purchases || 0)
            const issues = Number(product.issues || 0)

            // Calculate correct inventory count
            const calculatedInventory = opening + purchases - issues

            // Only update if different
            if (product.inventoryCount !== calculatedInventory) {
                await db.products.update(product.id, {
                    inventoryCount: calculatedInventory,
                    currentStockValue: calculatedInventory * Number(product.averagePrice || product.price || 0),
                    updatedAt: new Date().toISOString()
                })

                console.log(`✅ Updated ${product.productName}: ${product.inventoryCount || 0} → ${calculatedInventory}`)
                updated++
            }
        }

        console.log(`✅ Migration complete! Updated ${updated} products.`)
        alert(`تم تحديث ${updated} منتجات بنجاح!`)

        // Reload page to refresh data
        window.location.reload()

    } catch (error) {
        console.error('❌ Migration failed:', error)
        alert('فشل التحديث! راجع console للتفاصيل.')
    }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    // Add button to run migration
    const button = document.createElement('button')
    button.textContent = 'Fix Inventory Counts (إصلاح الجرد)'
    button.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;padding:10px 20px;background:#10b981;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;'
    button.onclick = fixInventoryCounts
    document.body.appendChild(button)

    console.log('💡 Click "Fix Inventory Counts" button to run migration')
}

export { fixInventoryCounts }
