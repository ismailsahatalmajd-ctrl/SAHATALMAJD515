export type BranchRequestStatus = "draft" | "submitted" | "approved" | "cancelled"

export interface BranchRequestItem {
  id?: string
  productId: string
  productCode: string
  productName: string
  unit?: string
  image?: string
  requestedQuantity: number
  quantity?: number // Added for compatibility
  availableQuantity?: number
  returnReason?: string
  // Multi-Unit
  unitType?: "base" | "carton"
  quantityEntered?: number
  quantityBase?: number
  selectedUnitName?: string
  quantityPerCarton?: number
  cartonUnit?: string
}

export interface BranchRequestHistoryEntry {
  id: string
  action: "created" | "submitted" | "approved" | "cancelled" | "updated_items" | "edited"
  message: string
  timestamp: string
  actor?: string
}

export interface BranchChatMessage {
  id: string
  sender: "admin" | "branch"
  senderName: string
  message: string
  timestamp: string
}

export interface BranchRequest {
  id: string
  requestNumber?: string
  branchId: string
  branchName: string
  items: BranchRequestItem[]
  notes?: string
  status: BranchRequestStatus
  type: "supply" | "return" // نوع الطلب: توريد أو مرتجع
  chatMessages: BranchChatMessage[] // محادثة الطلب
  createdAt: string
  updatedAt: string
  createdBy?: string
  history: BranchRequestHistoryEntry[]
}
