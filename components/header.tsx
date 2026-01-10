"use client"

import { Package, BarChart3, Receipt, ShoppingCart, Building2, Barcode, ChevronLeft, Settings, LogOut, Menu, Tag } from "lucide-react"
import Link from "next/link"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useI18n } from "@/components/language-provider"
import { AppControls } from "./app-controls"
import { SyncIndicator } from "./sync-indicator"
import { NotificationsCenter } from "@/components/notifications-center"
import { Button } from "@/components/ui/button"
import DailyBackupHook from "@/components/daily-backup"
import BranchRequestNotifier from "@/components/branch-request-notifier"
import { useRouter } from "next/navigation"
import GlobalImageDropzone from "./global-image-dropzone"
import { DualText } from "@/components/ui/dual-text"
import { useAuth } from "@/components/auth-provider"

export function Header() {
  const pathname = usePathname()
  const [logoError, setLogoError] = useState(false)
  const { t } = useI18n()
  const { user, logout } = useAuth()
  // const [session, setSession] = useState<any>(null) // Removed in favor of useAuth
  const [sessionBranchId, setSessionBranchId] = useState<string>("")

  const allLinks = [
    { href: "/", key: "nav.products", label: t("nav.products"), icon: Package },
    { href: "/purchases", key: "nav.purchases", label: t("nav.purchases"), icon: ShoppingCart },
    { href: "/issues", key: "nav.issues", label: t("nav.issues"), icon: Receipt },
    { href: "/returns", key: "nav.returns", label: t("nav.returns"), icon: Receipt },
    { href: "/reports", key: "nav.reports", label: t("nav.reports"), icon: BarChart3 },
    { href: "/branches", key: "nav.branches", label: t("nav.branches"), icon: Building2 },
    { href: "/branch-requests", key: "nav.branchRequests", label: t("nav.branchRequests"), icon: Receipt },
    { href: "/history", key: "nav.history", label: "سجل الباركود", icon: Receipt },
    { href: "/scanner", key: "nav.scanner", label: t("nav.scanner"), icon: Barcode },
    { href: "/label-designer", key: "nav.labelDesigner", label: "مصمم الملصقات", icon: Tag },
    { href: "/settings", key: "common.settings", label: t("common.settings"), icon: Settings },
  ]

  const router = useRouter()

  useEffect(() => {
    if (user && (user as any).role === 'branch') {
      setSessionBranchId((user as any).branchId || "")
    }
  }, [user])

  const links = (() => {
    if ((user as any)?.role === 'branch') {
      const branchId = (user as any).branchId || sessionBranchId
      return [
        ...(branchId ? [{ href: `/branch-requests`, key: "nav.branchDashboard", label: t("nav.branchDashboard") || "لوحة الفرع", icon: Building2 }] : [])
      ]
    }
    return allLinks
  })()

  const handleLogout = async () => {
    try {
      // Navigate to dedicated logout page for clean cleanup
      router.push("/logout")
    } catch (error) {
      console.error("Logout navigation failed", error)
    }
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile/Desktop Menu - Hamburger */}
            <div className="">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle><DualText k="brand.name" /></SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-4 mt-6 pb-20">
                    {links.map((link) => {
                      const Icon = link.icon
                      const isActive = pathname === link.href
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={cn(
                            "flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors border border-transparent",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <DualText k={link.key} />
                        </Link>
                      )
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>

            {/* Logo */}
            <div className="flex items-center gap-2" suppressHydrationWarning>
              {logoError ? (
                <Package className="h-8 w-8 text-primary" />
              ) : (
                <Image
                  src="/sahat-almajd-logo.svg"
                  alt="Sahat Almajid"
                  width={48}
                  height={48}
                  className="rounded object-contain"
                  onError={() => setLogoError(true)}
                  priority
                />
              )}
              <div className="font-bold hidden sm:block" suppressHydrationWarning>
                <DualText k="brand.name" />
              </div>
            </div>
          </div>

          {/* Desktop Navigation - Removed in favor of Sidebar */}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()} aria-label={t("common.back")} title={t("common.back")}>
              <ChevronLeft className="h-4 w-4 ml-2" /> <DualText k="common.back" />
            </Button>
            {pathname !== '/branch-requests' && (
              <>
                <SyncIndicator />
                <NotificationsCenter />
                <AppControls />
              </>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} title={t("auth.logout")}>
              <LogOut className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Row (Horizontal Scroll) - Removed in favor of Sidebar */}

        <DailyBackupHook />
        <BranchRequestNotifier />
        {/* <GlobalImageDropzone /> */}
      </div>
    </header>
  )
}
