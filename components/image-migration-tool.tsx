"use client"

import { useState } from "react"
import { db } from "@/lib/db"
import { syncProductImageToCloud } from "@/lib/firebase-sync-engine"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CloudUpload, CheckCircle, XCircle } from "lucide-react"

export function ImageMigrationTool() {
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [stats, setStats] = useState({ total: 0, success: 0, failed: 0 })
    const [done, setDone] = useState(false)

    const startMigration = async () => {
        setLoading(true)
        setProgress(0)
        setDone(false)
        setStats({ total: 0, success: 0, failed: 0 })

        try {
            // 1. Fetch all local images
            const images = await db.productImages.toArray()
            const total = images.length
            setStats(s => ({ ...s, total }))

            if (total === 0) {
                setDone(true)
                setLoading(false)
                return
            }

            // 2. Upload in chunks
            let success = 0
            let failed = 0

            const CHUNK_SIZE = 5
            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunk = images.slice(i, i + CHUNK_SIZE)

                await Promise.all(chunk.map(async (img) => {
                    try {
                        if (img.data && img.data.length < 900000) { // Skip insanely large files (approx 900KB limit for safety)
                            await syncProductImageToCloud(img.productId, img.data)
                            success++
                        } else {
                            console.warn(`Skipping image for ${img.productId} - too large`)
                            failed++
                        }
                    } catch (e) {
                        console.error(e)
                        failed++
                    }
                }))

                setStats(s => ({ ...s, success, failed }))
                setProgress(Math.round(((i + chunk.length) / total) * 100))
                await new Promise(r => setTimeout(r, 100)) // Throttle
            }

            setDone(true)

        } catch (e) {
            console.error("Migration failed", e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>مزامنة الصور للسحابة</CardTitle>
                <CardDescription>
                    استخدم هذه الأداة لرفع الصور الموجودة عى هذا الجهاز إلى السحابة، لتظهر في الأجهزة الأخرى.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!loading && !done && (
                    <Button onClick={startMigration} className="w-full">
                        <CloudUpload className="mr-2 h-4 w-4" />
                        بدء رفع الصور ({stats.total || '...'})
                    </Button>
                )}

                {loading && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>جاري الرفع...</span>
                            <span>{progress}%</span>
                        </div>
                        <Progress value={progress} />
                        <div className="text-xs text-muted-foreground flex gap-4">
                            <span>نجاح: {stats.success}</span>
                            <span>فشل/تجاوز: {stats.failed}</span>
                        </div>
                    </div>
                )}

                {done && (
                    <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <span>تمت العملية</span>
                        </div>
                        <div className="text-sm">
                            تم رفع {stats.success} صورة
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setDone(false)}>تم</Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
