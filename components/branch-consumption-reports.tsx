"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { ConsumptionRecord } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { FileText, Search, ArrowLeft, Download, Calendar } from "lucide-react"

interface BranchConsumptionReportsProps {
    branchId: string
    onBack?: () => void
}

const CONSUMPTION_REASONS = [
    { value: "all", label: "الكل / All" },
    { value: "daily_use", label: "استخدام يومي / Daily Use" },
    { value: "damaged", label: "تالف / Damaged" },
    { value: "expired", label: "منتهي الصلاحية / Expired" },
    { value: "sample", label: "عينة / Sample" },
    { value: "other", label: "أخرى / Other" }
]

export function BranchConsumptionReports({ branchId, onBack }: BranchConsumptionReportsProps) {
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [reasonFilter, setReasonFilter] = useState("all")
    const [productFilter, setProductFilter] = useState("all")

    // Get all consumption records for this branch
    const allRecords = useLiveQuery(
        () => db.consumptionRecords.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Get unique products for filter
    const uniqueProducts = useMemo(() => {
        const products = new Set(allRecords.map(r => r.productName))
        return Array.from(products).sort()
    }, [allRecords])

    // Filter records
    const filteredRecords = useMemo(() => {
        let result = allRecords

        // Filter by date range
        if (dateFrom) {
            const fromDate = new Date(dateFrom)
            result = result.filter(r => new Date(r.date) >= fromDate)
        }
        if (dateTo) {
            const toDate = new Date(dateTo)
            toDate.setHours(23, 59, 59, 999)
            result = result.filter(r => new Date(r.date) <= toDate)
        }

        // Filter by reason
        if (reasonFilter !== "all") {
            result = result.filter(r => r.reason === reasonFilter)
        }

        // Filter by product
        if (productFilter && productFilter !== "all") {
            result = result.filter(r => r.productName === productFilter)
        }

        // Sort by date descending
        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [allRecords, dateFrom, dateTo, reasonFilter, productFilter])

    // Stats
    const stats = useMemo(() => {
        const totalQuantity = filteredRecords.reduce((sum, r) => sum + r.quantity, 0)
        const uniqueProducts = new Set(filteredRecords.map(r => r.productId)).size
        return { records: filteredRecords.length, totalQuantity, uniqueProducts }
    }, [filteredRecords])

    // Group by product for summary
    const productSummary = useMemo(() => {
        const summary: Record<string, { name: string; total: number }> = {}
        filteredRecords.forEach(r => {
            if (!summary[r.productId]) {
                summary[r.productId] = { name: r.productName, total: 0 }
            }
            summary[r.productId].total += r.quantity
        })
        return Object.values(summary).sort((a, b) => b.total - a.total)
    }, [filteredRecords])

    const handleExportPDF = () => {
        toast({ title: "قريباً", description: "ميزة تصدير PDF قيد التطوير" })
    }

    const getReasonLabel = (reason: string) => {
        return CONSUMPTION_REASONS.find(r => r.value === reason)?.label || reason
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
                        Consumption Reports / تقارير الاستهلاك
                    </h2>
                </div>
                <Button onClick={handleExportPDF} disabled={filteredRecords.length === 0}>
                    <Download className="w-4 h-4 ml-2" />
                    Export PDF / تصدير
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filters / الفلاتر</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">From Date / من تاريخ</Label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">To Date / إلى تاريخ</Label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Reason / السبب</Label>
                            <Select value={reasonFilter} onValueChange={setReasonFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONSUMPTION_REASONS.map(r => (
                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Product / المنتج</Label>
                            <Select value={productFilter} onValueChange={setProductFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All / الكل" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All / الكل</SelectItem>
                                    {uniqueProducts.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.records}</div>
                        <div className="text-xs text-muted-foreground">Records / سجلات</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.totalQuantity}</div>
                        <div className="text-xs text-muted-foreground">Total Consumed / إجمالي المستهلك</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.uniqueProducts}</div>
                        <div className="text-xs text-muted-foreground">Products / منتجات</div>
                    </CardContent>
                </Card>
            </div>

            {/* Product Summary */}
            {productSummary.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Summary by Product / ملخص حسب المنتج</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product / المنتج</TableHead>
                                    <TableHead className="text-center">Total Consumed / المستهلك</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {productSummary.slice(0, 10).map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-center font-bold text-red-600">{item.total}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Records */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Detailed Records / السجلات التفصيلية</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredRecords.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No consumption records found</p>
                            <p className="text-xs">لا توجد سجلات استهلاك</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date / التاريخ</TableHead>
                                    <TableHead>Product / المنتج</TableHead>
                                    <TableHead className="text-center">Qty / الكمية</TableHead>
                                    <TableHead>Reason / السبب</TableHead>
                                    <TableHead>Notes / ملاحظات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRecords.map(record => (
                                    <TableRow key={record.id}>
                                        <TableCell className="text-xs">
                                            {new Date(record.date).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                        <TableCell className="font-medium">{record.productName}</TableCell>
                                        <TableCell className="text-center font-bold text-red-600">-{record.quantity}</TableCell>
                                        <TableCell className="text-xs">{getReasonLabel(record.reason)}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{record.notes || "-"}</TableCell>
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
