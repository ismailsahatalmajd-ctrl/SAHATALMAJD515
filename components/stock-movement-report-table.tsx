"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import { ArrowUpDown, ArrowUp, ArrowDown, FileText, ShoppingCart, RotateCcw, Activity, Filter, Check, MoreHorizontal } from "lucide-react"
import { DualText } from "@/components/ui/dual-text"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type MovementType = "issue" | "return" | "purchase" | "adjustment"

export interface StockMovement {
    id: string
    date: string
    type: MovementType
    reference: string
    description?: string
    itemsCount: number
    totalQuantity: number
    totalAmount: number
    inventoryValueBefore?: number
    inventoryValueAfter?: number
    status?: string
}

interface StockMovementReportTableProps {
    movements: StockMovement[]
    limit?: number
}

export function StockMovementReportTable({ movements, limit = 10 }: StockMovementReportTableProps) {
    const [sortConfig, setSortConfig] = useState<{ key: keyof StockMovement; direction: "asc" | "desc" } | null>({ key: 'date', direction: 'desc' })
    const [page, setPage] = useState(1)
    const [statusFilters, setStatusFilters] = useState<string[]>(['Pending', 'Received', 'Delivered'])
    const itemsPerPage = limit

    const filteredMovements = movements.filter(m => {
        if (!m.status) return true // Show items with no status (like purchases?) or maybe only filter issues/returns?
        // User specifically asked to filter by these statuses.
        // Purchases/Adjustments might not have these statuses.
        // If type is issue, apply filter.
        if (m.type === 'issue') {
            return statusFilters.includes(m.status)
        }
        return true
    })

    const sortedMovements = [...filteredMovements].sort((a, b) => {
        if (!sortConfig) return 0
        const { key, direction } = sortConfig
        if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1
        if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1
        return 0
    })

    // Pagination if listing all? Component limit prop suggests we might show top N
    // But user said "mini table", so maybe just a scrollable list or top 5?
    // Let's implement pagination/limit.
    const displayMovements = sortedMovements.slice(0, itemsPerPage)

    const getTypeBadge = (type: MovementType) => {
        switch (type) {
            case "issue":
                return <Badge variant="destructive" className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> <DualText k="reports.movements.issue" fallback="صرف" /></Badge>
            case "purchase":
                return <Badge variant="default" className="bg-green-600 hover:bg-green-700 flex items-center gap-1"><ArrowDown className="w-3 h-3" /> <DualText k="reports.movements.purchase" fallback="شراء" /></Badge>
            case "return":
                return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> <DualText k="reports.movements.return" fallback="مرتجع" /></Badge>
            case "adjustment":
                return <Badge variant="outline" className="flex items-center gap-1"><Activity className="w-3 h-3" /> <DualText k="reports.movements.adjustment" fallback="تسوية" /></Badge>
        }
    }

    const getTypeIcon = (type: MovementType) => {
        switch (type) {
            case "issue": return <FileText className="w-4 h-4 text-red-500" />
            case "purchase": return <ShoppingCart className="w-4 h-4 text-green-500" />
            case "return": return <RotateCcw className="w-4 h-4 text-yellow-500" />
            case "adjustment": return <Activity className="w-4 h-4 text-gray-500" />
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        <DualText k="reports.stockMovements.title" fallback="سجل حركات المخزون" />
                    </CardTitle>
                    <CardDescription>
                        <DualText k="reports.stockMovements.desc" fallback="تتبع عمليات الإضافة والخصم (مشتريات، مبيعات، مرتجعات)" />
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 border-dashed">
                                <Filter className="mr-2 h-4 w-4" />
                                <span>Filter Status / تصفية الحالة</span>
                                {statusFilters.length > 0 && (
                                    <>
                                        <Separator orientation="vertical" className="mx-2 h-4" />
                                        <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                                            {statusFilters.length}
                                        </Badge>
                                        <div className="hidden space-x-1 lg:flex">
                                            {statusFilters.length > 2 ? (
                                                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                                    {statusFilters.length} selected
                                                </Badge>
                                            ) : (
                                                statusFilters.map((option) => (
                                                    <Badge variant="secondary" key={option} className="rounded-sm px-1 font-normal">
                                                        {option === 'Pending' ? 'Pending / معلق' : option === 'Received' ? 'Received / استلام فرع' : 'Delivered / تم التسليم'}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {['Pending', 'Received', 'Delivered'].map((status) => (
                                <DropdownMenuCheckboxItem
                                    key={status}
                                    checked={statusFilters.includes(status)}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setStatusFilters([...statusFilters, status])
                                        } else {
                                            setStatusFilters(statusFilters.filter((s) => s !== status))
                                        }
                                    }}
                                >
                                    {status === 'Pending' ? 'Pending / معلق' : status === 'Received' ? 'Received / استلام فرع' : 'Delivered / تم التسليم'}
                                </DropdownMenuCheckboxItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                onCheckedChange={() => setStatusFilters(['Pending', 'Received', 'Delivered'])}
                                className="justify-center text-center"
                            >
                                Reset / إعادة تعيين
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-center w-[120px]"><DualText k="common.date" fallback="التاريخ" /></TableHead>
                                <TableHead className="text-center w-[100px]"><DualText k="common.type" fallback="النوع" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.reference" fallback="المرجع" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.details" fallback="التفاصيل" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.quantity" fallback="الكمية" /></TableHead>
                                <TableHead className="text-center"><DualText k="reports.valBefore" fallback="القيمة قبل" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.amount" fallback="مبلغ الحركة" /></TableHead>
                                <TableHead className="text-center"><DualText k="reports.valAfter" fallback="القيمة بعد" /></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayMovements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        <DualText k="common.noData" fallback="لا توجد حركات" />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                displayMovements.map((movement) => (
                                    <TableRow key={movement.id}>
                                        <TableCell className="text-center font-medium">
                                            {new Date(movement.date).toLocaleDateString('ar-EG')}
                                            <br />
                                            <span className="text-xs text-muted-foreground">{new Date(movement.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex justify-center">
                                                {getTypeBadge(movement.type)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="font-mono text-sm">{movement.reference}</span>
                                            {movement.status && <Badge variant="outline" className="mr-2 text-[10px] h-4 px-1">{movement.status}</Badge>}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm">{movement.description || "-"}</span>
                                                <span className="text-xs text-muted-foreground">{movement.itemsCount} <DualText k="common.items" fallback="عناصر" /></span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center dir-ltr text-right">
                                            <span className={movement.type === 'issue' ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                                                {movement.type === 'issue' ? '-' : '+'}{movement.totalQuantity}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center text-muted-foreground text-sm font-mono">
                                            {movement.inventoryValueBefore ? movement.inventoryValueBefore.toFixed(2) : "-"}
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-base">
                                            {movement.totalAmount.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center font-semibold text-sm font-mono text-blue-700">
                                            {movement.inventoryValueAfter ? movement.inventoryValueAfter.toFixed(2) : "-"}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
