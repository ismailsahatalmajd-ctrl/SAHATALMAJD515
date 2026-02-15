"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { getDeviceId } from "@/lib/device"
import { db as firestore } from "@/lib/firebase"
import { collection, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore"
import { Laptop, Smartphone, Monitor, Trash2, ShieldAlert, RefreshCw, Eye, Database, CheckCircle, AlertCircle, Users, Activity } from "lucide-react"
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
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')

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

  const handleBulkDelete = async () => {
    if (selectedDevices.size === 0) {
      toast({ title: "لم يتم تحديد أي جهاز", variant: "destructive" })
      return
    }

    if (!confirm(`هل أنت متأكد من حذف ${selectedDevices.size} جهاز؟`)) return

    try {
      const batch = writeBatch(firestore)
      selectedDevices.forEach(deviceId => {
        batch.delete(doc(firestore, "devices", deviceId))
      })
      await batch.commit()
      toast({ title: `تم حذف ${selectedDevices.size} جهاز بنجاح` })
      setSelectedDevices(new Set())
    } catch (e) {
      toast({ title: "فشل حذف الأجهزة", variant: "destructive" })
    }
  }

  const handleBulkUpdate = async () => {
    if (selectedDevices.size === 0) {
      toast({ title: "لم يتم تحديد أي جهاز", variant: "destructive" })
      return
    }

    if (!confirm(`هل أنت متأكد من إرسال أمر التحديث لـ ${selectedDevices.size} جهاز؟`)) return

    try {
      const batch = writeBatch(firestore)
      selectedDevices.forEach(deviceId => {
        batch.update(doc(firestore, "devices", deviceId), {
          command: 'force_resync',
          commandTimestamp: new Date().toISOString(),
          commandStatus: null
        })
      })
      await batch.commit()
      toast({ title: `تم إرسال أمر التحديث لـ ${selectedDevices.size} جهاز` })
      setSelectedDevices(new Set())
    } catch (e) {
      toast({ title: "فشل إرسال الأوامر", variant: "destructive" })
    }
  }

  const handleDeleteOldDevices = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const oldDevices = devices.filter(d =>
      new Date(d.lastActive) < sevenDaysAgo && d.deviceId !== currentDeviceId
    )

    if (oldDevices.length === 0) {
      toast({ title: "لا توجد أجهزة قديمة للحذف" })
      return
    }

    if (!confirm(`تم العثور على ${oldDevices.length} جهاز غير نشط منذ أكثر من 7 أيام. هل تريد حذفها؟`)) return

    try {
      const batch = writeBatch(firestore)
      oldDevices.forEach(device => {
        batch.delete(doc(firestore, "devices", device.deviceId))
      })
      await batch.commit()
      toast({ title: `تم حذف ${oldDevices.length} جهاز قديم` })
    } catch (e) {
      toast({ title: "فشل حذف الأجهزة القديمة", variant: "destructive" })
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

  const toggleSelectDevice = (deviceId: string) => {
    const newSelected = new Set(selectedDevices)
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId)
    } else {
      newSelected.add(deviceId)
    }
    setSelectedDevices(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedDevices.size === devices.filter(d => d.deviceId !== currentDeviceId).length) {
      setSelectedDevices(new Set())
    } else {
      setSelectedDevices(new Set(devices.filter(d => d.deviceId !== currentDeviceId).map(d => d.deviceId)))
    }
  }

  const getIcon = (ua: string) => {
    if (!ua) return <Monitor className="w-5 h-5" />
    if (ua.toLowerCase().includes("mobile")) return <Smartphone className="w-5 h-5" />
    return <Laptop className="w-5 h-5" />
  }

  const getAccountTypeBadge = (role: string) => {
    if (role === 'admin') {
      return <Badge className="bg-gradient-to-r from-amber-500 to-red-500 text-white">حساب المدير</Badge>
    } else if (role === 'branch') {
      return <Badge variant="default">حساب الفرع</Badge>
    }
    return <Badge variant="secondary">غير معروف</Badge>
  }

  useEffect(() => {
    const q = collection(firestore, "devices")
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setError(null)
      const list = snapshot.docs.map(doc => ({
        deviceId: doc.id,
        ...doc.data()
      })) as DeviceSession[]

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

  // Group devices by username
  const groupedDevices = useMemo(() => {
    const groups: Record<string, DeviceSession[]> = {}
    devices.forEach(device => {
      const username = device.username || 'Unknown'
      if (!groups[username]) groups[username] = []
      groups[username].push(device)
    })
    return groups
  }, [devices])

  // Statistics
  const stats = useMemo(() => {
    const now = new Date().getTime()
    const onlineCount = devices.filter(d => (now - new Date(d.lastActive).getTime()) < 120000).length
    const adminCount = devices.filter(d => d.role === 'admin').length
    const branchCount = devices.filter(d => d.role === 'branch').length

    return {
      total: devices.length,
      online: onlineCount,
      admin: adminCount,
      branch: branchCount
    }
  }, [devices])

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold block mb-1">تنبيه:</strong>
          <span className="block">{error}</span>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأجهزة</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Monitor className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">متصلة الآن</p>
                <p className="text-2xl font-bold text-green-600">{stats.online}</p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">حسابات المديرين</p>
                <p className="text-2xl font-bold text-amber-600">{stats.admin}</p>
              </div>
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">حسابات الفروع</p>
                <p className="text-2xl font-bold text-blue-600">{stats.branch}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>الأجهزة المتصلة (Online Monitor)</CardTitle>
              <CardDescription>مراقبة الأجهزة المتصلة وحالتها وحالة المزامنة</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                عرض قائمة
              </Button>
              <Button
                variant={viewMode === 'grouped' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grouped')}
              >
                تجميع حسب المستخدم
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions */}
          {selectedDevices.size > 0 && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {selectedDevices.size} جهاز محدد
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleBulkUpdate}>
                  <RefreshCw className="w-4 h-4 ml-2" />
                  تحديث المحددة
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="w-4 h-4 ml-2" />
                  حذف المحددة
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDevices(new Set())}>
                  إلغاء التحديد
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={toggleSelectAll}>
              {selectedDevices.size === devices.filter(d => d.deviceId !== currentDeviceId).length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeleteOldDevices}>
              <Trash2 className="w-4 h-4 ml-2" />
              حذف الأجهزة القديمة (+7 أيام)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Force reload page to trigger new heartbeat
                window.location.reload()
              }}
            >
              <RefreshCw className="w-4 h-4 ml-2" />
              تحديث البيانات
            </Button>
          </div>

          {/* List View */}
          {viewMode === 'list' && (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrent = device.deviceId === currentDeviceId
                const isOnline = (new Date().getTime() - new Date(device.lastActive).getTime()) < 120000

                return (
                  <div key={device.deviceId} className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                    {!isCurrent && (
                      <Checkbox
                        checked={selectedDevices.has(device.deviceId)}
                        onCheckedChange={() => toggleSelectDevice(device.deviceId)}
                        className="mt-1"
                      />
                    )}

                    <div className="flex-1 grid gap-3 sm:grid-cols-[auto_1fr_auto]">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 relative">
                          {getIcon(device.userAgent)}
                          {isOnline && <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-bold text-sm">{device.username || "Unknown"}</span>
                            {getAccountTypeBadge(device.role)}
                            {isCurrent && <Badge variant="default" className="text-[10px] h-5">الجهاز الحالي</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{device.deviceId.substring(0, 12)}...</span>
                            {isOnline ?
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">متصل الآن</Badge> :
                              <Badge variant="outline" className="text-slate-500">غير متصل</Badge>
                            }
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>{formatDistanceToNow(new Date(device.lastActive), { addSuffix: true, locale: ar })}</div>
                        {device.syncStatus && (
                          <div className="flex gap-3 text-xs font-medium text-slate-600">
                            <span className="flex items-center gap-1"><Database className="w-3 h-3" /> منتجات: {device.syncStatus.productsCount}</span>
                            <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> حركات: {device.syncStatus.transactionsCount}</span>
                          </div>
                        )}
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
                                {device.command === 'force_resync' ? 'جاري الإرسال...' : 'تحديث'}
                              </Button>

                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={device.command === 'wipe_and_logout'}
                                onClick={() => sendCommand(device.deviceId, 'wipe_and_logout')}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> حذف بيانات
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
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Grouped View */}
          {viewMode === 'grouped' && (
            <div className="space-y-4">
              {Object.entries(groupedDevices).map(([username, userDevices]) => (
                <Card key={username} className="overflow-hidden">
                  <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-bold">{username}</span>
                        {getAccountTypeBadge(userDevices[0].role)}
                        <Badge variant="outline" className="text-xs">
                          {userDevices.length} {userDevices.length === 1 ? 'جهاز' : 'أجهزة'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {userDevices.map(device => {
                        const isCurrent = device.deviceId === currentDeviceId
                        const isOnline = (new Date().getTime() - new Date(device.lastActive).getTime()) < 120000

                        return (
                          <div key={device.deviceId} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                            <div className="flex items-center gap-3">
                              {getIcon(device.userAgent)}
                              <div>
                                <div className="font-mono text-xs text-muted-foreground">{device.deviceId.substring(0, 12)}...</div>
                                <div className="text-xs">{formatDistanceToNow(new Date(device.lastActive), { addSuffix: true, locale: ar })}</div>
                              </div>
                              {isCurrent && <Badge className="text-[10px]">الحالي</Badge>}
                              {isOnline && <Badge variant="outline" className="text-green-600 text-[10px]">متصل</Badge>}
                            </div>
                            {!isCurrent && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDeleteDevice(device.deviceId)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {devices.length === 0 && !loading && !error && (
            <div className="text-center py-8 text-muted-foreground">لا توجد أجهزة مسجلة</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
