import type { PurchaseRequest, PurchaseRequestHistoryEntry, PurchaseRequestItem, PurchaseRequestStatus } from "./purchase-request-types"
import { getProducts, getPurchaseRequests as getDbRequests, savePurchaseRequests as saveDbRequests } from "./storage"
import { getNumericInvoiceNumber } from "./utils"

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9)

export function getPurchaseRequests(): PurchaseRequest[] {
  return getDbRequests()
}

export function savePurchaseRequests(requests: PurchaseRequest[]): void {
  saveDbRequests(requests)
}

function getAvailableQtyByProductCode(productCode: string): number {
  const products = getProducts()
  const p = products.find((x) => x.productCode === productCode)
  return p ? p.currentStock : 0
}

export function addPurchaseRequest(
  req: Omit<PurchaseRequest, "id" | "createdAt" | "updatedAt" | "history" | "requestNumber" | "status"> & { status?: PurchaseRequestStatus },
): PurchaseRequest {
  const requests = getPurchaseRequests()
  const nowIso = new Date().toISOString()

  const items: PurchaseRequestItem[] = (req.items || []).map((it) => ({
    ...it,
    id: it.id || generateId(),
    availableQuantity: it.availableQuantity ?? getAvailableQtyByProductCode(it.productCode),
  }))

  const newRequest: PurchaseRequest = {
    id: generateId(),
    requestNumber: getNumericInvoiceNumber(generateId(), new Date()),
    status: req.status ?? "draft",
    items,
    notes: req.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: req.createdBy,
    history: [
      { id: generateId(), action: "created", message: "تم إنشاء طلب شراء", timestamp: nowIso, actor: req.createdBy },
    ],
  }

  requests.unshift(newRequest)
  savePurchaseRequests(requests)
  return newRequest
}

export function updatePurchaseRequest(id: string, updates: Partial<PurchaseRequest>): PurchaseRequest | null {
  const requests = getPurchaseRequests()
  const index = requests.findIndex((r) => r.id === id)
  if (index === -1) return null

  const prev = requests[index]
  const nowIso = new Date().toISOString()

  let historyToAppend: PurchaseRequestHistoryEntry | null = null
  let nextItems = updates.items
  if (updates.items) {
    nextItems = updates.items.map((it) => ({
      ...it,
      availableQuantity: it.availableQuantity ?? getAvailableQtyByProductCode(it.productCode),
      id: it.id || generateId(),
    }))
    historyToAppend = {
      id: generateId(),
      action: "updated_items",
      message: "تم تعديل قائمة العناصر",
      timestamp: nowIso,
      actor: updates.createdBy,
    }
  }

  const next: PurchaseRequest = {
    ...prev,
    ...updates,
    items: nextItems ?? prev.items,
    updatedAt: nowIso,
    history: historyToAppend ? [...prev.history, historyToAppend] : prev.history,
  }

  requests[index] = next
  savePurchaseRequests(requests)
  return next
}

export function deletePurchaseRequest(id: string): boolean {
  const requests = getPurchaseRequests()
  const filtered = requests.filter((r) => r.id !== id)
  const changed = filtered.length !== requests.length
  if (!changed) return false
  savePurchaseRequests(filtered)
  return true
}

export function setRequestStatus(id: string, status: PurchaseRequestStatus, actor: string): PurchaseRequest | null {
  const requests = getPurchaseRequests()
  const index = requests.findIndex((r) => r.id === id)
  if (index === -1) return null

  const prev = requests[index]
  const nowIso = new Date().toISOString()

  const historyEntry: PurchaseRequestHistoryEntry = {
    id: generateId(),
    action: "status_change",
    message: `تم تغيير الحالة إلى ${status}`,
    timestamp: nowIso,
    actor: actor,
  }

  const next: PurchaseRequest = {
    ...prev,
    status: status,
    updatedAt: nowIso,
    history: [...prev.history, historyEntry],
  }

  requests[index] = next
  savePurchaseRequests(requests)
  return next
}
