"use strict";
import { db as firestore } from "./firebase";
import { db as localDb } from "./db";
import { collection, onSnapshot, doc, writeBatch, getDoc, setDoc, deleteDoc, query, where, getDocs, Timestamp } from "firebase/firestore";
import { Product, Transaction } from "./types";
import { notify } from "./events";
import { store } from "./data-store";
import type { StoreEvent } from "./events";
import { processSyncQueue } from "./sync-api";
import { v4 as uuidv4 } from 'uuid';

// Helper for Offline Enqueueing
async function enqueue(table: string, op: string, payload: any) {
    try {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        await localDb.syncQueue.put({
            id,
            table,
            op,
            payload,
            ts: new Date().toISOString(),
            attempts: 0,
            deviceId: 'browser', // default
            syncedToDevices: []
        });
        console.log(`[Sync] Enqueued ${op} for ${table} (Offline/Error)`);
    } catch (e) {
        console.error("[Sync] Failed to enqueue", e);
    }
}

// Helper functions to avoid circular dependency issues with imports
function updateStoreCache(table: string, record: any) {
    if (!store.initialized) return

    const map: Record<string, keyof typeof store.cache> = {
        'products': 'products',
        'categories': 'categories',
        'transactions': 'transactions',
        'branches': 'branches',
        'issues': 'issues',
        'returns': 'returns',
        'locations': 'locations',
        'units': 'units',
        'branch_requests': 'branchRequests',
        'branch_invoices': 'branchInvoices',
        'inventory_adjustments': 'adjustments',
    }

    const key = map[table]
    if (!key) return

    const list = store.cache[key] as any[]
    if (!list) return

    const idx = list.findIndex(r => r.id === record.id)
    if (idx !== -1) {
        list[idx] = { ...list[idx], ...record }
    } else {
        list.push(record)
    }
    notify('change')
    const eventMap: Record<string, StoreEvent> = {
        'products': 'products_change',
        'categories': 'categories_change',
        'transactions': 'transactions_change',
        'branches': 'branches_change',
        'issues': 'issues_change',
        'returns': 'returns_change',
        'branch_requests': 'branch_requests_change',
        'branch_invoices': 'branch_invoices_change',
    }
    if (eventMap[table]) notify(eventMap[table])
}

function removeFromStoreCache(table: string, id: string) {
    if (!store.initialized) return

    const map: Record<string, keyof typeof store.cache> = {
        'products': 'products',
        'categories': 'categories',
        'transactions': 'transactions',
        'branches': 'branches',
        'issues': 'issues',
        'returns': 'returns',
        'locations': 'locations',
        'units': 'units',
        'branch_requests': 'branchRequests',
        'branch_invoices': 'branchInvoices',
        'inventory_adjustments': 'adjustments',
    }

    const key = map[table]
    if (!key) return

    const list = store.cache[key] as any[]
    if (!list) return

    store.cache[key] = list.filter(r => r.id !== id) as any
    notify('change')
}

// Collections to sync
const COLLECTIONS = {
    PRODUCTS: 'products',
    TRANSACTIONS: 'transactions',
    CATEGORIES: 'categories',
    BRANCHES: 'branches',
    UNITS: 'units',
    ISSUES: 'issues',
    RETURNS: 'returns',
    LOCATIONS: 'locations',
    ADJUSTMENTS: 'inventoryAdjustments',
    BRANCH_REQUESTS: 'branchRequests',
    BRANCH_INVOICES: 'branchInvoices',
    PURCHASE_REQUESTS: 'purchaseRequests',
    PRODUCT_IMAGES: 'product_images'
};

let unsubscribers: Function[] = [];
let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

import { isDeleting } from "./sync-state";

// Helper for syncing collection
const syncCollection = (
    collectionName: string,
    localTable: any,
    eventName: string
) => {
    const q = query(collection(firestore, collectionName));
    return onSnapshot(q, (snapshot) => {
        let hasChanges = false;
        snapshot.docChanges().forEach(async (change) => {
            const data = change.doc.data();
            const localId = change.doc.id;

            // Skip updates for items currently being deleted locally
            if (isDeleting(localId)) {
                return;
            }

            hasChanges = true;

            try {
                if (change.type === "added" || change.type === "modified") {
                    const record = { ...data, id: localId };
                    await localTable.put(record);
                    updateStoreCache(collectionName, record);
                }
                if (change.type === "removed") {
                    await localTable.delete(localId);
                    removeFromStoreCache(collectionName, localId);
                }
            } catch (e) {
                console.error(`Sync Error ${collectionName}:`, e);
            }
        });

        if (hasChanges) {
            if (eventName) notify(eventName as any);
            notify("change");
        }
    }, (error) => {
        if (error?.message?.includes("Missing or insufficient permissions")) {
            console.warn(`[Sync] Permission denied for ${collectionName}. Check Firestore rules or Auth state.`);
            return;
        }
        console.error(`🔥 Sync Error ${collectionName}:`, error);
    });
};

// 1. Listen for Cloud Changes (Cloud -> Local)
export const startRealtimeSync = () => {
    if (isSyncing) return;
    isSyncing = true;
    console.log("🔥 Starting Firebase Realtime Sync...");

    // Process queue on startup
    processSyncQueue().catch(console.error);

    // Periodically process queue (every 60s)
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            processSyncQueue().catch(console.error);
        }, 60000);
    }

    try {
        unsubscribers.push(syncCollection(COLLECTIONS.PRODUCTS, localDb.products, "products_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.TRANSACTIONS, localDb.transactions, "transactions_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.CATEGORIES, localDb.categories, "categories_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCHES, localDb.branches, "branches_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.UNITS, localDb.units, "change"));
        unsubscribers.push(syncCollection(COLLECTIONS.ISSUES, localDb.issues, "issues_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.RETURNS, localDb.returns, "returns_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.LOCATIONS, localDb.locations, "change"));
        unsubscribers.push(syncCollection(COLLECTIONS.ADJUSTMENTS, localDb.inventoryAdjustments, "change"));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_REQUESTS, localDb.branchRequests, "branch_requests_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.PRODUCT_IMAGES, localDb.productImages, "product_images_change"));

    } catch (e) {
        console.error("Error starting sync:", e);
        isSyncing = false;
    }
};

export const stopRealtimeSync = () => {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
    isSyncing = false;
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    console.log("🛑 Stopped Firebase Sync");
};

// 2. Push Local Changes (Local -> Cloud)
export const syncProductToCloud = async (product: Product) => {
    if (!product.id) return false;
    try {
        const ref = doc(firestore, COLLECTIONS.PRODUCTS, product.id);
        const cleanData = JSON.parse(JSON.stringify(product));

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Sync Timeout")), 10000));

        await Promise.race([
            setDoc(ref, { ...cleanData, lastSyncedAt: Timestamp.now() }, { merge: true }),
            timeout
        ]);

        console.log("☁️ Pushed product to cloud:", product.productName);
        return true;
    } catch (e: any) {
        console.warn(`[Sync] Push failed for product ${product.productName}, queueing for offline sync.`, e);
        await enqueue(COLLECTIONS.PRODUCTS, 'upsert', product);
        return false;
    }
};

export const syncProductImageToCloud = async (productId: string, data: string) => {
    if (!productId || !data) return false;
    try {
        const ref = doc(firestore, COLLECTIONS.PRODUCT_IMAGES, productId);
        const payload = {
            productId,
            data,
            updatedAt: Timestamp.now()
        };
        await setDoc(ref, payload, { merge: true });
        console.log("☁️ Pushed product image to cloud:", productId);
        return true;
    } catch (e) {
        console.warn(`[Sync] Push failed for image ${productId}, queueing.`, e);
        await enqueue(COLLECTIONS.PRODUCT_IMAGES, 'upsert', { productId, data });
        return false;
    }
};

export const deleteProductImageFromCloud = async (productId: string) => {
    if (!productId) return false;
    try {
        const ref = doc(firestore, COLLECTIONS.PRODUCT_IMAGES, productId);
        await deleteDoc(ref);
        console.log("☁️ Deleted product image from cloud:", productId);
        return true;
    } catch (e) {
        console.warn(`[Sync] Delete failed for image ${productId}, queueing.`, e);
        await enqueue(COLLECTIONS.PRODUCT_IMAGES, 'delete', { id: productId });
        return false;
    }
};

export const deleteProductFromCloud = async (id: string) => {
    try {
        await deleteDoc(doc(firestore, COLLECTIONS.PRODUCTS, id));
        console.log("☁️ Deleted product from cloud:", id);
    } catch (e) {
        console.warn(`[Sync] Delete failed for product ${id}, queueing.`, e);
        await enqueue(COLLECTIONS.PRODUCTS, 'delete', { id });
    }
}

// 5. Generic Sync & Aliases
export const syncRecord = async (collectionName: string, record: any) => {
    if (!record.id) return false;
    try {
        const cleanData = JSON.parse(JSON.stringify(record));
        await setDoc(doc(firestore, collectionName, record.id), { ...cleanData, lastSyncedAt: Timestamp.now() }, { merge: true });
        return true;
    } catch (e) {
        console.warn(`[Sync] Push failed for ${collectionName}, queueing.`, e);
        await enqueue(collectionName, 'upsert', record);
        return false;
    }
}

export const deleteRecord = async (collectionName: string, id: string) => {
    try {
        await deleteDoc(doc(firestore, collectionName, id));
        console.log(`☁️ Deleted ${collectionName}:`, id);
        return true;
    } catch (e) {
        console.warn(`[Sync] Delete failed for ${collectionName} ${id}, queueing.`, e);
        await enqueue(collectionName, 'delete', { id });
        return false;
    }
}

// 3. Initial Full Sync (Local -> Cloud)
export const syncAllLocalToCloud = async (onProgress: (current: number, total: number) => void) => {
    console.log("🚀 Starting Full Upload to Cloud...");
    let successCount = 0;
    let failureCount = 0;
    let lastError: any = null;

    try {
        const products = await localDb.products.toArray();
        const images = await localDb.productImages.toArray();
        const totalProducts = products.length;
        const totalImages = images.length;
        const total = totalProducts + totalImages;

        if (total === 0) throw new Error("لا يوجد بيانات محلية للرفع");

        console.log(`Found ${totalProducts} products and ${totalImages} images. Starting upload...`);

        // 1. Sync Products
        const P_CHUNK_SIZE = 10;
        let processed = 0;

        for (let i = 0; i < products.length; i += P_CHUNK_SIZE) {
            const chunk = products.slice(i, i + P_CHUNK_SIZE);
            const results = await Promise.allSettled(chunk.map(p => syncProductToCloud(p)));

            results.forEach(res => {
                if (res.status === 'fulfilled') successCount++;
                else {
                    failureCount++;
                    lastError = res.reason;
                    console.error("item failed:", res.reason);
                }
            });

            processed += chunk.length;
            onProgress(processed, total);
            await new Promise(r => setTimeout(r, 100));
        }

        // 2. Sync Images
        const I_CHUNK_SIZE = 5;
        for (let i = 0; i < images.length; i += I_CHUNK_SIZE) {
            const chunk = images.slice(i, i + I_CHUNK_SIZE);
            const results = await Promise.allSettled(chunk.map(img => syncProductImageToCloud(img.productId, img.data)));

            results.forEach(res => {
                if (res.status === 'fulfilled') successCount++;
                else {
                    failureCount++;
                    console.error("image upload failed");
                }
            });

            processed += chunk.length;
            onProgress(processed, total);
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`✅ Upload Finished. Success: ${successCount}, Failed: ${failureCount}`);

        if (failureCount > 0) {
            console.warn(`${failureCount} منتج فشل رفعه. حاول الرفع مرة أخرى.`);
        }

        return { successCount, failureCount };
    } catch (e) {
        console.error("Upload process failed", e);
        throw e;
    }
}


// 4. Force Download (Cloud -> Local) - Smart Sync with Pruning
export const syncAllCloudToLocal = async (onProgress: (msg: string) => void) => {
    console.log("📥 Starting Full Download from Cloud...");
    try {
        onProgress("جاري الاتصال بقاعدة البيانات...");

        // 0. Get pending offline changes (to protect them from pruning)
        const pendingQueue = await localDb.syncQueue.toArray();
        const pendingProductIds = new Set(pendingQueue.filter(q => q.table === COLLECTIONS.PRODUCTS && q.op === 'upsert').map(q => q.payload.id));
        const pendingImageIds = new Set(pendingQueue.filter(q => q.table === COLLECTIONS.PRODUCT_IMAGES && q.op === 'upsert').map(q => q.payload.productId || q.payload.id));

        // 1. Products
        const q = query(collection(firestore, COLLECTIONS.PRODUCTS));
        const snapshot = await getDocs(q);
        const total = snapshot.size;

        let serverProductIds = new Set<string>();

        if (total > 0) {
            onProgress(`تم العثور على ${total} منتج. جاري التحميل...`);
            const items = snapshot.docs.map(d => {
                serverProductIds.add(d.id);
                return { ...d.data(), id: d.id } as Product;
            });
            await localDb.products.bulkPut(items);
        }

        // Pruning Stale Products
        if (total > 0 || pendingProductIds.size === 0) {
            const localKeys = await localDb.products.toCollection().primaryKeys();
            const toDelete = localKeys.filter(k =>
                !serverProductIds.has(k as string) &&
                !pendingProductIds.has(k as string) &&
                !isDeleting(k as string)
            );

            if (toDelete.length > 0) {
                console.log(`[Sync] Pruning ${toDelete.length} stale products...`);
                await localDb.products.bulkDelete(toDelete);
            }
        }

        // 2. Images
        onProgress("جاري البحث عن صور...");
        const qImg = query(collection(firestore, COLLECTIONS.PRODUCT_IMAGES));
        const snapImg = await getDocs(qImg);
        const totalImg = snapImg.size;
        let serverImageIds = new Set<string>();

        if (totalImg > 0) {
            onProgress(`تم العثور على ${totalImg} صورة. جاري التحميل...`);
            const images = snapImg.docs.map(d => {
                serverImageIds.add(d.id);
                const data = d.data();
                return { productId: d.id, data: data.data };
            });
            await localDb.productImages.bulkPut(images);
        }

        // Pruning Stale Images
        if (totalImg > 0 || pendingImageIds.size === 0) {
            const localImageKeys = await localDb.productImages.toCollection().primaryKeys();
            const imagesToDelete = localImageKeys.filter(k =>
                !serverImageIds.has(k as string) &&
                !pendingImageIds.has(k as string)
            );

            if (imagesToDelete.length > 0) {
                console.log(`[Sync] Pruning ${imagesToDelete.length} stale images...`);
                await localDb.productImages.bulkDelete(imagesToDelete);
            }
        }

        onProgress(`✅ تم تحميل ${total} منتج و ${totalImg} صورة بنجاح`);
        notify("products_change");
        notify("change");
    } catch (e) {
        console.error("Download failed", e);
        throw e;
    }
}

// Aliases
export const syncProduct = syncProductToCloud;
export const deleteProductApi = deleteProductFromCloud;
export const deleteAllProductsApi = async (ids: string[]) => {
    const batch = writeBatch(firestore);
    ids.forEach(id => {
        batch.delete(doc(firestore, COLLECTIONS.PRODUCTS, id));
    });
    await batch.commit();
}

export const syncTransaction = (r: any) => syncRecord(COLLECTIONS.TRANSACTIONS, r);
export const syncIssue = (r: any) => syncRecord(COLLECTIONS.ISSUES, r);
export const syncReturn = (r: any) => syncRecord(COLLECTIONS.RETURNS, r);
export const syncCategory = (r: any) => syncRecord(COLLECTIONS.CATEGORIES, r);
export const deleteCategoryApi = (id: string) => deleteRecord(COLLECTIONS.CATEGORIES, id);
export const syncBranch = (r: any) => syncRecord(COLLECTIONS.BRANCHES, r);
export const deleteBranchApi = (id: string) => deleteRecord(COLLECTIONS.BRANCHES, id);
export const syncUnit = (r: any) => syncRecord(COLLECTIONS.UNITS, r);
export const deleteUnitApi = (id: string) => deleteRecord(COLLECTIONS.UNITS, id);
export const syncLocation = (r: any) => syncRecord(COLLECTIONS.LOCATIONS, r);
export const deleteLocationApi = (id: string) => deleteRecord(COLLECTIONS.LOCATIONS, id);
export const syncInventoryAdjustment = (r: any) => syncRecord(COLLECTIONS.ADJUSTMENTS, r);
export const syncBranchRequest = (r: any) => syncRecord(COLLECTIONS.BRANCH_REQUESTS, r);
export const syncBranchInvoice = (r: any) => syncRecord(COLLECTIONS.BRANCH_INVOICES, r);
export const syncPurchaseRequest = (r: any) => syncRecord(COLLECTIONS.PURCHASE_REQUESTS, r);
export const pullAllDataFromFirebase = async () => {
    await syncAllCloudToLocal(() => { });
}
