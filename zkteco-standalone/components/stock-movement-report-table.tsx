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
import { ArrowUpDown, ArrowUp, ArrowDown, FileText, ShoppingCart, RotateCcw, Activity, Filter, Check, MoreHorizontal, ChevronDown, ChevronUp, PackageOpen, Plus, Edit, Trash2 } from "lucide-react"
import { DualText } from "@/components/ui/dual-text"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type MovementType = "issue" | "return" | "purchase" | "adjustment" | "add" | "edit" | "delete"

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
    details?: {
        name: string
        quantity: number
        price: number
        total: number
    }[]
}

interface StockMovementReportTableProps {
    movements: StockMovement[]
    limit?: number
}

export function StockMovementReportTable({ movements, limit = 50 }: StockMovementReportTableProps) {
    const [sortConfig, setSortConfig] = useState<{ key: keyof StockMovement; direction: "asc" | "desc" } | null>({ key: 'date', direction: 'desc' })
    const [page, setPage] = useState(1)
    const itemsPerPage = limit

    const [expandedRows, setExpandedRows] = useState<string[]>([])

    const toggleRow = (id: string) => {
        setExpandedRows(prev =>
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        )
    }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(val)
    }

    const sortedMovements = [...movements].sort((a, b) => {
        if (!sortConfig) return 0
        const { key, direction } = sortConfig
        if (a[key]! < b[key]!) return direction === "asc" ? -1 : 1
        if (a[key]! > b[key]!) return direction === "asc" ? 1 : -1
        return 0
    })

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
            case "add":
                return <Badge className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"><Plus className="w-3 h-3" /> <DualText k="common.add" fallback="إضافة" /></Badge>
            case "edit":
                return <Badge variant="secondary" className="flex items-center gap-1"><Edit className="w-3 h-3" /> <DualText k="common.edit" fallback="تعديل" /></Badge>
            case "delete":
                return <Badge variant="destructive" className="bg-red-800 hover:bg-red-900 flex items-center gap-1"><Trash2 className="w-3 h-3" /> <DualText k="common.delete" fallback="حذف" /></Badge>
        }
    }

    const getTypeIcon = (type: MovementType) => {
        switch (type) {
            case "issue": return <FileText className="w-4 h-4 text-red-500" />
            case "purchase": return <ShoppingCart className="w-4 h-4 text-green-500" />
            case "return": return <RotateCcw className="w-4 h-4 text-yellow-500" />
            case "adjustment": return <Activity className="w-4 h-4 text-gray-500" />
            case "add": return <Plus className="w-4 h-4 text-blue-500" />
            case "edit": return <Edit className="w-4 h-4 text-orange-500" />
            case "delete": return <Trash2 className="w-4 h-4 text-red-700" />
        }
    }

    return (
        <div className="w-full overflow-auto">
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
                    <Badge variant="outline" className="ml-auto">
                        Total: {displayMovements.length}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="text-right"><DualText k="common.date" fallback="Date / التاريخ" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.type" fallback="Type / النوع" /></TableHead>
                                <TableHead className="text-right"><DualText k="common.reference" fallback="Ref / المرجع" /></TableHead>
                                <TableHead className="text-right"><DualText k="common.description" fallback="Description / الوصف" /></TableHead>
                                <TableHead className="text-center"><DualText k="common.quantity" fallback="Qty / الكمية" /></TableHead>
                                <TableHead className="text-right font-bold text-muted-foreground"><DualText k="reports.col.before" fallback="Before / قبل" /> <span className="text-xs font-normal opacity-70">(<DualText k="reports.col.value" fallback="Value / القيمة" />)</span></TableHead>
                                <TableHead className="text-center font-bold"><DualText k="reports.col.change" fallback="Change / التغيير" /> <span className="text-xs font-normal opacity-70">(<DualText k="reports.col.value" fallback="Value / القيمة" />)</span></TableHead>
                                <TableHead className="text-right font-bold text-primary"><DualText k="reports.col.after" fallback="After / بعد" /> <span className="text-xs font-normal opacity-70">(<DualText k="reports.col.value" fallback="Value / القيمة" />)</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayMovements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center">
                                        <DualText k="common.noData" fallback="No movements found" />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                displayMovements.map((movement) => {
                                    const isNegative = movement.type === 'issue' || (movement.type === 'adjustment' && movement.totalQuantity < 0) || movement.type === 'return' // Returns usually + stock? Wait. 
                                    // Issues -> Stock decrease, Value decrease (-).
                                    // Purchase -> Stock increase, Value increase (+).
                                    // Return -> Stock increase, Value increase (+).
                                    // Adjustment -> Depends.

                                    let valueChange = movement.totalAmount
                                    let valueColor = "text-green-600"
                                    let sign = "+"

                                    if (movement.type === 'issue') {
                                        valueChange = -movement.totalAmount
                                        valueColor = "text-red-600"
                                        sign = "-"
                                    } else if (movement.type === 'purchase') {
                                        valueChange = movement.totalAmount
                                        valueColor = "text-green-600"
                                        sign = "+"
                                    } else if (movement.type === 'return') {
                                        valueChange = movement.totalAmount
                                        valueColor = "text-green-600"
                                        sign = "+"
                                    } else if (movement.type === 'adjustment') {
                                        if (movement.totalQuantity < 0) {
                                            valueChange = -movement.totalAmount
                                            valueColor = "text-red-600"
                                            sign = "-"
                                        }
                                    }

                                    return (
                                        <>
                                            <TableRow key={movement.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleRow(movement.id)}>
                                                <TableCell className="p-2 text-center">
                                                    {expandedRows.includes(movement.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">
                                                    <div className="flex flex-col">
                                                        <span>{new Date(movement.date).toLocaleDateString()}</span>
                                                        <span className="text-muted-foreground">{new Date(movement.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {getTypeBadge(movement.type)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">{movement.reference}</TableCell>
                                                <TableCell className="text-right text-sm max-w-[200px] truncate" title={movement.description}>
                                                    {movement.description}
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-sm" dir="ltr">
                                                    <span className={movement.totalQuantity < 0 ? "text-red-600" : "text-green-600"}>
                                                        {movement.totalQuantity > 0 ? "+" : ""}{movement.totalQuantity}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                                    {formatCurrency(movement.inventoryValueBefore || 0)}
                                                </TableCell>
                                                <TableCell className={`text-center font-bold font-mono text-sm ${valueColor}`} dir="ltr">
                                                    {sign}{formatCurrency(Math.abs(valueChange))}
                                                </TableCell>
                                                <TableCell className="text-right font-bold font-mono text-sm">
                                                    {formatCurrency(movement.inventoryValueAfter || 0)}
                                                </TableCell>
                                            </TableRow>

                                            {/* Expanded Details Row */}
                                            {expandedRows.includes(movement.id) && movement.details && (
                                                <TableRow className="bg-muted/10">
                                                    <TableCell colSpan={9} className="p-0">
                                                        <div className="p-4 border-b bg-muted/20 shadow-inner">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <PackageOpen className="h-4 w-4 text-muted-foreground" />
                                                                <h4 className="font-semibold text-sm">Transaction Details / تفاصيل الحركة</h4>
                                                            </div>
                                                            <Table className="bg-white rounded-md border text-xs">
                                                                <TableHeader>
                                                                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                                                                        <TableHead>Product / المنتج</TableHead>
                                                                        <TableHead className="text-center">Qty / الكمية</TableHead>
                                                                        <TableHead className="text-center">Cost / التكلفة</TableHead>
                                                                        <TableHead className="text-right">Total / الإجمالي</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {movement.details.map((detail, idx) => (
                                                                        <TableRow key={idx} className="hover:bg-transparent">
                                                                            <TableCell className="font-medium">{detail.name}</TableCell>
                                                                            <TableCell className="text-center" dir="ltr">
                                                                                <span className={detail.quantity < 0 ? "text-red-600" : "text-green-600"}>
                                                                                    {detail.quantity}
                                                                                </span>
                                                                            </TableCell>
                                                                            <TableCell className="text-center">{formatCurrency(detail.price)}</TableCell>
                                                                            <TableCell className="text-right font-bold">{formatCurrency(Math.abs(detail.total))}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </div>
    )
}
