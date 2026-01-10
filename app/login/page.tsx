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
      const branches = getBranches()
      const adminUser = "SAHATALMAJD515"
      const exists = branches.find(b => b.username === adminUser)
      if (!exists) {
        console.log("Seeding admin user...")
        const hash = await bcrypt.hash("Aa112233", 10)
        await addBranch({
          name: "المدير العام",
          username: adminUser,
          passwordHash: hash,
          type: "main",
          phone: "0000000000",
          location: "Main",
          accessCodeHash: hash
        } as any)
        console.log("Admin user seeded.")
        alert(t("login.alert.adminSeeded").replace("{user}", adminUser))
      }
    }
    // Give store a moment to load
    setTimeout(seedAdmin, 1000)
  }, [])

  const handleLocalLogin = async () => {
    try {
      console.log("Attempting local login...")
      const localBranches = getBranches()
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
        const user = {
          uid: branch.id,
          email: null,
          displayName: branch.name,
          photoURL: null,
          role: branch.type === 'main' ? 'owner' : 'branch',
          branchId: branch.id
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

      if (user && (user.role === 'owner' || user.role === 'admin')) {
        router.push('/')
      } else {
        router.push('/branch-requests')
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