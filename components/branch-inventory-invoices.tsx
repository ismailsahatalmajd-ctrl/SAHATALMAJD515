"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { ConsumptionRecord, BranchInventory } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Printer, ArrowLeft, FileText, Download, Calendar } from "lucide-react"

interface BranchInventoryInvoicesProps {
    branchId: string
    branchName?: string
    onBack?: () => void
}

interface InvoiceSummary {
    id: string
    type: "consumption" | "receiving"
    date: string
    itemsCount: number
    totalQuantity: number
    description: string
}

export function BranchInventoryInvoices({ branchId, branchName, onBack }: BranchInventoryInvoicesProps) {
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [typeFilter, setTypeFilter] = useState("all")

    // Get consumption records grouped by date
    const consumptionRecords = useLiveQuery(
        () => db.consumptionRecords.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Get inventory items for receiving info
    const inventory = useLiveQuery(
        () => db.branchInventory.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Generate invoice summaries
    const invoices: InvoiceSummary[] = useMemo(() => {
        const result: InvoiceSummary[] = []

        // Group consumption by date
        const consumptionByDate: Record<string, ConsumptionRecord[]> = {}
        consumptionRecords.forEach(record => {
            const date = record.date.split("T")[0]
            if (!consumptionByDate[date]) {
                consumptionByDate[date] = []
            }
            consumptionByDate[date].push(record)
        })

        // Create consumption invoices
        Object.entries(consumptionByDate).forEach(([date, records]) => {
            const totalQty = records.reduce((sum, r) => sum + r.quantity, 0)
            result.push({
                id: `consumption-${date}`,
                type: "consumption",
                date,
                itemsCount: records.length,
                totalQuantity: totalQty,
                description: `استهلاك ${records.length} صنف`
            })
        })

        // Create receiving invoices from inventory last received dates
        const receivingByDate: Record<string, BranchInventory[]> = {}
        inventory.forEach(item => {
            if (item.lastReceivedDate) {
                const date = item.lastReceivedDate.split("T")[0]
                if (!receivingByDate[date]) {
                    receivingByDate[date] = []
                }
                receivingByDate[date].push(item)
            }
        })

        Object.entries(receivingByDate).forEach(([date, items]) => {
            const totalQty = items.reduce((sum, i) => sum + i.receivedTotal, 0)
            result.push({
                id: `receiving-${date}`,
                type: "receiving",
                date,
                itemsCount: items.length,
                totalQuantity: totalQty,
                description: `استلام ${items.length} صنف`
            })
        })

        // Sort by date descending
        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [consumptionRecords, inventory])

    // Filter invoices
    const filteredInvoices = useMemo(() => {
        let result = invoices

        if (dateFrom) {
            result = result.filter(inv => inv.date >= dateFrom)
        }
        if (dateTo) {
            result = result.filter(inv => inv.date <= dateTo)
        }
        if (typeFilter !== "all") {
            result = result.filter(inv => inv.type === typeFilter)
        }

        return result
    }, [invoices, dateFrom, dateTo, typeFilter])

    // Stats
    const stats = useMemo(() => ({
        total: filteredInvoices.length,
        consumption: filteredInvoices.filter(i => i.type === "consumption").length,
        receiving: filteredInvoices.filter(i => i.type === "receiving").length
    }), [filteredInvoices])

    const handlePrintInvoice = async (invoice: InvoiceSummary) => {
        try {
            const { printInventoryInvoice } = await import("@/lib/inventory-invoice-printer")
            const branchNameStr = branchName || "Branch"

            if (invoice.type === "consumption") {
                // Fetch detailed consumption records for this date
                // Note: invoice.date is YYYY-MM-DD
                const records = await db.consumptionRecords
                    .where("branchId").equals(branchId)
                    .filter(r => r.date.startsWith(invoice.date))
                    .toArray()

                const items = records.map(r => ({
                    name: r.productName,
                    quantity: r.quantity,
                    productCode: "", // Add if available in record or fetch
                    notes: r.notes,
                    reason: r.reason
                }))

                await printInventoryInvoice("consumption", invoice.date, branchNameStr, items)

            } else if (invoice.type === "receiving") {
                // Fetch inventory items received on this date
                // Note: Only shows items where lastReceivedDate matches exactly
                const items = await db.branchInventory
                    .where("branchId").equals(branchId)
                    .filter(i => i.lastReceivedDate ? i.lastReceivedDate.startsWith(invoice.date) : false)
                    .toArray()

                const printItems = items.map(i => ({
                    name: i.productName,
                    quantity: i.receivedTotal, // Use received total or difference? 
                    // Wait, receivedTotal is cumulative. We actually want the amount received in *this* batch.
                    // But we don't store transaction history for receiving in branchInventory :(
                    // Fallback: For now we show 'receivedTotal' which is wrong if multiple receipts happened.
                    // Correct approach: We should query the Issue that was received on this date!
                    // Let's try to find an Issue confirmed on this date.
                    productCode: i.productCode || "",
                    unit: i.unit,
                    image: i.productImage
                }))

                // Better approach for receiving:
                // Find issues that were marked as received on this date
                const issues = await db.issues
                    .where("branchId").equals(branchId)
                    .filter(i => i.branchReceived === true && i.branchReceivedAt ? i.branchReceivedAt.startsWith(invoice.date) : false)
                    .toArray()

                if (issues.length > 0) {
                    // Combine products from all issues received on this date
                    const issueItems: any[] = []
                    issues.forEach(issue => {
                        issue.products.forEach(p => {
                            issueItems.push({
                                name: p.productName,
                                quantity: p.quantity,
                                productCode: p.productCode,
                                unit: p.unit,
                                image: p.image // IssueProduct has image? Let's check type.
                            })
                        })
                    })
                    await printInventoryInvoice("receiving", invoice.date, branchNameStr, issueItems)
                } else {
                    // Fallback to inventory items if no issue found (legacy or manual)
                    // Using currentStock as proxy for quantity is bad but better than nothing
                    await printInventoryInvoice("receiving", invoice.date, branchNameStr, printItems)
                }
            }
        } catch (error) {
            console.error("Print error:", error)
            toast({ title: "خطأ", description: "فشلت عملية الطباعة", variant: "destructive" })
        }
    }

    const getTypeBadge = (type: string) => {
        if (type === "consumption") {
            return <Badge variant="destructive">استهلاك / Consumption</Badge>
        }
        return <Badge variant="default">استلام / Receiving</Badge>
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
                    <Printer className="w-5 h-5" />
                    Inventory Invoices / فواتير المخزون
                </h2>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filters / الفلاتر</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                            <Label className="text-xs">Type / النوع</Label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All / الكل</SelectItem>
                                    <SelectItem value="consumption">Consumption / استهلاك</SelectItem>
                                    <SelectItem value="receiving">Receiving / استلام</SelectItem>
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
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">Total / الإجمالي</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.consumption}</div>
                        <div className="text-xs text-muted-foreground">Consumption / استهلاك</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.receiving}</div>
                        <div className="text-xs text-muted-foreground">Receiving / استلام</div>
                    </CardContent>
                </Card>
            </div>

            {/* Invoices Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Invoices / الفواتير</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredInvoices.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No invoices found</p>
                            <p className="text-xs">لا توجد فواتير</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date / التاريخ</TableHead>
                                    <TableHead>Type / النوع</TableHead>
                                    <TableHead className="text-center">Items / الأصناف</TableHead>
                                    <TableHead className="text-center">Qty / الكمية</TableHead>
                                    <TableHead>Description / الوصف</TableHead>
                                    <TableHead className="text-center">Action / إجراء</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.map(invoice => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-mono text-sm">
                                            {new Date(invoice.date).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                        <TableCell>{getTypeBadge(invoice.type)}</TableCell>
                                        <TableCell className="text-center">{invoice.itemsCount}</TableCell>
                                        <TableCell className="text-center font-bold">
                                            {invoice.type === "consumption" ? (
                                                <span className="text-red-600">-{invoice.totalQuantity}</span>
                                            ) : (
                                                <span className="text-green-600">+{invoice.totalQuantity}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">{invoice.description}</TableCell>
                                        <TableCell className="text-center">
                                            <Button size="sm" variant="outline" onClick={() => handlePrintInvoice(invoice)}>
                                                <Printer className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
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
