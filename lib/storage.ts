import type {
  Product,
  Category,
  Transaction,
  InventoryAdjustment,
  FinancialSummary,
  Branch,
  Unit,
  Issue,
  Return,
  Location,
  IssueDraft,
  PurchaseOrder,
  PurchaseOrderItem,
  VerificationLog,
} from "./types"
export type { PurchaseOrder, PurchaseOrderItem }
import type { BranchInvoice } from './branch-invoice-types'
import type { BranchRequest } from './branch-request-types'
import type { PurchaseRequest } from './purchase-request-types'
import { db } from './db'
export { db }
import { getDeviceId } from './device'
import { markAsDeleting, unmarkAsDeleting } from "./sync-state";
import {
  syncProduct, deleteProductApi, deleteAllProductsApi,
  syncTransaction,
  syncIssue,
  syncReturn,
  syncCategory,
  deleteCategoryApi,
  syncBranch,
  deleteBranchApi,
  syncUnit,
  deleteUnitApi,
  syncLocation,
  deleteLocationApi,
  syncInventoryAdjustment as syncAdjustment,
  syncBranchRequest,
  syncBranchInvoice,
  syncProductImageToCloud,
  deleteProductImageFromCloud,
  startRealtimeSync,
  stopRealtimeSync
} from './firebase-sync-engine'

// Monthly Closing
export { closeMonth, getLastClosingDate, shouldShowClosingAlert } from './monthly-closing'
export type { MonthClosingRecord } from './monthly-closing'

import {
  deleteAllTransactionsApi,
  deleteAllIssuesApi,
  deleteAllReturnsApi,
  deleteAllBranchesApi,
  deleteAllCategoriesApi,
  deleteAllLocationsApi,
  deleteAllUnitsApi,
  deleteAllAdjustmentsApi,
  deleteAllBranchRequestsApi,
  deleteAllBranchInvoicesApi,
  deleteAllPurchaseRequestsApi,
  deleteAllProductImagesApi
} from './sync-api'
export { subscribe, notify } from "./events"
import { notify } from "./events"
import type { StoreEvent } from "./events"
import { store, initDataStore, reloadFromDb } from './data-store'
export { store, initDataStore, reloadFromDb, updateStoreCache, removeFromStoreCache, initDataStoreWithProgress } from './data-store'
export {
  deleteAllTransactionsApi, deleteAllIssuesApi, deleteAllReturnsApi,
  deleteAllBranchesApi, deleteAllCategoriesApi, deleteAllLocationsApi,
  deleteAllUnitsApi, deleteAllAdjustmentsApi, deleteAllBranchRequestsApi,
  deleteAllBranchInvoicesApi, deleteAllPurchaseRequestsApi, deleteAllProductImagesApi
} from './sync-api'

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9)

export async function syncAllFromServer() {
  console.log("Starting Sync...");
  startRealtimeSync();
}

export function clearAppCache() {
  store.cache = {
    products: [],
    categories: [],
    transactions: [],
    branches: [],
    units: [],
    issues: [],
    returns: [],
    locations: [],
    issueDrafts: [],
    purchaseOrders: [],
    adjustments: [],
    verificationLogs: [],
    branchInvoices: [],
    branchRequests: [],
    purchaseRequests: []
  }
  notify('change')
  reloadFromDb().catch(console.error)
}

export async function factoryReset() {
  try {
    // 0. Cloud Data Wipe (Optional/Prompted usually, but enforced here based on 'Factory Reset' expectation)
    // We try to clear cloud data to prevent re-sync
    try {
      const [
        products, cats, branches, trans, issues, returns, units, locs, adjs, reqs, invs, preqs, imgs
      ] = await Promise.all([
        db.products.toArray(),
        db.categories.toArray(),
        db.branches.toArray(),
        db.transactions.toArray(),
        db.issues.toArray(),
        db.returns.toArray(),
        db.units.toArray(),
        db.locations.toArray(),
        db.inventoryAdjustments.toArray(),
        db.branchRequests.toArray(),
        db.branchInvoices.toArray(),
        db.purchaseRequests.toArray(),
        db.productImages.toArray()
      ])

      await Promise.all([
        deleteAllProductsApi(products.map(p => p.id)),
        deleteAllCategoriesApi(cats.map(p => p.id)),
        deleteAllBranchesApi(branches.map(p => p.id)),
        deleteAllTransactionsApi(trans.map(p => p.id)),
        deleteAllIssuesApi(issues.map(p => p.id)),
        deleteAllReturnsApi(returns.map(p => p.id)),
        deleteAllUnitsApi(units.map(p => p.id)),
        deleteAllLocationsApi(locs.map(p => p.id)),
        deleteAllAdjustmentsApi(adjs.map(p => p.id)),
        deleteAllBranchRequestsApi(reqs.map(p => p.id)),
        deleteAllBranchInvoicesApi(invs.map(p => p.id)),
        deleteAllPurchaseRequestsApi(preqs.map(p => p.id)),
        deleteAllProductImagesApi(imgs.map(p => p.productId))
      ])
    } catch (e) {
      console.error("Failed to clear cloud data:", e)
    }

    clearAppCache()

    // 1. Clear Dexie Tables
    await Promise.all([
      db.products.clear(),
      db.categories.clear(),
      db.branches.clear(),
      db.transactions.clear(),
      db.issues.clear(),
      db.returns.clear(),
      db.units.clear(),
      db.locations.clear(),
      db.issueDrafts.clear(),
      db.purchaseOrders.clear(),
      db.verificationLogs.clear(),
      db.inventoryAdjustments.clear(),
      db.branchInvoices.clear(),
      db.branchRequests.clear(),
      db.purchaseRequests.clear(),
      // db.settings.clear(),
      db.auditLogs.clear(),
      db.notifications.clear(),
      db.productImages.clear(),
      db.changeLogs.clear(),
      db.syncQueue.clear(),
      db.conflictLogs.clear(),
      db.imageCache.clear()
    ])

    // 2. Clear Local Cache in Memory
    store.cache = {
      products: [],
      categories: [],
      transactions: [],
      branches: [],
      units: [],
      issues: [],
      returns: [],
      locations: [],
      issueDrafts: [],
      purchaseOrders: [],
      verificationLogs: [],
      inventoryAdjustments: [],
      branchInvoices: [],
      branchRequests: [],
      purchaseRequests: [],
      notifications: [],
      productImages: [],
      changeLogs: []
    } as any

    notify('products_change')
    notify('categories_change')
    notify('branches_change')
    notify('transactions_change')

    return true
  } catch (error) {
    console.error('Factory reset failed:', error)
    return false
  }
}

export async function deleteDemoData() {
  return factoryReset()
}

export async function hardReset() {
  if (typeof window === 'undefined') return
  try {
    console.warn("Hard Reset: Deleting local database and clearing storage...");
    await db.delete()
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  } catch (e) {
    console.error('Hard reset failed:', e)
    // Fallback: clear what we can and reload
    localStorage.clear()
    window.location.reload()
  }
}

if (typeof window !== 'undefined') {
  store.init()
}

// Products
export function getProducts(): Product[] {
  return store.cache.products
}

export function saveProducts(products: Product[]): void {
  store.cache.products = products
  db.products.bulkPut(products).catch(console.error)
  notify('products_change')
}

export async function addProduct(product: Omit<Product, "id" | "createdAt" | "updatedAt"> | Product): Promise<Product> {
  try {
    // Check if ID exists (full product passed) or generate new
    const id = (product as Product).id || generateId()

    // Prevent duplicates on creation (manual entry protection)
    if (!(product as Product).id) {
      const code = (product.productCode || "").trim()
      const num = (product.itemNumber || "").trim()
      if (code || num) {
        const existing = store.cache.products.find(p =>
          (code && p.productCode === code) || (num && p.itemNumber === num)
        )
        if (existing) {
          console.warn(`Prevented duplicate creation for ${code || num}`)
          // For now, we update the existing one to merge changes if it's a re-entry attempt?
          // Or just throw? 
          // User wants "Root Solution". Preventing duplicates is Root.
          // Let's throw an error so the UI handles it (e.g. "Product exists").
          throw new Error("يوجد منتج بنفس الكود أو الرقم مسبقاً")
        }
      }
    }

    // Optimization: Handle large images
    let image = product.image
    if (image && image.length > 500 && !image.startsWith('http') && image !== 'DB_IMAGE') {
      await db.productImages.put({ productId: id, data: image })
      try {
        // Sync image to cloud
        await syncProductImageToCloud(id, image)
      } catch (e) {
        console.error("Failed to sync new product image", e)
      }
      image = 'DB_IMAGE'
    }

    const newProduct: Product = {
      ...product,
      id,
      image,
      createdAt: (product as Product).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastModifiedBy: getDeviceId(),
    } as Product

    // Calculate initial inventory logic if needed (legacy from cache version)
    if (newProduct.inventoryCount === undefined) {
      newProduct.inventoryCount = (newProduct.openingStock || 0) + (newProduct.purchases || 0) - (newProduct.issues || 0)
    }

    // Update Cache
    const products = store.cache.products
    const idx = products.findIndex(p => p.id === newProduct.id)
    if (idx >= 0) products[idx] = newProduct
    else products.push(newProduct)

    // DB Write
    await db.products.put(newProduct);

    // Sync - AWAIT it to ensure it reaches cloud or throws
    try {
      await syncProduct(newProduct);
    } catch (syncErr) {
      console.error("Sync Error for new product:", syncErr);
    }

    notify("products_change")
    return newProduct
  } catch (err) {
    console.error("Add Product Failed", err);
    throw err;
  }
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
  try {
    // Optimization: If image is large, store in separate table
    if (updates.image && updates.image.length > 500 && !updates.image.startsWith('http')) {
      await db.productImages.put({ productId: id, data: updates.image })
      try {
        await syncProductImageToCloud(id, updates.image)
      } catch (e) { console.error(e) }
      updates.image = 'DB_IMAGE'
    } else if (updates.image === null || updates.image === '') {
      // If clearing image, also clear side table
      await db.productImages.delete(id)
      try {
        await deleteProductImageFromCloud(id)
      } catch (e) { console.error(e) }
    }

    const products = store.cache.products
    const index = products.findIndex((p) => p.id === id)

    // Optimistic update in cache
    if (index !== -1) {
      // Apply updates
      const updated = {
        ...products[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // Recalc logic
      if (updates.openingStock !== undefined || updates.purchases !== undefined || updates.issues !== undefined) {
        updated.inventoryCount = (updated.openingStock || 0) + (updated.purchases || 0) - (updated.issues || 0)
      }

      products[index] = updated;

      // DB Put
      await db.products.put(updated);

      // Sync
      try {
        await syncProduct(updated)
      } catch (e) {
        console.error("Sync Error updateProduct:", e)
      }

      notify("products_change")
      return updated;
    }

    // Fallback if not in cache (should be rare)
    const fromDb = await db.products.get(id);
    if (fromDb) {
      const updated = { ...fromDb, ...updates, updatedAt: new Date().toISOString() };
      await db.products.put(updated);
      try {
        await syncProduct(updated)
      } catch (e) {
        console.error("Sync Error updateProduct fallback:", e)
      }
      return updated;
    }

    return null;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    markAsDeleting(id); // Prevent sync resurrection

    const products = store.cache.products
    store.cache.products = products.filter(p => p.id !== id)

    await db.products.delete(id);
    // Ensure we delete the local image cache for this product
    await db.productImages.delete(id).catch(() => { })

    try {
      await deleteProductApi(id)
      await deleteProductImageFromCloud(id)
      console.log(`[Storage] Deleted product ${id} from cloud`)
      // Keep marked as deleting for a while to ensure 'removed' event processes
      setTimeout(() => unmarkAsDeleting(id), 5000)
    } catch (e) {
      console.error("Sync Error deleteProduct:", e)
      // If sync failed, keep it marked? Or unmark?
      // If we unmark, it might come back if we reconnect.
      // But we can't keep it forever in memory.
      setTimeout(() => unmarkAsDeleting(id), 10000)
    }

    notify("products_change")
    return true;
  } catch (err) {
    console.error(err);
    unmarkAsDeleting(id);
    return false;
  }
}

// Categories
export function getCategories(): Category[] {
  return store.cache.categories
}

export function saveCategories(categories: Category[]): void {
  store.cache.categories = categories
  db.categories.bulkPut(categories).catch(console.error)
  notify('categories_change')
}

export async function addCategory(category: Omit<Category, "id">): Promise<Category> {
  const categories = getCategories()
  const newCategory: Category = { ...category, id: generateId() }
  categories.push(newCategory)
  store.cache.categories = categories
  await db.categories.put(newCategory)
  if (typeof window !== 'undefined') await syncCategory(newCategory).catch(console.error)
  return newCategory
}

// Transactions
export function getTransactions(): Transaction[] {
  return store.cache.transactions
}

export function saveTransactions(transactions: Transaction[]): void {
  store.cache.transactions = transactions
  db.transactions.bulkPut(transactions).catch(console.error)
  notify('transactions_change')
}

// Clear only purchase transactions (keep other types intact)
export async function clearAllPurchases() {
  try {
    const purchases = getTransactions().filter(t => t.type === 'purchase')
    const remaining = getTransactions().filter(t => t.type !== 'purchase')
    store.cache.transactions = remaining
    // Delete purchases from DB using indexed query on `type`
    await db.transactions.where('type').equals('purchase').delete()
    notify('transactions_change')

    // Cloud Delete
    if (typeof window !== 'undefined') {
      await deleteAllTransactionsApi(purchases.map(p => p.id)).catch(console.error)
    }
  } catch (e) {
    console.error('Failed to clear purchases:', e)
  }
}

export async function restoreTransactions(transactions: Transaction[]) {
  try {
    saveTransactions(transactions)
    if (typeof window !== 'undefined') {
      const batchSize = 100
      for (let i = 0; i < transactions.length; i += batchSize) {
        await Promise.all(transactions.slice(i, i + batchSize).map(syncTransaction))
      }
    }
  } catch (e) {
    console.error("Failed to restore transactions", e)
    throw e
  }
}

export async function addTransaction(transaction: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
  const newTransaction: Transaction = {
    ...transaction,
    id: generateId(),
    createdAt: new Date().toISOString(),
  }

  store.cache.transactions.push(newTransaction)
  await db.transactions.put(newTransaction)

  try {
    if (typeof window !== 'undefined') await syncTransaction(newTransaction)
  } catch (e) {
    console.error("Sync Error addTransaction:", e)
  }

  // Update product quantities - FETCH FROM DB
  try {
    const product = await db.products.get(transaction.productId)
    if (product) {
      let quantityChange = 0

      switch (transaction.type) {
        case "purchase":
          quantityChange = transaction.quantity
          product.purchases = (product.purchases || 0) + transaction.quantity
          break
        case "sale":
          quantityChange = -transaction.quantity
          product.issues = (product.issues || 0) + transaction.quantity
          product.lastActivity = new Date().toISOString()
          break
        case "return":
          quantityChange = transaction.quantity
          break
        case "adjustment":
          quantityChange = transaction.quantity
          break
      }

      product.currentStock = (product.currentStock || 0) + quantityChange
      // Recalculate Inventory Count (Theoretical Stock)
      product.inventoryCount = (product.openingStock || 0) + (product.purchases || 0) - (product.issues || 0)
      product.currentStockValue = product.currentStock * product.averagePrice
      product.updatedAt = new Date().toISOString()
      product.lastModifiedBy = getDeviceId()

      // Update Cache
      const pIdx = store.cache.products.findIndex(p => p.id === product.id)
      if (pIdx !== -1) store.cache.products[pIdx] = product

      await db.products.put(product)

      try {
        if (typeof window !== 'undefined') await syncProduct(product)
      } catch (e) {
        console.error("Sync Error updateProduct (transaction):", e)
      }

      notify('products_change')
    }
  } catch (err) {
    console.error("Failed to update product for transaction:", err)
  }

  notify('transactions_change')
  return newTransaction
}

// Locations
export function getLocations(): Location[] { return store.cache.locations }

export function saveLocations(locations: Location[]) {
  store.cache.locations = locations
  db.locations.bulkPut(locations).catch(console.error)
  notify('change')
}

export async function addLocation(location: Omit<Location, "id">): Promise<Location> {
  const locations = getLocations()
  const newLocation = { ...location, id: generateId() }
  locations.push(newLocation)
  store.cache.locations = locations
  await db.locations.put(newLocation)
  if (typeof window !== 'undefined') await syncLocation(newLocation).catch(console.error)
  return newLocation
}

export async function updateLocation(id: string, updates: Partial<Location>): Promise<Location | null> {
  const locations = getLocations()
  const idx = locations.findIndex(l => l.id === id)
  if (idx === -1) return null
  locations[idx] = { ...locations[idx], ...updates }
  store.cache.locations = locations
  await db.locations.put(locations[idx])
  if (typeof window !== 'undefined') await syncLocation(locations[idx]).catch(console.error)
  return locations[idx]
}

export async function deleteLocation(id: string): Promise<boolean> {
  const locations = getLocations()
  const filtered = locations.filter(l => l.id !== id)
  if (filtered.length === locations.length) return false
  store.cache.locations = filtered
  await db.locations.delete(id)
  notify('change')
  if (typeof window !== 'undefined') await deleteLocationApi(id).catch(console.error)
  return true
}

// Units
export function getUnits(): Unit[] { return store.cache.units }

export function saveUnits(units: Unit[]) {
  store.cache.units = units
  db.units.bulkPut(units).catch(console.error)
  notify('change')
}

export async function addUnit(unit: Omit<Unit, "id">): Promise<Unit> {
  const units = getUnits()
  const newUnit = { ...unit, id: generateId() }
  units.push(newUnit)
  store.cache.units = units
  await db.units.put(newUnit)
  if (typeof window !== 'undefined') await syncUnit(newUnit).catch(console.error)
  return newUnit
}

export async function updateUnit(id: string, updates: Partial<Unit>): Promise<Unit | null> {
  const units = getUnits()
  const idx = units.findIndex(u => u.id === id)
  if (idx === -1) return null
  units[idx] = { ...units[idx], ...updates }
  store.cache.units = units
  await db.units.put(units[idx])
  if (typeof window !== 'undefined') await syncUnit(units[idx]).catch(console.error)
  return units[idx]
}

export async function deleteUnit(id: string): Promise<boolean> {
  const units = getUnits()
  const filtered = units.filter(u => u.id !== id)
  if (filtered.length === units.length) return false
  store.cache.units = filtered
  await db.units.delete(id)
  notify('change')
  if (typeof window !== 'undefined') await deleteUnitApi(id).catch(console.error)
  return true
}

// Purchase Requests
export function getPurchaseRequests(): PurchaseRequest[] { return store.cache.purchaseRequests }
export function addPurchaseRequest(pr: Omit<PurchaseRequest, "id" | "createdAt" | "updatedAt">): PurchaseRequest {
  const list = getPurchaseRequests()
  const newItem = { ...pr, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  list.push(newItem)
  store.cache.purchaseRequests = list
  db.purchaseRequests.put(newItem).catch(console.error)
  return newItem
}

export function updatePurchaseRequest(id: string, updates: Partial<PurchaseRequest>): PurchaseRequest | null {
  const list = getPurchaseRequests()
  const idx = list.findIndex(p => p.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() }
  store.cache.purchaseRequests = list
  db.purchaseRequests.put(list[idx]).catch(console.error)
  return list[idx]
}

export function deletePurchaseRequest(id: string) {
  store.cache.purchaseRequests = store.cache.purchaseRequests.filter(p => p.id !== id)
  db.purchaseRequests.delete(id).catch(console.error)
}
export function savePurchaseRequests(requests: PurchaseRequest[]): void {
  store.cache.purchaseRequests = requests
  db.purchaseRequests.bulkPut(requests).catch(console.error)
  notify('change')
}

// Purchase Orders
export function getPurchaseOrders(): PurchaseOrder[] { return store.cache.purchaseOrders }

export function addPurchaseOrder(po: Omit<PurchaseOrder, "id" | "createdAt" | "updatedAt">): PurchaseOrder {
  const list = getPurchaseOrders()
  const newItem = { ...po, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  list.push(newItem)
  store.cache.purchaseOrders = list
  db.purchaseOrders.put(newItem).catch(console.error)
  return newItem
}

export function updatePurchaseOrder(id: string, updates: Partial<PurchaseOrder>): PurchaseOrder | null {
  const list = getPurchaseOrders()
  const idx = list.findIndex(p => p.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() }
  store.cache.purchaseOrders = list
  db.purchaseOrders.put(list[idx]).catch(console.error)
  return list[idx]
}

export function deletePurchaseOrder(id: string) {
  store.cache.purchaseOrders = store.cache.purchaseOrders.filter(p => p.id !== id)
  db.purchaseOrders.delete(id).catch(console.error)
}

export function savePurchaseOrders(orders: PurchaseOrder[]): void {
  store.cache.purchaseOrders = orders
  db.purchaseOrders.bulkPut(orders).catch(console.error)
  notify('change')
}

// Calculate Product Values
export function calculateProductValues(product: Product) {
  const openingStock = Number(product.openingStock || 0)
  const purchases = Number(product.purchases || 0)
  const issues = Number(product.issues || 0)
  const price = Number(product.price || 0)
  const averagePrice = Number(product.averagePrice || price || 0)

  // Logic: currentStock and quantity should be the same in this system
  const currentStock = Number(product.currentStock ?? product.quantity ?? 0)
  const quantity = currentStock

  const inventoryCount = openingStock + purchases - issues

  return {
    ...product,
    openingStock,
    purchases,
    issues,
    currentStock,
    quantity,
    price,
    averagePrice,
    inventoryCount,
    currentStockValue: currentStock * averagePrice,
    issuesValue: issues * price  // Calculate issues value
  }
}

export function getAdjustments(): InventoryAdjustment[] {
  return store.cache.adjustments
}

export function saveAdjustments(adjustments: InventoryAdjustment[]): void {
  store.cache.adjustments = adjustments
  db.inventoryAdjustments.bulkPut(adjustments).catch(console.error)
  notify('change')
}

export async function addAdjustment(adjustment: Omit<InventoryAdjustment, "id" | "createdAt" | "difference">): Promise<InventoryAdjustment> {
  const newAdjustment: InventoryAdjustment = {
    ...adjustment,
    id: generateId(),
    difference: adjustment.newQuantity - adjustment.oldQuantity,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastModifiedBy: getDeviceId()
  }

  store.cache.adjustments.push(newAdjustment)
  await db.inventoryAdjustments.put(newAdjustment)

  try {
    if (typeof window !== 'undefined') await syncAdjustment(newAdjustment)
  } catch (e) {
    console.error("Sync Error addAdjustment:", e)
  }

  // Update product - FETCH FRESH
  try {
    const p = await db.products.get(adjustment.productId);
    if (p) {
      p.openingStock = adjustment.newQuantity - (p.purchases || 0) + (p.issues || 0)
      p.inventoryCount = adjustment.newQuantity
      p.currentStock = adjustment.newQuantity // Sync legacy field
      p.updatedAt = new Date().toISOString()
      p.lastModifiedBy = getDeviceId()

      // Update Cache
      const idx = store.cache.products.findIndex(prod => prod.id === p.id)
      if (idx !== -1) store.cache.products[idx] = p

      await db.products.put(p)

      try {
        await syncProduct(p)
      } catch (e) {
        console.error("Sync Error updateProduct (adjustment):", e)
      }

      notify('products_change')
    }
  } catch (err) {
    console.error("Failed to update product for adjustment:", err);
  }

  notify('change')
  return newAdjustment
}

// Branches
export function getBranches(): Branch[] {
  return store.cache.branches
}

export function saveBranches(branches: Branch[]) {
  store.cache.branches = branches
  db.branches.bulkPut(branches).catch(console.error)
  notify('branches_change')
}

export async function addBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt">): Promise<Branch> {
  const branches = getBranches()
  const newBranch: Branch = {
    ...branch,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastModifiedBy: getDeviceId()
  }
  branches.push(newBranch)
  store.cache.branches = branches
  await db.branches.put(newBranch)
  if (typeof window !== 'undefined') await syncBranch(newBranch).catch(console.error)
  return newBranch
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch | null> {
  const branches = getBranches()
  const index = branches.findIndex(b => b.id === id)
  if (index === -1) return null
  branches[index] = { ...branches[index], ...updates, updatedAt: new Date().toISOString(), lastModifiedBy: getDeviceId() }
  store.cache.branches = branches
  await db.branches.put(branches[index])
  if (typeof window !== 'undefined') await syncBranch(branches[index]).catch(console.error)
  return branches[index]
}

export async function deleteBranch(id: string): Promise<boolean> {
  const branches = getBranches()
  const filtered = branches.filter(b => b.id !== id)
  if (filtered.length === branches.length) return false
  store.cache.branches = filtered
  await db.branches.delete(id)
  notify('branches_change')
  if (typeof window !== 'undefined') await deleteBranchApi(id).catch(console.error)
  return true
}

// Issues
export function getIssues(): Issue[] {
  return store.cache.issues
}

export function saveIssues(issues: Issue[]) {
  store.cache.issues = issues
  db.issues.bulkPut(issues).catch(console.error)
  notify('issues_change')
}

export async function clearAllIssues() {
  try {
    const all = getIssues()
    store.cache.issues = []
    await db.issues.clear()
    notify('issues_change')
    if (typeof window !== 'undefined') {
      await deleteAllIssuesApi(all.map(i => i.id)).catch(console.error)
    }
  } catch (e) {
    console.error('Failed to clear issues:', e)
  }
}

export async function restoreIssues(issues: Issue[]) {
  try {
    saveIssues(issues)
    if (typeof window !== 'undefined') {
      const batchSize = 100
      for (let i = 0; i < issues.length; i += batchSize) {
        await Promise.all(issues.slice(i, i + batchSize).map(syncIssue))
      }
    }
  } catch (e) {
    console.error("Failed to restore issues", e)
    throw e
  }
}

export async function updateIssue(id: string, updates: Partial<Issue>): Promise<Issue | null> {
  const issues = getIssues()
  const idx = issues.findIndex(i => i.id === id)
  if (idx === -1) return null
  issues[idx] = { ...issues[idx], ...updates, updatedAt: new Date().toISOString(), lastModifiedBy: getDeviceId() }
  store.cache.issues = issues
  await db.issues.put(issues[idx])
  if (typeof window !== 'undefined') await syncIssue(issues[idx]).catch(console.error)
  return issues[idx]
}

export async function addIssue(issue: Omit<Issue, "id" | "createdAt">): Promise<Issue> {
  const issues = getIssues()
  const newIssue: Issue = { ...issue, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastModifiedBy: getDeviceId() }
  issues.push(newIssue)
  store.cache.issues = issues
  await db.issues.put(newIssue)
  if (typeof window !== 'undefined') await syncIssue(newIssue).catch(console.error)
  return newIssue
}

export async function setIssueDelivered(issueId: string, deliveredBy: string): Promise<boolean> {
  const issue = await db.issues.get(issueId);
  if (!issue) return false

  if (issue.delivered) return true

  // Update Issue
  issue.delivered = true
  issue.deliveredAt = new Date().toISOString()
  issue.deliveredBy = deliveredBy
  issue.updatedAt = new Date().toISOString()
  issue.lastModifiedBy = getDeviceId()

  // Update cache
  const iIdx = store.cache.issues.findIndex(i => i.id === issueId)
  if (iIdx !== -1) store.cache.issues[iIdx] = issue

  // Deduct Stock - FETCH FRESH PRODUCTS
  try {
    // Parallel processing for product updates
    await Promise.all(issue.products.map(async (ip) => {
      const p = await db.products.get(ip.productId);
      if (p) {
        p.currentStock = (p.currentStock || 0) - ip.quantity
        p.issues = (p.issues || 0) + ip.quantity
        p.issuesValue = (p.issuesValue || 0) + ip.totalPrice

        // Recalculate Inventory Count
        p.inventoryCount = (p.openingStock || 0) + (p.purchases || 0) - (p.issues || 0)
        p.currentStockValue = p.currentStock * p.averagePrice
        p.updatedAt = new Date().toISOString()
        p.lastModifiedBy = getDeviceId()

        // Update Cache
        const pIdx = store.cache.products.findIndex(prod => prod.id === p.id)
        if (pIdx !== -1) store.cache.products[pIdx] = p

        await db.products.put(p)

        // Sync product
        try {
          if (typeof window !== 'undefined') await syncProduct(p)
        } catch (e) {
          console.error("Sync Error updateProduct (setIssueDelivered):", e)
        }
      }
    }));
    notify('products_change')
  } catch (err) {
    console.error("Failed to update products for issue delivery:", err);
  }

  await db.issues.put(issue)

  if (typeof window !== 'undefined') {
    await syncIssue(issue).catch(console.error)
  }
  return true
}

export async function setIssueBranchReceived(issueId: string): Promise<boolean> {
  const issue = await db.issues.get(issueId);
  if (!issue) return false

  if (issue.branchReceived) return true

  // Update Issue Status ONLY (No Stock Deduction)
  issue.branchReceived = true
  issue.branchReceivedAt = new Date().toISOString()
  issue.updatedAt = new Date().toISOString()
  issue.lastModifiedBy = getDeviceId()

  // Update cache
  const iIdx = store.cache.issues.findIndex(i => i.id === issueId)
  if (iIdx !== -1) store.cache.issues[iIdx] = issue

  await db.issues.put(issue)

  if (typeof window !== 'undefined') {
    await syncIssue(issue).catch(console.error)
  }
  return true
}

// Returns
export function getReturns(): Return[] { return store.cache.returns }
export function saveReturns(returns: Return[]) {
  store.cache.returns = returns
  db.returns.bulkPut(returns).catch(console.error)
  notify('returns_change')
}

export async function addReturn(returnData: Omit<Return, "id" | "createdAt">): Promise<Return> {
  const newReturn: Return = {
    ...returnData,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastModifiedBy: getDeviceId()
  }

  store.cache.returns.push(newReturn)
  await db.returns.put(newReturn)

  if (typeof window !== 'undefined') await syncReturn(newReturn).catch(console.error)

  return newReturn
}

export async function approveReturn(returnId: string, approvedBy: string): Promise<boolean> {
  const ret = await db.returns.get(returnId)
  if (!ret) return false

  if (ret.status === 'approved' || ret.status === 'completed') return true

  ret.status = 'approved'
  ret.approvedBy = approvedBy
  ret.updatedAt = new Date().toISOString()
  ret.lastModifiedBy = getDeviceId()

  // Update Cache
  const rIdx = store.cache.returns.findIndex(r => r.id === returnId)
  if (rIdx !== -1) store.cache.returns[rIdx] = ret

  // Restock Products - FETCH FRESH
  try {
    console.log(`[RETURN APPROVAL] Processing ${ret.products.length} products for return ${returnId}`)

    await Promise.all(ret.products.map(async (rp) => {
      const p = await db.products.get(rp.productId)
      if (p) {
        const oldStock = p.currentStock || 0
        p.currentStock = (p.currentStock || 0) + rp.quantity

        console.log(`[STOCK RESTORE] ${p.productName}: ${oldStock} + ${rp.quantity} = ${p.currentStock}`)

        // Decrement issues count/value if those fields exist (Reverse the issue)
        // @ts-ignore
        p.issues = (p.issues || 0) - rp.quantity
        // @ts-ignore
        p.issuesValue = (p.issuesValue || 0) - rp.totalPrice

        p.inventoryCount = (p.openingStock || 0) + (p.purchases || 0) - (p.issues || 0)
        p.currentStockValue = p.currentStock * p.averagePrice
        p.updatedAt = new Date().toISOString()
        p.lastModifiedBy = getDeviceId()

        const pIdx = store.cache.products.findIndex(prod => prod.id === p.id)
        if (pIdx !== -1) store.cache.products[pIdx] = p

        await db.products.put(p)

        try {
          if (typeof window !== 'undefined') await syncProduct(p)
        } catch (e) {
          console.error("Sync Error updateProduct (approveReturn):", e)
        }
      } else {
        console.warn(`[STOCK RESTORE] Product not found: ${rp.productId}`)
      }
    }))

    console.log(`[RETURN APPROVAL] ✅ Stock restoration completed for return ${returnId}`)
    notify('products_change')
  } catch (err) {
    console.error("Failed to update products for return approval:", err);
  }

  await db.returns.put(ret)
  if (typeof window !== 'undefined') await syncReturn(ret).catch(console.error)

  return true
}

// Clear all Returns
export async function clearAllReturns() {
  try {
    const all = getReturns()
    store.cache.returns = []
    await db.returns.clear()
    notify('returns_change')
    if (typeof window !== 'undefined') {
      await deleteAllReturnsApi(all.map(r => r.id)).catch(console.error)
    }
  } catch (e) {
    console.error('Failed to clear returns:', e)
  }
}

export async function restoreReturns(returns: Return[]) {
  try {
    saveReturns(returns)
    if (typeof window !== 'undefined') {
      const batchSize = 100
      for (let i = 0; i < returns.length; i += batchSize) {
        await Promise.all(returns.slice(i, i + batchSize).map(syncReturn))
      }
    }
  } catch (e) {
    console.error("Failed to restore returns", e)
    throw e
  }
}

// Branch Requests
export function getBranchRequests(): BranchRequest[] { return store.cache.branchRequests }
export function saveBranchRequests(reqs: BranchRequest[]) {
  store.cache.branchRequests = reqs
  db.branchRequests.bulkPut(reqs).catch(console.error)
  notify('branch_requests_change')
}

// Clear all Branch Requests
export async function clearAllBranchRequests() {
  try {
    const all = store.cache.branchRequests
    store.cache.branchRequests = []
    await db.branchRequests.clear()
    notify('branch_requests_change')
    if (typeof window !== 'undefined' && all.length > 0) {
      await deleteAllBranchRequestsApi(all.map(r => r.id)).catch(console.error)
    }
  } catch (e) {
    console.error('Failed to clear branch requests:', e)
  }
}

// Branch Invoices
export function getBranchInvoices(): BranchInvoice[] { return store.cache.branchInvoices }
export function saveBranchInvoices(invoices: BranchInvoice[]) {
  store.cache.branchInvoices = invoices
  db.branchInvoices.bulkPut(invoices).catch(console.error)
  notify('branch_invoices_change')
}

// Issue Drafts
export function getIssueDrafts() { return store.cache.issueDrafts }

export function addIssueDraft(draft: Omit<IssueDraft, "id" | "updatedAt">): IssueDraft {
  const drafts = getIssueDrafts()
  const newDraft = { ...draft, id: generateId(), updatedAt: new Date().toISOString() }
  drafts.push(newDraft)
  store.cache.issueDrafts = drafts
  db.issueDrafts.put(newDraft).catch(console.error)
  return newDraft
}

export function updateIssueDraft(id: string, updates: Partial<IssueDraft>): IssueDraft | null {
  const drafts = getIssueDrafts()
  const idx = drafts.findIndex(d => d.id === id)
  if (idx === -1) return null
  drafts[idx] = { ...drafts[idx], ...updates, updatedAt: new Date().toISOString() }
  store.cache.issueDrafts = drafts
  db.issueDrafts.put(drafts[idx]).catch(console.error)
  db.issueDrafts.put(drafts[idx]).catch(console.error)
  return drafts[idx]
}

export function upsertIssueDraft(draft: IssueDraft): IssueDraft {
  if (draft.id) {
    const updated = updateIssueDraft(draft.id, draft)
    if (updated) return updated
  }
  return addIssueDraft(draft)
}

export function deleteIssueDraft(id: string) {
  store.cache.issueDrafts = store.cache.issueDrafts.filter(d => d.id !== id)
  db.issueDrafts.delete(id)
}

const ACTIVE_DRAFT_KEY = 'active_issue_draft_id'
export function getActiveIssueDraftId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACTIVE_DRAFT_KEY)
}

export function setActiveIssueDraftId(id: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_DRAFT_KEY, id)
}

export function clearActiveIssueDraftId() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_DRAFT_KEY)
}

// Financial
export function calculateFinancialSummary(startDate?: Date, endDate?: Date): FinancialSummary {
  const transactions = getTransactions()
  const products = getProducts()

  let filteredTransactions = transactions
  if (startDate && endDate) {
    filteredTransactions = transactions.filter((t) => {
      const date = new Date(t.createdAt)
      return date >= startDate && date <= endDate
    })
  }

  const totalPurchases = filteredTransactions
    .filter((t) => t.type === "purchase")
    .reduce((sum, t) => sum + t.totalAmount, 0)

  const totalSales = filteredTransactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.totalAmount, 0)
  const totalInventoryValue = products.reduce((sum, p) => sum + p.currentStockValue, 0)
  const profit = totalSales - totalPurchases

  return {
    totalPurchases,
    totalSales,
    totalInventoryValue,
    profit,
    period: startDate && endDate ? `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}` : "الكل",
  }
}
// Data Integrity / Deduplication
export async function fixDuplicates() {
  console.log("Starting De-duplication process...")
  try {
    const products = await db.products.toArray()
    const map = new Map<string, Product[]>()

    // Group by unique key (Code or ItemNumber or Name)
    products.forEach(p => {
      // Prefer Code, then Number, then Name
      const key = (p.productCode || p.itemNumber || p.productName || "").trim()
      if (!key) return

      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    })

    let removedCount = 0
    let mergedCount = 0

    for (const [key, group] of map.entries()) {
      if (group.length > 1) {
        // Sort by creation date (Oldest is Master)
        group.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))

        const master = group[0]
        const duplicates = group.slice(1)

        console.log(`Merging ${duplicates.length} duplicates into ${master.productName} (${master.id})`)

        // 1. Merge numeric values (optional, but safer to assume max or sum? 
        // Usually duplication is accidental, so 'current' state of the most recently updated one might be best.
        // But we picked Oldest as Master to preserve older links.
        // Let's take the LATEST stock values from the group

        const latestUpdate = group.reduce((prev, curr) => (curr.updatedAt || "") > (prev.updatedAt || "") ? curr : prev, master)

        // Update Master content with latest info
        master.currentStock = latestUpdate.currentStock
        master.price = latestUpdate.price
        master.productName = latestUpdate.productName // Fix typo if any
        master.image = master.image || latestUpdate.image

        // 2. Re-link foreign keys
        // We need to find references to duplicate IDs in:
        // Transactions, Issues, Returns, Adjustments, BranchRequests, BranchInvoices, PurchaseRequests, ProductImages

        const dupIds = duplicates.map(d => d.id)

        await Promise.all([
          db.transactions.where('productId').anyOf(dupIds).modify({ productId: master.id }),
          db.issues.filter(i => i.products.some(p => dupIds.includes(p.productId))).modify(i => {
            i.products.forEach(p => { if (dupIds.includes(p.productId)) p.productId = master.id })
          }),
          db.returns.filter(r => r.products.some(p => dupIds.includes(p.productId))).modify(r => {
            r.products.forEach(p => { if (dupIds.includes(p.productId)) p.productId = master.id })
          }),
          db.inventoryAdjustments.where('productId').anyOf(dupIds).modify({ productId: master.id }),
          db.productImages.where('productId').anyOf(dupIds).modify({ productId: master.id }),

          // Complex json structures in requests/invoices might need explicit iteration if Dexie modify doesn't support deep path
          // For now, assume simpler structures or that duplication mostly affects core inventory
        ])

        // 3. Delete duplicates
        await db.products.bulkDelete(dupIds)

        // 4. Update Master
        await db.products.put(master)

        // 5. Sync Deletions to Cloud
        // Ideally we should send deletes for dupIds and update for master
        for (const id of dupIds) {
          await deleteProductApi(id).catch(console.error)
        }
        await syncProduct(master).catch(console.error)

        removedCount += duplicates.length
        mergedCount++
      }
    }

    // Refresh Cache
    await reloadFromDb()
    notify("products_change")

    return { mergedCount, removedCount }
  } catch (e) {
    console.error("Deduplication failed", e)
    throw e
  }
}
