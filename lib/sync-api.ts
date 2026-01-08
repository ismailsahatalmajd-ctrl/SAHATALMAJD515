
import { db } from "./db"
import { db as firestore } from "./firebase"
import { doc, setDoc, deleteDoc, writeBatch, collection, getDocs, query } from "firebase/firestore"
import type { Product, Transaction, Issue, Return, Branch, InventoryAdjustment, Category, Location, Unit } from "./types"
import type { BranchRequest } from "./branch-request-types"
import type { BranchInvoice } from "./branch-invoice-types"

// --- Helper for Offline Enqueueing ---
async function enqueue(table: string, op: string, payload: any) {
  // We can rely on Firebase Offline Persistence mostly, but keeping this as backup or for manual sync logic
  try {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    await db.syncQueue.put({
      id,
      table,
      op,
      payload,
      ts: new Date().toISOString(),
      attempts: 0
    })
    console.log(`[Sync] Enqueued ${op} for ${table}`)
  } catch (e) {
    console.error("[Sync] Failed to enqueue", e)
  }
}

// --- Process Queue (Called when online) ---
export async function processSyncQueue(limit: number = 25) {
  try {
    const items = await db.syncQueue.orderBy('ts').limit(limit).toArray();
    if (items.length === 0) return;

    console.log(`[Sync] Processing ${items.length} queued items...`);

    for (const item of items) {
      const success = await performFirebaseOp(item.table, item.op as any, item.payload, true);
      if (success) {
        await db.syncQueue.delete(item.id);
      } else {
        // Increment attempts?
        // For now, leave it. If it fails, it stays in queue.
        // Maybe add a delay or backoff?
      }
    }
  } catch (e) {
    console.error("[Sync] Error processing queue", e);
  }
}

async function performFirebaseOp(collectionName: string, op: 'upsert' | 'delete', data: any, fromQueue = false) {
  try {
    // collectionName mapping: some might differ
    // products -> products
    // transactions -> transactions
    // branch_requests -> branchRequests (camelCase in Firebase usually preferred? Or keep snake_case?)
    // Let's stick to the names passed in. 
    // BUT 'branch_requests' from Supabase legacy might need to be 'branchRequests' if we use that in use-firestore.ts
    // In use-firestore.ts: useCollection<BranchRequest>("branchRequests")
    // So we MUST use "branchRequests" not "branch_requests".

    // Map table names if necessary
    const map: Record<string, string> = {
      'branch_requests': 'branchRequests',
      'branch_invoices': 'branchInvoices',
      'inventory_adjustments': 'inventoryAdjustments',
      'adjustments': 'inventoryAdjustments'
    }
    const targetCollection = map[collectionName] || collectionName

    if (op === 'upsert') {
      // Ensure ID
      if (!data.id) throw new Error("Document must have ID")
      // Remove undefined
      const cleanData = JSON.parse(JSON.stringify(data))
      await setDoc(doc(firestore, targetCollection, data.id), cleanData, { merge: true })
    } else {
      const idToDelete = data.id
      if (idToDelete) {
        await deleteDoc(doc(firestore, targetCollection, idToDelete))
      }
    }
    return true
  } catch (e) {
    console.warn(`[Sync] Operation failed for ${collectionName}, adding to queue.`, e)
    if (!fromQueue) {
      await enqueue(collectionName, op, data)
    }
    return false
  }
}

// --- Products ---
export async function syncProduct(product: Product) {
  return performFirebaseOp('products', 'upsert', product)
}
export async function deleteProductApi(id: string) {
  return performFirebaseOp('products', 'delete', { id })
}

export async function deleteAllProductsApi(ids: string[]) {
  try {
    const batchSize = 500
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = writeBatch(firestore)
      const chunk = ids.slice(i, i + batchSize)
      chunk.forEach(id => {
        const ref = doc(firestore, 'products', id)
        batch.delete(ref)
      })
      await batch.commit()
    }
    return true
  } catch (e) {
    console.error("Batch delete failed", e)
    return false
  }
}

// --- Transactions ---
export async function syncTransaction(transaction: Transaction) {
  return performFirebaseOp('transactions', 'upsert', transaction)
}

// --- Issues ---
export async function syncIssue(issue: Issue) {
  return performFirebaseOp('issues', 'upsert', issue)
}

// --- Returns ---
export async function syncReturn(ret: Return) {
  return performFirebaseOp('returns', 'upsert', ret)
}

// --- Branches ---
export async function syncBranch(branch: Branch) {
  return performFirebaseOp('branches', 'upsert', branch)
}
export async function deleteBranchApi(id: string) {
  return performFirebaseOp('branches', 'delete', { id })
}

// --- Adjustments ---
export async function syncAdjustment(adj: InventoryAdjustment) {
  return performFirebaseOp('inventoryAdjustments', 'upsert', adj)
}

// --- Categories ---
export async function syncCategory(category: Category) {
  return performFirebaseOp('categories', 'upsert', category)
}
export async function deleteCategoryApi(id: string) {
  return performFirebaseOp('categories', 'delete', { id })
}

// --- Locations ---
export async function syncLocation(location: Location) {
  return performFirebaseOp('locations', 'upsert', location)
}
export async function deleteLocationApi(id: string) {
  return performFirebaseOp('locations', 'delete', { id })
}

// --- Units ---
export async function syncUnit(unit: Unit) {
  return performFirebaseOp('units', 'upsert', unit)
}
export async function deleteUnitApi(id: string) {
  return performFirebaseOp('units', 'delete', { id })
}

// --- Branch Requests ---
export async function syncBranchRequest(req: BranchRequest) {
  return performFirebaseOp('branchRequests', 'upsert', req)
}

// --- Branch Invoices ---
export async function syncBranchInvoice(inv: BranchInvoice) {
  return performFirebaseOp('branchInvoices', 'upsert', inv)
}

// --- Bulk Operations ---

export async function pushAllData() {
  // Not heavily used if we sync incrementally
  console.log("Push all data not implemented for Firebase (use incremental sync)")
}

// import { pullAllDataFromFirebase } from "./firebase-sync-engine" // Circular dependency
// Imports handled at top level to avoid duplicates
// import { db as firestore } from "./firebase"
// import { collection, getDocs, query } from "firebase/firestore"
// import { db as localDb } from "./db"

export async function pullAllData() {
  console.log("Starting full data pull from Firebase (Inline via sync-api)...")
  try {
    const save = async (collName: string, table: any) => {
      const q = query(collection(firestore, collName))
      const snap = await getDocs(q)
      const items = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      if (items.length) await table.bulkPut(items)
    }
    await Promise.all([
      save('products', db.products),
      save('categories', db.categories),
      save('branches', db.branches),
      save('transactions', db.transactions),
      save('branchRequests', db.branchRequests),
      save('product_images', db.productImages)
    ])
    return 1
  } catch (e) {
    console.error("Pull failed", e)
    return 0
  }
}

// --- Helper for Batch Delete ---
async function batchDeleteApi(collectionName: string, ids: string[]) {
  try {
    const batchSize = 500
    const map: Record<string, string> = {
      'branch_requests': 'branchRequests',
      'branch_invoices': 'branchInvoices',
      'inventory_adjustments': 'inventoryAdjustments'
    }
    const target = map[collectionName] || collectionName

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = writeBatch(firestore)
      const chunk = ids.slice(i, i + batchSize)
      chunk.forEach(id => {
        const ref = doc(firestore, target, id)
        batch.delete(ref)
      })
      await batch.commit()
    }
    return true
  } catch (e) {
    console.error(`Batch delete failed for ${collectionName}`, e)
    return false
  }
}

export async function deleteAllTransactionsApi(ids: string[]) { return batchDeleteApi('transactions', ids) }
export async function deleteAllIssuesApi(ids: string[]) { return batchDeleteApi('issues', ids) }
export async function deleteAllReturnsApi(ids: string[]) { return batchDeleteApi('returns', ids) }
export async function deleteAllBranchesApi(ids: string[]) { return batchDeleteApi('branches', ids) }
export async function deleteAllCategoriesApi(ids: string[]) { return batchDeleteApi('categories', ids) }
export async function deleteAllLocationsApi(ids: string[]) { return batchDeleteApi('locations', ids) }
export async function deleteAllUnitsApi(ids: string[]) { return batchDeleteApi('units', ids) }
export async function deleteAllAdjustmentsApi(ids: string[]) { return batchDeleteApi('inventoryAdjustments', ids) }
export async function deleteAllBranchRequestsApi(ids: string[]) { return batchDeleteApi('branchRequests', ids) }
export async function deleteAllBranchInvoicesApi(ids: string[]) { return batchDeleteApi('branchInvoices', ids) }
export async function deleteAllPurchaseRequestsApi(ids: string[]) { return batchDeleteApi('purchaseRequests', ids) }
export async function deleteAllProductImagesApi(ids: string[]) { return batchDeleteApi('productImages', ids) }
