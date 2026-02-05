"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchAsset, AssetStatusReport } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { FileText, ArrowLeft, Download, CheckCircle, AlertTriangle, XCircle, Wrench } from "lucide-react"

interface BranchAssetStatusReportProps {
    branchId: string
    branchName?: string
    onBack?: () => void
}

const STATUS_CONFIG = {
    new: { label: "جديد / New", color: "bg-blue-500", icon: CheckCircle },
    good: { label: "جيد / Good", color: "bg-green-500", icon: CheckCircle },
    needs_maintenance: { label: "يحتاج صيانة / Needs Maintenance", color: "bg-yellow-500", icon: AlertTriangle },
    damaged: { label: "تالف / Damaged", color: "bg-red-500", icon: XCircle },
    disposed: { label: "مستبعد / Disposed", color: "bg-gray-500", icon: XCircle },
    lost: { label: "مفقود / Lost", color: "bg-red-700", icon: XCircle }
}

export function BranchAssetStatusReport({ branchId, branchName, onBack }: BranchAssetStatusReportProps) {
    const [notes, setNotes] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)

    // Get branch assets
    const assets = useLiveQuery(
        () => db.branchAssets.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Get recent reports
    const recentReports = useLiveQuery(
        () => db.assetStatusReports
            .where("branchId").equals(branchId)
            .reverse()
            .limit(5)
            .toArray(),
        [branchId]
    ) || []

    // Calculate stats
    const stats = useMemo(() => {
        return {
            new: assets.filter(a => a.status === "new").length,
            good: assets.filter(a => a.status === "good").length,
            needs_maintenance: assets.filter(a => a.status === "needs_maintenance").length,
            damaged: assets.filter(a => a.status === "damaged").length,
            disposed: assets.filter(a => a.status === "disposed").length,
            lost: assets.filter(a => a.status === "lost").length
        }
    }, [assets])

    const handleGenerateReport = async () => {
        if (assets.length === 0) {
            toast({ title: "لا توجد أصول", description: "لا يمكن إنشاء تقرير بدون أصول", variant: "destructive" })
            return
        }

        setIsGenerating(true)
        try {
            const now = new Date().toISOString()

            const report: AssetStatusReport = {
                id: uuidv4(),
                branchId,
                branchName,
                totalAssets: assets.length,
                assetsByStatus: stats,
                assets: assets.map(a => ({
                    assetId: a.id,
                    assetName: a.name,
                    status: a.status,
                    condition: a.condition
                })),
                generatedBy: "branch",
                generatedAt: now,
                notes: notes || undefined
            }

            await db.assetStatusReports.add(report)

            toast({
                title: "تم إنشاء التقرير",
                description: "تم حفظ تقرير حالة الأصول بنجاح"
            })

            setNotes("")
        } catch (error) {
            console.error("Generate report error:", error)
            toast({ title: "خطأ", description: "فشل إنشاء التقرير", variant: "destructive" })
        } finally {
            setIsGenerating(false)
        }
    }

    const getStatusBadge = (status: string) => {
        const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
        if (!config) return <Badge>{status}</Badge>
        return (
            <Badge className={`${config.color} text-white`}>
                {config.label}
            </Badge>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    )}
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Asset Status Report / تقرير حالة الأصول
                    </h2>
                </div>
            </div>

            {/* Stats by Status */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <Card key={key} className={stats[key as keyof typeof stats] > 0 ? "border-2" : ""}
                        style={{ borderColor: stats[key as keyof typeof stats] > 0 ? config.color.replace("bg-", "") : undefined }}>
                        <CardContent className="p-3 text-center">
                            <div className={`text-2xl font-bold`}>{stats[key as keyof typeof stats]}</div>
                            <div className="text-xs text-muted-foreground">{config.label.split(" / ")[0]}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Assets List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Current Assets / الأصول الحالية ({assets.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {assets.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No assets found</p>
                            <p className="text-xs">لا توجد أصول</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Asset / الأصل</TableHead>
                                    <TableHead>Category / التصنيف</TableHead>
                                    <TableHead>Status / الحالة</TableHead>
                                    <TableHead>Condition / الوضع</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {assets.map((asset, idx) => (
                                    <TableRow key={asset.id}>
                                        <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                        <TableCell className="font-medium">{asset.name}</TableCell>
                                        <TableCell className="text-sm">{asset.category}</TableCell>
                                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{asset.condition || "-"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Generate Report */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Generate Report / إنشاء تقرير</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Notes (Optional) / ملاحظات</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add any notes about the current status..."
                            rows={3}
                        />
                    </div>
                    <Button onClick={handleGenerateReport} disabled={isGenerating || assets.length === 0} className="w-full">
                        <Download className="w-4 h-4 ml-2" />
                        {isGenerating ? "جاري الإنشاء..." : "Generate & Save Report / إنشاء وحفظ التقرير"}
                    </Button>
                </CardContent>
            </Card>

            {/* Recent Reports */}
            {recentReports.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent Reports / التقارير السابقة</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date / التاريخ</TableHead>
                                    <TableHead className="text-center">Assets / الأصول</TableHead>
                                    <TableHead>Notes / ملاحظات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentReports.map(report => (
                                    <TableRow key={report.id}>
                                        <TableCell className="text-xs">
                                            {new Date(report.generatedAt).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                        <TableCell className="text-center font-bold">{report.totalAssets}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{report.notes || "-"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
