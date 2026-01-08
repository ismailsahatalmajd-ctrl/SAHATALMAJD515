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
  const p = products.find((x) => x.id === it.productId || x.productCode === it.productCode)
  const unitPrice = p?.averagePrice ?? p?.price ?? it.unitPrice ?? 0
  const quantity = Math.max(0, Math.floor(it.quantity))
  return {
    id: it.id || generateId(),
    productId: p?.id || it.productId!,
    productCode: p?.productCode || it.productCode!,
    productName: p?.productName || it.productName!,
    unit: p?.unit || it.unit,
    image: p?.image || "",
    quantity,
    unitPrice,
    totalPrice: unitPrice * quantity,
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
