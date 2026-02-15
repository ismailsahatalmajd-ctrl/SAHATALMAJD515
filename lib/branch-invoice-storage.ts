import type { BranchInvoice, BranchInvoiceItem } from "./branch-invoice-types"
import { getProducts, getBranchInvoices as getDbInvoices, saveBranchInvoices as saveDbInvoices } from "./storage"
import { nextInvoiceNumber } from "./invoice-sequences"

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9)

export function getBranchInvoices(): BranchInvoice[] {
  return getDbInvoices()
}

export function saveBranchInvoices(invoices: BranchInvoice[]): void {
  // Enforce limit: max 5 invoices per branch
  const grouped = new Map<string, BranchInvoice[]>()
  invoices.forEach(inv => {
    if (!grouped.has(inv.branchId)) grouped.set(inv.branchId, [])
    grouped.get(inv.branchId)!.push(inv)
  })

  const keptInvoices: BranchInvoice[] = []
  grouped.forEach((group) => {
    // Sort newest first
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    // Keep top 5
    const keep = group.slice(0, 5)
    keptInvoices.push(...keep)
  })

  // Sanitize: ensure items contain only minimal fields; drop heavy image strings
  const sanitized = keptInvoices.map((inv) => ({
    ...inv,
    items: inv.items.map((it) => ({
      ...it,
      // Only drop image if it is very large (base64)
      image: (it.image && it.image.length > 500) ? "" : it.image,
    })),
    // Trim notes if needed
    notes: (inv.notes || "").slice(0, 500),
  }))

  saveDbInvoices(sanitized)
}

export function getInvoicesByBranch(branchId: string): BranchInvoice[] {
  return getBranchInvoices().filter((x) => x.branchId === branchId)
}

function resolveItemPricing(it: Omit<BranchInvoiceItem, "totalPrice" | "unitPrice"> & Partial<BranchInvoiceItem>): BranchInvoiceItem {
  const products = getProducts()
  // Prioritize ID match, fallback to productCode match only if ID not found
  const byId = products.find((x) => x.id === it.productId)
  const byCode = byId ? undefined : products.find((x) => x.productCode === it.productCode)
  const p = byId || byCode

  // Determine base unit price
  let basePrice = (p?.averagePrice ?? p?.price ?? it.unitPrice ?? 0)
  // If basePrice is zero and non-carton unit, fallback to provided unitPrice
  if (basePrice === 0 && it.unitPrice && it.unitType !== 'carton') basePrice = it.unitPrice

  // Quantity handling
  const enteredQty = Math.max(0, Math.floor(it.quantity || it.quantityEntered || 0))
  let qtyBase = Math.max(0, Math.floor(it.quantityBase ?? enteredQty))
  let unitName = it.selectedUnitName || it.unit || p?.unit
  let finalUnitPrice = basePrice

  // Carton unit handling
  if (it.unitType === 'carton') {
    const factor = p?.quantityPerCarton || it.quantityPerCarton || 1
    finalUnitPrice = basePrice * factor
    qtyBase = enteredQty * factor
    unitName = it.selectedUnitName || p?.cartonUnit || it.cartonUnit || 'Carton'
  }

  // Preserve item-provided fields to avoid incorrect overriding
  const productId = it.productId ?? p?.id!
  const productCode = it.productCode ?? p?.productCode ?? ""
  const productName = it.productName ?? p?.productName ?? ""
  const image = it.image ?? p?.image ?? ""
  const unit = it.unit ?? p?.unit

  return {
    id: it.id || generateId(),
    productId,
    productCode,
    productName,
    unit,
    image,
    quantity: enteredQty,
    unitPrice: finalUnitPrice,
    totalPrice: finalUnitPrice * enteredQty,
    // Multi-Unit Persistence
    unitType: it.unitType || 'base',
    quantityEntered: enteredQty,
    quantityBase: qtyBase,
    selectedUnitName: unitName,
    quantityPerCarton: p?.quantityPerCarton || it.quantityPerCarton,
    cartonUnit: p?.cartonUnit || it.cartonUnit,
    // Preserve optional fields
    returnReason: it.returnReason,
    notes: it.notes
  }
}

export async function addBranchInvoice(
  inv: Omit<BranchInvoice, "id" | "createdAt" | "totalValue" | "items" | "invoiceNumber"> & {
    items: Array<Omit<BranchInvoiceItem, "id" | "totalPrice" | "unitPrice"> & Partial<BranchInvoiceItem>>
  },
): Promise<BranchInvoice> {
  const invoices = getBranchInvoices()
  const nowIso = new Date().toISOString()
  const items: BranchInvoiceItem[] = inv.items.map(resolveItemPricing)
  const totalValue = items.reduce((sum, x) => sum + x.totalPrice, 0)
  const invoiceNumber = await nextInvoiceNumber('branchOps')

  const newInvoice: BranchInvoice = {
    id: generateId(),
    invoiceNumber,
    branchId: inv.branchId,
    branchName: inv.branchName,
    items,
    notes: inv.notes,
    totalValue,
    createdAt: nowIso,
    createdBy: inv.createdBy,
  }

  invoices.unshift(newInvoice)
  saveBranchInvoices(invoices)
  return newInvoice
}
