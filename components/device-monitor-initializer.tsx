"use client"

import { useEffect } from "react"
import { initDeviceMonitor } from "@/lib/device-monitor"

export function DeviceMonitorInitializer({
    children,
}: {
    children: React.ReactNode
}) {
    useEffect(() => {
        initDeviceMonitor()
    }, [])

    return <>{children}</>
}
