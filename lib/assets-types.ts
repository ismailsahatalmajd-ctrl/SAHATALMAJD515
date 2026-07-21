export type AssetCategory = "ASSET" | "MATERIAL";
export type AssetType = "PERMANENT" | "CONSUMABLE";
export type AssetCondition = "NEW" | "GOOD" | "MAINTENANCE" | "DAMAGED" | "DISPOSED" | "LOST";

export interface AssetItem {
  id: string;
  name: string;
  code: string;
  category: AssetCategory; // ASSET or MATERIAL
  subCategory?: string; // Custom user-defined category (e.g. Office Supplies)
  type?: AssetType; // Applicable if category is ASSET
  price: number;
  totalQuantity: number;
  purchases: number;
  expenses: number;
  image?: string;
  unit?: string; // e.g., Kilo, Piece, Carton
  
  // Advanced Settings
  defaultMinThreshold?: number; // Automatic alert when stock is below this
  defaultConsumptionRate?: number; // Expected consumption per month
  branchSettings?: Record<string, {
    minThreshold?: number;
    expectedConsumptionRate?: number;
    limitType?: "quantity" | "financial";
    maxLimit?: number;
    limitTimeframe?: "monthly" | "yearly";
    approvalRoute?: "automatic" | "manager"; // Extensible
  }>;
  
  // Branch Control
  allowedBranches?: string[]; // Empty means all branches
  requiresApprovalBranches?: string[]; // Empty means no approval needed
  maxQuantityPerBranch?: number;

  createdAt: string;
  updatedAt: string;
}

export interface AssetSerialNumber {
  id: string;
  assetId: string;
  serialNumber: string;
  branchId?: string; // Where it is currently located
  status: "IN_STOCK" | "DISPENSED" | "MAINTENANCE" | "DAMAGED";
  condition: AssetCondition;
  dispensedAt?: string;
  dispensedInvoiceId?: string;
}

export interface AssetRequestItem {
  id: string; // unique item id inside the invoice
  assetId: string;
  name: string;
  code: string;
  image?: string;
  requestedQuantity: number;
  remainingInBranch: number;
  approvedQuantity?: number; // Used when modifying quantity
  dispenseQty?: number; // Quantity to be dispensed from warehouse
  purchaseQty?: number; // Quantity marked as shortage to be purchased
  rejectionReason?: string; // Reason if quantity is rejected/cancelled
  notes?: string;
  managerNotes?: string;
  status: "PENDING" | "REQUIRES_APPROVAL" | "APPROVED" | "REJECTED" | "MODIFIED" | "DISPENSED";
  category: AssetCategory;
  subCategory?: string;
  type?: AssetType;
  assignedSerialNumbers?: string[]; // If permanent asset, list of serials
}

export interface AssetRequestInvoice {
  id: string;
  invoiceNumber: string;
  branchId: string;
  branchName: string;
  items: AssetRequestItem[];
  status: "PENDING" | "REQUIRES_APPROVAL" | "PARTIAL_APPROVED" | "APPROVED" | "REJECTED" | "DISPENSED";
  generalNotes?: string;
  requestedAt: string;
  updatedAt: string;
  dispensedAt?: string;
  mergedFromRequestIds?: string[]; // If this invoice was a merge of multiple branch requests
}

// --- Purchasing Intelligence Types ---

export interface AssetPendingPurchase {
  id: string; // Unique ID
  requestInvoiceId: string; // The branch request ID it originated from
  requestInvoiceNumber: string;
  branchId: string;
  branchName: string;
  assetId: string;
  name: string;
  code: string;
  image?: string;
  category: AssetCategory;
  purchaseQty: number;
  status: "PENDING" | "PURCHASED";
  createdAt: string;
}

export interface AssetPurchaseItem {
  id: string;
  assetId: string;
  name: string;
  code: string;
  image?: string;
  category: AssetCategory;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  routing: "WAREHOUSE" | "DIRECT_BRANCH";
  branchId?: string; // Target branch if DIRECT_BRANCH
  branchName?: string;
  pendingPurchaseId?: string; // If this item was fulfilling a pending purchase
}

export interface AssetPurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  items: AssetPurchaseItem[];
  totalValue: number;
  notes?: string;
  invoiceImages?: string[]; // Multiple invoice images supported
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface AssetPriceHistory {
  id: string;
  assetId: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  price: number;
  quantity: number;
  date: string;
}

// --- Independent Asset Suppliers & Returns ---

export interface AssetSupplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSupplierReturnItem {
  id: string;
  assetId: string;
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  reason: string;
}

export interface AssetSupplierReturn {
  id: string;
  returnNumber: string;
  supplierId: string;
  supplierName: string;
  items: AssetSupplierReturnItem[];
  totalValue: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface AssetBranchReturnItem {
  id: string;
  assetId: string;
  name: string;
  code: string;
  quantity: number;
  condition: AssetCondition;
  reason: string;
}

export interface AssetBranchReturn {
  id: string;
  returnNumber: string;
  branchId: string;
  branchName: string;
  items: AssetBranchReturnItem[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "RECEIVED";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
}
