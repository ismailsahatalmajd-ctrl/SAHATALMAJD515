"use client"

import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { usePathname } from "next/navigation"

export function Footer() {
  const { t } = useI18n()
  const pathname = usePathname()
  const currentPath = (typeof window !== "undefined" ? window.location.pathname : "") || pathname || ""

  // Completely hide footer on Marsad and camera public pages
  if (currentPath.includes("marsad") || currentPath.includes("partner-cameras")) {
    return null
  }

  const year = new Date().getFullYear()
  return (
    <footer className="border-t bg-card" suppressHydrationWarning>
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2" suppressHydrationWarning>
            {/* Use plain img to avoid Next/Image layout overhead in footer */}
            <img
              src="/sahat-almajd-logo.svg"
              alt={t("brand.name")}
              width={24}
              height={24}
              className="object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <span className="text-sm text-muted-foreground" suppressHydrationWarning><DualText k="brand.name" /></span>
          </div>
          <div className="text-xs text-muted-foreground">
            © {year} <DualText k="footer.copyright" />
          </div>
        </div>
      </div>
    </footer>
  )
}