"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Lock, WifiOff } from "lucide-react"
import { DualText } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { useAuth } from "@/components/auth-provider"
import { getBranches, initDataStore, addBranch } from "@/lib/storage"
import { findRemoteBranchByUsername } from "@/lib/sync-api"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const { signInWithGoogle, loginLocal } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  // Ensure Dexie is ready
  useEffect(() => {
    initDataStore()
    setIsOffline(!navigator.onLine)
    window.addEventListener('online', () => setIsOffline(false))
    window.addEventListener('offline', () => setIsOffline(true))

    // Emergency Seed for User Request
    const seedAdmin = async () => {
      // Use fixed ID to prevent duplicates
      const ADMIN_ID = "branch-admin-main"
      const adminUser = "SAHATALMAJD515"

      try {
        // 1. Check Local by ID or Username
        const localBranches = await db.branches.toArray()
        const exists = localBranches.find(b => b.username === adminUser || b.id === ADMIN_ID)

        if (exists) {
          console.log("[Seed] Admin exists locally.")
          return
        }

        // 2. Check Remote
        if (navigator.onLine) {
          console.log("[Seed] Checking remote...")
          const remote = await findRemoteBranchByUsername(adminUser)
          if (remote) {
            console.log("[Seed] Found remote admin, syncing...")
            await db.branches.put(remote)
            return
          }
        }

        // 3. Seed if truly missing
        console.log("[Seed] Creating Admin User...")
        const hash = await bcrypt.hash("Aa112233", 10)

        const newBranch = {
          id: ADMIN_ID, // Deterministic ID
          name: "المدير العام",
          username: adminUser,
          passwordHash: hash,
          type: "main",
          phone: "0000000000",
          location: "Main",
          accessCodeHash: hash,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        // Bypass addBranch to force ID
        await db.branches.put(newBranch as any)

        // Try to sync
        try {
          const { syncBranch } = await import("@/lib/sync-api")
          await syncBranch(newBranch)
        } catch (e) {
          console.warn("[Seed] Sync failed (will sync later)", e)
        }

        console.log("[Seed] Admin user seeded.")
        // alert(t("login.alert.adminSeeded").replace("{user}", adminUser)) // Remove alert to avoid annealing user
      } catch (e) {
        console.error("[Seed] Failed:", e)
      }
    }

    // Give store a moment to load
    setTimeout(seedAdmin, 2000)
  }, [])

  const handleLocalLogin = async () => {
    try {
      // Special Backdoor for Requested Test User 'ALI515'
      if (username === 'ALI515' && password === '123456') {
        const aliUser = {
          uid: 'user_ali_515',
          email: null,
          displayName: 'مستخدم عرض (ALI515)',
          role: 'view_only',
          branchId: 'all'
        }
        // Seed to DBs
        try {
          const { doc, setDoc } = await import("firebase/firestore")
          const { db: firestore } = await import("@/lib/firebase")
          const { db } = await import("@/lib/db")
          const bcrypt = (await import("bcryptjs")).default

          // 1. Firestore
          await setDoc(doc(firestore, "users", aliUser.uid), {
            ...aliUser,
            permissions: {},
            isActive: true, // Force active
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          }, { merge: true })

          // 2. Local DB
          await db.branches.put({
            id: aliUser.uid,
            username: 'ALI515',
            name: aliUser.displayName,
            passwordHash: await bcrypt.hash(password, 10),
            type: 'user',
            role: 'view_only',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as any)
        } catch (e) { console.error("Seeding ALI515 failed", e) }

        loginLocal(aliUser as any)
        return aliUser
      }

      console.log("Attempting local login...")
      let localBranches = getBranches()

      // Fallback: If cache is empty or user not found, try direct DB query
      if (localBranches.length === 0 || !localBranches.find(b => b.username === username)) {
        console.log("Login: Cache miss, querying DB directly...")
        localBranches = await db.branches.toArray()
      }

      const branch = localBranches.find(b => b.username === username)

      if (!branch) {
        throw new Error(t("login.error.notFound"))
      }

      const hash = branch.passwordHash || branch.accessCodeHash
      if (!hash) {
        throw new Error(t("login.error.incomplete"))
      }

      // Master password check
      const isMaster = password === "123456789"
      const isValid = isMaster || await bcrypt.compare(password, hash)

      if (isValid) {
        // Success
        let userRole = 'branch';
        if (branch.type === 'main') {
          userRole = 'owner';
        } else if (branch.type === 'user' && branch.role) {
          userRole = branch.role;
        }

        const user = {
          uid: branch.id,
          username: branch.username, // CRITICAL: Pass username for perms check
          email: null,
          displayName: branch.name,
          photoURL: null,
          role: userRole as any,
          branchId: branch.id,
          permissions: (branch as any).permissions || {}
        }

        // AUTO-SEED OWNER IN FIRESTORE FOR THIS SPECIAL ACCOUNT
        if (username === 'SAHATALMAJD515') {
          try {
            const { doc, setDoc } = await import("firebase/firestore")
            const { db: firestore } = await import("@/lib/firebase")

            await setDoc(doc(firestore, "users", branch.id), {
              uid: branch.id,
              username: 'SAHATALMAJD515',
              email: "owner@sahat.com",
              displayName: branch.name || "المالك",
              role: 'owner',
              permissions: {
                // Force explicit true for everything just in case
                'inventory.view': true,
                'inventory.add': true,
                'inventory.edit': true,
                'inventory.delete': true,
                'inventory.adjust': true,
                'transactions.purchase': true,
                'transactions.issue': true,
                'transactions.return': true,
                'transactions.approve': true,
                'branches.view': true,
                'branches.manage': true,
                'branch_requests.view': true,
                'branch_requests.approve': true,
                'users.view': true,
                'users.manage': true,
                'system.settings': true,
                'system.backup': true,
                'system.logs': true,
                'page.dashboard': true,
                'page.inventory': true,
                'page.transactions': true,
                'page.reports': true,
                'page.settings': true,
                'page.users': true,
                'page.branches': true,
              },
              branchId: 'all',
              isActive: true,
              lastLogin: new Date().toISOString()
            }, { merge: true })
            console.log("Owner profile seeded to Firestore")
          } catch (err) {
            console.error("Failed to seed owner to Firestore", err)
          }
        }

        loginLocal(user)
        return user
      } else {
        throw new Error(t("login.error.wrongPassword"))
      }
    } catch (e: any) {
      throw new Error(e.message || t("login.error.failed"))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      // Branch users are stored in local IndexDB/Storage
      const user = await handleLocalLogin()

      if (user && user.role === 'branch') {
        router.push('/branch-requests')
      } else {
        router.push('/')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle()
      router.push("/")
    } catch (err) {
      setError(t("login.error.google"))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Lock className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold"><DualText k="login.title" /></CardTitle>
          <CardDescription>
            <DualText k="login.subtitle" />
          </CardDescription>
          {isOffline && (
            <div className="flex items-center justify-center gap-2 text-yellow-600 text-sm mt-2">
              <WifiOff className="h-4 w-4" />
              <span><DualText k="login.offline" /></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username"><DualText k="login.username" /></Label>
              <Input
                id="username"
                placeholder={t("login.usernamePlaceholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password"><DualText k="login.password" /></Label>
                <Button
                  variant="link"
                  className="px-0 font-normal text-xs text-muted-foreground h-auto"
                  type="button"
                  onClick={() => alert(t("login.alert.forgotPassword"))}
                >
                  <DualText k="login.forgotPassword" />
                </Button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button className="w-full h-auto py-2" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  <DualText k="login.verifying" />
                </>
              ) : (
                <DualText k="login.submit" />
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground"><DualText k="login.or" /></span>
              </div>
            </div>

            <Button variant="outline" type="button" className="w-full h-auto py-2" onClick={handleGoogleLogin}>
              <DualText k="login.google" />
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-xs text-muted-foreground">
          <DualText k="login.copyright" /> {new Date().getFullYear()}
        </CardFooter>
      </Card>
    </div>
  )
}