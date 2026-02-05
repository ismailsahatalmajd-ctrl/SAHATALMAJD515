import type { BranchRequest, BranchRequestHistoryEntry, BranchRequestItem, BranchRequestStatus } from "./branch-request-types"
import type { IssueProduct } from "./types"
import { getProducts, getBranches, addIssue, addReturn, approveReturn, getBranchRequests as getDbRequests, saveBranchRequests as saveDbRequests, deleteAllBranchRequestsApi } from "./storage"

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9)

export function getBranchRequests(): BranchRequest[] {
  return getDbRequests()
}

export function saveBranchRequests(requests: BranchRequest[]): void {
  // We used to limit per branch/type to 5 latest, but this caused sync conflicts
  // and data loss for Admin. Display limits are now handled in the UI.
  saveDbRequests(requests)
}

function getAvailableQtyByProductCode(productCode: string): number {
  const products = getProducts()
  const p = products.find((x) => x.productCode === productCode)
  return p ? p.currentStock : 0
}

export function addBranchRequest(
  req: Omit<BranchRequest, "id" | "createdAt" | "updatedAt" | "history" | "requestNumber" | "status" | "chatMessages"> & { status?: BranchRequestStatus },
) {
  const requests = getBranchRequests()
  const nowIso = new Date().toISOString()

  const items: BranchRequestItem[] = (req.items || []).map((it) => ({
    ...it,
    id: it.id || generateId(),
    availableQuantity: it.availableQuantity ?? getAvailableQtyByProductCode(it.productCode),
  }))

  const newRequest: BranchRequest = {
    id: generateId(),
    requestNumber: undefined,
    branchId: req.branchId,
    branchName: req.branchName,
    items,
    notes: req.notes,
    status: req.status ?? "draft",
    type: req.type || "supply",
    chatMessages: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: req.createdBy,
    history: [
      { id: generateId(), action: "created", message: "تم إنشاء طلب فرع", timestamp: nowIso, actor: req.createdBy },
    ],
  }

  requests.unshift(newRequest)
  saveBranchRequests(requests)
  return newRequest
}

export function updateBranchRequest(id: string, updates: Partial<BranchRequest>): BranchRequest | null {
  const requests = getBranchRequests()
  const idx = requests.findIndex((r) => r.id === id)
  if (idx === -1) return null
  const nowIso = new Date().toISOString()
  const updated: BranchRequest = { ...requests[idx], ...updates, updatedAt: nowIso }
  requests[idx] = updated
  saveBranchRequests(requests)
  return updated
}

export function deleteBranchRequest(id: string): boolean {
  const requests = getBranchRequests()
  const next = requests.filter((r) => r.id !== id)
  saveBranchRequests(next)

  // Sync deletion to cloud
  if (typeof window !== 'undefined') {
    deleteAllBranchRequestsApi([id]).catch(console.error)
  }

  return next.length !== requests.length
}

export function appendRequestHistory(id: string, entry: Omit<BranchRequestHistoryEntry, "id" | "timestamp"> & { actor?: string }): void {
  const requests = getBranchRequests()
  const idx = requests.findIndex((r) => r.id === id)
  if (idx === -1) return
  const nowIso = new Date().toISOString()
  const ent: BranchRequestHistoryEntry = { id: generateId(), timestamp: nowIso, ...entry }
  requests[idx].history.push(ent)
  requests[idx].updatedAt = nowIso
  saveBranchRequests(requests)
}

export function addBranchRequestMessage(requestId: string, message: Omit<import("./branch-request-types").BranchChatMessage, "id" | "timestamp">): import("./branch-request-types").BranchRequest | null {
  const requests = getBranchRequests()
  const idx = requests.findIndex((r) => r.id === requestId)
  if (idx === -1) return null

  const nowIso = new Date().toISOString()
  const msg: import("./branch-request-types").BranchChatMessage = {
    id: generateId(),
    timestamp: nowIso,
    ...message,
  }

  if (!requests[idx].chatMessages) requests[idx].chatMessages = []

  requests[idx].chatMessages.push(msg)
  requests[idx].updatedAt = nowIso
  saveBranchRequests(requests)
  return requests[idx]
}

export function setRequestStatus(id: string, status: BranchRequestStatus, actor?: string): BranchRequest | null {
  const updated = updateBranchRequest(id, { status })
  if (updated) appendRequestHistory(id, { action: status === "submitted" ? "submitted" : status === "approved" ? "approved" : "cancelled", message: `تم تغيير الحالة إلى ${status}`, actor })
  return updated
}

export async function approveBranchRequest(id: string, actor?: string): Promise<{ approved: boolean; issueId?: string; returnId?: string }> {
  const requests = getBranchRequests()
  const req = requests.find((r) => r.id === id)
  if (!req) return { approved: false }

  const products = getProducts()

  if (req.type === 'return') {
    const returnProducts: IssueProduct[] = req.items.map((it) => {
      const p = products.find((x) => x.id === it.productId || x.productCode === it.productCode)
      const unitPrice = p?.averagePrice ?? p?.price ?? 0
      const quantity = Math.max(0, Math.floor(it.requestedQuantity || it.quantity || 0))
      return {
        productId: p?.id || it.productId,
        productCode: p?.productCode || it.productCode,
        productName: p?.productName || it.productName,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        image: p?.image || it.image || "",
        currentStock: p?.currentStock ?? 0,
        unit: p?.unit || it.unit || "",
      }
    })

    const totalValue = returnProducts.reduce((sum, x) => sum + x.totalPrice, 0)

    const newReturn = {
      branchId: req.branchId,
      branchName: req.branchName,
      products: returnProducts,
      totalValue,
      reason: req.notes || "مرتجع من الفرع (طلب)",
      sourceType: "issue" as const,
      status: "pending" as const,
    }

    const ret = await addReturn(newReturn)
    await approveReturn(ret.id, actor || "admin")
    setRequestStatus(id, "approved", actor)
    appendRequestHistory(id, { action: "approved", message: `تمت الموافقة على المرتجع وإنشاء سجل برقم ${ret.returnNumber || ret.id.slice(0, 8)}`, actor })
    return { approved: true, returnId: ret.id }
  }

  // تجهيز منتجات الصرف (Issue)
  const issueProducts: IssueProduct[] = req.items.map((it) => {
    const p = products.find((x) => x.id === it.productId || x.productCode === it.productCode)
    const unitPrice = p?.averagePrice ?? p?.price ?? 0
    const quantity = Math.max(0, Math.floor(it.requestedQuantity || it.quantity || 0))
    // Multi-Unit Logic: Use quantityBase if available (for precise stock deduction), otherwise fallback
    const finalQuantity = it.quantityBase || quantity

    return {
      productId: p?.id || it.productId,
      productCode: p?.productCode || it.productCode,
      productName: p?.productName || it.productName,
      quantity: finalQuantity, // Store in Base Units for Issue
      unitPrice,
      totalPrice: unitPrice * quantity, // Value based on Entered Quantity * Unit Price (Carton Price * Cartons) matches Base * BasePrice?
      // Check: 5 * (24 * 1) = 120. 120 * 1 = 120. Yes.
      // But we must preserve the original "unitPrice" relative to the Issue Items?
      // IssueProduct expects unitPrice. If quantity is 120, unitPrice should be Piece Price.
      // it.unitPrice might be Carton Price.
      // So: totalPrice is correct. unitPrice needs adjustment if we change quantity basis.
      // calculatedTotalPrice = it.totalPrice || (quantity * unitPrice)

      image: p?.image || it.image || "",
      currentStock: p?.currentStock ?? 0,
      unit: p?.unit || it.unit || "",
      quantityBase: finalQuantity,
    }
  })

  const totalValue = issueProducts.reduce((sum, x) => sum + x.totalPrice, 0)

  // إنشاء عملية الصرف المرتبطة بالفرع
  const issue = await addIssue({
    branchId: req.branchId,
    branchName: req.branchName,
    products: issueProducts,
    totalValue,
    notes: req.notes || "صرف طلب فرع",
  })

  // تحديث حالة الطلب وإضافة سجل
  setRequestStatus(id, "approved", actor)
  appendRequestHistory(id, { action: "approved", message: `تمت الموافقة وإنشاء صرف بقيمة ${totalValue.toFixed(2)}`, actor })

  return { approved: true, issueId: issue.id }
}
