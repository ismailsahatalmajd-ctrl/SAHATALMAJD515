
import { useAuth } from "@/components/auth-provider"
import { hasPermission, canAccessPage } from "@/lib/auth-utils"
import { Permissions } from "@/lib/types"

export function usePermission() {
    const { user } = useAuth()

    const check = (permission: keyof Permissions) => {
        return hasPermission(user, permission)
    }

    const checkPage = (path: string) => {
        return canAccessPage(user, path)
    }

    return {
        can: check,
        canAccessPage: checkPage,
        role: user?.role,
        user
    }
}
