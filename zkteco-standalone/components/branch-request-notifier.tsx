"use client"

import { useEffect, useRef } from "react"
import { db } from "@/lib/db"
import type { BranchRequest } from "@/lib/branch-request-types"

const NOTIFIER_STATE_KEY = "branch_req_notifier_state"

type SeenState = {
  byIdStatus: Record<string, string>
}

// Return dual text string
function getBilingualType(t: BranchRequest["type"]) {
  if (t === "return") return "مرتجع (Return)"
  return "صرف (Issue)"
}

function getBilingualStatus(s: BranchRequest["status"]) {
  if (s === "approved") return "قبول (Approved)"
  if (s === "cancelled") return "رفض (Rejected)"
  if (s === "submitted") return "مرسل (Submitted)"
  return "مسودة (Draft)"
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
      read: 0
    })
  } catch (e) {
    console.error("Failed to push notification", e)
  }
}

export default function BranchRequestNotifier() {
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const tick = async () => {
      try {
        const requests = await db.branchRequests.toArray()

        let state: SeenState = { byIdStatus: {} }
        const stateRecord = await db.settings.get(NOTIFIER_STATE_KEY)
        if (stateRecord?.value) {
          state = stateRecord.value
        } else {
          const raw = localStorage.getItem(NOTIFIER_STATE_KEY)
          if (raw) {
            state = JSON.parse(raw)
            await db.settings.put({ key: NOTIFIER_STATE_KEY, value: state })
            localStorage.removeItem(NOTIFIER_STATE_KEY)
          }
        }

        const known = state.byIdStatus
        let changed = false

        // New Requests notifications (Bilingual)
        for (const r of requests) {
          if (!(r.id in known)) {
            const t = getBilingualType(r.type)
            const rn = r.requestNumber || r.id
            await pushNotification(
              "info",
              `طلب فرع جديد - ${t} (New Branch Request)`,
              `الطلب ${rn} من ${r.branchName} (Order ${rn} from ${r.branchName})`
            )
            known[r.id] = r.status
            changed = true
          }
        }

        // Status Change notifications (Bilingual)
        for (const r of requests) {
          const prev = known[r.id]
          if (prev && prev !== r.status) {
            const type = r.status === "approved" ? "success" : r.status === "cancelled" ? "error" : "warning"
            const t = getBilingualType(r.type)
            const rn = r.requestNumber || r.id
            const st = getBilingualStatus(r.status)
            await pushNotification(
              type,
              `تغيير حالة طلب - ${t} (Order Status Change)`,
              `الطلب ${rn}: ${st} (Order ${rn}: ${st})`
            )
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
