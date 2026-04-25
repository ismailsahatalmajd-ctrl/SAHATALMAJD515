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
  ReceivingNote,
  Supplier,
  Employee,
  OvertimeReason,
  OvertimeEntry,
  AbsenceRecord,
  PlannedLeave,
  WarehouseLocation,
  WarehouseDesignElement,
  LabelTemplate
} from "./types"
import type { BranchInvoice } from './branch-invoice-types'
import type { BranchRequest } from './branch-request-types'
import type { BranchRequestDraft } from './types'
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
    branchRequestDrafts: BranchRequestDraft[]
    purchaseRequests: PurchaseRequest[]
    receivingNotes: ReceivingNote[]
    suppliers: Supplier[]
    employees: Employee[]
    overtimeReasons: OvertimeReason[]
    overtimeEntries: OvertimeEntry[]
    absenceRecords: AbsenceRecord[]
    plannedLeaves: PlannedLeave[]
    warehouseLocations: WarehouseLocation[]
    warehouseDesignElements: WarehouseDesignElement[]
    labelTemplates: LabelTemplate[]
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
      branchRequestDrafts: [],
      purchaseRequests: [],
      receivingNotes: [],
      suppliers: [],
      employees: [],
      overtimeReasons: [],
      overtimeEntries: [],
      absenceRecords: [],
      plannedLeaves: [],
      warehouseLocations: [],
      warehouseDesignElements: [],
      labelTemplates: [],
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
          { name: "categories", label: "الفئات", query: db.categories },
          { name: "transactions", label: "المعاملات", query: db.transactions },
          { name: "branches", label: "الفروع", query: db.branches },
          { name: "units", label: "الوحدات", query: db.units },
          { name: "issues", label: "الإصدارات", query: db.issues },
          { name: "returns", label: "المرتجعات", query: db.returns },
          { name: "locations", label: "المواقع", query: db.locations },
          { name: "issueDrafts", label: "مسودات الإصدارات", query: db.issueDrafts },
          { name: "purchaseOrders", label: "أوامر الشراء", query: db.purchaseOrders },
          { name: "adjustments", label: "التعديلات", query: db.inventoryAdjustments },
          { name: "verificationLogs", label: "سجلات التحقق", query: db.verificationLogs },
          { name: "branchInvoices", label: "فواتير الفروع", query: db.branchInvoices },
          { name: "branchRequests", label: "طلبات الفروع", query: db.branchRequests },
          { name: "branchRequestDrafts", label: "مسودات طلبات الفروع", query: db.branchRequestDrafts },
          { name: "purchaseRequests", label: "طلبات الشراء", query: db.purchaseRequests },
          { name: "receivingNotes", label: "سجلات الاستلام", query: db.receivingNotes },
          { name: "suppliers", label: "الموردون", query: db.suppliers },
          { name: "employees", label: "الموظفون", query: db.employees },
          { name: "overtimeReasons", label: "أسباب الساعات الإضافية", query: db.overtimeReasons },
          { name: "overtimeEntries", label: "سجلات الساعات الإضافية", query: db.overtimeEntries },
          { name: "absenceRecords", label: "سجلات الغياب والاجازات", query: db.absenceRecords },
          { name: "plannedLeaves", label: "الإجازات المخطط لها", query: db.plannedLeaves },
          { name: "warehouseLocations", label: "مواقع المستودع", query: db.warehouseLocations },
          { name: "warehouseDesignElements", label: "مخطط المستودع", query: db.warehouseDesignElements },
          { name: "labelTemplates", label: "قوالب الملصقات", query: db.labelTemplates },
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

            // Safety timeout per table fetch (60s for large datasets)
            // Products table can be large, especially with images
            const timeout = task.name === 'products' ? 300000 : 60000; // 5 min for products

            // Check if query exists and has toArray method
            if (!task.query || typeof task.query.toArray !== 'function') {
              console.warn(`DataStore: Query for ${task.name} is not available, skipping...`);
              results.push([]);
              completed++;
              continue;
            }

            const tableData = await Promise.race([
              task.query.toArray(),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout loading ${task.label || task.name}`)), timeout))
            ]) as any[];

            results.push(tableData);
            completed++;
            console.log(`DataStore: Done ${task.name} (${tableData.length} records)`);
          } catch (e) {
            console.error(`DataStore: Failed to load ${task.name}`, e);
            // Push empty array and continue loading other tables
            results.push([]);
            completed++;
            // Continue even if one table fails
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
        this.cache.branchRequestDrafts = (results[14] as BranchRequestDraft[]) || []
        this.cache.purchaseRequests = (results[15] as PurchaseRequest[]) || []
        this.cache.receivingNotes = (results[16] as ReceivingNote[]) || []
        this.cache.suppliers = (results[17] as Supplier[]) || []
        this.cache.employees = (results[18] as Employee[]) || []
        this.cache.overtimeReasons = (results[19] as OvertimeReason[]) || []
        this.cache.overtimeEntries = (results[20] as OvertimeEntry[]) || []
        this.cache.absenceRecords = (results[21] as AbsenceRecord[]) || []
        this.cache.plannedLeaves = (results[22] as PlannedLeave[]) || []
        this.cache.warehouseLocations = (results[23] as WarehouseLocation[]) || []
        this.cache.warehouseDesignElements = (results[24] as WarehouseDesignElement[]) || []
        this.cache.labelTemplates = (results[25] as LabelTemplate[]) || []

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
    'suppliers': 'suppliers',
    'employees': 'employees',
    'overtimeReasons': 'overtimeReasons',
    'overtimeEntries': 'overtimeEntries',
    'absenceRecords': 'absenceRecords',
    'plannedLeaves': 'plannedLeaves',
    'warehouseLocations': 'warehouseLocations',
    'warehouseDesignElements': 'warehouseDesignElements',
    'labelTemplates': 'labelTemplates',
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
    'employees': 'employees_change' as any,
    'overtimeReasons': 'overtime_reasons_change' as any,
    'overtimeEntries': 'overtime_entries_change' as any,
    'absenceRecords': 'absence_records_change' as any,
    'warehouseLocations': 'warehouse_locations_change' as any,
    'labelTemplates': 'label_templates_change',
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
    'suppliers': 'suppliers',
    'receiving_notes': 'receivingNotes',
    'employees': 'employees',
    'overtimeReasons': 'overtimeReasons',
    'overtimeEntries': 'overtimeEntries',
    'absenceRecords': 'absenceRecords',
    'plannedLeaves': 'plannedLeaves',
    'warehouseLocations': 'warehouseLocations',
    'warehouseDesignElements': 'warehouseDesignElements',
    'labelTemplates': 'labelTemplates',
  }

  const key = map[table]
  if (!key) return

  const list = store.cache[key] as any[]
  if (!list) return

  store.cache[key] = list.filter(r => r.id !== id) as any
  notify('change')
}
