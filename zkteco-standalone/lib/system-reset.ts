import { db } from "@/lib/db"
import { collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore"
import { db as firebaseDb } from "@/lib/firebase"

export const performFactoryReset = async () => {
    try {
        console.log("Starting Factory Reset...")

        // 1. Wipe Local Dexie DB
        console.log("Clearing Local Database...")
        await Promise.all([
            db.products.clear(),
            db.categories.clear(),
            db.transactions.clear(),
            db.branches.clear(),
            db.units.clear(),
            db.issues.clear(),
            db.returns.clear(),
            db.locations.clear(),
            db.issueDrafts.clear(),
            db.purchaseOrders.clear(),
            db.verificationLogs.clear(),
            db.inventoryAdjustments.clear(),
            db.branchInvoices.clear(),
            db.branchRequests.clear(),
            db.purchaseRequests.clear(),
            db.settings.clear(),
            db.auditLogs.clear(),
            db.notifications.clear(),
            db.backups.clear(),
            db.imageCache.clear(),
            db.syncQueue.clear(),
            db.conflictLogs.clear(),
            db.changeLogs.clear(),
            db.productImages.clear(),
            db.branchInventory.clear(),
            db.consumptionRecords.clear(),
            db.branchAssets.clear(),
            db.maintenanceReports.clear(),
            db.assetRequests.clear(),
            db.assetStatusReports.clear(),
            db.userSessions.clear(),
            db.userPreferences.clear()
        ])

        // 2. Wipe Local Storage
        console.log("Clearing Local Storage...")
        localStorage.clear()

        // 3. Wipe Firebase (if connected)
        if (firebaseDb) {
            console.log("Clearing Cloud Database...")
            const collectionsToWipe = [
                'products', 'categories', 'transactions', 'branches',
                'units', 'issues', 'returns', 'locations',
                'purchaseOrders', 'verificationLogs', 'inventoryAdjustments',
                'branchRequests', 'auditLogs', 'notifications'
            ]

            for (const colName of collectionsToWipe) {
                try {
                    const colRef = collection(firebaseDb, colName)
                    const snapshot = await getDocs(colRef)
                    if (snapshot.empty) continue

                    const batch = writeBatch(firebaseDb)
                    let count = 0

                    for (const doc of snapshot.docs) {
                        batch.delete(doc.ref)
                        count++
                        if (count >= 400) { // Batch limit is 500
                            await batch.commit()
                            count = 0
                        }
                    }
                    if (count > 0) await batch.commit()
                    console.log(`Cleared collection: ${colName}`)
                } catch (e) {
                    console.error(`Failed to clear collection ${colName}`, e)
                }
            }
        }

        console.log("Factory Reset Complete.")
        return true
    } catch (error) {
        console.error("Factory Reset Failed:", error)
        throw error
    }
}
