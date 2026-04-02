"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { collectPerf, savePerf } from "@/lib/perf"

export function PerfReportButton() {
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const key = 'perf_logs_v1'
  const load = () => {
    try { const raw = localStorage.getItem(key); setSnapshots(raw ? JSON.parse(raw) : []) } catch { setSnapshots([]) }
  }
  useEffect(() => { load() }, [])
  const run = () => { const s = collectPerf(); savePerf(s); load() }
  const reset = () => { try { localStorage.removeItem(key) } catch {}; load() }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>تقارير الأداء</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تقارير الأداء</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button onClick={run}>قياس الآن</Button>
              <Button variant="outline" onClick={reset}>مسح التقارير</Button>
            </div>
            <div className="max-h-[50vh] overflow-auto border rounded p-3 text-sm">
              {snapshots.length === 0 ? (
                <div className="text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="text-right p-2">الوقت</th>
                      <th className="text-right p-2">DOMContentLoaded</th>
                      <th className="text-right p-2">Load</th>
                      <th className="text-right p-2">الاتصال</th>
                      <th className="text-right p-2">الموارد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.slice().reverse().map((s, i) => (
                      <tr key={i}>
                        <td className="p-2">{s.ts}</td>
                        <td className="p-2">{s.nav?.domContentLoaded ?? 0} ms</td>
                        <td className="p-2">{s.nav?.load ?? 0} ms</td>
                        <td className="p-2">{s.net?.effectiveType || '-'} ({s.net?.downlink || 0}Mbps)</td>
                        <td className="p-2">{s.resources?.count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
