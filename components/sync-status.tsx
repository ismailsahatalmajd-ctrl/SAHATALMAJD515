"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react"
import { getSettings } from "@/lib/settings-store"

export function SyncStatus() {
  const { user } = useAuth()
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting" | "missing_config">("connecting")

  useEffect(() => {
    if (!user) {
      setStatus("disconnected")
      return
    }

    // Check if configuration exists
    const settings = getSettings()
    if (!settings.supabaseUrl || !settings.supabaseKey) {
      setStatus("missing_config")
      return
    }

    // Assume connected if config exists and user is logged in
    setStatus("connected")

  }, [user])

  if (!user) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur border transition-all hover:bg-background">
      {status === "connected" && <Cloud className="h-3.5 w-3.5 text-green-500" />}

      {status === "disconnected" && <CloudOff className="h-3.5 w-3.5 text-slate-400" />}

      {status === "missing_config" && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}

      {status === "connecting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

      <span>
        {status === "connected" && "Cloud Sync Active"}
        {status === "disconnected" && "Offline Mode"}
        {status === "missing_config" && "Setup Cloud Sync"}
        {status === "connecting" && "Connecting..."}
      </span>
    </div>
  )
}
