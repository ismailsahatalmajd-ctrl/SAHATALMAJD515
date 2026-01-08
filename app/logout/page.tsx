"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { auth } from "@/lib/firebase"

export default function LogoutPage() {
    const router = useRouter()
    const { logout } = useAuth()

    useEffect(() => {
        const performLogout = async () => {
            try {
                // 1. Force clear storage directly (ignoring context for a moment)
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('sahat_user')
                    localStorage.clear() // Aggressive clear to be safe
                }

                // 2. Call context logout
                await logout().catch(console.error)

                // 3. Force Hard Redirect to Login
                window.location.href = "/login?logged_out=true"
            } catch (e) {
                console.error("Logout failed", e)
                window.location.href = "/login?error=logout_failed"
            }
        }

        performLogout()
    }, [])

    return (
        <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">جاري تسجيل الخروج...</p>
        </div>
    )
}
