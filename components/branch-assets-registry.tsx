"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchAsset } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Wrench, Search, ArrowLeft, Plus, Eye, Edit, AlertTriangle, CheckCircle, XCircle, Package } from "lucide-react"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"

interface BranchAssetsRegistryProps {
    branchId: string
    onBack?: () => void
}

const ASSET_STATUSES = [
    { value: "new", label: "جديد / New", color: "default" as const },
    { value: "good", label: "جيد / Good", color: "default" as const },
    { value: "needs_maintenance", label: "يحتاج صيانة / Needs Maintenance", color: "secondary" as const },
    { value: "damaged", label: "تالف / Damaged", color: "destructive" as const },
    { value: "disposed", label: "مستبعد / Disposed", color: "outline" as const },
    { value: "lost", label: "مفقود / Lost", color: "destructive" as const }
]

const ASSET_CATEGORIES = [
    { value: "equipment", label: "معدات / Equipment" },
    { value: "appliances", label: "أجهزة / Appliances" },
    { value: "furniture", label: "أثاث / Furniture" },
    { value: "electronics", label: "إلكترونيات / Electronics" },
    { value: "tools", label: "أدوات / Tools" },
    { value: "other", label: "أخرى / Other" }
]

export function BranchAssetsRegistry({ branchId, onBack }: BranchAssetsRegistryProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [categoryFilter, setCategoryFilter] = useState("all")
    const [isViewOpen, setIsViewOpen] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<BranchAsset | null>(null)

    // Get branch assets
    const assets = useLiveQuery(
        () => db.branchAssets.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Filter assets
    const filteredAssets = useMemo(() => {
        let result = assets

        if (statusFilter !== "all") {
            result = result.filter(a => a.status === statusFilter)
        }

        if (categoryFilter !== "all") {
            result = result.filter(a => a.category === categoryFilter)
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.brand?.toLowerCase().includes(q) ||
                a.serialNumber?.toLowerCase().includes(q)
            )
        }

        return result
    }, [assets, statusFilter, categoryFilter, searchQuery])

    // Calculate stats
    const stats = useMemo(() => {
        return {
            total: assets.length,
            good: assets.filter(a => a.status === "new" || a.status === "good").length,
            needsMaintenance: assets.filter(a => a.status === "needs_maintenance").length,
            damaged: assets.filter(a => a.status === "damaged" || a.status === "lost").length
        }
    }, [assets])

    const getStatusBadge = (status: string) => {
        const statusInfo = ASSET_STATUSES.find(s => s.value === status)
        return statusInfo ? (
            <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
        ) : (
            <Badge>{status}</Badge>
        )
    }

    const handleViewAsset = (asset: BranchAsset) => {
        setSelectedAsset(asset)
        setIsViewOpen(true)
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
                        <Wrench className="w-5 h-5" />
                        Assets Registry / سجل الأصول
                    </h2>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">Total Assets / إجمالي الأصول</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.good}</div>
                        <div className="text-xs text-muted-foreground">Good / جيدة</div>
                    </CardContent>
                </Card>
                <Card className={stats.needsMaintenance > 0 ? "border-yellow-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{stats.needsMaintenance}</div>
                        <div className="text-xs text-muted-foreground">Needs Maintenance / تحتاج صيانة</div>
                    </CardContent>
                </Card>
                <Card className={stats.damaged > 0 ? "border-red-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.damaged}</div>
                        <div className="text-xs text-muted-foreground">Damaged/Lost / تالفة/مفقودة</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                        placeholder="Search assets / ابحث عن أصل..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses / كل الحالات</SelectItem>
                        {ASSET_STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories / كل التصنيفات</SelectItem>
                        {ASSET_CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Assets Table */}
            {filteredAssets.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No assets found</p>
                        <p className="text-sm">لا توجد أصول</p>
                        <p className="text-xs mt-2">Assets will be added by the purchasing manager</p>
                        <p className="text-xs">يتم إضافة الأصول بواسطة مسؤول المشتريات</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead className="w-[60px]">Image</TableHead>
                                    <TableHead>Asset / الأصل</TableHead>
                                    <TableHead>Category / التصنيف</TableHead>
                                    <TableHead>Brand / الماركة</TableHead>
                                    <TableHead>Status / الحالة</TableHead>
                                    <TableHead className="text-center">Actions / إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAssets.map((asset, idx) => (
                                    <TableRow key={asset.id}>
                                        <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                        <TableCell>
                                            <ProductImageThumbnail
                                                src={asset.images && asset.images[0]}
                                                alt={asset.name}
                                                className="w-10 h-10"
                                                fallbackIcon={<Wrench className="w-1/2 h-1/2 text-muted-foreground opacity-50" />}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{asset.name}</div>
                                            {asset.serialNumber && (
                                                <div className="text-xs text-muted-foreground">SN: {asset.serialNumber}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {ASSET_CATEGORIES.find(c => c.value === asset.category)?.label || asset.category}
                                        </TableCell>
                                        <TableCell className="text-sm">{asset.brand || "-"}</TableCell>
                                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
                                        <TableCell className="text-center">
                                            <Button variant="ghost" size="sm" onClick={() => handleViewAsset(asset)}>
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* View Asset Dialog */}
            <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Asset Details / تفاصيل الأصل</DialogTitle>
                    </DialogHeader>

                    {selectedAsset && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Name / الاسم</Label>
                                    <div className="font-medium">{selectedAsset.name}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Category / التصنيف</Label>
                                    <div>{ASSET_CATEGORIES.find(c => c.value === selectedAsset.category)?.label}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Brand / الماركة</Label>
                                    <div>{selectedAsset.brand || "-"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Model / الموديل</Label>
                                    <div>{selectedAsset.model || "-"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Serial Number / الرقم التسلسلي</Label>
                                    <div className="font-mono">{selectedAsset.serialNumber || "-"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Status / الحالة</Label>
                                    <div>{getStatusBadge(selectedAsset.status)}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Assigned Date / تاريخ التسليم</Label>
                                    <div>{new Date(selectedAsset.assignedDate).toLocaleDateString("ar-SA")}</div>
                                </div>
                                {selectedAsset.warrantyExpiry && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Warranty Expiry / انتهاء الضمان</Label>
                                        <div>{new Date(selectedAsset.warrantyExpiry).toLocaleDateString("ar-SA")}</div>
                                    </div>
                                )}
                            </div>

                            {selectedAsset.condition && (
                                <div>
                                    <Label className="text-muted-foreground text-xs">Condition Notes / ملاحظات الحالة</Label>
                                    <div className="text-sm p-2 bg-muted rounded">{selectedAsset.condition}</div>
                                </div>
                            )}

                            {selectedAsset.responsiblePerson && (
                                <div>
                                    <Label className="text-muted-foreground text-xs">Responsible / المسؤول</Label>
                                    <div>{selectedAsset.responsiblePerson}</div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                            Close / إغلاق
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
