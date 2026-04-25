import { db as firestore, storage } from "./firebase";
import { db as localDb } from "./db";
import { collection, onSnapshot, doc, writeBatch, getDoc, setDoc, deleteDoc, query, where, getDocs, Timestamp, updateDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Product, Transaction, WarehouseDesignElement } from "./types";
import { notify } from "./events";
import { store } from "./data-store";
import type { StoreEvent } from "./events";
import { processSyncQueue } from "./sync-api";
import { v4 as uuidv4 } from 'uuid';

// Helper for Network Retries (Exponential Backoff)
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            lastError = e;
            const isRetryable = e?.code === 'deadline-exceeded' || e?.code === 'unavailable' || e?.message?.includes('timeout') || e?.message?.includes('unavailable');

            if (isRetryable && attempt < maxAttempts) {
                const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                console.warn(`[Sync] Operation failed (${e.code || e.message}). Retrying in ${delay}ms... (Attempt ${attempt}/${maxAttempts})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw lastError;
}

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
        'branchRequests': 'branchRequests',
        'branchInvoices': 'branchInvoices',
        'inventoryAdjustments': 'adjustments',
        'purchaseRequests': 'purchaseRequests',
        'receivingNotes': 'receivingNotes',
        'employees': 'employees',
        'overtimeReasons': 'overtimeReasons',
        'overtimeEntries': 'overtimeEntries',
        'absenceRecords': 'absenceRecords',
        'labelTemplates': 'labelTemplates'
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
        'branchRequests': 'branch_requests_change',
        'branchInvoices': 'branch_invoices_change',
        'receivingNotes': 'receiving_notes_change' as any,
        'employees': 'employees_change' as any,
        'overtimeReasons': 'overtime_reasons_change' as any,
        'overtimeEntries': 'overtime_entries_change' as any,
        'absenceRecords': 'absence_records_change' as any,
        'labelTemplates': 'label_templates_change',
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
        'branchRequests': 'branchRequests',
        'branchInvoices': 'branchInvoices',
        'inventoryAdjustments': 'adjustments',
        'purchaseRequests': 'purchaseRequests',
        'employees': 'employees',
        'overtimeReasons': 'overtimeReasons',
        'overtimeEntries': 'overtimeEntries',
        'absenceRecords': 'absenceRecords',
        'labelTemplates': 'labelTemplates'
    }

    const key = map[table]
    if (!key) return

    const list = store.cache[key] as any[]
    if (!list) return

    store.cache[key] = list.filter(r => r.id !== id) as any
    notify('change')
}

// Collections to sync
export const COLLECTIONS = {
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
    PRODUCT_IMAGES: 'product_images',
    SYNC_QUEUE: 'syncQueue',
    // Branch Inventory System Collections
    BRANCH_INVENTORY: 'branchInventory',
    CONSUMPTION_RECORDS: 'consumptionRecords',
    BRANCH_ASSETS: 'branchAssets',
    MAINTENANCE_REPORTS: 'maintenanceReports',
    ASSET_REQUESTS: 'assetRequests',
    ASSET_STATUS_REPORTS: 'assetStatusReports',
    AUDIT_LOGS: 'auditLogs',
    SUPPLIERS: 'suppliers',
    EMPLOYEES: 'employees',
    OVERTIME_REASONS: 'overtimeReasons',
    OVERTIME_ENTRIES: 'overtimeEntries',
    ABSENCE_RECORDS: 'absenceRecords',
    LABEL_TEMPLATES: 'labelTemplates',
    WAREHOUSE_LOCATIONS: 'warehouseLocations',
    WAREHOUSE_DESIGN: 'warehouseDesignElements',
    GRANULAR_PERMISSIONS: 'granularPermissions',
    BRANCH_NOTES: 'branchNotes',
    BRANCH_INVENTORY_REPORTS: 'branch_inventory_reports'
};

const notifyGranularUpdate = (userId: string) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('granular_permissions_updated', { detail: { userId } }));
    }
}

let unsubscribers: Function[] = [];
let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

import { isDeleting } from "./sync-state";

/** Normalize Firestore Timestamp | ISO string | number to epoch ms for LWW merges */
function recordToMillis(v: unknown): number {
    if (v == null) return 0
    if (typeof v === "object" && v !== null && typeof (v as { toMillis?: () => number }).toMillis === "function") {
        try {
            return (v as { toMillis: () => number }).toMillis()
        } catch {
            return 0
        }
    }
    if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? Math.round(v * 1000) : v
    if (typeof v === "string") {
        const t = new Date(v).getTime()
        return Number.isNaN(t) ? 0 : t
    }
    return 0
}

/** Avoid overwriting Dexie with stale Firestore product (e.g. purchase saved locally but syncProduct still pending). */
function shouldSkipStaleRemoteProduct(existing: Product | undefined, remote: Product & { lastSyncedAt?: unknown }): boolean {
    if (!existing?.id) return false
    const localTs = Math.max(recordToMillis(existing.updatedAt), recordToMillis(existing.lastActivity))
    const remoteTs = Math.max(
        recordToMillis(remote.updatedAt),
        recordToMillis(remote.lastActivity),
        recordToMillis(remote.lastSyncedAt),
    )
    return localTs > remoteTs
}

// Helper for syncing collection
const syncCollection = (
    collectionName: string,
    localTable: any,
    eventName: string
) => {
    const q = query(collection(firestore, collectionName));
    return onSnapshot(q, (snapshot) => {
        void (async () => {
            let hasChanges = false;
            for (const change of snapshot.docChanges()) {
                const data = change.doc.data();
                const localId = change.doc.id;

                if (isDeleting(localId)) {
                    continue;
                }

                try {
                    if (change.type === "added" || change.type === "modified") {
                        const record = { ...data, id: localId } as Product & { lastSyncedAt?: unknown };
                        if (collectionName === COLLECTIONS.PRODUCTS) {
                            const existing = (await localTable.get(localId)) as Product | undefined;
                            if (shouldSkipStaleRemoteProduct(existing, record)) {
                                console.debug(
                                    `[Sync] Skipped stale remote product overwrite: ${localId} (local newer than cloud snapshot)`,
                                )
                                continue;
                            }
                        }
                        hasChanges = true;
                        await localTable.put(record);
                        updateStoreCache(collectionName, record);

                        if (collectionName === "granularPermissions") {
                            notifyGranularUpdate(localId);
                        }
                    }
                    if (change.type === "removed") {
                        hasChanges = true;
                        await localTable.delete(localId);
                        removeFromStoreCache(collectionName, localId);
                    }
                } catch (e) {
                    console.error(`Sync Error ${collectionName}:`, e);
                }
            }

            if (hasChanges) {
                if (eventName) notify(eventName as any);
                notify("change");
            }
        })();
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

    // Periodically process queue is wasteful for CPU (App Engine time) if empty
    // Only process on startup and then on user action
    /*
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            processSyncQueue().catch(console.error);
        }, 60000);
    }
    */

    try {
        // --- 1. Real-time Collections (Absolute necessity) ---
        unsubscribers.push(syncCollection(COLLECTIONS.PRODUCTS, localDb.products, "products_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.TRANSACTIONS, localDb.transactions, "transactions_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.ISSUES, localDb.issues, "issues_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.RETURNS, localDb.returns, "returns_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_REQUESTS, localDb.branchRequests, "branch_requests_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_INVOICES, localDb.branchInvoices, "branch_invoices_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.EMPLOYEES, localDb.employees, "employees_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.OVERTIME_REASONS, localDb.overtimeReasons, "overtime_reasons_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.OVERTIME_ENTRIES, localDb.overtimeEntries, "overtime_entries_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.ABSENCE_RECORDS, localDb.absenceRecords as any, "absence_records_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.LABEL_TEMPLATES, localDb.labelTemplates as any, "label_templates_change"));
        unsubscribers.push(syncCollection(COLLECTIONS.WAREHOUSE_LOCATIONS, localDb.warehouseLocations as any, "warehouse_locations_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.WAREHOUSE_DESIGN, localDb.warehouseDesignElements as any, "warehouse_design_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.GRANULAR_PERMISSIONS, localDb.userPreferences as any, "granular_permissions_updated"));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_NOTES, localDb.branchNotes, "branch_notes_change" as any));
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_INVENTORY_REPORTS, localDb.branchInventoryReports, "branch_inventory_reports_change" as any));

        // --- 2. Fetch-once Collections (Optimization: only on startup) ---
        // These don't change often enough to warrant a constant background CPU connection
        async function fetchStaticData() {
            try {
                const fetchTable = async (collName: string, localTable: any, event: string) => {
                    const q = query(collection(firestore, collName));
                    const snapshot = await getDocs(q);
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
                    if (items.length > 0) {
                        await localTable.bulkPut(items);
                        // Update cache for each item (limited to start)
                        items.forEach(it => updateStoreCache(collName, it));
                        if (event) notify(event as any);
                    }
                };
                await Promise.all([
                    fetchTable(COLLECTIONS.CATEGORIES, localDb.categories, "categories_change"),
                    fetchTable(COLLECTIONS.BRANCHES, localDb.branches, "branches_change"),
                    fetchTable(COLLECTIONS.UNITS, localDb.units, "change"),
                    fetchTable(COLLECTIONS.LOCATIONS, localDb.locations, "change"),
                    fetchTable(COLLECTIONS.ADJUSTMENTS, localDb.inventoryAdjustments, "change"),
                ]);
            } catch (err) {
                console.error("Failed to fetch static collections:", err);
            }
        }
        fetchStaticData();

        // ⚠️ CRITICAL OPTIMIZATION: Removed real-time sync for COLLECTIONS.PRODUCT_IMAGES.
        // This collection can be huge and syncing thousands of images docs is extremely expensive for CPU/Time.
        // Images are already handled lazily when products load.

        // Branch Inventory System Sync - Keep critical ones real-time
        unsubscribers.push(syncCollection(COLLECTIONS.BRANCH_INVENTORY, localDb.branchInventory, "change"));
        unsubscribers.push(syncCollection(COLLECTIONS.CONSUMPTION_RECORDS, localDb.consumptionRecords, "change"));
        unsubscribers.push(syncCollection(COLLECTIONS.ASSET_REQUESTS, localDb.assetRequests, "change"));

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


let isQuotaExceeded = false;

const checkQuota = () => {
    if (isQuotaExceeded) {
        throw new Error("FIREBASE_QUOTA_EXCEEDED_SKIP");
    }
}

// 2. Push Local Changes (Local -> Cloud)
export const syncProductToCloud = async (product: Product) => {
    if (!product.id) return false;
    try {
        checkQuota();
        const ref = doc(firestore, COLLECTIONS.PRODUCTS, product.id);
        const cleanData = JSON.parse(JSON.stringify(product));

        // Prevent overwriting the valid Storage URL with local placeholder
        if (cleanData.image === 'DB_IMAGE') {
            delete cleanData.image;
        }

        await withRetry(async () => {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Sync Timeout")), 30000));
            await Promise.race([
                setDoc(ref, { ...cleanData, lastSyncedAt: Timestamp.now() }, { merge: true }),
                timeout
            ]);
        });

        console.log("☁️ Pushed product to cloud:", product.productName);
        return true;
    } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            console.warn("🚨 Quota Exceeded detected. Switching to offline mode.");
            isQuotaExceeded = true;
        }
        if (e.message !== "FIREBASE_QUOTA_EXCEEDED_SKIP") {
            const code = e?.code || 'unknown';
            console.warn(`[Sync] Push failed for product ${product.productName} (${code}), queueing for offline sync.`, e);
        } else {
            console.log(`[Sync] Skipped push for ${product.productName} (Quota Exceeded Mode)`);
        }
        await enqueue(COLLECTIONS.PRODUCTS, 'upsert', product);
        return false;
    }
};

export const syncProductImageToCloud = async (productId: string, data: string) => {
    if (!productId || !data) return false;
    try {
        checkQuota();

        // 1. Upload to Firebase Storage
        const storageRef = ref(storage, `product-images/${productId}`);
        await uploadString(storageRef, data, 'data_url');

        // 2. Get Download URL
        const downloadURL = await getDownloadURL(storageRef);
        console.log("☁️ Uploaded image to Storage:", downloadURL);

        // 3. Update Product Document with URL
        const productRef = doc(firestore, COLLECTIONS.PRODUCTS, productId);
        await setDoc(productRef, { image: downloadURL, lastSyncedAt: Timestamp.now() }, { merge: true });

        return true;
    } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            console.warn("🚨 Quota Exceeded detected. Switching to offline mode.");
            isQuotaExceeded = true;
        }
        if (e.message !== "FIREBASE_QUOTA_EXCEEDED_SKIP") {
            console.warn(`[Sync] Push failed for image ${productId}, queueing.`, e);
        }
        // Fallback: Queue for retry (might need better handling for persistent failures)
        await enqueue(COLLECTIONS.PRODUCT_IMAGES, 'upsert', { productId, data });
        return false;
    }
};

export const deleteProductImageFromCloud = async (productId: string) => {
    if (!productId) return false;
    try {
        checkQuota();
        const ref = doc(firestore, COLLECTIONS.PRODUCT_IMAGES, productId);
        await deleteDoc(ref);
        console.log("☁️ Deleted product image from cloud:", productId);
        return true;
    } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            isQuotaExceeded = true;
        }
        console.warn(`[Sync] Delete failed for image ${productId}, queueing.`, e);
        await enqueue(COLLECTIONS.PRODUCT_IMAGES, 'delete', { id: productId });
        return false;
    }
};

export const deleteProductFromCloud = async (id: string) => {
    try {
        checkQuota();
        await deleteDoc(doc(firestore, COLLECTIONS.PRODUCTS, id));
        console.log("☁️ Deleted product from cloud:", id);
    } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            isQuotaExceeded = true;
        }
        console.warn(`[Sync] Delete failed for product ${id}, queueing.`, e);
        await enqueue(COLLECTIONS.PRODUCTS, 'delete', { id });
    }
}

// 5. Generic Sync & Aliases
export const syncRecord = async (collectionName: string, record: any) => {
    if (!record.id) return false;
    try {
        checkQuota();
        const cleanData = JSON.parse(JSON.stringify(record));
        await withRetry(() => setDoc(doc(firestore, collectionName, record.id), { ...cleanData, lastSyncedAt: Timestamp.now() }, { merge: true }));
        return true;
    } catch (e: any) {
        if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            console.warn("🚨 Quota Exceeded detected. Switching to offline mode.");
            isQuotaExceeded = true;
        }
        if (e.message !== "FIREBASE_QUOTA_EXCEEDED_SKIP") {
            console.warn(`[Sync] Push failed for ${collectionName}, queueing.`, e);
        }
        await enqueue(collectionName, 'upsert', record);
        return false;
    }
}

export const deleteRecord = async (collectionName: string, id: string) => {
    try {
        await withRetry(() => deleteDoc(doc(firestore, collectionName, id)));
        console.log(`☁️ Deleted ${collectionName}:`, id);
        return true;
    } catch (e) {
        console.warn(`[Sync] Delete failed for ${collectionName} ${id}, queueing.`, e);
        await enqueue(collectionName, 'delete', { id });
        return false;
    }
}

export const syncAuditLog = async (log: any) => {
    if (!log.id) return false;
    try {
        await setDoc(doc(firestore, COLLECTIONS.AUDIT_LOGS, log.id), { ...log, lastSyncedAt: Timestamp.now() }, { merge: true });
        return true;
    } catch (e) {
        console.warn(`[Sync] Push failed for audit log ${log.id}, queueing.`, e);
        await enqueue(COLLECTIONS.AUDIT_LOGS, 'upsert', log);
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
export const syncBranchNote = (r: any) => syncRecord(COLLECTIONS.BRANCH_NOTES, r);
export const deleteBranchNoteApi = (id: string) => deleteRecord(COLLECTIONS.BRANCH_NOTES, id);

export const syncWarehouseDesignElement = (r: WarehouseDesignElement) => syncRecord(COLLECTIONS.WAREHOUSE_DESIGN, r);
export const deleteWarehouseDesignElementApi = (id: string) => deleteRecord(COLLECTIONS.WAREHOUSE_DESIGN, id);

export const syncWarehouseLocation = (r: any) => syncRecord(COLLECTIONS.WAREHOUSE_LOCATIONS, r);
export const deleteWarehouseLocationApi = (id: string) => deleteRecord(COLLECTIONS.WAREHOUSE_LOCATIONS, id);

// Branch Inventory System Sync Functions
export const syncBranchInventory = (r: any) => syncRecord(COLLECTIONS.BRANCH_INVENTORY, r);
export const syncConsumptionRecord = (r: any) => syncRecord(COLLECTIONS.CONSUMPTION_RECORDS, r);
export const syncBranchAsset = (r: any) => syncRecord(COLLECTIONS.BRANCH_ASSETS, r);
export const syncMaintenanceReport = (r: any) => syncRecord(COLLECTIONS.MAINTENANCE_REPORTS, r);
export const syncAssetRequest = (r: any) => syncRecord(COLLECTIONS.ASSET_REQUESTS, r);
export const syncAssetStatusReport = (r: any) => syncRecord(COLLECTIONS.ASSET_STATUS_REPORTS, r);
export const deleteBranchAsset = (id: string) => deleteRecord(COLLECTIONS.BRANCH_ASSETS, id);
export const deleteAssetRequest = (id: string) => deleteRecord(COLLECTIONS.ASSET_REQUESTS, id);
export const syncBranchInventoryReport = (r: any) => syncRecord(COLLECTIONS.BRANCH_INVENTORY_REPORTS, r);
export const syncLabelTemplate = (r: any) => syncRecord(COLLECTIONS.LABEL_TEMPLATES, r);
export const deleteLabelTemplateApi = (id: string) => deleteRecord(COLLECTIONS.LABEL_TEMPLATES, id);

export const pullAllDataFromFirebase = async () => {
    await syncAllCloudToLocal(() => { });
}

export const syncProductsBatch = async (products: Product[]) => {
    if (!products.length) return
    checkQuota()
    console.log(`☁️ Batch Syncing ${products.length} products...`)

    const BATCH_SIZE = 50 // Further reduced from 100 to 50 to prevent timeouts
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        checkQuota()
        const chunk = products.slice(i, i + BATCH_SIZE)
        // Note: writeBatch must be created fresh for each commit
        // We cannot reuse the same batch object for retries if it was partially applied (which shouldn't happen with atomic batch)
        // But we DO need to rebuild the batch if we want to retry properly or just re-call commit? 
        // Firestore batch.commit() can be retried.

        let attempts = 0
        let committed = false

        while (attempts < 3 && !committed) {
            try {
                // Rebuild batch ensuring clean state
                const batch = writeBatch(firestore)
                chunk.forEach(p => {
                    if (!p.id) return
                    const ref = doc(firestore, COLLECTIONS.PRODUCTS, p.id)
                    const clean = JSON.parse(JSON.stringify(p))

                    // IF we are doing a FULL OVERWRITE (no merge), we must protect the image field
                    // if the local one is just a placeholder, otherwise we lose the cloud URL.
                    if (clean.image === 'DB_IMAGE') {
                        delete clean.image;
                        // If we delete it and use merge:false, we LOSE it.
                        // So for safety with images, we still need merge:true BUT we will 
                        // explicitly set movement fields to 0 in bulk-operations.tsx (already done).
                        // Let's use merge:true but make sure ALL fields are present.
                    }

                    batch.set(ref, { ...clean, lastSyncedAt: Timestamp.now() }, { merge: true })
                })

                await batch.commit()
                console.log(`☁️ Committed products batch ${i} - ${i + chunk.length}`)
                committed = true
                await new Promise(r => setTimeout(r, 2000))
            } catch (e: any) {
                attempts++
                console.error(`Product Batch commit failed (attempt ${attempts}):`, e)

                if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
                    console.error("🚨 FIREBASE QUOTA EXCEEDED (Daily limit or Storage full). Stopping sync.")
                    isQuotaExceeded = true
                    throw new Error("FIREBASE_QUOTA_EXCEEDED")
                }

                if (e?.code === 'deadline-exceeded' || e?.code === 'unavailable') {
                    console.warn(`⚠️ Network Timeout/Unavailable (attempt ${attempts}). Retrying with backoff...`)
                }

                if (attempts >= 3) {
                    console.error("Giving up on product batch after 3 attempts.")
                    // Don't throw to allow other batches to proceed, but log error
                } else {
                    const backoff = 2000 * Math.pow(2, attempts - 1) // 2s, 4s, 8s
                    await new Promise(r => setTimeout(r, backoff))
                }
            }
        }
    }
}

export const syncProductImagesBatch = async (images: { productId: string, data: string }[]) => {
    if (!images.length) return
    checkQuota()
    console.log(`☁️ Batch Syncing ${images.length} images to STORAGE...`)

    const BATCH_SIZE = 5 // Keep small for parallel uploads
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
        checkQuota()
        const chunk = images.slice(i, i + BATCH_SIZE)

        let attempts = 0
        let committed = false

        while (attempts < 3 && !committed) {
            try {
                // 1. Upload images to Storage in parallel
                const uploadPromises = chunk.map(async (img) => {
                    if (!img.productId || !img.data) return null;
                    try {
                        const storageRef = ref(storage, `product-images/${img.productId}`);
                        await uploadString(storageRef, img.data, 'data_url');
                        const url = await getDownloadURL(storageRef);
                        return { productId: img.productId, url };
                    } catch (err) {
                        console.error(`Failed to upload image for ${img.productId}`, err);
                        return null;
                    }
                });

                const uploadedImages = await Promise.all(uploadPromises);

                // 2. Update Products in Firestore with the new URLs
                const batch = writeBatch(firestore);
                let updatesCount = 0;

                uploadedImages.forEach(item => {
                    if (item && item.url) {
                        const productRef = doc(firestore, COLLECTIONS.PRODUCTS, item.productId);
                        batch.set(productRef, { image: item.url, lastSyncedAt: Timestamp.now() }, { merge: true });
                        updatesCount++;
                    }
                });

                if (updatesCount > 0) {
                    await batch.commit();
                    console.log(`☁️ Synced ${updatesCount} image URLs to Firestore products (Batch ${i})`);
                }

                committed = true
                await new Promise(r => setTimeout(r, 2000))
            } catch (e: any) {
                attempts++
                console.error(`Image Batch commit failed (attempt ${attempts}):`, e)

                if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
                    console.error("🚨 FIREBASE QUOTA EXCEEDED (Daily limit or Storage full). Stopping sync.")
                    isQuotaExceeded = true
                    throw new Error("FIREBASE_QUOTA_EXCEEDED")
                }

                if (e?.code === 'deadline-exceeded' || e?.code === 'unavailable') {
                    console.warn(`⚠️ Network Timeout/Unavailable (attempt ${attempts}). Retrying with backoff...`)
                }

                if (attempts >= 3) {
                    console.error("Giving up on image batch after 3 attempts.")
                } else {
                    const backoff = 2000 * Math.pow(2, attempts - 1) // 2s, 4s, 8s
                    await new Promise(r => setTimeout(r, backoff))
                }
            }
        }
    }
}

export async function syncReceivingNote(note: any) {
    if (!firestore) return;
    try {
        await setDoc(doc(firestore, "receiving_notes", note.id), {
            ...note,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("ReceivingNote Sync Error:", e);
        throw e;
    }
}

export const syncSupplier = (r: any) => syncRecord(COLLECTIONS.SUPPLIERS, r);
export const deleteSupplierApi = (id: string) => deleteRecord(COLLECTIONS.SUPPLIERS, id);


export async function deleteAllReceivingNotesApi(ids: string[]) {
    if (!firestore) return;
    try {
        const batch = writeBatch(firestore);
        ids.forEach(id => {
            batch.delete(doc(firestore, "receiving_notes", id));
        });
        await batch.commit();
    } catch (e) {
        console.error("ReceivingNotes Batch Delete Error:", e);
        throw e;
    }
}

// HR Sync Aliases
export const syncEmployee = (r: any) => syncRecord(COLLECTIONS.EMPLOYEES, r);
export const deleteEmployeeApi = (id: string) => deleteRecord(COLLECTIONS.EMPLOYEES, id);
export const syncOvertimeReason = (r: any) => syncRecord(COLLECTIONS.OVERTIME_REASONS, r);
export const deleteOvertimeReasonApi = (id: string) => deleteRecord(COLLECTIONS.OVERTIME_REASONS, id);
export const syncOvertimeEntry = (r: any) => syncRecord(COLLECTIONS.OVERTIME_ENTRIES, r);
export const deleteOvertimeEntryApi = (id: string) => deleteRecord(COLLECTIONS.OVERTIME_ENTRIES, id);
export const syncAbsenceRecord = (r: any) => syncRecord(COLLECTIONS.ABSENCE_RECORDS, r);
export const deleteAbsenceRecordApi = (id: string) => deleteRecord(COLLECTIONS.ABSENCE_RECORDS, id);
