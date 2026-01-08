"use client"

import { useEffect, useRef } from "react"
import { db } from "@/lib/db"
import type { BranchRequest } from "@/lib/branch-request-types"

const NOTIFIER_STATE_KEY = "branch_req_notifier_state"

type SeenState = {
  byIdStatus: Record<string, string>
}

function getArabicType(t: BranchRequest["type"]) {
  return t === "return" ? "مرتجع" : "صرف"
}

function getArabicStatus(s: BranchRequest["status"]) {
  if (s === "approved") return "قبول"
  if (s === "cancelled") return "رفض"
  if (s === "submitted") return "مرسل"
  return "مسودة"
}

// Helper to push notification to Dexie
async function pushNotification(type: "warning" | "info" | "success" | "error", title: string, message: string) {
  try {
    await db.notifications.add({
      id: crypto.randomUUID(),
      type,
      title,
      message,
      date: new Date().toISOString(),
      read: 0 // 0 for false, 1 for true (indexedDB doesn't index booleans well sometimes, but dexie handles it. keeping it simple)
    })
  } catch (e) {
    console.error("Failed to push notification", e)
  }
}

export default function BranchRequestNotifier() {
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    // Client-side only check to prevent SSR errors
    if (typeof window === "undefined") return

    const tick = async () => {
      try {
        // Load requests from Dexie
        const requests = await db.branchRequests.toArray()
        
        // Load state from Dexie settings
        let state: SeenState = { byIdStatus: {} }
        const stateRecord = await db.settings.get(NOTIFIER_STATE_KEY)
        if (stateRecord?.value) {
          state = stateRecord.value
        } else {
          // Migration from localStorage if needed
          const raw = localStorage.getItem(NOTIFIER_STATE_KEY)
          if (raw) {
            state = JSON.parse(raw)
            await db.settings.put({ key: NOTIFIER_STATE_KEY, value: state })
            localStorage.removeItem(NOTIFIER_STATE_KEY)
          }
        }

        const known = state.byIdStatus
        let changed = false

        // إشعارات الطلبات الجديدة
        for (const r of requests) {
          if (!(r.id in known)) {
            const t = getArabicType(r.type)
            const rn = r.requestNumber || r.id
            await pushNotification("info", `طلب فرع جديد - ${t}`, `الطلب ${rn} من ${r.branchName}`)
            known[r.id] = r.status
            changed = true
          }
        }

        // إشعارات تغييرات الحالة
        for (const r of requests) {
          const prev = known[r.id]
          if (prev && prev !== r.status) {
            const type = r.status === "approved" ? "success" : r.status === "cancelled" ? "error" : "warning"
            const t = getArabicType(r.type)
            const rn = r.requestNumber || r.id
            const st = getArabicStatus(r.status)
            await pushNotification(type, `تغيير حالة طلب - ${t}`, `الطلب ${rn}: ${st}`)
            known[r.id] = r.status
            changed = true
          }
        }

        if (changed) {
          await db.settings.put({ key: NOTIFIER_STATE_KEY, value: { byIdStatus: known } })
        }
      } catch (e) {
        console.error("Notifier tick error", e)
      }
    }

    // Initial run
    tick()

    // Poll every 5 seconds
    timerRef.current = window.setInterval(tick, 5000)
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return null
}
