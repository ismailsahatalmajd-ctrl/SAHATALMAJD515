"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import FingerprintHubPage from "../page"
import { useAuth } from "@/components/auth-provider"

export default function AdminFingerprintPage() {
  const router = useRouter()
  const { user } = useAuth()
  const role = String(user?.role || "")

  useEffect(() => {
    if (!role) return
    if (role === "branch") {
      router.replace("/fingerprint-center/branch")
    }
  }, [role, router])

  if (!role) {
    return null
  }

  if (role === "branch") {
    return null
  }

  return <FingerprintHubPage forcedMode="admin" />
}
