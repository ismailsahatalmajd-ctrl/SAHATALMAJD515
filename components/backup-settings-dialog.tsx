"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { db } from "@/lib/db"

type BackupSettings = {
  dailyBackupEnabled?: boolean
  backupTime?: string
  backupRetentionDays?: number
}

export function BackupSettingsDialog() {
  const [open, setOpen] = useState(false)
  const [dailyBackupEnabled, setDailyBackupEnabled] = useState(false)
  const [backupTime, setBackupTime] = useState("02:00")
  const [backupRetentionDays, setBackupRetentionDays] = useState(30)

  useEffect(() => {
    if (!open) return

    const load = async () => {
      try {
        let s: BackupSettings = {}
        const record = await db.settings.get("app_settings")
        
        if (record?.value) {
          s = record.value
        } else {
          // Migration from localStorage
          const raw = localStorage.getItem("app_settings")
          if (raw) {
            s = JSON.parse(raw)
            await db.settings.put({ key: "app_settings", value: s })
            localStorage.removeItem("app_settings")
          }
        }

        setDailyBackupEnabled(!!s.dailyBackupEnabled)
        setBackupTime(s.backupTime || "02:00")
        setBackupRetentionDays(s.backupRetentionDays ?? 30)
      } catch (e) {
        console.error("Failed to load settings", e)
      }
    }
    
    load()
  }, [open])

  const onSave = async () => {
    try {
      const record = await db.settings.get("app_settings")
      const current = record?.value || {}
      const merged = { ...current, dailyBackupEnabled, backupTime, backupRetentionDays }
      await db.settings.put({ key: "app_settings", value: merged })
      setOpen(false)
    } catch (e) {
      console.error("Failed to save settings", e)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">إعدادات النسخ اليومي</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعدادات النسخ الاحتياطي اليومي</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="mr-4">تفعيل النسخ اليومي</Label>
            <Switch checked={dailyBackupEnabled} onCheckedChange={setDailyBackupEnabled} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>وقت التنفيذ (HH:MM)</Label>
              <Input value={backupTime} onChange={(e) => setBackupTime(e.target.value)} placeholder="02:00" />
            </div>
            <div>
              <Label>مدة الاحتفاظ بالأيام</Label>
              <Input type="number" min={1} value={backupRetentionDays} onChange={(e) => setBackupRetentionDays(parseInt(e.target.value || "0"))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={onSave}>حفظ</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}