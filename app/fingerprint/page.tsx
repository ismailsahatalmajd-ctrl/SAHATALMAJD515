"use client"

import { useState, useEffect } from "react"
import { 
  Plus, Info, Save, Trash2, Search, UserCheck
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { updateEmployee } from "@/lib/storage"

export default function FingerprintPage() {
  const { toast } = useToast()
  
  // Data fetching
  const employees = useLiveQuery(() => db.employees.toArray()) || []

  // --- ZKTECO STATE & LOGIC ---
  const [zk_ip, setZkIp] = useState("192.168.8.186")
  const [zk_port, setZkPort] = useState("4370")
  const [zk_status, setZkStatus] = useState<"idle" | "connecting" | "syncing" | "success" | "error">("idle")

  const handleZkSync = async () => {
    setZkStatus("syncing")
    try {
      toast({ 
        title: "جاري الاتصال بجهاز البصمة...", 
        description: `IP: ${zk_ip}:${zk_port}`,
      })
      
      // Check if we are in Electron
      const isElectron = typeof window !== 'undefined' && (window as any).electron?.zkSync
      
      if (!isElectron) {
        setZkStatus("error")
        toast({ 
          title: "حدث خطأ", 
          description: "يجب تشغيل التطبيق من خلال برنامج الكمبيوتر (Electron) للاتصال المباشر بجهاز البصمة.",
          variant: "destructive"
        })
        return
      }

      // Call the bridge
      const response = await (window as any).electron.zkSync({ ip: zk_ip, port: Number(zk_port) })
      
      if (response.success) {
        setZkStatus("success")
        toast({ title: "تم مزامنة البيانات بنجاح" })
      } else {
        setZkStatus("error")
        toast({ title: "فشل المزامنة", description: response.error, variant: "destructive" })
      }
    } catch (error) {
      setZkStatus("error")
      toast({ title: "فشل الاتصال بجهاز البصمة", variant: "destructive" })
    }
  }

  const handleUpdateFingerprintId = async (empId: string, fId: string) => {
    await updateEmployee(empId, { fingerprintId: fId })
    toast({ title: "تم تحديث رقم البصمة" })
  }

  return (
    <main className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-3xl font-black">نظام إدارة البصمة</h1>
          <p className="text-slate-400">Fingerprint Management System (ZKTeco)</p>
        </div>
        <UserCheck className="h-12 w-12 text-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-xl border-primary/10">
            <CardHeader className="bg-primary/5 py-4 border-b">
              <CardTitle className="text-xl font-bold flex items-center gap-3">
                <Plus className="h-6 w-6 text-primary" /> إعدادات الجهاز / Device Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="font-black">عنوان الـ IP / IP Address</Label>
                <Input value={zk_ip} onChange={e => setZkIp(e.target.value)} placeholder="192.168.8.186" className="h-12 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="font-black">المنفذ / Port</Label>
                <Input value={zk_port} onChange={e => setZkPort(e.target.value)} placeholder="4370" className="h-12 font-bold" />
              </div>
              <Button 
                onClick={handleZkSync} 
                disabled={zk_status === "syncing"}
                className="w-full h-14 text-lg font-black"
              >
                {zk_status === "syncing" ? "جاري المزامنة..." : "بدء المزامنة / Start Sync"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                يجب أن يكون جهاز البصمة والكمبيوتر على نفس الشبكة المحلية.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-blue-100 bg-blue-50/30">
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-800">
                <Info className="h-5 w-5" /> كيف يعمل الربط التلقائي؟
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-sm space-y-3 text-blue-900 text-right">
              <p>1. قم بتوصيل جهاز البصمة (ZKTeco MB20-VL) بالشبكة عبر كيبل LAN.</p>
              <p>2. تأكد من ثبات الـ IP الخاص بالجهاز ({zk_ip}).</p>
              <p>3. اربط كل موظف برقم البصمة الخاص به في الجدول الجانبي.</p>
              <p>4. عند الضغط على "بدء المزامنة"، سيقوم النظام بسحب سجلات الحضور وترجمتها تلقائياً إلى غياب أو إضافي.</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="shadow-xl border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-900 text-white py-4 px-6">
              <CardTitle className="font-black">ربط الموظفين بالبصمة / Employee Mapping</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 bg-slate-50 border-b flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="بحث عن موظف..." className="h-10 pr-10" />
                </div>
              </div>
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 font-black">اسم الموظف / Employee</th>
                    <th className="p-4 text-center font-black">رقم البصمة (Device ID)</th>
                    <th className="p-4 text-center font-black">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold">{emp.name}</td>
                      <td className="p-4 text-center">
                        <Input 
                          placeholder="ID" 
                          value={emp.fingerprintId || ""} 
                          onChange={(e) => handleUpdateFingerprintId(emp.id, e.target.value)}
                          className="h-10 w-24 mx-auto text-center font-bold"
                        />
                      </td>
                      <td className="p-4 text-center text-xs">
                        {emp.fingerprintId ? (
                          <Badge className="bg-green-100 text-green-700 border-0">مرتبط / Linked</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">غير مرتبط</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
