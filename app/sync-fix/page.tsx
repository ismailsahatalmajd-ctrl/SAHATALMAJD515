
"use client"

import { useState } from "react"
import { getBranches } from "@/lib/storage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react"
import { createClient } from "@supabase/supabase-js"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import bcrypt from "bcryptjs"

export default function SyncFixPage() {
  const [status, setStatus] = useState<"idle" | "syncing" | "success" | "error">("idle")
  const [log, setLog] = useState<string[]>([])
  const [resetPasswords, setResetPasswords] = useState(false)

  const syncBranches = async () => {
    setStatus("syncing")
    setLog([])
    
    try {
      // 1. Get Local Branches
      const localBranches = getBranches()
      setLog(prev => [...prev, `Found ${localBranches.length} local branches.`])

      if (localBranches.length === 0) {
        setLog(prev => [...prev, "No local branches to sync."])
        setStatus("success")
        return
      }

      // 2. Try Server-Side Sync first
      if (!resetPasswords) {
          setLog(prev => [...prev, "Attempting server sync..."])
          try {
            const res = await fetch("/api/branches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(localBranches)
            })
            const result = await res.json()
            if (result.savedToSupabase) {
                setLog(prev => [...prev, "Server sync successful!"])
                setStatus("success")
                return
            } else {
                setLog(prev => [...prev, "Server sync failed to reach cloud. Trying direct client sync..."])
            }
          } catch (err) {
            setLog(prev => [...prev, "Server sync error. Trying direct client sync..."])
          }
      } else {
          setLog(prev => [...prev, "Skipping server sync (password reset requested)..."])
      }

      // 3. Direct Client Sync (Fallback)
      setLog(prev => [...prev, "Connecting directly to Supabase..."])
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      
      if (!supabaseUrl || !supabaseKey) {
          throw new Error("Missing Supabase configuration in browser.")
      }

      const supabase = createClient(supabaseUrl, supabaseKey)

      // Validate and clean data
      const rows = []
      
      // Pre-calculate hash if reset requested
      let defaultHash = ""
      if (resetPasswords) {
          setLog(prev => [...prev, "Generating new password hash for '123456'..."])
          defaultHash = await bcrypt.hash("123456", 10)
      }

      for (const b of localBranches) {
          const row: any = {
              name: b.name,
              username: b.username,
              password_hash: resetPasswords ? defaultHash : (b.passwordHash || b.accessCodeHash),
              location: b.location,
              manager: b.manager,
              phone: b.phone,
          }

          // If ID is valid UUID, use it. Otherwise, check if we can find the branch by username
          const isIdValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)
          
          if (isIdValid) {
              row.id = b.id
          } else {
              setLog(prev => [...prev, `Warning: Invalid UUID "${b.id}" for branch "${b.username}". Resolving...`])
              
              // Check if branch exists by username to avoid duplicates
              const { data: existing } = await supabase.from('branches').select('id').eq('username', b.username).single()
              
              if (existing) {
                  setLog(prev => [...prev, `Found existing branch for "${b.username}". Updating...`])
                  row.id = existing.id
              } else {
                  setLog(prev => [...prev, `Creating new cloud ID for "${b.username}"...`])
                  // Let Supabase generate ID
              }
          }
          rows.push(row)
      }

      const { data, error } = await supabase.from('branches').upsert(rows, { onConflict: 'id' })

      if (error) {
          setLog(prev => [...prev, `Client Sync Error: ${error.message}`])
          setLog(prev => [...prev, `HINT: Did you run the SQL policy to allow inserts?`])
          throw error
      }

      setLog(prev => [...prev, `Client Sync Complete! Cloud updated.`])
      if (resetPasswords) {
          setLog(prev => [...prev, `IMPORTANT: All branch passwords reset to: 123456`])
      }
      setStatus("success")

    } catch (e: any) {
      console.error(e)
      setLog(prev => [...prev, `Final Error: ${e.message}`])
      setStatus("error")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>أداة إصلاح المزامنة (المتقدمة)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              تأكد من تنفيذ كود SQL التالي في Supabase قبل البدء إذا فشلت المحاولة الأولى:
              <br/>
              <code className="text-xs bg-gray-100 p-1 block mt-1 select-all">
                create policy "Enable insert for all" on branches for insert with check (true);
              </code>
            </AlertDescription>
          </Alert>

          <div className="flex items-center space-x-2 space-x-reverse border p-4 rounded-md bg-white">
            <Checkbox id="reset" checked={resetPasswords} onCheckedChange={(c) => setResetPasswords(!!c)} />
            <Label htmlFor="reset" className="cursor-pointer text-red-600 font-bold">
                إعادة تعيين كلمة مرور جميع الفروع إلى (123456)
            </Label>
          </div>

          <div className="bg-black/90 text-green-400 p-4 rounded-md text-sm font-mono h-40 overflow-y-auto">
            {log.map((l, i) => <div key={i}>&gt; {l}</div>)}
            {log.length === 0 && <div className="text-gray-500">جاهز للمزامنة...</div>}
          </div>

          <Button 
            className="w-full" 
            onClick={syncBranches} 
            disabled={status === "syncing"}
          >
            {status === "syncing" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ابدأ المزامنة الآن
          </Button>
          
          {status === "success" && (
            <Button variant="outline" className="w-full" onClick={() => window.location.href = "/login"}>
              الذهاب لصفحة الدخول
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
