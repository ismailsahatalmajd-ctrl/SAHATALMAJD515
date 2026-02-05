export interface Product {
  id: string
  productCode: string
  itemNumber: string
  location: string
  productName: string
  quantity: number
  unit: string
  cartonLength?: number
  cartonWidth?: number
  cartonHeight?: number
  cartonUnit?: string
  openingStock: number
  purchases: number
  issues: number
  inventoryCount: number
  currentStock: number
  difference: number
  price: number
  averagePrice: number
  currentStockValue: number
  issuesValue: number
  quantityPerCarton?: number // الكمية في الكرتون
  cartonBarcode?: string // باركود الكرتون
  category: string
  image?: string
  // معرض صور المنتج (اختياري)
  gallery?: string[]
  minStockLimit?: number // Added custom low stock limit
  lowStockThresholdPercentage?: number // Percentage for low stock calculation (default 33.33)
  isLowStock?: boolean // Flag for low stock status
  lowStockDetectedAt?: string // Timestamp when low stock was detected
  lastActivity?: string // Added last activity date
  createdAt: string
  updatedAt: string
  lastModifiedBy?: string
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface Transaction {
  id: string
  operationNumber?: number | string
  productId: string
  productName: string
  type: "purchase" | "sale" | "adjustment" | "return"
  quantity: number
  unitPrice: number
  totalAmount: number
  notes?: string
  createdAt: string
  createdBy?: string
  updatedAt?: string
  lastModifiedBy?: string
}

export interface InventoryAdjustment {
  id: string
  productId: string
  productName: string
  oldQuantity: number
  newQuantity: number
  difference: number
  reason: string
  createdAt: string
  createdBy?: string
  updatedAt?: string
  lastModifiedBy?: string
}

export interface FinancialSummary {
  totalPurchases: number
  totalSales: number
  totalInventoryValue: number
  profit: number
  period: string
}

export interface Branch {
  id: string
  name: string
  location: string
  address?: string
  manager?: string
  phone?: string
  contactEmail?: string
  // تجزئة رمز الدخول للفرع (SHA-256) - legacy
  accessCodeHash?: string
  // Branch Type: main (Owner/Admin) or regular or user
  type?: "main" | "branch" | "user"
  role?: UserRole
  permissions?: Partial<Permissions>
  // New auth fields
  username?: string
  passwordHash?: string
  // ساعات العمل النصية مثل "السبت-الخميس: 9 ص - 5 م"
  workingHours?: string
  // الخدمات المقدمة في الفرع
  services?: string[]
  // فعاليات/أنشطة الفرع
  events?: { title: string; date?: string; description?: string }[]
  createdAt: string
  updatedAt?: string
  lastModifiedBy?: string
}

// ============================================
// Auth & Permissions Types
// ============================================

export type UserRole = 'owner' | 'manager' | 'supervisor' | 'staff' | 'view_only' | 'custom';

export interface Permissions {
  // Inventory
  'inventory.view': boolean;
  'inventory.add': boolean;
  'inventory.edit': boolean;
  'inventory.delete': boolean;
  'inventory.adjust': boolean; // Stock Adjustment

  // Transactions
  'transactions.purchase': boolean;
  'transactions.issue': boolean;
  'transactions.return': boolean;
  'transactions.approve': boolean;

  // Branch Management
  'branches.view': boolean;
  'branches.manage': boolean; // Add/Edit/Delete
  'branch_requests.view': boolean;
  'branch_requests.approve': boolean;

  // User Management (Admin)
  'users.view': boolean;
  'users.manage': boolean;

  // System & Settings
  'system.settings': boolean; // Was settings.edit
  'system.backup': boolean;
  'system.logs': boolean;     // Was audit.view

  // Page Access (Route Protection)
  'page.dashboard': boolean;
  'page.inventory': boolean;
  'page.transactions': boolean;
  'page.reports': boolean;
  'page.settings': boolean;
  'page.users': boolean;
  'page.branches': boolean;
}

export interface UserSession {
  id: string
  userId: string
  deviceId: string
  lastActive: string
  ipAddress?: string
  userAgent?: string
}

export interface UserPreferences {
  theme?: "light" | "dark" | "system"
  language?: "ar" | "en"
  notifications?: boolean
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  username?: string // Legacy support
  photoURL?: string

  role: UserRole
  permissions: Permissions

  branchId?: string // If set, restricts data to this branch
  isActive: boolean

  createdAt: string
  lastLogin: string

  // Legacy / Local Auth Fields
  passwordHash?: string
  activeSessions?: UserSession[]
  preferences?: UserPreferences
}

// Alias for backward compatibility
export type User = UserProfile;

export interface Unit {
  id: string
  name: string
  abbreviation?: string
  createdAt?: string
}

export interface VerificationLog {
  id: string
  issueId: string
  issueNumber: string
  timestamp: string
  user?: string
  status: 'matched' | 'discrepancy'
  items: VerificationItem[]
  notes?: string
  // Multi-Unit Support
  unitType?: "base" | "carton"
  quantityEntered?: number
  quantityBase?: number
  selectedUnitName?: string
}

export interface VerificationItem {
  productId: string
  productName: string
  productCode: string
  image?: string
  expectedQty: number
  scannedQty: number
  status: 'match' | 'missing' | 'extra'
}

export interface Location {
  id: string
  name: string
  description?: string
  createdAt: string
}

export interface Issue {
  id: string
  invoiceNumber?: string
  branchId: string
  branchName: string
  products: IssueProduct[]
  totalValue: number
  notes?: string
  createdAt: string
  createdBy?: string
  // أسماء الموظفين المرتبطين بعملية الصرف/التجميع
  extractorName?: string
  inspectorName?: string
  // حالة تأكيد التسليم
  delivered?: boolean
  deliveredAt?: string
  deliveredBy?: string
  // Branch receipt confirmation (independent of stock deduction)
  branchReceived?: boolean
  branchReceivedAt?: string
  // حالة العملية (اختياري): مسودة/قيد التنفيذ/تم التسليم
  status?: "draft" | "pending" | "delivered"
  updatedAt?: string
  lastModifiedBy?: string
}

export interface IssueProduct {
  productId: string
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  image?: string
  unit?: string // Added unit to issue product
  currentStock?: number
  quantityBase?: number // For Multi-Unit Deduction
}

export interface Return {
  id: string
  returnNumber?: string
  // مصدر المرتجع: عملية صرف (عودة إلى المخزون) أو عملية شراء (عودة إلى المورد)
  sourceType?: "issue" | "purchase"
  // ربط المرتجع بسجل مصدر محدد
  issueId?: string
  sourceTransactionId?: string
  // معلومات العميل المرتبط بعملية المرتجع
  customerName?: string
  customerPhone?: string
  originalInvoiceNumber?: string
  // المسؤول عن العملية وخيارات التوقيع/الختم
  responsibleName?: string
  signatureImage?: string
  stampImageUrl?: string
  branchId: string
  branchName: string
  products: IssueProduct[]
  totalValue: number
  reason: string
  // طريقة الاسترداد (عند الإرجاع إلى المورد)
  refundMethod?: "cash" | "wallet" | "bank_transfer" | "voucher"
  // تتبع حالة طلب الإرجاع
  status?: "pending" | "approved" | "rejected" | "completed"
  approvedBy?: string
  createdAt: string
  updatedAt?: string
  lastModifiedBy?: string
}

// مسودة فاتورة صرف غير مكتملة
export interface IssueDraft {
  id: string
  branchId?: string
  branchName?: string
  products: IssueProduct[]
  notes?: string
  extractorName?: string
  inspectorName?: string
  createdAt: string
  updatedAt: string
  complete?: boolean
}

export interface PurchaseOrderItem {
  productId: string
  productName: string
  productCode: string
  unit: string
  requestedQuantity: number
  availableQuantity: number
  image?: string
}

export interface PurchaseOrder {
  id: string
  items: PurchaseOrderItem[]
  status: "draft" | "submitted" | "approved" | "completed"
  notes?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface AuditLogEntry {
  id: string
  timestamp: Date | string
  userId: string
  userName: string
  action: "create" | "update" | "delete" | "export" | "import"
  entity:
  | "product"
  | "transaction"
  | "issue"
  | "return"
  | "purchase"
  | "branch"
  | "category"
  | "location"
  | "unit"
  | "branch_request"
  | "settings"
  entityId: string
  entityName: string
  changes?: {
    field: string
    oldValue: any
    newValue: any
  }[]
  metadata?: Record<string, any>
}

export interface DeviceSession {
  deviceId: string
  username?: string
  userAgent: string
  ip?: string
  lastActive: string
  appVersion: string
  syncStatus: {
    productsCount: number
    transactionsCount: number
    lastSyncTimestamp: string
  }
  command?: 'none' | 'force_resync' | 'wipe_and_logout'
  commandStatus?: {
    type: 'success' | 'error' | 'pending'
    message: string
    timestamp: string
  }
  role?: string // Added role
}

// ============================================
// Branch Inventory System Types
// ============================================

// مخزون الفرع (المستهلكات)
export interface BranchInventory {
  id: string
  branchId: string
  productId: string
  productName: string
  productCode?: string
  unit?: string
  productImage?: string   // صورة المنتج

  // الكميات
  receivedTotal: number      // إجمالي المستلم من المستودع الرئيسي
  consumedTotal: number      // إجمالي المستهلك
  currentStock: number       // الرصيد الحالي = received - consumed
  lastInventoryCount?: number // آخر جرد فعلي
  minStockLimit?: number     // الحد الأدنى للتنبيه

  // التواريخ
  lastReceivedDate?: string
  lastConsumedDate?: string
  lastInventoryDate?: string
  createdAt: string
  updatedAt: string
}

// سجل الاستهلاك
export interface ConsumptionRecord {
  id: string
  branchId: string
  branchInventoryId: string
  productId: string
  productName: string

  quantity: number
  reason: string             // سبب الاستهلاك
  usedBy?: string            // من استخدم
  notes?: string

  date: string
  createdAt: string
}

// أصول الفرع (معدات وأجهزة)
export interface BranchAsset {
  id: string
  branchId: string
  branchName?: string

  // معلومات الأصل
  name: string               // اسم الأصل (ثلاجة، مكينة قهوة، إلخ)
  category: string           // تصنيف (أجهزة، أثاث، معدات)
  brand?: string             // الماركة
  model?: string             // الموديل
  serialNumber?: string      // الرقم التسلسلي
  barcode?: string           // باركود الأصل

  // الحالة
  status: 'new' | 'good' | 'needs_maintenance' | 'damaged' | 'disposed' | 'lost'
  condition?: string         // وصف الحالة

  // التواريخ
  purchaseDate?: string
  purchasePrice?: number
  warrantyExpiry?: string
  assignedDate: string       // تاريخ تسليمه للفرع
  lastMaintenanceDate?: string

  // المسؤولية
  responsiblePerson?: string  // المسؤول عنه في الفرع

  // الصور
  images?: string[]

  createdAt: string
  updatedAt: string
  createdBy?: string
}

// تقارير الصيانة
export interface MaintenanceReport {
  id: string
  assetId: string
  assetName: string
  branchId: string
  branchName?: string

  issueType: 'malfunction' | 'damage' | 'wear' | 'other'
  description: string        // وصف المشكلة
  cause?: string             // سبب العطل
  actionTaken?: string       // الإجراء المتخذ
  cost?: number              // تكلفة الإصلاح

  status: 'pending' | 'in_progress' | 'resolved' | 'requires_replacement'

  reportedBy: string
  reportedDate: string
  resolvedDate?: string
  resolvedBy?: string

  images?: string[]

  createdAt: string
  updatedAt: string
}

// طلبات الأصول
export interface AssetRequest {
  id: string
  branchId: string
  branchName?: string

  requestedAsset: string     // الأصل المطلوب
  category?: string          // تصنيف (أجهزة، أثاث، معدات)
  reason: string             // سبب الطلب
  urgency: 'low' | 'medium' | 'high'
  quantity?: number          // الكمية المطلوبة

  // تقرير الأصول الحالية (مطلوب)
  currentAssetsReportId?: string
  currentAssetsReportDate?: string

  status: 'pending' | 'approved' | 'rejected' | 'fulfilled'
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string

  requestedBy: string
  requestDate: string

  createdAt: string
  updatedAt: string
}

// تقرير حالة الأصول (للفرع)
export interface AssetStatusReport {
  id: string
  branchId: string
  branchName?: string

  totalAssets: number
  assetsByStatus: {
    new: number
    good: number
    needs_maintenance: number
    damaged: number
    disposed: number
    lost: number
  }

  assets: {
    assetId: string
    assetName: string
    status: string
    condition?: string
  }[]

  generatedBy: string
  generatedAt: string
  notes?: string
}
