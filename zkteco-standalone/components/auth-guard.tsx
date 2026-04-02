"use client"

import { useAuth } from "@/components/auth-provider"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()
    const router = useRouter()
    const pathname = usePathname()

    // Derived Logic - No useState needed for this
    const unauthenticated = !loading && !user
    const shouldRedirectToLogin = unauthenticated && pathname !== "/login" && pathname !== "/logout"

    const authenticated = !loading && user
    const shouldRedirectHome = authenticated && pathname === "/login"

    useEffect(() => {
        if (loading) return

        if (shouldRedirectToLogin) {
            console.log("AuthGuard: Redirecting to Login")
            router.replace("/login")
        } else if (shouldRedirectHome) {
            console.log("AuthGuard: Redirecting Home")
            if ((user as any).role === 'branch') {
                router.replace('/branch-requests')
            } else {
                router.replace('/')
            }
        }
    }, [user, loading, pathname, router, shouldRedirectToLogin, shouldRedirectHome])

    // Show Loader if:
    // 1. Auth is loading
    // 2. We decided we need to redirect (waiting for router to act)
    // 3. We are unauthenticated but on a protected page (shouldRedirectToLogin covers this)
    if (loading || shouldRedirectToLogin || shouldRedirectHome) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50 flex-col gap-4" dir="rtl">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <div className="text-muted-foreground text-sm">
                    {loading ? "جاري التحقق..." : "جاري التوجيه..."}
                </div>
                {!loading && (
                    <button
                        onClick={() => window.location.href = '/login'}
                        className="text-xs text-blue-600 hover:underline mt-2"
                    >
                        اضغط هنا إذا تأخر التوجيه
                    </button>
                )}
            </div>
        )
    }

    // If we are unauthenticated and on login page -> Render Login (Children)
    // If we are authenticated and on protected page -> Render App (Children)
    return <>{children}</>
}
