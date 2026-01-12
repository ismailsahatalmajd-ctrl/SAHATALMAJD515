// Script to fix existing products with quantityPerCarton = 0
// Run this in browser console on http://localhost:3000

(async function fixQuantity() {
  // Get Dexie instance
  const { db } = await import('./lib/db.js');
  
  // Get all products
  const products = await db.products.toArray();
  
  // Filter products with quantityPerCarton = 0 or null
  const toFix = products.filter(p => !p.quantityPerCarton || p.quantityPerCarton === 0);
  
  console.log(`Found ${toFix.length} products to fix`);
  
  // Update them
  for (const product of toFix) {
    await db.products.update(product.id, {
      quantityPerCarton: 1
    });
  }
  
  console.log(`✅ Fixed ${toFix.length} products!`);
  alert(`تم تحديث ${toFix.length} منتج بنجاح!`);
  
  // Reload page
  window.location.reload();
})();
