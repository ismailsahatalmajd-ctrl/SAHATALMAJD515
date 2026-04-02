"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Key, Copy, Check } from "lucide-react"
import type { Branch } from "@/lib/types"
import { hashAccessCode } from "@/lib/security"
import { updateBranch } from "@/lib/supabase-storage"

interface BranchAccessDialogProps {
  branch: Branch
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function BranchAccessDialog({ branch, open, onOpenChange, onSuccess }: BranchAccessDialogProps) {
  const [accessCode, setAccessCode] = useState("")
  const [confirmCode, setConfirmCode] = useState("")
  const [showCode, setShowCode] = useState(false)
  const [generatedCode, setGeneratedCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const generateRandomCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase()
    setAccessCode(code)
    setConfirmCode(code)
    setGeneratedCode(code)
  }

  const handleCopy = async () => {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!accessCode || accessCode.length < 6) {
      setError("رمز الوصول يجب أن يكون 6 أحرف على الأقل")
      return
    }

    if (accessCode !== confirmCode) {
      setError("رمز الوصول غير متطابق")
      return
    }

    setIsSubmitting(true)
    try {
      const hash = await hashAccessCode(accessCode)
      await updateBranch(branch.id, { ...branch, accessCodeHash: hash })
      onSuccess()
      onOpenChange(false)
      setAccessCode("")
      setConfirmCode("")
      setGeneratedCode("")
    } catch (err) {
      setError("حدث خطأ أثناء حفظ رمز الوصول")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            إدارة رمز الوصول - {branch.name}
          </DialogTitle>
          <DialogDescription>
            {branch.accessCodeHash
              ? "تحديث رمز الوصول للفرع. الرمز القديم سيتم استبداله."
              : "إنشاء رمز وصول جديد للفرع. سيحتاج الفرع هذا الرمز لتسجيل الدخول."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accessCode">رمز الوصول *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="accessCode"
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="أدخل رمز الوصول (6 أحرف على الأقل)"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                >
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={generateRandomCode}>
                توليد تلقائي
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmCode">تأكيد رمز الوصول *</Label>
            <Input
              id="confirmCode"
              type={showCode ? "text" : "password"}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="أعد إدخال رمز الوصول"
              required
              minLength={6}
            />
          </div>

          {generatedCode && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <div>
                  <span className="font-medium">رمز الوصول المُولد: </span>
                  <code className="text-lg font-bold">{generatedCode}</code>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertDescription className="text-sm">
              <strong>ملاحظة مهمة:</strong> احفظ رمز الوصول في مكان آمن. لن تتمكن من رؤيته مرة أخرى بعد الحفظ.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جاري الحفظ..." : branch.accessCodeHash ? "تحديث الرمز" : "حفظ الرمز"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
