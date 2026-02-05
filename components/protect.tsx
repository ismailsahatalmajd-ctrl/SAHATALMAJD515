"use client"

import { ReactNode } from "react"
import { usePermission } from "@/lib/hooks/use-permission"
import { Permissions } from "@/lib/types"

interface ProtectProps {
    children: ReactNode
    permission: keyof Permissions
    fallback?: ReactNode
}

export function Protect({ children, permission, fallback = null }: ProtectProps) {
    const { can } = usePermission()

    if (!can(permission)) {
        return <>{fallback}</>
    }

    return <>{children}</>
}
