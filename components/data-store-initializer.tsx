"use client"

import { useEffect, useState } from "react"
import { initDataStoreWithProgress } from "@/lib/storage"
import { Loader2 } from "lucide-react"

export function DataStoreInitializer({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState("بدء التحميل...")

  useEffect(() => {
    // Safety timeout: 10 seconds
    const safetyTimer = setTimeout(() => {
      console.warn("DataStoreInitializer: Triggering Safety Timeout (10s)");
      setInitialized(true);
    }, 10000);

    const performInit = async () => {
      try {
        await initDataStoreWithProgress((pct, msg) => {
          setProgress(pct)
          setMessage(msg)
        });
        // If successful, clear timeout and enter
        clearTimeout(safetyTimer);
        setInitialized(true);
      } catch (e: any) {
        console.error("Init failed:", e);
        setError(e.message || "DB Init Error");
        // Force entry on error too
        setInitialized(true);
      }
    };

    performInit();

    return () => clearTimeout(safetyTimer);
  }, []);

  if (!initialized) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background text-foreground z-50" dir="rtl">
        <div className="w-full max-w-sm px-4 flex flex-col items-center gap-6">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">جاري تحميل البيانات</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>

          <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="font-mono text-sm font-bold text-primary">{progress}%</p>

          {error && <div className="p-4 bg-destructive/10 text-destructive rounded text-sm w-full">{error}</div>}

          {progress > 80 && (
            <p className="text-xs text-muted-foreground animate-pulse">جاري معالجة الصور الكبيرة...</p>
          )}

          <button
            onClick={() => setInitialized(true)}
            className="mt-8 text-xs text-muted-foreground underline hover:text-foreground"
          >
            تخطي الانتظار (في حال التعليق)
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
