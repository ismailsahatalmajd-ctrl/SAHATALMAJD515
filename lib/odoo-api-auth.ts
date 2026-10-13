import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { initAdminApp } from "@/lib/firebase-admin"

export async function authorizeOdooApi(request: Request, requireAdmin = false): Promise<NextResponse | null> {
  const authorization = request.headers.get("authorization") || ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  }

  try {
    const app = initAdminApp()
    const decoded = await getAuth(app).verifyIdToken(match[1])
    if (decoded.firebase?.sign_in_provider === "anonymous") {
      return NextResponse.json({ success: false, error: "A signed-in account is required" }, { status: 403 })
    }

    if (requireAdmin) {
      const userSnapshot = await getFirestore(app).collection("users").doc(decoded.uid).get()
      if (!userSnapshot.exists || userSnapshot.data()?.role !== "admin") {
        return NextResponse.json({ success: false, error: "Administrator access required" }, { status: 403 })
      }
    }

    return null
  } catch (error) {
    console.error("Odoo API authentication failed:", error)
    return NextResponse.json({ success: false, error: "Invalid or expired authentication" }, { status: 401 })
  }
}