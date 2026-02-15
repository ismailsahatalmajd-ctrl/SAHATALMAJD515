import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import NumberNormalizer from "@/components/number-normalizer"
import { Footer } from "@/components/footer"
import { LanguageProvider } from "@/components/language-provider"
import { DataStoreInitializer } from "@/components/data-store-initializer"
import { DeviceMonitorInitializer } from "@/components/device-monitor-initializer"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

import { FirebaseSyncManager } from "@/components/firebase-sync-manager"

// ... existing imports

export const metadata: Metadata = {
  title: "مستودع ساحة المجد",
  description: "نظام مستودع ساحة المجد لإدارة المخزون والمنتجات",
  generator: "v0.app",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
}

import { AuthProvider } from "@/components/auth-provider"
import { SyncStatus } from "@/components/sync-status"
import { SyncProvider } from "@/components/sync-provider"
import { SyncManager } from "@/components/sync-manager"
import { Toaster } from "@/components/ui/toaster"
import { ServiceWorkerUnregister } from "@/components/sw-unregister"
import { AuthGuard } from "@/components/auth-guard"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" translate="no" suppressHydrationWarning>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        <ServiceWorkerUnregister />
        <AuthProvider>
          <LanguageProvider>
            <AuthGuard>
              <DataStoreInitializer>
                <SyncManager />
                <FirebaseSyncManager />
                <DeviceMonitorInitializer>
                  {/* <NumberNormalizer /> */}
                  <SyncProvider>
                    {children}
                  </SyncProvider>
                </DeviceMonitorInitializer>
                <Footer />
                <Toaster />
              </DataStoreInitializer>
            </AuthGuard>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  )
}



