"use client"

import { useEffect } from "react"
import { syncAllFromServer } from "@/lib/storage"
import { processSyncQueue } from "@/lib/sync-api"
import { useAuth } from "@/components/auth-provider"

export function SyncManager() {
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      syncAllFromServer()
      processSyncQueue().catch(() => {})
      const handleOnline = () => { processSyncQueue().catch(() => {}) }
      window.addEventListener("online", handleOnline)
      return () => window.removeEventListener("online", handleOnline)
    }
  }, [user])

  return null // Render nothing
}
