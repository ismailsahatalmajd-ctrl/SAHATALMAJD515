import Dexie, { type Table } from 'dexie';
import type {
  Product,
  Category,
  Transaction,
  Branch,
  Unit,
  Issue,
  Return,
  Location,
  IssueDraft,
  PurchaseOrder,
  VerificationLog,
  InventoryAdjustment,
  AuditLogEntry,
  BranchInventory,
  ConsumptionRecord,
  BranchAsset,
  MaintenanceReport,
  AssetRequest,
  AssetStatusReport
} from './types';
import type { BranchInvoice } from './branch-invoice-types';
import type { BranchRequest } from './branch-request-types';
import type { PurchaseRequest } from './purchase-request-types';

export class InventoryDatabase extends Dexie {
  products!: Table<Product>;
  categories!: Table<Category>;
  transactions!: Table<Transaction>;
  branches!: Table<Branch>;
  units!: Table<Unit>;
  issues!: Table<Issue>;
  returns!: Table<Return>;
  locations!: Table<Location>;
  issueDrafts!: Table<IssueDraft>;
  purchaseOrders!: Table<PurchaseOrder>;
  verificationLogs!: Table<VerificationLog>;
  inventoryAdjustments!: Table<InventoryAdjustment>;
  branchInvoices!: Table<BranchInvoice>;
  branchInvoices!: Table<BranchInvoice>;
  branchRequests!: Table<BranchRequest>;
  branchRequestDrafts!: Table<BranchRequestDraft>; // New table
  purchaseRequests!: Table<PurchaseRequest>;
  settings!: Table<{ key: string; value: any }>;
  auditLogs!: Table<AuditLogEntry>;
  notifications!: Table<any>;
  backups!: Table<any>;
  imageCache!: Table<{ key: string; value: string; timestamp: number }>;
  syncQueue!: Table<any>;
  conflictLogs!: Table<any>;
  changeLogs!: Table<any>;
  productImages!: Table<{ productId: string; data: string }>;

  // Branch Inventory System
  branchInventory!: Table<BranchInventory>;
  consumptionRecords!: Table<ConsumptionRecord>;
  branchAssets!: Table<BranchAsset>;
  maintenanceReports!: Table<MaintenanceReport>;
  assetRequests!: Table<AssetRequest>;
  assetStatusReports!: Table<AssetStatusReport>;

  constructor() {
    super('InventoryDB');

    this.version(1).stores({
      products: 'id, productCode, productName, category, location, quantity, currentStock, isLowStock',
      categories: 'id, name',
      transactions: 'id, productId, type, createdAt',
      branches: 'id, name, location',
      units: 'id, name',
      issues: 'id, productId, branchId, status, delivered, createdAt, invoiceNumber',
      returns: 'id, productId, branchId, status, createdAt',
      locations: 'id, name',
      issueDrafts: 'id, branchId, complete, updatedAt',
      purchaseOrders: 'id, status, createdAt',
      verificationLogs: 'id, issueId, status, timestamp',
      inventoryAdjustments: 'id, productId, createdAt',
      branchInvoices: 'id, branchId, invoiceNumber, createdAt',
      branchRequests: 'id, branchId, status, type, createdAt',
      purchaseRequests: 'id, status, createdAt',
      settings: 'key',
      auditLogs: 'id, timestamp, userId, action, entity, entityId',
      notifications: 'id, type, date, read',
      backups: 'id, timestamp, version',
      imageCache: 'key, timestamp'
    });
    this.version(2).stores({
      syncQueue: 'id, table, op, ts, attempts',
      conflictLogs: 'id, table, entityId, ts',
      changeLogs: 'id, table, entityId, ts'
    });
    this.version(3).stores({
      userSessions: 'id, userId, deviceId, lastActive',
      userPreferences: 'userId', // Primary key is userId
      syncQueue: 'id, table, op, ts, attempts, deviceId, syncedToDevices', // Extended
      conflictLogs: 'id, table, recordId, ts' // standardized recordId
    });
    this.version(4).stores({
      productImages: 'productId'
    });

    // Branch Inventory System - Version 5
    this.version(5).stores({
      branchInventory: 'id, branchId, productId, [branchId+productId], productName, currentStock',
      consumptionRecords: 'id, branchId, productId, date, createdAt',
      branchAssets: 'id, branchId, category, status, createdAt',
      maintenanceReports: 'id, assetId, branchId, status, reportedDate',
      assetRequests: 'id, branchId, status, requestDate',
      assetStatusReports: 'id, branchId, generatedAt'
    });

    // Version 6: Branch Request Drafts
    this.version(6).stores({
      branchRequestDrafts: 'id, branchId, updatedAt'
    });
  }
}

// Safely initialize DB to avoid top-level crashes
let dbInstance: InventoryDatabase;

if (typeof window === 'undefined') {
  // Server-side: use dummy implementation
  class DummyDB {
    constructor() { }
  }
  dbInstance = new DummyDB() as any;

  // Mock tables to prevent crashes on undefined access
  const mockTable = {
    toArray: async () => [],
    bulkPut: async () => { },
    put: async () => { },
    get: async () => undefined,
    where: () => ({ equals: () => ({ toArray: async () => [], first: async () => undefined, modify: async () => { } }) }),
    add: async () => { },
    delete: async () => { },
    clear: async () => { },
    count: async () => 0,
    orderBy: () => ({ limit: () => ({ toArray: async () => [] }) })
  };

  const tables = [
    'products', 'categories', 'transactions', 'branches', 'units',
    'issues', 'returns', 'locations', 'issueDrafts', 'purchaseOrders',
    'verificationLogs', 'inventoryAdjustments', 'branchInvoices',
    'branchRequests', 'branchRequestDrafts', 'purchaseRequests', 'settings', 'auditLogs',
    'notifications', 'backups', 'imageCache', 'syncQueue', 'conflictLogs',
    'changeLogs', 'userSessions', 'userPreferences', 'productImages'
  ];

  tables.forEach(table => {
    (dbInstance as any)[table] = mockTable;
  });
} else {
  try {
    // Check if Dexie is supported in this environment
    // (Dexie internally checks indexedDB, but we wrap the constructor just in case)
    dbInstance = new InventoryDatabase();
  } catch (e) {
    console.error("Failed to initialize Dexie Database:", e);
    // Fallback: Create a proxy or a dummy object?
    // Creating a dummy object that mimics Dexie tables is hard.
    // We will re-throw but this time inside a try-catch block in the module consumer?
    // No, if we export undefined, TypeScript complains.
    // We will assign a potentially unsafe instance or a mock if possible.
    // But usually constructor only fails if 'indexedDB' is missing and Dexie doesn't handle it well?
    // Actually Dexie handles missing indexedDB by failing at open(), not constructor.
    // The only reason constructor fails is if super() fails or schema is invalid.
    // We will assume it works, but if it threw, we are in trouble.
    // Let's create a dummy class that does nothing if it failed?
    class DummyDB extends Dexie {
      constructor() { super('DummyDB'); }
    }
    dbInstance = new DummyDB() as any;

    // Mock tables to prevent crashes on undefined access
    const mockTable = {
      toArray: async () => [],
      bulkPut: async () => { },
      put: async () => { },
      get: async () => undefined,
      where: () => ({ equals: () => ({ toArray: async () => [], first: async () => undefined, modify: async () => { } }) }),
      add: async () => { },
      delete: async () => { },
      clear: async () => { },
      count: async () => 0
    };

    // Assign mock tables to dbInstance if they are missing
    const tables = [
      'products', 'categories', 'transactions', 'branches', 'units',
      'issues', 'returns', 'locations', 'issueDrafts', 'purchaseOrders',
      'verificationLogs', 'inventoryAdjustments', 'branchInvoices',
      'branchRequests', 'branchRequestDrafts', 'purchaseRequests', 'settings', 'auditLogs',
      'notifications', 'backups', 'imageCache', 'syncQueue', 'conflictLogs',
      'changeLogs', 'userSessions', 'userPreferences', 'productImages'
    ];

    tables.forEach(table => {
      if (!(dbInstance as any)[table]) {
        (dbInstance as any)[table] = mockTable;
      }
    });
  }
}

export const db = dbInstance;

export async function fetchProductsFromDb() {
  try {
    return await db.products.toArray()
  } catch (e) {
    console.error("DB Fetch Error:", e);
    return [];
  }
}

export async function upsertProductsToDb(products: Product[]) {
  try {
    return await db.products.bulkPut(products);
  } catch (e) {
    console.error("DB Upsert Error:", e);
  }
}
