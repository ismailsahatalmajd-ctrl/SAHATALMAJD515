"use client"

import { SimpleDemandDashboard } from "@/components/simple-demand-dashboard"
import { Header } from "@/components/header"
import { hasPermission } from "@/lib/auth-utils"
import { useAuth } from "@/components/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Shield, Lock } from "lucide-react"
import { DualText } from "@/components/ui/dual-text"

export default function DemandAnalysisPage() {
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Alert className="max-w-md mx-auto">
            <Lock className="h-4 w-4" />
            <AlertTitle>مطلوب تسجيل الدخول</AlertTitle>
            <AlertDescription>
              يرجى تسجيل الدخول للوصول إلى صفحة تحليل الطلبات
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (!hasPermission(user, 'view_analytics')) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Alert className="max-w-md mx-auto">
            <Shield className="h-4 w-4" />
            <AlertTitle>وصول غير مصرح به</AlertTitle>
            <AlertDescription>
              ليس لديك صلاحية للوصول إلى صفحة تحليل الطلبات
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <SimpleDemandDashboard />
      </main>
    </div>
  )
}
