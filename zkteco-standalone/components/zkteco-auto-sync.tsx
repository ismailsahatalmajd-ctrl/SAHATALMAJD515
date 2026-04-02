"use client"

import { useEffect, useRef, useCallback } from "react"
import { db } from "@/lib/db"
import { syncAbsenceRecord } from "@/lib/firebase-sync-engine"
import { format } from "date-fns"
import { useToast } from "@/components/ui/use-toast"
import { getDeviceId } from "@/lib/device"

/**
 * ZKTecoAutoSync Component
 * Runs in the background to periodically sync attendance logs from the ZKTeco device.
 */
export function ZKTecoAutoSync() {
  const { toast } = useToast()
  const lastSyncTimeRef = useRef<number>(0)
  const isSyncingRef = useRef<boolean>(false)

  const performAutoSync = useCallback(async () => {
    if (isSyncingRef.current) return
    
    // Only run every 5 minutes (300,000 ms)
    const now = Date.now()
    if (now - lastSyncTimeRef.current < 300000) return
    
    // Check if we are in Electron
    const isElectron = typeof window !== 'undefined' && (window as any).electron?.zkSync
    if (!isElectron) return

    isSyncingRef.current = true
    console.log("[ZKTecoAutoSync] Starting background sync...")

    try {
      // 1. Get settings from DB
      const ipSetting = await db.settings.get("zk_ip")
      const portSetting = await db.settings.get("zk_port")
      
      const ip = ipSetting?.value || "192.168.8.200"
      const port = Number(portSetting?.value || "4370")

      // 2. Fetch logs from device via Electron bridge
      const response = await (window as any).electron.zkSync({ ip, port })
      
      if (response.success) {
        const fetchedLogs = response.data.attendances || []
        const fetchedUsers = response.data.users || []
        
        if (fetchedLogs.length === 0) {
          console.log("[ZKTecoAutoSync] No logs found on device.")
          lastSyncTimeRef.current = Date.now()
          isSyncingRef.current = false
          return
        }

        // 3. Get all employees to match IDs
        const employees = await db.employees.toArray()
        
        let savedCount = 0
        for (const log of fetchedLogs) {
          const employee = employees.find(e => e.fingerprintId === String(log.deviceUserId))
          
          if (employee) {
            const logDate = new Date(log.recordTime)
            const recordTimeStr = format(logDate, "yyyy-MM-dd HH:mm:ss")
            
            // Check if record already exists to avoid duplicates
            const existing = await db.absenceRecords
              .where({ employeeId: employee.id, recordTime: recordTimeStr })
              .first()

            if (!existing) {
              const newRecord = {
                employeeId: employee.id,
                employeeName: employee.name,
                date: format(logDate, "yyyy-MM-dd"),
                type: "attendance" as const, 
                category: "fingerprint", 
                notes: `مزامنة تلقائية من جهاز: ${ip}`,
                recordTime: recordTimeStr,
                status: 'pending' as const,
                createdAt: new Date().toISOString(),
                branchId: (window as any).localStorage.getItem('branchId') || undefined
              }

              // Local Save
              await db.absenceRecords.add(newRecord as any)
              
              // Cloud Sync
              await syncAbsenceRecord(newRecord as any).catch(err => {
                console.error("[ZKTecoAutoSync] Firebase sync failed for record:", err)
              })
              
              savedCount++
            }
          }
        }

        if (savedCount > 0) {
          console.log(`[ZKTecoAutoSync] Auto-synced ${savedCount} new records.`)
          toast({
            title: "تحديث تلقائي للبصمة",
            description: `تم سحب ${savedCount} حركات حضور جديدة تلقائياً.`,
          })
        }
        
        lastSyncTimeRef.current = Date.now()
      } else {
        console.warn("[ZKTecoAutoSync] Device sync failed:", response.error)
      }
    } catch (error) {
      console.error("[ZKTecoAutoSync] Critical error during auto-sync:", error)
    } finally {
      isSyncingRef.current = false
    }
  }, [toast])

  useEffect(() => {
    // Initial sync after 10 seconds
    const initialTimer = setTimeout(performAutoSync, 10000)
    
    // Regular interval every 5 minutes
    const interval = setInterval(performAutoSync, 300000)
    
    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [performAutoSync])

  return null // This is a logic-only component
}
