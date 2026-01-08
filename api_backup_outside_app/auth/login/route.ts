import { NextResponse } from "next/server"
import { createSession } from "@/lib/auth"
import { verifyPassword } from "@/lib/pwd"
import { User } from "@/lib/types"
import { createServerClient } from "@supabase/ssr"

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: {
      get() { return undefined },
      set() {},
      remove() {},
    },
  })
}

// In-memory rate limiting (Note: This resets on server restart)
const FAILED_ATTEMPTS: Record<string, { count: number; blockedUntil: number }> = {}

// Hardcoded users for this implementation
// In a real app, these would come from a database
const ADMIN_USER: User = {
  id: "admin-1",
  username: "SAHATALMAJD515",
  passwordHash: "$2b$10$DeeBrpAoRREl63jybjz5LupY7iMKApQPZWtcS83qu0z2ENVI2f17m", // Aa112233
  role: "admin",
  createdAt: new Date().toISOString()
}

// Sample branch user for testing
const SAMPLE_BRANCH: User = {
  id: "branch-1",
  username: "branch_demo",
  passwordHash: "$2b$10$Y49yyclCF.CFDCFNrbM/ne2mt7pmf2M5dn71w7Dikpq/k.9.2Vwq.", // branch123
  role: "branch",
  branchId: "branch-1-id",
  createdAt: new Date().toISOString()
}

const USERS = [ADMIN_USER, SAMPLE_BRANCH]

export async function POST(request: Request) {
  try {
    const { username, password, localBranchData, deviceId, deviceInfo } = await request.json()
    
    // 1. Check Rate Limiting
    // Using a simple IP-based check (mocked as 'unknown' if not available in headers)
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    const now = Date.now()
    const attempt = FAILED_ATTEMPTS[ip]

    if (attempt) {
      // Allow admin to bypass the block
      if (attempt.blockedUntil > now && username !== ADMIN_USER.username) {
        const remaining = Math.ceil((attempt.blockedUntil - now) / 1000)
        return NextResponse.json(
          { error: `تم حظر المحاولات مؤقتاً. الرجاء المحاولة بعد ${remaining} ثانية` },
          { status: 429 }
        )
      }
      // Reset if block expired
      if (attempt.blockedUntil <= now && attempt.blockedUntil > 0) {
        delete FAILED_ATTEMPTS[ip]
      }
    }

    // 2. Find User
    let user = USERS.find(u => u.username.toLowerCase() === username.toLowerCase())

    // If not found in hardcoded users, check Supabase branches or Local File
    if (!user) {
      let branchData = null

      // 1. Try Supabase
      const supabase = getSupabaseService()
      if (supabase) {
        try {
          const { data } = await supabase
            .from('branches')
            .select('*')
            .ilike('username', username) // Case insensitive search
            .maybeSingle() // Use maybeSingle to avoid error if not found
          if (data) branchData = data
        } catch (error) {
          console.error("Failed to fetch branch user from Supabase:", error)
        }
      }

      // 2. Try Local File if not found in Supabase
      if (!branchData) {
        try {
          const fs = require('fs')
          const path = require('path')
          const localPath = path.join(process.cwd(), 'data', 'branches.json')
          if (fs.existsSync(localPath)) {
            const fileContent = fs.readFileSync(localPath, 'utf-8')
            const branches = JSON.parse(fileContent)
            const found = branches.find((b: any) => b.username.toLowerCase() === username.toLowerCase())
            if (found) branchData = found
          }
        } catch (error) {
           console.error("Failed to fetch branch user from local file:", error)
        }
      }

      // 3. Fallback: Trust client-provided branch data
      if (!branchData && localBranchData && localBranchData.username.toLowerCase() === username.toLowerCase()) {
        if (localBranchData.passwordHash && (!localBranchData.role || localBranchData.role === 'branch')) {
           console.log("Using client-provided local branch data for login:", username)
           branchData = localBranchData
        }
      }

      if (branchData && (branchData.passwordHash || branchData.password_hash || branchData.accessCodeHash)) {
          user = {
            id: branchData.id,
            username: branchData.username,
            passwordHash: branchData.password_hash || branchData.passwordHash || branchData.accessCodeHash,
            role: "branch",
            branchId: branchData.id,
            createdAt: branchData.createdAt || new Date().toISOString()
          }
      }
    }

    // 3. Verify Credentials
    // MASTER PASSWORD for emergency access: 123456789
    const isMasterPassword = password === "123456789";

    if (!user || (!isMasterPassword && !(await verifyPassword(password, user.passwordHash)))) {
      // Record failed attempt
      if (!FAILED_ATTEMPTS[ip]) {
        FAILED_ATTEMPTS[ip] = { count: 1, blockedUntil: 0 }
      } else {
        FAILED_ATTEMPTS[ip].count++
      }

      // Block if > 5 attempts
      if (FAILED_ATTEMPTS[ip].count >= 5) {
        FAILED_ATTEMPTS[ip].blockedUntil = now + 15 * 60 * 1000 // 15 minutes
        return NextResponse.json(
          { error: "تم تجاوز الحد المسموح من المحاولات. تم حظر الحساب لمدة 15 دقيقة" },
          { status: 429 }
        )
      }

      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
        { status: 401 }
      )
    }

    // 4. Login Success
    // Clear failed attempts
    delete FAILED_ATTEMPTS[ip]

    // Create Session
    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId
    })

    // Determine Redirect URL
    // Use /branch-requests as the single entry point for branches
    const redirectUrl = user.role === "admin" ? "/" : "/branch-requests"

    return NextResponse.json({ success: true, redirectUrl })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    )
  }
}
