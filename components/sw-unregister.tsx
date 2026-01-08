"use client"

import { useEffect } from "react"

export function ServiceWorkerUnregister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const unregister = async () => {
        try {
          // Check if document is ready
          if (document.readyState !== 'complete') {
             await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
          }
          
          const registrations = await navigator.serviceWorker.getRegistrations()
          for (const registration of registrations) {
            await registration.unregister()
          }
        } catch (error: any) {
          // Ignore InvalidStateError as it often happens in restricted environments/previews
          // and doesn't affect the main app functionality if SW access is blocked.
          if (error?.name !== 'InvalidStateError') {
             console.warn("SW cleanup skipped:", error)
          }
        }
      }

      unregister()
    }
  }, [])

  return null
}
