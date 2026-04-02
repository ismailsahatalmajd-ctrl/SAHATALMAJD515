export interface GranularPermissions {
  showPages: {
    dashboard: boolean;
    inventory: boolean;
    issues: boolean;
    purchases: boolean;
    returns: boolean;
    reports: boolean;
    branches: boolean;
    employees: boolean;
    barcodes: boolean;
    history: boolean;
    scanner: boolean;
    labelDesigner: boolean;
  };
  global: {
    backButton: boolean;
  };
  inventoryPage: {
    statsCards: boolean;
    warehouseAdvisor: boolean;
    bulkOperations: boolean;
    filters: boolean;
    addProduct: boolean;
    quickSettings: boolean;
    search: boolean;
    columns: {
      image: boolean;
      productCode: boolean;
      itemNumber: boolean;
      productName: boolean;
      category: boolean;
      location: boolean;
      currentStock: boolean;
      unit: boolean;
      quantityPerCarton: boolean;
      cartonDimensions: boolean;
      openingStock: boolean;
      purchases: boolean;
      returns: boolean;
      issues: boolean;
      inventoryCount: boolean;
      difference: boolean;
      price: boolean;
      averagePrice: boolean;
      currentStockValue: boolean;
      issuesValue: boolean;
      turnoverRate: boolean;
      status: boolean;
      lastActivity: boolean;
      minStockLimit: boolean;
      stockStatus: boolean;
      actions: boolean;
    };
    tableActions: {
      exportExcel: boolean;
      exportPdf: boolean;
      print: boolean;
      columnToggles: boolean;
    };
  };
  purchasesPage: {
    statsCards: boolean;
    warehouseAdvisor: boolean;
    quickActions: boolean;
    addPurchase: boolean;
    addGRN: boolean;
    historyGRN: boolean;
    tabs: boolean;
    historyActions: {
      print: boolean;
      delete: boolean;
    };
  };
  issuesPage: {
    analytics: boolean;
    statsCards: boolean;
    quickActions: boolean;
    addReturn: boolean;
    addIssue: boolean;
    orderSearch: boolean;
    invoiceTool: boolean;
    historyActions: {
      deliver: boolean;
      print: boolean;
      exportOdoo: boolean;
      edit: boolean;
      delete: boolean;
    };
  };
  reportsPage: {
    filters: boolean;
    financialSummary: boolean;
    financialSummary_profit: boolean;
    stockMovementsSummary: boolean;
    stockMovementTable: boolean;
    inventoryAnalysis: boolean;
    charts: boolean;
    topProducts: boolean;
    lowStockAlerts: boolean;
  };
  dashboardPage: {
    info: boolean;
    stats: boolean;
    cart: boolean;
    orderSystem: boolean;
    returnSystem: boolean;
    trackingLogs: boolean;
    clearHistory: boolean;
  };
  branchesPage: {
    reports: boolean;
    directory: boolean;
  };
  employeesPage: {
    overtime: boolean;
    attendance: boolean;
    reports: boolean;
  };
}

export const DEFAULT_GRANULAR_PERMISSIONS: GranularPermissions = {
  showPages: {
    dashboard: true,
    inventory: true,
    issues: true,
    purchases: true,
    returns: true,
    reports: false,
    branches: false,
    employees: false,
    barcodes: true,
    history: true,
    scanner: true,
    labelDesigner: true,
  },
  global: {
    backButton: true,
  },
  inventoryPage: {
    statsCards: false,
    warehouseAdvisor: false,
    bulkOperations: false,
    filters: true,
    addProduct: true,
    quickSettings: false,
    search: true,
    columns: {
      image: true,
      productCode: true,
      itemNumber: true,
      productName: true,
      category: true,
      location: true,
      currentStock: true,
      unit: true,
      quantityPerCarton: false,
      cartonDimensions: false,
      openingStock: false,
      purchases: false,
      returns: false,
      issues: false,
      inventoryCount: false,
      difference: false,
      price: false,
      averagePrice: false,
      currentStockValue: false,
      issuesValue: false,
      turnoverRate: false,
      status: false,
      lastActivity: false,
      minStockLimit: false,
      stockStatus: false,
      actions: true,
    },
    tableActions: {
      exportExcel: false,
      exportPdf: false,
      print: true,
      columnToggles: false,
    },
  },
  purchasesPage: {
    statsCards: false,
    warehouseAdvisor: false,
    quickActions: false,
    addPurchase: true,
    addGRN: true,
    historyGRN: true,
    tabs: true,
    historyActions: {
      print: true,
      delete: false,
    },
  },
  issuesPage: {
    analytics: false,
    statsCards: false,
    quickActions: false,
    addReturn: false,
    addIssue: true,
    orderSearch: true,
    invoiceTool: true,
    historyActions: {
      deliver: true,
      print: true,
      exportOdoo: false,
      edit: false,
      delete: false,
    },
  },
  reportsPage: {
    filters: false,
    financialSummary: false,
    financialSummary_profit: false,
    stockMovementsSummary: false,
    stockMovementTable: false,
    inventoryAnalysis: false,
    charts: false,
    topProducts: false,
    lowStockAlerts: false,
  },
  dashboardPage: {
    info: true,
    stats: false,
    cart: true,
    orderSystem: true,
    returnSystem: false,
    trackingLogs: true,
    clearHistory: false,
  },
  branchesPage: {
    reports: false,
    directory: false,
  },
  employeesPage: {
    overtime: false,
    attendance: false,
    reports: false,
  },
};

const STORAGE_KEY_PREFIX = "granular_perms_";

import { db } from "./db";

export async function getGranularPermissions(userId: string): Promise<GranularPermissions> {
  if (typeof window === "undefined") return DEFAULT_GRANULAR_PERMISSIONS;
  try {
    // 1. Check local Dexie
    const stored = await db.userPreferences.get(userId);
    if (stored) {
      return { ...DEFAULT_GRANULAR_PERMISSIONS, ...stored };
    }

    // 2. Proactively check Firestore if local is empty
    try {
      const { db: firestore } = await import("./firebase");
      const { getDoc, doc } = await import("firebase/firestore");
      const snap = await getDoc(doc(firestore, 'granularPermissions', userId));
      if (snap.exists()) {
        const cloudData = snap.data() as GranularPermissions;
        // Save to local for next time
        await db.userPreferences.put({ ...cloudData, id: userId, userId });
        return { ...DEFAULT_GRANULAR_PERMISSIONS, ...cloudData };
      }
    } catch (firestoreErr) {
      console.warn("Could not fetch perms from cloud", firestoreErr);
    }
  } catch (e) {
    console.error("Failed to get perms from DB", e);
  }
  
  // 3. Fallback to legacy localStorage
  const legacy = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      await saveGranularPermissions(userId, parsed);
      localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
      return { ...DEFAULT_GRANULAR_PERMISSIONS, ...parsed };
    } catch {}
  }

  return DEFAULT_GRANULAR_PERMISSIONS;
}

export async function saveGranularPermissions(userId: string, perms: GranularPermissions): Promise<void> {
  if (typeof window === "undefined") return;
  
  const record = { ...perms, id: userId, userId: userId };
  await db.userPreferences.put(record);
  
  // Dispatch local event
  window.dispatchEvent(new CustomEvent('granular_permissions_updated', { detail: { userId } }));
  
  // Push to cloud
  try {
    const { syncRecord } = await import("./firebase-sync-engine");
    await syncRecord('granularPermissions', record);
  } catch (e) {
    console.error("Cloud sync failed for perms", e);
  }
}
