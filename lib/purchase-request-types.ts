export type PurchaseRequestStatus = "draft" | "submitted" | "received"

export interface PurchaseRequestItem {
  id?: string
  productId?: string
  productCode: string
  productName: string
  unit?: string
  requestedQuantity: number
  availableQuantity?: number
  image?: string
}

export type PurchaseRequestAction =
  | "created"
  | "updated_items"
  | "saved_draft"
  | "submitted"
  | "received"

export interface PurchaseRequestHistoryEntry {
  id: string
  action: PurchaseRequestAction
  message: string
  timestamp: string
  actor?: string
}

export interface PurchaseRequest {
  id: string
  requestNumber?: number | string
  status: PurchaseRequestStatus
  items: PurchaseRequestItem[]
  notes?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
  history: PurchaseRequestHistoryEntry[]
}