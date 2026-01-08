"use client"

import { useEffect } from "react"
import { syncAllFromServer } from "@/lib/storage"
import { processSyncQueue } from "@/lib/sync-api"
import { useAuth } from "@/components/auth-provider"

export function SyncManager() {
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      console.log("User logged in, triggering cloud sync...")
      syncAllFromServer()
      processSyncQueue().catch(() => {})
      const id = setInterval(() => { processSyncQueue().catch(() => {}) }, 8000)
      return () => clearInterval(id)
    }
  }, [user])

  return null // Render nothing
}
