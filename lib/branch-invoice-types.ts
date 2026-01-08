export interface BranchInvoiceItem {
  id?: string
  productId: string
  productCode: string
  productName: string
  unit?: string
  image?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  returnReason?: string
}

export interface BranchInvoice {
  id: string
  invoiceNumber?: string
  branchId: string
  branchName: string
  items: BranchInvoiceItem[]
  notes?: string
  totalValue: number
  createdAt: string
  createdBy?: string
}