
"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

import { useEffect } from "react"
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Page Error:", error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-bold">حدث خطأ في الصفحة</h2>
      <p className="text-muted-foreground max-w-md">
        {error.message || "حدث خطأ غير متوقع أثناء تحميل الصفحة."}
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => window.location.reload()}>
            تحديث الصفحة
          </Button>
          <Button onClick={() => reset()}>
            حاول مرة أخرى
          </Button>
        </div>

        {/* 🛠️ SPECIAL FIX FOR FIRESTORE ERROR */}
        {(error.message?.includes('firebase') || error.message?.includes('Te') || process.env.NODE_ENV === 'development') && (

          <div className="mt-4 p-4 border border-amber-200 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-800 mb-2 font-arabic">
              تم اكتشاف خلل في قاعدة البيانات المحلية (Firestore Cache).
              اضغط أدناه لإصلاح عميق لقاعدة البيانات وإعادة التشغيل.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const { resetPersistence } = await import('@/lib/firebase')
                await resetPersistence()
              }}
            >
              إصلاح عميق وإعادة تشغيل (Deep Fix & Reset)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
