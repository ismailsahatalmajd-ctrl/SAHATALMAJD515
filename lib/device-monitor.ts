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
            let branchName = ""

            if (typeof window !== 'undefined') {
                try {
                    // استخدام المفتاح الصحيح 'sahat_user' بدلاً من 'user'
                    const userStr = localStorage.getItem('sahat_user')
                    console.log('[DeviceMonitor] Reading sahat_user:', userStr ? 'Found' : 'Not found')
                    if (userStr) {
                        const u = JSON.parse(userStr)
                        role = u.role || "Unknown"
                        console.log('[DeviceMonitor] User role:', role, 'branchId:', u.branchId)

                        // إذا كان المستخدم فرعاً، استخدم اسم الفرع
                        if (role === 'branch' && u.branchId) {
                            try {
                                const branch = await db.branches.get(u.branchId)
                                if (branch) {
                                    username = branch.name || u.username || "Unknown"
                                    branchName = branch.name || ""
                                    console.log('[DeviceMonitor] Branch found:', username)
                                } else {
                                    username = u.username || u.name || "فرع"
                                }
                            } catch (e) {
                                username = u.username || u.name || "فرع"
                            }
                        } else if (role === 'admin') {
                            username = "المدير" // عرض "المدير" بدلاً من اسم المستخدم
                            console.log('[DeviceMonitor] Admin user detected')
                        } else {
                            username = u.username || u.name || u.displayName || "Unknown"
                        }
                    }
                } catch (e) {
                    console.error('[DeviceMonitor] Failed to parse user from localStorage', e)
                }
            }

            const payload = {
                deviceId,
                userAgent: info?.userAgent || 'Unknown',
                browser: info?.browser || 'Unknown',
                platform: info?.platform || 'Unknown',
                lastActive: new Date().toISOString(),
                syncStatus: stats,
                appVersion: '1.0.0',
                username,
                role,
                branchName
            }

            console.log('[DeviceMonitor] Sending heartbeat:', { username, role, deviceId })
            await setDoc(docRef, payload, { merge: true })
            console.log('[DeviceMonitor] Heartbeat sent successfully')
        } catch (e) {
            console.error("[DeviceMonitor] Heartbeat failed", e)
        }
    }

    // Initial update - تحديث فوري عند التحميل
    console.log('[DeviceMonitor] Starting initial heartbeat...')
    updateHeartbeat()

    // Interval update (every 60s)
    setInterval(updateHeartbeat, 60000)

    // تحديث فوري عند تغيير بيانات المستخدم في localStorage
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e) => {
            if (e.key === 'sahat_user') {
                console.log('[DeviceMonitor] User data changed, updating heartbeat...')
                updateHeartbeat()
            }
        })

        // تحديث عند تغيير focus للنافذة
        window.addEventListener('focus', () => {
            console.log('[DeviceMonitor] Window focused, updating heartbeat...')
            updateHeartbeat()
        })
    }

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
