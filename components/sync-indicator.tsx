"use client"

import { useEffect, useState } from "react"
import { Wifi, WifiOff, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "./language-provider"
import { cn } from "@/lib/utils"

export function SyncIndicator() {
    const { t } = useI18n()
    const [isOnline, setIsOnline] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)

        // Check initial status
        setIsOnline(navigator.onLine)

        return () => {
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
        }
    }, [])

    // Listen for sync events (you can emit custom events from firebase-sync-engine)
    useEffect(() => {
        const handleSyncStart = () => setIsSyncing(true)
        const handleSyncEnd = () => setIsSyncing(false)

        window.addEventListener("syncstart", handleSyncStart)
        window.addEventListener("syncend", handleSyncEnd)

        return () => {
            window.removeEventListener("syncstart", handleSyncStart)
            window.removeEventListener("syncend", handleSyncEnd)
        }
    }, [])

    if (!isOnline) {
        return (
            <Badge variant="destructive" className="gap-1.5 text-xs">
                <WifiOff className="h-3 w-3" />
                <span>{t("sync.offline")}</span>
            </Badge>
        )
    }

    if (isSyncing) {
        return (
            <Badge variant="outline" className="gap-1.5 text-xs border-yellow-500 text-yellow-700">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>{t("sync.syncing")}</span>
            </Badge>
        )
    }

    return (
        <Badge variant="outline" className="gap-1.5 text-xs border-green-500 text-green-700">
            <Wifi className="h-3 w-3" />
            <span>{t("sync.live")}</span>
        </Badge>
    )
}
