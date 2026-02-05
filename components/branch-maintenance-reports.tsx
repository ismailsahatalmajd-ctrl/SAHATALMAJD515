"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { MaintenanceReport, BranchAsset } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { ClipboardList, ArrowLeft, Plus, Wrench, AlertTriangle, CheckCircle } from "lucide-react"

interface BranchMaintenanceReportsProps {
    branchId: string
    onBack?: () => void
}

const ISSUE_TYPES = [
    { value: "malfunction", label: "عطل / Malfunction" },
    { value: "damage", label: "ضرر / Damage" },
    { value: "wear", label: "تآكل / Wear" },
    { value: "other", label: "أخرى / Other" }
]

const STATUS_CONFIG = {
    pending: { label: "معلق / Pending", color: "warning" as const },
    in_progress: { label: "قيد المعالجة / In Progress", color: "default" as const },
    resolved: { label: "تم الحل / Resolved", color: "success" as const },
    requires_replacement: { label: "يحتاج استبدال / Requires Replacement", color: "destructive" as const }
}

export function BranchMaintenanceReports({ branchId, onBack }: BranchMaintenanceReportsProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedAssetId, setSelectedAssetId] = useState("")
    const [issueType, setIssueType] = useState("malfunction")
    const [description, setDescription] = useState("")
    const [cause, setCause] = useState("")
    const [actionTaken, setActionTaken] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Get branch assets
    const assets = useLiveQuery(
        () => db.branchAssets.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Get maintenance reports
    const reports = useLiveQuery(
        () => db.maintenanceReports
            .where("branchId").equals(branchId)
            .reverse()
            .toArray(),
        [branchId]
    ) || []

    // Stats
    const stats = useMemo(() => {
        return {
            total: reports.length,
            pending: reports.filter(r => r.status === "pending").length,
            inProgress: reports.filter(r => r.status === "in_progress").length,
            resolved: reports.filter(r => r.status === "resolved").length
        }
    }, [reports])

    const handleOpenNewReport = () => {
        setSelectedAssetId("")
        setIssueType("malfunction")
        setDescription("")
        setCause("")
        setActionTaken("")
        setIsDialogOpen(true)
    }

    const handleSubmitReport = async () => {
        if (!selectedAssetId) {
            toast({ title: "خطأ", description: "الرجاء اختيار الأصل", variant: "destructive" })
            return
        }
        if (!description.trim()) {
            toast({ title: "خطأ", description: "الرجاء وصف المشكلة", variant: "destructive" })
            return
        }

        const asset = assets.find(a => a.id === selectedAssetId)
        if (!asset) return

        setIsSubmitting(true)
        try {
            const now = new Date().toISOString()

            const report: MaintenanceReport = {
                id: uuidv4(),
                assetId: selectedAssetId,
                assetName: asset.name,
                branchId,
                issueType: issueType as any,
                description,
                cause: cause || undefined,
                actionTaken: actionTaken || undefined,
                status: "pending",
                reportedBy: "branch",
                reportedDate: now,
                createdAt: now,
                updatedAt: now
            }

            await db.maintenanceReports.add(report)

            // Update asset status
            await db.branchAssets.update(selectedAssetId, {
                status: "needs_maintenance",
                lastMaintenanceDate: now,
                updatedAt: now
            })

            // Sync to Firebase
            if (typeof window !== 'undefined') {
                import('@/lib/firebase-sync-engine').then(module => {
                    module.syncMaintenanceReport(report).catch(console.error)
                    // Also sync the asset because status changed
                    db.branchAssets.get(selectedAssetId).then(updatedAsset => {
                        if (updatedAsset) module.syncBranchAsset(updatedAsset).catch(console.error)
                    })
                })
            }

            toast({
                title: "تم إنشاء التقرير",
                description: `تم تسجيل تقرير صيانة لـ ${asset.name}`
            })

            setIsDialogOpen(false)
        } catch (error) {
            console.error("Submit report error:", error)
            toast({ title: "خطأ", description: "فشل إنشاء التقرير", variant: "destructive" })
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
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    )}
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ClipboardList className="w-5 h-5" />
                        Maintenance Reports / تقارير الصيانة
                    </h2>
                </div>
                <Button onClick={handleOpenNewReport} disabled={assets.length === 0}>
                    <Plus className="w-4 h-4 ml-2" />
                    New Report / تقرير جديد
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">Total / الإجمالي</div>
                    </CardContent>
                </Card>
                <Card className={stats.pending > 0 ? "border-yellow-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                        <div className="text-xs text-muted-foreground">Pending / معلق</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
                        <div className="text-xs text-muted-foreground">In Progress / قيد المعالجة</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
                        <div className="text-xs text-muted-foreground">Resolved / تم الحل</div>
                    </CardContent>
                </Card>
            </div>

            {/* Reports Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All Reports / جميع التقارير</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {reports.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No maintenance reports</p>
                            <p className="text-xs">لا توجد تقارير صيانة</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date / التاريخ</TableHead>
                                    <TableHead>Asset / الأصل</TableHead>
                                    <TableHead>Issue / المشكلة</TableHead>
                                    <TableHead>Description / الوصف</TableHead>
                                    <TableHead>Status / الحالة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reports.map(report => (
                                    <TableRow key={report.id}>
                                        <TableCell className="text-xs">
                                            {new Date(report.reportedDate).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                        <TableCell className="font-medium">{report.assetName}</TableCell>
                                        <TableCell className="text-xs">
                                            {ISSUE_TYPES.find(t => t.value === report.issueType)?.label}
                                        </TableCell>
                                        <TableCell className="text-sm max-w-[200px] truncate">{report.description}</TableCell>
                                        <TableCell>{getStatusBadge(report.status)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* New Report Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New Maintenance Report / تقرير صيانة جديد</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Asset / الأصل *</Label>
                            <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select asset..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {assets.map(asset => (
                                        <SelectItem key={asset.id} value={asset.id}>
                                            {asset.name} ({asset.category})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Issue Type / نوع المشكلة</Label>
                            <Select value={issueType} onValueChange={setIssueType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ISSUE_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Description / وصف المشكلة *</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the issue in detail..."
                                rows={3}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Cause (Optional) / السبب</Label>
                            <Input
                                value={cause}
                                onChange={(e) => setCause(e.target.value)}
                                placeholder="What caused this issue..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Action Taken (Optional) / الإجراء المتخذ</Label>
                            <Textarea
                                value={actionTaken}
                                onChange={(e) => setActionTaken(e.target.value)}
                                placeholder="What was done to address the issue..."
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel / إلغاء
                        </Button>
                        <Button onClick={handleSubmitReport} disabled={isSubmitting}>
                            {isSubmitting ? "..." : "Submit / إرسال"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
