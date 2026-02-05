import { db } from "./db"
import { db as firestore } from "./firebase"
import { doc, setDoc, onSnapshot, updateDoc } from "firebase/firestore"
import { getDeviceId, getDeviceInfo } from "./device"
import { store } from "./data-store"
import { reloadFromDb, syncAllFromServer } from "./storage"

const DEVICE_COLLECTION = "devices"

export const initDeviceMonitor = () => {
    if (typeof window === 'undefined') return

    const deviceId = getDeviceId()
    const info = getDeviceInfo()
    const docRef = doc(firestore, DEVICE_COLLECTION, deviceId)

    // 1. Register / Update Heartbeat
    const updateHeartbeat = async () => {
        try {
            const stats = {
                productsCount: await db.products.count(),
                transactionsCount: await db.transactions.count(),
                lastSyncTimestamp: new Date().toISOString()
            }

            let username = "Unknown"
            let role = "Unknown"

            if (typeof window !== 'undefined') {
                try {
                    const userStr = localStorage.getItem('user')
                    if (userStr) {
                        const u = JSON.parse(userStr)
                        username = u.username || u.name || "Unknown"
                        role = u.role || "Unknown"
                    }
                } catch (e) { }
            }

            const payload = {
                deviceId,
                userAgent: info?.userAgent || 'Unknown',
                lastActive: new Date().toISOString(),
                syncStatus: stats,
                appVersion: '1.0.0',
                username,
                role
            }

            await setDoc(docRef, payload, { merge: true })
        } catch (e) {
            console.error("[DeviceMonitor] Heartbeat failed", e)
        }
    }

    // Initial update
    updateHeartbeat()

    // Interval update (every 60s)
    setInterval(updateHeartbeat, 60000)

    // 2. Listen for Commands
    onSnapshot(docRef, async (snap) => {
        const data = snap.data()
        if (!data || !data.command || data.command === 'none') return

        console.log(`[DeviceMonitor] Received command: ${data.command}`)

        if (data.command === 'force_resync') {
            await handleForceResync(docRef)
        } else if (data.command === 'wipe_and_logout') {
            await handleWipeAndLogout(docRef)
        }
    })
}

async function handleForceResync(docRef: any) {
    console.log("[DeviceMonitor] Executing Force Resync...")
    try {
        await updateDoc(docRef, {
            command: 'none',
            commandStatus: { type: 'pending', message: 'Starting update...', timestamp: new Date().toISOString() }
        })

        // Clear local data
        await db.products.clear()
        await db.transactions.clear()
        await db.branches.clear()

        // Trigger pull
        await syncAllFromServer()

        await updateDoc(docRef, {
            commandStatus: { type: 'success', message: 'Updated successfully', timestamp: new Date().toISOString() }
        })

        alert("تم تحديث البيانات من السيرفر بنجاح.")
        window.location.reload()
    } catch (e) {
        console.error("Force Resync Failed", e)
        await updateDoc(docRef, {
            command: 'none',
            commandStatus: { type: 'error', message: 'Update failed', timestamp: new Date().toISOString() }
        })
        alert("فشل تحديث البيانات. حاول مرة أخرى.")
    }
}

async function handleWipeAndLogout(docRef: any) {
    console.log("[DeviceMonitor] Executing Wipe & Logout...")
    try {
        await updateDoc(docRef, {
            command: 'none',
            commandStatus: { type: 'success', message: 'Wiped and logged out', timestamp: new Date().toISOString() }
        })

        await db.delete() // Deletes the whole IndexedDB
        localStorage.clear()
        window.location.href = '/login'
    } catch (e) {
        console.error("Wipe Failed", e)
        await updateDoc(docRef, {
            command: 'none',
            commandStatus: { type: 'error', message: 'Wipe failed', timestamp: new Date().toISOString() }
        })
    }
}
