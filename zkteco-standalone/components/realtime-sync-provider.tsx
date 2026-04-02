
"use client"

import { useRealtimeSync } from "@/hooks/use-realtime-sync"

export function RealtimeSyncProvider() {
  useRealtimeSync()
  return null
}
