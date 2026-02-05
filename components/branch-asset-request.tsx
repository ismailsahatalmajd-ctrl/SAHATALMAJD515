"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { AssetRequest, AssetStatusReport } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Package, ArrowLeft, Plus, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react"

interface BranchAssetRequestProps {
    branchId: string
    branchName?: string
    onBack?: () => void
}

const ASSET_CATEGORIES = [
    { value: "equipment", label: "معدات / Equipment" },
    { value: "appliances", label: "أجهزة / Appliances" },
    { value: "furniture", label: "أثاث / Furniture" },
    { value: "electronics", label: "إلكترونيات / Electronics" },
    { value: "tools", label: "أدوات / Tools" },
    { value: "other", label: "أخرى / Other" }
]

const URGENCY_CONFIG = {
    low: { label: "عادي / Low", color: "secondary" as const },
    medium: { label: "متوسط / Medium", color: "warning" as const },
    high: { label: "عاجل / High", color: "destructive" as const }
}

const STATUS_CONFIG = {
    pending: { label: "قيد المراجعة / Pending", color: "warning" as const, icon: Clock },
    approved: { label: "موافق عليه / Approved", color: "success" as const, icon: CheckCircle },
    rejected: { label: "مرفوض / Rejected", color: "destructive" as const, icon: XCircle },
    fulfilled: { label: "تم التسليم / Fulfilled", color: "default" as const, icon: CheckCircle }
}

export function BranchAssetRequest({ branchId, branchName, onBack }: BranchAssetRequestProps) {
    const [requestedAsset, setRequestedAsset] = useState("")
    const [category, setCategory] = useState("equipment")
    const [reason, setReason] = useState("")
    const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium")
    const [quantity, setQuantity] = useState("1")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Get recent status reports - needed before making a request
    const recentReports = useLiveQuery(
        () => db.assetStatusReports
            .where("branchId").equals(branchId)
            .reverse()
            .limit(1)
            .toArray(),
        [branchId]
    ) || []

    // Get pending requests
    const requests = useLiveQuery(
        () => db.assetRequests
            .where("branchId").equals(branchId)
            .reverse()
            .toArray(),
        [branchId]
    ) || []

    const hasRecentReport = useMemo(() => {
        if (recentReports.length === 0) return false
        const lastReport = recentReports[0]
        const reportDate = new Date(lastReport.generatedAt)
        const daysSinceReport = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24)
        return daysSinceReport <= 30 // Report valid for 30 days
    }, [recentReports])

    const handleSubmitRequest = async () => {
        if (!hasRecentReport) {
            toast({
                title: "مطلوب تقرير حالة",
                description: "يجب إنشاء تقرير حالة الأصول أولاً قبل طلب أصل جديد",
                variant: "destructive"
            })
            return
        }

        if (!requestedAsset.trim()) {
            toast({ title: "خطأ", description: "الرجاء إدخال اسم الأصل المطلوب", variant: "destructive" })
            return
        }
        if (!reason.trim()) {
            toast({ title: "خطأ", description: "الرجاء ذكر سبب الطلب", variant: "destructive" })
            return
        }

        setIsSubmitting(true)
        try {
            const now = new Date().toISOString()
            const lastReport = recentReports[0]

            const request: AssetRequest = {
                id: uuidv4(),
                branchId,
                branchName,
                requestedAsset,
                category,
                reason,
                urgency,
                quantity: Number(quantity) || 1,
                currentAssetsReportId: lastReport?.id,
                currentAssetsReportDate: lastReport?.generatedAt,
                status: "pending",
                requestedBy: "branch",
                requestDate: now,
                createdAt: now,
                updatedAt: now
            }

            await db.assetRequests.add(request)

            // Sync to Firebase
            if (typeof window !== 'undefined') {
                import('@/lib/firebase-sync-engine').then(({ syncAssetRequest }) => {
                    syncAssetRequest(request).catch(console.error)
                })
            }

            toast({
                title: "تم إرسال الطلب",
                description: "سيتم مراجعة طلبك من قبل مسؤول المشتريات"
            })

            // Reset form
            setRequestedAsset("")
            setReason("")
            setQuantity("1")
        } catch (error) {
            console.error("Submit request error:", error)
            toast({ title: "خطأ", description: "فشل إرسال الطلب", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const getStatusBadge = (status: string) => {
        const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
        if (!config) return <Badge>{status}</Badge>
        return <Badge variant={config.color}>{config.label}</Badge>
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                )}
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    New Asset Request / طلب أصل جديد
                </h2>
            </div>

            {/* Warning if no recent report */}
            {!hasRecentReport && (
                <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
                        <div>
                            <div className="font-medium text-yellow-800 dark:text-yellow-200">
                                Status Report Required / تقرير الحالة مطلوب
                            </div>
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">
                                You must generate an Asset Status Report before requesting a new asset.
                            </div>
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">
                                يجب إنشاء تقرير حالة الأصول قبل طلب أصل جديد.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Request Form */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Request Details / تفاصيل الطلب</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Asset Name / اسم الأصل *</Label>
                            <Input
                                value={requestedAsset}
                                onChange={(e) => setRequestedAsset(e.target.value)}
                                placeholder="e.g. Coffee Machine, Refrigerator..."
                                disabled={!hasRecentReport}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Category / التصنيف</Label>
                            <Select value={category} onValueChange={setCategory} disabled={!hasRecentReport}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ASSET_CATEGORIES.map(c => (
                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Quantity / الكمية</Label>
                            <Input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                disabled={!hasRecentReport}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Urgency / الأولوية</Label>
                            <Select value={urgency} onValueChange={(v) => setUrgency(v as any)} disabled={!hasRecentReport}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(URGENCY_CONFIG).map(([key, config]) => (
                                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Reason / سبب الطلب *</Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain why you need this asset..."
                            rows={3}
                            disabled={!hasRecentReport}
                        />
                    </div>

                    <Button
                        onClick={handleSubmitRequest}
                        disabled={isSubmitting || !hasRecentReport}
                        className="w-full"
                    >
                        <Plus className="w-4 h-4 ml-2" />
                        {isSubmitting ? "جاري الإرسال..." : "Submit Request / إرسال الطلب"}
                    </Button>
                </CardContent>
            </Card>

            {/* Previous Requests */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">My Requests / طلباتي ({requests.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {requests.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No requests yet</p>
                            <p className="text-xs">لا توجد طلبات</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date / التاريخ</TableHead>
                                    <TableHead>Asset / الأصل</TableHead>
                                    <TableHead className="text-center">Qty / الكمية</TableHead>
                                    <TableHead>Urgency / الأولوية</TableHead>
                                    <TableHead>Status / الحالة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map(request => (
                                    <TableRow key={request.id}>
                                        <TableCell className="text-xs">
                                            {new Date(request.requestDate).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                        <TableCell className="font-medium">{request.requestedAsset}</TableCell>
                                        <TableCell className="text-center">{request.quantity || 1}</TableCell>
                                        <TableCell>
                                            <Badge variant={URGENCY_CONFIG[request.urgency]?.color}>
                                                {URGENCY_CONFIG[request.urgency]?.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
