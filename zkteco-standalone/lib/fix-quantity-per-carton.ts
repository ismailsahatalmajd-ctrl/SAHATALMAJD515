import { db } from './db'
import { getProducts } from './storage'

/**
 * Fix existing products with quantityPerCarton = 0 by setting them to 1
 */
export async function fixQuantityPerCarton() {
    const products = getProducts()
    const toUpdate = products.filter(p => !p.quantityPerCarton || p.quantityPerCarton === 0)

    console.log(`Fixing ${toUpdate.length} products with quantityPerCarton = 0`)

    for (const product of toUpdate) {
        await db.products.update(product.id!, {
            quantityPerCarton: 1
        })
    }

    return toUpdate.length
}
