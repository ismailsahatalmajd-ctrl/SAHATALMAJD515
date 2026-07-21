import { db } from './db';
import type { AssetItem, AssetSerialNumber, AssetRequestInvoice, AssetCategory, AssetType, AssetCondition } from './assets-types';
import { syncAssetItem, syncAssetSerialNumber, syncAssetInvoice, deleteAssetItemApi, deleteAssetSerialNumberApi, deleteAssetInvoiceApi } from './sync-api';
const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export async function getAssetItems(category?: AssetCategory) {
  if (category) {
    return await db.assetItems.where('category').equals(category).toArray();
  }
  return await db.assetItems.toArray();
}

export async function getAssetItem(id: string) {
  return await db.assetItems.get(id);
}

export async function addAssetItem(item: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const newItem: AssetItem = {
    ...item,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.assetItems.add(newItem);
  syncAssetItem(newItem).catch(console.error);
  return newItem;
}

export async function updateAssetItem(id: string, updates: Partial<AssetItem>) {
  updates.updatedAt = new Date().toISOString();
  await db.assetItems.update(id, updates);
  const updatedItem = await db.assetItems.get(id);
  if (updatedItem) syncAssetItem(updatedItem).catch(console.error);
  return updatedItem;
}

export async function deleteAssetItem(id: string) {
  await db.assetItems.delete(id);
  deleteAssetItemApi(id).catch(console.error);
  // Also delete associated serial numbers
  const serials = await db.assetSerialNumbers.where('assetId').equals(id).toArray();
  const serialIds = serials.map(s => s.id);
  await db.assetSerialNumbers.bulkDelete(serialIds);
  serialIds.forEach(sid => deleteAssetSerialNumberApi(sid).catch(console.error));
}

// --- Serial Numbers ---

export async function getAssetSerialNumbers(assetId: string) {
  return await db.assetSerialNumbers.where('assetId').equals(assetId).toArray();
}

export async function addAssetSerialNumber(assetId: string, serialNumber: string, condition: AssetCondition = "NEW") {
  const newSerial: AssetSerialNumber = {
    id: generateId(),
    assetId,
    serialNumber,
    status: "IN_STOCK",
    condition,
  };
  await db.assetSerialNumbers.add(newSerial);
  syncAssetSerialNumber(newSerial).catch(console.error);
  return newSerial;
}

export async function updateAssetSerialNumber(id: string, updates: Partial<AssetSerialNumber>) {
  await db.assetSerialNumbers.update(id, updates);
  const updatedSerial = await db.assetSerialNumbers.get(id);
  if (updatedSerial) syncAssetSerialNumber(updatedSerial).catch(console.error);
}

export async function deleteAssetSerialNumber(id: string) {
  await db.assetSerialNumbers.delete(id);
  deleteAssetSerialNumberApi(id).catch(console.error);
}

// --- Requests & Invoices ---

export async function getAssetInvoices() {
  return await db.assetRequestInvoices.toArray();
}

export async function getAssetInvoice(id: string) {
  return await db.assetRequestInvoices.get(id);
}

export async function addAssetInvoice(invoice: Omit<AssetRequestInvoice, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const newInvoice = {
    ...invoice,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.assetRequestInvoices.add(newInvoice);
  syncAssetInvoice(newInvoice).catch(console.error);
  return newInvoice;
}

export async function updateAssetInvoice(id: string, updates: Partial<AssetRequestInvoice>) {
  updates.updatedAt = new Date().toISOString();
  await db.assetRequestInvoices.update(id, updates);
  const updatedInvoice = await db.assetRequestInvoices.get(id);
  if (updatedInvoice) syncAssetInvoice(updatedInvoice).catch(console.error);
  return updatedInvoice;
}

export async function deleteAssetInvoice(id: string) {
  await db.assetRequestInvoices.delete(id);
  deleteAssetInvoiceApi(id).catch(console.error);
}

// --- Asset Purchasing ---

export async function addAssetPurchaseOrder(order: Omit<import('./assets-types').AssetPurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString()
  const newOrder = {
    ...order,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  } as import('./assets-types').AssetPurchaseOrder
  
  await db.assetPurchaseOrders.add(newOrder)
  import('./sync-api').then(m => m.syncAssetPurchaseOrder(newOrder)).catch(console.error)
  return newOrder
}

export async function getAssetPurchaseOrders() {
  return await db.assetPurchaseOrders.toArray()
}

export async function addAssetPriceHistory(record: Omit<import('./assets-types').AssetPriceHistory, 'id'>) {
  const newRecord = {
    ...record,
    id: generateId()
  } as import('./assets-types').AssetPriceHistory
  
  await db.assetPriceHistory.add(newRecord)
  import('./sync-api').then(m => m.syncAssetPriceHistory(newRecord)).catch(console.error)
  return newRecord
}

export async function getAssetPriceHistory(assetId?: string) {
  if (assetId) {
    return await db.assetPriceHistory.where('assetId').equals(assetId).toArray()
  }
  return await db.assetPriceHistory.toArray()
}

// --- Independent Asset Suppliers ---

export async function addAssetSupplier(supplier: Omit<import('./assets-types').AssetSupplier, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString()
  const newSupplier = {
    ...supplier,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  } as import('./assets-types').AssetSupplier
  
  await db.assetSuppliers.add(newSupplier)
  import('./sync-api').then(m => m.syncAssetSupplier(newSupplier)).catch(console.error)
  return newSupplier
}

export async function updateAssetSupplier(id: string, updates: Partial<import('./assets-types').AssetSupplier>) {
  updates.updatedAt = new Date().toISOString()
  await db.assetSuppliers.update(id, updates)
  const updated = await db.assetSuppliers.get(id)
  if (updated) import('./sync-api').then(m => m.syncAssetSupplier(updated)).catch(console.error)
  return updated
}

export async function deleteAssetSupplier(id: string) {
  await db.assetSuppliers.delete(id)
  import('./sync-api').then(m => m.deleteAssetSupplierApi(id)).catch(console.error)
}

// --- Returns ---

export async function addAssetSupplierReturn(ret: Omit<import('./assets-types').AssetSupplierReturn, 'id' | 'createdAt'>) {
  const newReturn = {
    ...ret,
    id: generateId(),
    createdAt: new Date().toISOString()
  } as import('./assets-types').AssetSupplierReturn
  
  await db.assetSupplierReturns.add(newReturn)
  import('./sync-api').then(m => m.syncAssetSupplierReturn(newReturn)).catch(console.error)
  return newReturn
}

export async function addAssetBranchReturn(ret: Omit<import('./assets-types').AssetBranchReturn, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString()
  const newReturn = {
    ...ret,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  } as import('./assets-types').AssetBranchReturn
  
  await db.assetBranchReturns.add(newReturn)
  import('./sync-api').then(m => m.syncAssetBranchReturn(newReturn)).catch(console.error)
  return newReturn
}

export async function addAssetPendingPurchase(data: Omit<import('./assets-types').AssetPendingPurchase, "id" | "createdAt" | "status">) {
  const newPending = {
    ...data,
    id: generateId("APP"),
    status: "PENDING",
    createdAt: new Date().toISOString()
  } as import('./assets-types').AssetPendingPurchase;
  await db.assetPendingPurchases.add(newPending);
  return newPending;
}
