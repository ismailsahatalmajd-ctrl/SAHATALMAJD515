"use client"

import { useEffect, useState } from "react"
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"
import { onSnapshot, collection, query, limit } from "firebase/firestore"

export function SyncIndicator() {
    const { lang } = useI18n()
    const [isOnline, setIsOnline] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isFirestoreConnected, setIsFirestoreConnected] = useState(false)

    useEffect(() => {
        if (typeof window === "undefined") return

        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)

        // Check initial status
        setIsOnline(navigator.onLine)

        // Monitor Firestore connection
        // We listen to a small query to check if we're getting fresh data or cached data
        const q = query(collection(db, "products"), limit(1))
        const unsubscribeFirestore = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snapshot) => {
                // fromCache is true if the data was not received from the server
                setIsFirestoreConnected(!snapshot.metadata.fromCache)
            },
            (error) => {
                console.error("Firestore connectivity monitor error:", error)
                setIsFirestoreConnected(false)
            }
        )

        return () => {
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
            unsubscribeFirestore()
        }
    }, [])

    // Listen for sync events emitted by firebase-sync-engine or other parts of the app
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
                <DualText k="sync.offline" />
            </Badge>
        )
    }

    if (isSyncing) {
        return (
            <Badge variant="outline" className="gap-1.5 text-xs border-blue-500 text-blue-700 bg-blue-50/50">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <DualText k="sync.syncing" />
            </Badge>
        )
    }

    if (!isFirestoreConnected) {
        return (
            <Badge variant="outline" className="gap-1.5 text-xs border-amber-500 text-amber-700 bg-amber-50/50">
                <CloudOff className="h-3 w-3" />
                <DualText k="sync.disconnected" />
            </Badge>
        )
    }

    return (
        <Badge variant="outline" className="gap-1.5 text-xs border-green-500 text-green-700 bg-green-50/50">
            <Cloud className="h-3 w-3" />
            <DualText k="sync.connected" />
        </Badge>
    )
}
