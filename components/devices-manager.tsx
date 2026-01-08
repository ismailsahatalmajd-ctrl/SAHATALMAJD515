"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getDeviceId, getDeviceInfo } from "@/lib/device"
import { db } from "@/lib/db"
import { Laptop, Smartphone, Monitor, Trash2, ShieldAlert, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale"
import { useToast } from "@/components/ui/use-toast"

interface DeviceSession {
  id: string
  deviceId: string
  name: string
  type: 'desktop' | 'mobile' | 'tablet'
  lastActive: string
  isCurrent: boolean
  browser: string
  os: string
}

import { useAuth } from "@/components/auth-provider"

export function DevicesManager() {
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const { user } = useAuth()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
        setUserId(user.uid || null)
    }
  }, [user])

  useEffect(() => {
    loadDevices()
  }, [userId])

  const loadDevices = async () => {
    try {
      setLoading(true)
      const currentId = getDeviceId()
      const currentInfo = getDeviceInfo()
      
      // 1. Get User ID from auth/session - replaced with useAuth
      const uid = userId

      // 2. Prepare current device info
      const currentDeviceObj = {
          id: `sess_${currentId.substring(0, 8)}`, // Consistent ID for this device
          deviceId: currentId,
          userId: uid,
          lastActive: new Date().toISOString(),
          name: currentInfo?.browser || "Unknown Browser",
          type: "desktop",
          browser: currentInfo?.browser || "Unknown",
          os: currentInfo?.platform || "Unknown"
      }

      // 3. Upsert current device to Server
      try {
          await fetch('/api/devices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(currentDeviceObj)
          })
      } catch (e) { console.error("Sync device failed", e) }

      // 4. Fetch all devices from Server
      let serverDevices: any[] = []
      try {
          const res = await fetch('/api/devices')
          const data = await res.json()
          serverDevices = data.data || []
      } catch (e) { console.error("Fetch devices failed", e) }

      // 5. Update Local Dexie with Server Data (Merge)
      if (serverDevices.length > 0) {
          try {
            await db.userSessions.clear() // Refresh local cache with server truth
            for (const sd of serverDevices) {
                await db.userSessions.put({
                    id: sd.id,
                    userId: sd.userId,
                    deviceId: sd.deviceId,
                    lastActive: sd.lastActive,
                })
            }
          } catch {}
      }
      
      // 6. Display Devices
      let displayList: DeviceSession[] = []
      
      if (serverDevices.length > 0) {
          displayList = serverDevices.map(s => ({
              id: s.id,
              deviceId: s.deviceId,
              name: s.name || (s.deviceId === currentId ? (currentInfo?.browser || "Unknown Browser") : "Device"),
              type: s.type || 'desktop',
              lastActive: s.lastActive,
              isCurrent: s.deviceId === currentId,
              browser: s.browser || "Unknown",
              os: s.os || "Unknown"
          }))
      } else {
           // Fallback to local Dexie if server empty (offline)
           const sessions = await db.userSessions.toArray()
           displayList = sessions.map((s: any) => ({
               id: s.id,
               deviceId: s.deviceId,
               name: s.deviceId === currentId ? (currentInfo?.browser || "Unknown Browser") : "Device",
               type: 'desktop',
               lastActive: s.lastActive,
               isCurrent: s.deviceId === currentId,
               browser: "Unknown",
               os: "Unknown"
           }))
      }
      
      // Ensure current device is in the list if not present
      if (!displayList.find(d => d.deviceId === currentId)) {
          const self = {
              id: currentDeviceObj.id,
              deviceId: currentId,
              name: currentInfo?.browser || "Unknown Browser",
              type: "desktop" as const,
              lastActive: new Date().toISOString(),
              isCurrent: true,
              browser: currentInfo?.browser || "Unknown",
              os: currentInfo?.platform || "Unknown"
          }
          displayList.push(self)
      }
      
      setDevices(displayList)
    } finally {
      setLoading(false)
    }
  }

  const handleLogoutDevice = async (sessionId: string) => {
    try {
        await fetch('/api/devices', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [sessionId] })
        })
        setDevices(devices.filter(d => d.id !== sessionId))
        await db.userSessions.delete(sessionId)
        toast({
          title: "تم تسجيل خروج الجهاز",
          description: "تم فصل الجهاز بنجاح من الحساب.",
        })
    } catch (e) {
        toast({
          title: "حدث خطأ",
          description: "تعذر حذف جلسة الجهاز.",
        })
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'mobile': return <Smartphone className="h-5 w-5" />
      case 'tablet': return <Monitor className="h-5 w-5" /> 
      default: return <Laptop className="h-5 w-5" />
    }
  }
  
  const logoutAllDevices = async () => {
    try {
      setLoading(true)
      
      // 1. Delete all sessions from server
      const ids = devices.map(d => d.id)
      if (ids.length > 0) {
          await fetch('/api/devices', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
          })
      }
      
      // 2. Clear local storage
      await db.userSessions.clear()
      setDevices([])
      
      // 3. Logout locally
      try { await fetch("/api/auth/logout", { method: "POST" }) } catch {}
      
      toast({
        title: "تم تسجيل الخروج من جميع الأجهزة",
        description: "تم إنهاء كافة الجلسات وحذفها.",
      })
      
      window.location.reload()
    } catch {
      toast({
        title: "حدث خطأ",
        description: "تعذر تنفيذ تسجيل الخروج الشامل.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>الأجهزة المتصلة</CardTitle>
              <CardDescription>إدارة الأجهزة التي لها حق الوصول إلى حسابك</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadDevices}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {devices.map((device) => (
              <div key={device.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400">
                    {getIcon(device.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{device.name}</h4>
                      {device.isCurrent && (
                        <Badge variant="default" className="text-[10px] h-5">الجهاز الحالي</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {device.os} • {device.browser} • آخر نشاط {formatDistanceToNow(new Date(device.lastActive), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                </div>
                
                {!device.isCurrent && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 self-end sm:self-auto"
                    onClick={() => handleLogoutDevice(device.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">تسجيل خروج</span>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            إعدادات الأمان المتقدمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 rounded-lg">
            <div className="space-y-1">
              <h4 className="font-medium text-amber-900 dark:text-amber-200">تسجيل الخروج من جميع الأجهزة</h4>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                سيتم تسجيل خروجك من جميع الأجهزة بما في ذلك هذا الجهاز. ستحتاج إلى تسجيل الدخول مرة أخرى.
              </p>
            </div>
            <Button variant="destructive" onClick={logoutAllDevices}>تسجيل الخروج من الكل</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
