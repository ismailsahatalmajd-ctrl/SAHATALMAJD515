import type {
  Product,
  Category,
  Transaction,
  InventoryAdjustment,
  Branch,
  Unit,
  Issue,
  Return,
  Location,
  IssueDraft,
  PurchaseOrder,
  VerificationLog,
} from "./types"
import type { BranchInvoice } from './branch-invoice-types'
import type { BranchRequest } from './branch-request-types'
import type { PurchaseRequest } from './purchase-request-types'
import { db } from './db'
import { notify, StoreEvent } from "./events"

// In-Memory Data Store
export class DataStore {
  cache: {
    products: Product[]
    categories: Category[]
    transactions: Transaction[]
    branches: Branch[]
    units: Unit[]
    issues: Issue[]
    returns: Return[]
    locations: Location[]
    issueDrafts: IssueDraft[]
    purchaseOrders: PurchaseOrder[]
    adjustments: InventoryAdjustment[]
    verificationLogs: VerificationLog[]
    branchInvoices: BranchInvoice[]
    branchRequests: BranchRequest[]
    purchaseRequests: PurchaseRequest[]
  } = {
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
      purchaseRequests: [],
    }

  initPromise: Promise<void> | null = null
  initialized: boolean = false
  progressListeners: ((percent: number, message: string) => void)[] = []

  async init(onProgress?: (percent: number, message: string) => void) {
    if (this.initialized) {
      if (onProgress) onProgress(100, "Done");
      return
    }
    if (typeof window === 'undefined') return

    if (onProgress) {
      this.progressListeners.push(onProgress)
    }

    if (this.initPromise) {
      return this.initPromise
    }

    const broadcastProgress = (percent: number, message: string) => {
      this.progressListeners.forEach(listener => listener(percent, message))
    }

    this.initPromise = (async () => {
      try {
        if (!db) {
          console.error("DataStore: DB is undefined");
          broadcastProgress(100, "Error: DB not found");
          this.initialized = true;
          return;
        }

        const tasks = [
          { name: "products", label: "المنتجات", query: db.products },
          { name: "categories", label: "التصنيفات", query: db.categories },
          { name: "transactions", label: "الحركات", query: db.transactions },
          { name: "branches", label: "الفروع", query: db.branches },
          { name: "units", label: "الوحدات", query: db.units },
          { name: "issues", label: "الصرف", query: db.issues },
          { name: "returns", label: "المرتجع", query: db.returns },
          { name: "locations", label: "المواقع", query: db.locations },
          { name: "issueDrafts", label: "المسودات", query: db.issueDrafts },
          { name: "purchaseOrders", label: "أوامر الشراء", query: db.purchaseOrders },
          { name: "adjustments", label: "التسويات", query: db.inventoryAdjustments },
          { name: "verificationLogs", label: "سجلات الجرد", query: db.verificationLogs },
          { name: "branchInvoices", label: "فواتير الفروع", query: db.branchInvoices },
          { name: "branchRequests", label: "طلبات الفروع", query: db.branchRequests },
          { name: "purchaseRequests", label: "طلبات الشراء", query: db.purchaseRequests },
        ]

        let completed = 0;
        const total = tasks.length;
        const results: any[] = []

        console.log("DataStore: Starting sequential load...");
        for (const task of tasks) {
          try {
            const percent = Math.round((completed / total) * 100);
            broadcastProgress(percent, `تحميل ${task.label}...`);
            console.log(`DataStore: Loading ${task.name}...`);

            // Add a safety timeout per table fetch
            const tableData = await Promise.race([
              task.query.toArray(),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout loading ${task.name}`)), 5000))
            ]) as any[];

            results.push(tableData);
            completed++;
            console.log(`DataStore: Done ${task.name} (${tableData.length} records)`);
          } catch (e) {
            console.error(`DataStore: Failed to load ${task.name}`, e);
            results.push([]);
            completed++;
          }
        }

        // Map results back to cache with proper type casting
        this.cache.products = (results[0] as Product[]) || []
        this.cache.categories = (results[1] as Category[]) || []
        this.cache.transactions = (results[2] as Transaction[]) || []
        this.cache.branches = (results[3] as Branch[]) || []
        this.cache.units = (results[4] as Unit[]) || []
        this.cache.issues = (results[5] as Issue[]) || []
        this.cache.returns = (results[6] as Return[]) || []
        this.cache.locations = (results[7] as Location[]) || []
        this.cache.issueDrafts = (results[8] as IssueDraft[]) || []
        this.cache.purchaseOrders = (results[9] as PurchaseOrder[]) || []
        this.cache.adjustments = (results[10] as InventoryAdjustment[]) || []
        this.cache.verificationLogs = (results[11] as VerificationLog[]) || []
        this.cache.branchInvoices = (results[12] as BranchInvoice[]) || []
        this.cache.branchRequests = (results[13] as BranchRequest[]) || []
        this.cache.purchaseRequests = (results[14] as PurchaseRequest[]) || []

        broadcastProgress(100, "اكتمل التحميل");
        console.log("DataStore: Initialization complete");

        this.initialized = true
        notify('change')

        // --- Migration: Move large images to separate table ---
        setTimeout(() => {
          this.migrateImages().catch(console.error)
        }, 5000)

      } catch (e) {
        console.error('DataStore: Init failed', e)
        this.initialized = true
      }
    })()

    return this.initPromise
  }

  // Migrate large images from products table to separate productImages table
  async migrateImages() {
    // This function is intentionally empty as migration is now handled elsewhere
    // Kept to prevent "not a function" errors from old code
    console.log('migrateImages: Skipping (handled in firebase-sync-manager)')
  }
}

export const store = new DataStore()

export async function initDataStore() {
  await store.init()
}

export async function initDataStoreWithProgress(onProgress: (percent: number, message: string) => void) {
  await store.init(onProgress)
}

export async function reloadFromDb() {
  store.initialized = false
  store.initPromise = null
  await store.init()
  return store.cache
}

// --- Sync Helpers ---
export function updateStoreCache(table: string, record: any) {
  if (!store.initialized) return

  // Map table names to cache keys
  const map: Record<string, keyof typeof store.cache> = {
    'products': 'products',
    'categories': 'categories',
    'transactions': 'transactions',
    'branches': 'branches',
    'issues': 'issues',
    'returns': 'returns',
    'locations': 'locations',
    'units': 'units',
    'branch_requests': 'branchRequests',
    'branch_invoices': 'branchInvoices',
    'inventory_adjustments': 'adjustments',
  }

  const key = map[table]
  if (!key) return

  const list = store.cache[key] as any[]
  if (!list) return

  const idx = list.findIndex(r => r.id === record.id)
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...record }
  } else {
    list.push(record)
  }
  notify('change')
  const eventMap: Record<string, StoreEvent> = {
    'products': 'products_change',
    'categories': 'categories_change',
    'transactions': 'transactions_change',
    'branches': 'branches_change',
    'issues': 'issues_change',
    'returns': 'returns_change',
    'branch_requests': 'branch_requests_change',
    'branch_invoices': 'branch_invoices_change',
  }
  if (eventMap[table]) notify(eventMap[table])
}

export function removeFromStoreCache(table: string, id: string) {
  if (!store.initialized) return

  const map: Record<string, keyof typeof store.cache> = {
    'products': 'products',
    'categories': 'categories',
    'transactions': 'transactions',
    'branches': 'branches',
    'issues': 'issues',
    'returns': 'returns',
    'locations': 'locations',
    'units': 'units',
    'branch_requests': 'branchRequests',
    'branch_invoices': 'branchInvoices',
    'inventory_adjustments': 'adjustments',
  }

  const key = map[table]
  if (!key) return

  const list = store.cache[key] as any[]
  if (!list) return

  store.cache[key] = list.filter(r => r.id !== id) as any
  notify('change')
}
