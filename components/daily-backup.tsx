"use client"

import { useEffect } from "react"
import { db } from "@/lib/db"

type BackupSettings = {
  dailyBackupEnabled?: boolean
  backupTime?: string // HH:MM
  backupRetentionDays?: number
}

const LAST_RUN_KEY = "inventory_backups_last_run"

// Helper to push notification to Dexie
async function pushNotification(type: "warning" | "info" | "success" | "error", title: string, message: string) {
  try {
    await db.notifications.add({
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      type,
      title,
      message,
      date: new Date().toISOString(),
      read: 0
    })
  } catch (e) {
    console.error("Failed to push notification", e)
  }
}

async function getSettings(): Promise<BackupSettings> {
  try {
    const record = await db.settings.get("app_settings")
    return record?.value || {}
  } catch {
    return {}
  }
}

async function createSnapshot() {
  try {
    const tables = [
      'products', 'categories', 'branches', 'transactions', 'issues', 'returns', 
      'units', 'locations', 'issueDrafts', 'purchaseOrders', 'verificationLogs',
      'inventoryAdjustments', 'branchInvoices', 'branchRequests', 'purchaseRequests'
    ]
    
    const backupData = {
       version: "2.0",
       timestamp: new Date().toISOString(),
       tables: {} as Record<string, any>,
       settings: {} as Record<string, any>
    }

    for (const t of tables) {
       // @ts-ignore
       const table = db[t]
       if (table) {
           backupData.tables[t] = await table.toArray()
       }
    }
    
    // Settings
    const settings = await db.settings.toArray()
    for (const s of settings) {
        backupData.settings[s.key] = s.value
    }

    // Save to Dexie backups table
    await db.backups.add({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      version: "2.0",
      data: backupData
    })
    
    await db.settings.put({ key: LAST_RUN_KEY, value: new Date().toISOString() })

    // إشعار النجاح
    await pushNotification("success", "نسخ احتياطي يومي", "تم إنشاء نسخة احتياطية تلقائية")
  } catch (e) {
    console.error(e)
    await pushNotification("error", "فشل النسخ الاحتياطي", "حدث خطأ أثناء إنشاء النسخة الاحتياطية")
  }
}

async function pruneOldBackups(retentionDays: number | undefined) {
  if (!retentionDays || retentionDays <= 0) return
  try {
      const allBackups = await db.backups.toArray()
      const now = Date.now()
      const toDelete: string[] = []
      
      for (const b of allBackups) {
          const ts = Date.parse(b.timestamp)
          if (now - ts > retentionDays * 24 * 60 * 60 * 1000) {
              toDelete.push(b.id)
          }
      }
      
      if (toDelete.length > 0) {
          await db.backups.bulkDelete(toDelete)
      }
  } catch {}
}

export default function DailyBackupHook() {
  useEffect(() => {
    // Client-side only check to prevent SSR errors
    if (typeof window === "undefined") return

    const run = async () => {
        try {
            const settings = await getSettings()
            if (!settings.dailyBackupEnabled) return

            const desiredTime = settings.backupTime || "02:00"
            const now = new Date()
            const hh = String(now.getHours()).padStart(2, "0")
            const mm = String(now.getMinutes()).padStart(2, "0")
            const current = `${hh}:${mm}`
            
            const lastRunRecord = await db.settings.get(LAST_RUN_KEY)
            const lastRun = lastRunRecord?.value
            
            const lastRunDate = lastRun ? new Date(lastRun) : null
            const lastRunDayKey = lastRunDate ? lastRunDate.toDateString() : ""
            const todayKey = now.toDateString()

            if (current === desiredTime && lastRunDayKey !== todayKey) {
                await createSnapshot()
                await pruneOldBackups(settings.backupRetentionDays)
            }
        } catch (e) {
            console.error("Daily backup check failed", e)
        }
    }

    const timer = setInterval(run, 30 * 1000) // Check every 30 seconds
    return () => clearInterval(timer)
  }, [])

  return null
}
