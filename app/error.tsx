"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

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
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          تحديث الصفحة
        </Button>
        <Button onClick={() => reset()}>
          حاول مرة أخرى
        </Button>
      </div>
    </div>
  )
}
