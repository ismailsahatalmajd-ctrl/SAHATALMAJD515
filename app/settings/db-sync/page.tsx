"use client"
import React, { useState } from 'react'
import { 
  getProducts, 
  getTransactions, 
  getBranches, 
  getIssues, 
  getReturns,
  getAdjustments,
  syncAllFromServer
} from "@/lib/storage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CloudUpload, CloudDownload } from "lucide-react"

export default function DbSyncPage() {
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [status, setStatus] = useState<string[]>([])

  const addStatus = (msg: string) => setStatus(prev => [...prev, msg])

  async function pushData(endpoint: string, data: any[], label: string) {
    if (data.length === 0) {
      addStatus(`ℹ️ لا توجد ${label} لرفعها`)
      return
    }
    addStatus(`⏳ جاري رفع ${data.length} ${label}...`)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed')
      addStatus(`✅ تم رفع ${label} بنجاح`)
    } catch (e) {
      addStatus(`❌ فشل رفع ${label}`)
      console.error(e)
    }
  }

  async function handlePushAll() {
    setPushing(true)
    setStatus([])
    try {
       // Check health first
       const healthRes = await fetch('/api/health')
       const health = await healthRes.json()
       if (!health.hasServiceKey) {
         addStatus('❌ تنبيه: مفتاح الخدمة غير موجود، قد يفشل الرفع إذا كانت الجداول محمية.')
       }
       
      await pushData('/api/products', getProducts(), 'منتجات')
      await pushData('/api/transactions', getTransactions(), 'معاملات')
      await pushData('/api/branches', getBranches(), 'فروع')
      await pushData('/api/issues', getIssues(), 'صرف')
      await pushData('/api/returns', getReturns(), 'مرتجعات')
      await pushData('/api/adjustments', getAdjustments(), 'تسويات')
      addStatus('🎉 اكتملت عملية الرفع')
    } catch (e) {
      addStatus('❌ حدث خطأ غير متوقع')
    } finally {
      setPushing(false)
    }
  }

  async function handlePullAll() {
    setPulling(true)
    setStatus([])
    try {
      // Check health first
      const healthRes = await fetch('/api/health')
      const health = await healthRes.json()
      if (!health.hasServiceKey) {
        addStatus('❌ خطأ فادح: مفتاح الخدمة (Service Role Key) مفقود في إعدادات Vercel.')
        addStatus('⚠️ لا يمكن القراءة من قاعدة البيانات بدونه.')
        return
      }

      addStatus('⏳ جاري سحب البيانات من السحابة...')
      await syncAllFromServer()
      addStatus('✅ تم السحب بنجاح')
    } catch (e) {
      addStatus('❌ فشل السحب')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="container py-10 max-w-3xl">
       <Card>
         <CardHeader>
           <CardTitle>مزامنة البيانات السحابية</CardTitle>
           <CardDescription>
             ارفع جميع بياناتك المحلية إلى السحابة لتظهر في الأجهزة الأخرى.
             <br />
             استخدم هذا الزر إذا كانت البيانات تظهر في جهاز واحد فقط.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="flex gap-4">
             <Button onClick={handlePushAll} disabled={pushing || pulling} className="flex-1">
               {pushing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-2 h-4 w-4" />}
               رفع الكل إلى السحابة
             </Button>
             <Button onClick={handlePullAll} variant="outline" disabled={pushing || pulling} className="flex-1">
               {pulling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
               سحب الكل من السحابة
             </Button>
           </div>
           
           <div className="bg-muted p-4 rounded-md text-sm font-mono h-64 overflow-y-auto whitespace-pre-wrap">
             {status.map((s, i) => <div key={i} className="mb-1">{s}</div>)}
             {status.length === 0 && <div className="text-muted-foreground">اضغط على "رفع الكل" لبدء المزامنة...</div>}
           </div>
         </CardContent>
       </Card>
    </div>
  )
}
