"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/lib/db'
import { syncProductsBatch } from '@/lib/firebase-sync-engine'
import { CheckCircle, AlertCircle, Loader2, Cloud } from 'lucide-react'

export default function FixInventoryPage() {
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [updatedCount, setUpdatedCount] = useState(0)
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done'>('idle')

    const runFix = async () => {
        setStatus('running')
        setMessage('جاري تحديث المنتجات...')

        try {
            const products = await db.products.toArray()
            let updated = 0
            const productsToSync = []

            for (const p of products) {
                const opening = Number(p.openingStock || 0)
                const purchases = Number(p.purchases || 0)
                const issues = Number(p.issues || 0)
                
                // Calculate: Opening + Purchases - Issues
                const calculatedCurrentStock = opening + purchases - issues

                let needsUpdate = false

                // Update currentStock if different
                if (p.currentStock !== calculatedCurrentStock) {
                    p.currentStock = calculatedCurrentStock
                    p.currentStockValue = calculatedCurrentStock * (p.averagePrice || p.price || 0)
                    needsUpdate = true
                }

                // Initialize inventoryCount if missing
                if (p.inventoryCount === undefined || p.inventoryCount === null) {
                    p.inventoryCount = calculatedCurrentStock
                    needsUpdate = true
                }

                if (needsUpdate) {
                    p.updatedAt = new Date().toISOString()
                    await db.products.put(p)
                    updated++
                }

                productsToSync.push(p)
            }

            setUpdatedCount(updated)

            // Auto sync to Firebase
            setSyncStatus('syncing')
            setMessage(`تم تحديث ${updated} منتجات. جاري رفع البيانات إلى Firebase...`)

            try {
                await syncProductsBatch(productsToSync)
                setSyncStatus('done')
                setStatus('success')
                setMessage(`تم تحديث ${updated} منتجات بنجاح ورفع البيانات إلى Firebase!`)
            } catch (syncErr) {
                console.error('Firebase sync failed:', syncErr)
                setStatus('success')
                setMessage(`تم تحديث ${updated} منتجات محلياً، لكن فشل الرفع إلى Firebase. سيتم إعادة المحاولة تلقائياً.`)
            }

            // Auto reload after 3 seconds
            setTimeout(() => {
                window.location.href = '/'
            }, 3000)

        } catch (error) {
            console.error('Fix failed:', error)
            setStatus('error')
            setMessage('فشل التحديث! حاول مرة أخرى.')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">إصلاح الجرد والمزامنة</CardTitle>
                    <CardDescription className="text-center">
                        تحديث المخزون ورفع البيانات إلى Firebase
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status === 'idle' && (
                        <>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                                <p className="font-semibold mb-2">⚠️ تنبيه:</p>
                                <p>سيتم حساب المخزون الحالي بناءً على المعادلة:</p>
                                <p className="font-mono text-xs mt-2 bg-yellow-100 p-2 rounded">
                                    المخزون = الرصيد الافتتاحي + المشتريات - الصرفيات
                                </p>
                                <p className="text-xs mt-2">سيتم رفع البيانات تلقائياً إلى Firebase.</p>
                            </div>
                            <Button
                                onClick={runFix}
                                className="w-full"
                                size="lg"
                            >
                                ابدأ الإصلاح والرفع
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
                                    <span className="text-sm text-gray-600">مزامنة مع Firebase...</span>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="text-center py-8">
                            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                            <p className="text-xl font-bold text-green-700 mb-2">{message}</p>
                            <p className="text-sm text-gray-600">سيتم إعادة التحميل تلقائياً...</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center py-8">
                            <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
                            <p className="text-xl font-bold text-red-700 mb-4">{message}</p>
                            <Button onClick={runFix} variant="destructive">
                                حاول مرة أخرى
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
