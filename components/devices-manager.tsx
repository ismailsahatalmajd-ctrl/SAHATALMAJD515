"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getDeviceId } from "@/lib/device"
import { db as firestore } from "@/lib/firebase"
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { Laptop, Smartphone, Monitor, Trash2, ShieldAlert, RefreshCw, Eye, Database, CheckCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale"
import { useToast } from "@/components/ui/use-toast"
import { DeviceSession } from "@/lib/types"

export function DevicesManager() {
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [currentDeviceId, setCurrentDeviceId] = useState("")
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setCurrentDeviceId(getDeviceId())
  }, [])

  const sendCommand = async (deviceId: string, command: 'force_resync' | 'wipe_and_logout') => {
    try {
      await updateDoc(doc(firestore, "devices", deviceId), {
        command,
        commandTimestamp: new Date().toISOString(),
        commandStatus: null
      })
      toast({ title: "تم إرسال الأمر بنجاح" })
    } catch (e) {
      toast({ title: "فشل إرسال الأمر", variant: "destructive" })
    }
  }

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الجهاز؟")) return
    try {
      await deleteDoc(doc(firestore, "devices", deviceId))
      toast({ title: "تم حذف الجهاز بنجاح" })
    } catch (e) {
      toast({ title: "فشل حذف الجهاز", variant: "destructive" })
    }
  }

  const getIcon = (ua: string) => {
    if (!ua) return <Monitor className="w-5 h-5" />
    if (ua.toLowerCase().includes("mobile")) return <Smartphone className="w-5 h-5" />
    return <Laptop className="w-5 h-5" />
  }

  useEffect(() => {
    // Listen to devices collection in real-time
    const q = collection(firestore, "devices")
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setError(null)
      const list = snapshot.docs.map(doc => ({
        deviceId: doc.id,
        ...doc.data()
      })) as DeviceSession[]

      // Sort: Current device first, then by lastActive
      list.sort((a, b) => {
        if (a.deviceId === currentDeviceId) return -1
        if (b.deviceId === currentDeviceId) return 1
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
      })

      setDevices(list)
      setLoading(false)
    }, (err) => {
      console.error("Devices listener error", err)
      if (err.code === 'resource-exhausted') {
        setError("تجاوز النظام الحد المسموح من القراءات اليومية (Quota Exceeded). يرجى المحاولة غداً.")
      } else {
        setError("حدث خطأ في جلب الأجهزة.")
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [currentDeviceId])

  // ... (rest of code)

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold block mb-1">تنبيه:</strong>
          <span className="block">{error}</span>
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>الأجهزة المتصلة (Online Monitor)</CardTitle>
              <CardDescription>مراقبة الأجهزة المتصلة وحالتها وحالة المزامنة</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {devices.map((device) => {
              // ... map logic ...
              const isCurrent = device.deviceId === currentDeviceId
              const isOnline = (new Date().getTime() - new Date(device.lastActive).getTime()) < 120000 // 2 minutes

              return (
                <div key={device.deviceId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 relative">
                      {getIcon(device.userAgent)}
                      {isOnline && <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm block">{device.username || "Unknown"}</span>
                        <Badge variant="secondary" className="text-[10px] h-5">{device.role || "User"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-muted-foreground">{device.deviceId.substring(0, 8)}...</span>
                        {isCurrent && <Badge variant="default" className="text-[10px] h-5">الجهاز الحالي</Badge>}
                        {isOnline ? <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">متصل الآن</Badge> : <Badge variant="outline" className="text-slate-500">غير متصل</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-1">
                        <div>
                          {formatDistanceToNow(new Date(device.lastActive), { addSuffix: true, locale: ar })}
                        </div>
                        {device.syncStatus && (
                          <div className="flex gap-3 text-xs font-medium text-slate-600">
                            <span className="flex items-center gap-1"><Database className="w-3 h-3" /> منتجات: {device.syncStatus.productsCount}</span>
                            <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> حركات: {device.syncStatus.transactionsCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 items-end">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {!isCurrent && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={device.command === 'force_resync'}
                            onClick={() => sendCommand(device.deviceId, 'force_resync')}
                          >
                            <RefreshCw className={`w-3 h-3 mr-1 ${device.command === 'force_resync' ? 'animate-spin' : ''}`} />
                            {device.command === 'force_resync' ? 'جاري الإرسال...' : 'تحديث إجباري'}
                          </Button>

                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={device.command === 'wipe_and_logout'}
                            onClick={() => sendCommand(device.deviceId, 'wipe_and_logout')}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> حذف البيانات والخروج
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                        onClick={() => handleDeleteDevice(device.deviceId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {device.commandStatus && (
                      <Badge variant={device.commandStatus.type === 'success' ? 'default' : device.commandStatus.type === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {device.commandStatus.type === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
                        {device.commandStatus.message}
                        <span className="opacity-50 mx-1">({formatDistanceToNow(new Date(device.commandStatus.timestamp), { addSuffix: true, locale: ar })})</span>
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}

            {devices.length === 0 && !loading && !error && (
              <div className="text-center py-8 text-muted-foreground">لا توجد أجهزة مسجلة</div>
            )}
            {devices.length === 0 && !loading && error && (
              <div className="text-center py-8 text-muted-foreground">تعذر تحميل القائمة</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
