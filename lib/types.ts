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
  // Branch Type: main (Owner/Admin) or regular
  type?: "main" | "branch"
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

export interface User {
  id: string
  username: string
  passwordHash: string
  role: "admin" | "branch"
  branchId?: string // If role is branch
  createdAt: string
  lastLogin?: string
  activeSessions?: UserSession[]
  preferences?: UserPreferences
}

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
