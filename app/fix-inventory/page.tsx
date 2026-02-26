"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/lib/db'
import { syncProductsBatch } from '@/lib/firebase-sync-engine'
import { CheckCircle, AlertCircle, Loader2, Cloud, Calculator } from 'lucide-react'

export default function FixInventoryPage() {
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [updatedCount, setUpdatedCount] = useState(0)
    const [repairedLinksCount, setRepairedLinksCount] = useState(0)
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done'>('idle')

    const runFix = async () => {
        setStatus('running')
        setMessage('جاري جلب البيانات وتحليل الروابط المفقودة...')

        try {
            // 1. Fetch All Data
            const products = await db.products.toArray()
            const transactions = await db.transactions.toArray()
            const issues = await db.issues.toArray()
            const returns = await db.returns.toArray()

            const productMap = new Map(products.map(p => [p.id, p]))
            const productNameMap = new Map(products.map(p => [p.productName.trim().toLowerCase(), p]))

            // Stats Accumulators
            const stats = new Map<string, { purchases: number, issues: number, returns: number }>()
            products.forEach(p => stats.set(p.id, { purchases: 0, issues: 0, returns: 0 }))

            let repairedLinks = 0
            const transactionsToUpdate: any[] = []
            const issuesToUpdate: any[] = []
            const returnsToUpdate: any[] = []

            setMessage(`جاري فحص ${transactions.length} معاملة...`)

            // 2. Process Transactions (Smart Link)
            for (const t of transactions) {
                let targetProductId = t.productId
                let p = productMap.get(targetProductId)

                // Try to recover orphan by name
                if (!p) {
                    const match = productNameMap.get(t.productName.trim().toLowerCase())
                    if (match) {
                        targetProductId = match.id
                        p = match
                        // Schedule repair
                        t.productId = match.id
                        t.productCode = match.productCode // Update code if available to be safe
                        transactionsToUpdate.push(t)
                        repairedLinks++
                    }
                }

                if (p) {
                    const s = stats.get(targetProductId)!
                    const qty = Number(t.quantity) || 0
                    if (t.type === 'purchase') s.purchases += qty
                    else if (t.type === 'sale') s.issues += qty
                    else if (t.type === 'return') s.returns += qty
                }
            }

            // 3. Process Issues (Smart Link)
            for (const issue of issues) {
                // Issues have nested items
                let issueDirty = false
                for (const item of issue.products) {
                    let targetProductId = item.productId
                    let p = productMap.get(targetProductId)

                    if (!p) {
                        const match = productNameMap.get(item.productName.trim().toLowerCase())
                        if (match) {
                            targetProductId = match.id
                            p = match
                            item.productId = match.id
                            item.productCode = match.productCode
                            issueDirty = true
                            repairedLinks++
                        }
                    }

                    if (p && issue.delivered) {
                        const s = stats.get(targetProductId)!
                        s.issues += Number((item as any).quantityBase || item.quantity) || 0
                    }
                }
                if (issueDirty) issuesToUpdate.push(issue)
            }

            // 4. Process Returns (Smart Link)
            for (const ret of returns) {
                let returnDirty = false
                for (const item of ret.products) {
                    let targetProductId = item.productId
                    let p = productMap.get(targetProductId)

                    if (!p) {
                        const match = productNameMap.get(item.productName.trim().toLowerCase())
                        if (match) {
                            targetProductId = match.id
                            p = match
                            item.productId = match.id
                            item.productCode = match.productCode
                            returnDirty = true
                            repairedLinks++
                        }
                    }

                    if (p && (ret.status === 'approved' || ret.status === 'completed')) {
                        const s = stats.get(targetProductId)!
                        s.returns += Number((item as any).quantityBase || item.quantity) || 0
                    }
                }
                if (returnDirty) returnsToUpdate.push(ret)
            }

            // 5. Apply Updates
            setMessage('جاري حفظ التعديلات...')

            // Save Repaired Records Local
            if (transactionsToUpdate.length) await db.transactions.bulkPut(transactionsToUpdate)
            if (issuesToUpdate.length) await db.issues.bulkPut(issuesToUpdate)
            if (returnsToUpdate.length) await db.returns.bulkPut(returnsToUpdate)

            setRepairedLinksCount(repairedLinks)

            // Update Products
            let updated = 0
            const productsToSync = []

            for (const p of products) {
                const s = stats.get(p.id)!
                const calculatedCurrentStock = (Number(p.openingStock) || 0) + s.purchases + s.returns - s.issues

                let needsUpdate = false

                if (p.purchases !== s.purchases) { p.purchases = s.purchases; needsUpdate = true; }
                if (p.issues !== s.issues) { p.issues = s.issues; needsUpdate = true; }
                if (p.returns !== s.returns) { p.returns = s.returns; needsUpdate = true; }

                // Only update stock if different to avoid noise, but ensure calculation is enforced
                if (p.currentStock !== calculatedCurrentStock) {
                    p.currentStock = calculatedCurrentStock
                    p.currentStockValue = calculatedCurrentStock * (Number(p.averagePrice) || Number(p.price) || 0)
                    needsUpdate = true
                }
                if (p.inventoryCount === undefined || p.inventoryCount === null) {
                    p.inventoryCount = calculatedCurrentStock
                    needsUpdate = true
                }

                if (needsUpdate) {
                    p.updatedAt = new Date().toISOString()
                    updated++
                    productsToSync.push(p)
                }
            }

            if (updated > 0) {
                await db.products.bulkPut(productsToSync)
            }

            setUpdatedCount(updated)

            // Auto sync to Firebase
            setSyncStatus('syncing')
            setMessage(`تم تحديث ${updated} منتجات وإصلاح ${repairedLinks} رابط. جاري الرفع...`)

            try {
                if (productsToSync.length > 0) {
                    await syncProductsBatch(productsToSync)
                }
                // Trigger background sync for repaired transactions is too heavy, let's rely on future usage or manual re-sync if needed.
                // But typically transactions sync on creation. We fixed local ID. 
                // Ideally we should sync repaired transactions too.
                // For now, product stats are the priority.

                setSyncStatus('done')
                setStatus('success')
                setMessage(`تم الإصلاح بنجاح! طابقنا ${repairedLinks} سجل مفقود وعدّلنا ${updated} منتج.`)
            } catch (syncErr) {
                console.error('Firebase sync failed:', syncErr)
                setStatus('success')
                setMessage(`تم الإصلاح محلياً (${updated} منتج)، ولكن فشل الرفع للسحابة.`)
            }

            setTimeout(() => {
                window.location.href = '/'
            }, 4000)

        } catch (error) {
            console.error('Fix failed:', error)
            setStatus('error')
            setMessage('فشل عملية الإصلاح.')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">إصلاح شامل + الذكاء في الربط</CardTitle>
                    <CardDescription className="text-center">
                        إعادة بناء المخزون + استعادة السجلات المفقودة عبر الاسم
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status === 'idle' && (
                        <>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                                <p className="font-semibold flex items-center gap-2">
                                    <Calculator className="w-4 h-4" />
                                    المستوى المتقدم للإصلاح:
                                </p>
                                <ul className="list-disc list-inside space-y-1 text-xs opacity-90">
                                    <li>نبحث عن السجلات التي "فقدت" ارتباطها بالمنتج.</li>
                                    <li>إذا وجدنا معاملة لمنتج محذوف، نحاول ربطها بالمنتج الجديد عن طريق <strong>تطابق الاسم</strong>.</li>
                                    <li>نعيد حساب (المشتريات، المبيعات، المرتجعات) بدقة متناهية.</li>
                                    <li>نصحح الأرصدة ونرفع التعديلات.</li>
                                </ul>
                            </div>
                            <Button
                                onClick={runFix}
                                className="w-full"
                                size="lg"
                            >
                                ابدأ الإصلاح الذكي
                            </Button>
                        </>
                    )}

                    {status === 'running' && (
                        <div className="text-center py-8">
                            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                            <p className="text-lg font-semibold">{message}</p>
                            {syncStatus === 'syncing' && (
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <Cloud className="h-5 w-5 animate-pulse text-blue-600" />
                                    <span className="text-sm text-gray-600">جاري الحفظ والمزامنة...</span>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="text-center py-8">
                            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                            <p className="text-xl font-bold text-green-700 mb-2">{message}</p>
                            <p className="text-sm text-gray-600">سيتم نقلك للرئيسية...</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center py-8">
                            <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
                            <p className="text-xl font-bold text-red-700 mb-4">{message}</p>
                            <Button onClick={runFix} variant="destructive">
                                إعادة المحاولة
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
