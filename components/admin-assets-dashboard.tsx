"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchAsset, AssetRequest } from "@/lib/types"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { Wrench, Search, Plus, Eye, Edit, Trash2, Building2, AlertTriangle, CheckCircle, XCircle, Package } from "lucide-react"
import { syncBranchAsset, syncAssetRequest, syncMaintenanceReport } from "@/lib/firebase-sync-engine"
import { ImageUploadField } from "./image-upload-field"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"

const ASSET_STATUSES = [
    { value: "new", label: "جديد / New", color: "bg-blue-500" },
    { value: "good", label: "جيد / Good", color: "bg-green-500" },
    { value: "needs_maintenance", label: "يحتاج صيانة / Needs Maintenance", color: "bg-yellow-500" },
    { value: "damaged", label: "تالف / Damaged", color: "bg-red-500" },
    { value: "disposed", label: "مستبعد / Disposed", color: "bg-gray-500" },
    { value: "lost", label: "مفقود / Lost", color: "bg-red-700" }
]

const ASSET_CATEGORIES = [
    { value: "equipment", label: "معدات / Equipment" },
    { value: "appliances", label: "أجهزة / Appliances" },
    { value: "furniture", label: "أثاث / Furniture" },
    { value: "electronics", label: "إلكترونيات / Electronics" },
    { value: "tools", label: "أدوات / Tools" },
    { value: "other", label: "أخرى / Other" }
]

export function AdminAssetsDashboard() {
    const [activeTab, setActiveTab] = useState("assets")
    const [searchQuery, setSearchQuery] = useState("")
    const [branchFilter, setBranchFilter] = useState("all")
    const [statusFilter, setStatusFilter] = useState("all")
    const [categoryFilter, setCategoryFilter] = useState("all")

    // Add Asset Dialog
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [newAsset, setNewAsset] = useState({
        name: "",
        category: "equipment",
        brand: "",
        model: "",
        serialNumber: "",
        branchId: "",
        status: "new" as const,
        condition: "",
        purchasePrice: "",
        imageUrl: ""
    })

    // Edit State
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editingAsset, setEditingAsset] = useState<BranchAsset | null>(null)
    const [editForm, setEditForm] = useState({
        name: "",
        category: "equipment",
        brand: "",
        model: "",
        serialNumber: "",
        branchId: "",
        status: "new" as const,
        condition: "",
        purchasePrice: "",
        imageUrl: ""
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Get all assets
    const assets = useLiveQuery(() => db.branchAssets.toArray()) || []

    // Get all branches
    const branches = useLiveQuery(() => db.branches.toArray()) || []

    // Get pending requests
    const pendingRequests = useLiveQuery(
        () => db.assetRequests.where("status").equals("pending").toArray()
    ) || []

    // Get all maintenance reports
    const maintenanceReports = useLiveQuery(
        () => db.maintenanceReports.where("status").equals("pending").toArray()
    ) || []

    // Unique branches from assets
    const assetBranches = useMemo(() => {
        const branchIds = new Set(assets.map(a => a.branchId))
        return branches.filter(b => branchIds.has(b.id))
    }, [assets, branches])

    // Filter assets
    const filteredAssets = useMemo(() => {
        let result = assets

        if (branchFilter !== "all") {
            result = result.filter(a => a.branchId === branchFilter)
        }
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
    }, [assets, branchFilter, statusFilter, categoryFilter, searchQuery])

    // Stats
    const stats = useMemo(() => ({
        total: assets.length,
        good: assets.filter(a => a.status === "new" || a.status === "good").length,
        needsMaintenance: assets.filter(a => a.status === "needs_maintenance").length,
        damaged: assets.filter(a => a.status === "damaged" || a.status === "lost").length,
        pendingRequests: pendingRequests.length,
        pendingMaintenance: maintenanceReports.length
    }), [assets, pendingRequests, maintenanceReports])

    const getStatusBadge = (status: string) => {
        const statusInfo = ASSET_STATUSES.find(s => s.value === status)
        return statusInfo ? (
            <Badge className={`${statusInfo.color} text-white`}>{statusInfo.label.split(" / ")[0]}</Badge>
        ) : (
            <Badge>{status}</Badge>
        )
    }

    const getBranchName = (branchId: string) => {
        return branches.find(b => b.id === branchId)?.name || branchId
    }

    const handleAddAsset = async () => {
        if (!newAsset.name.trim()) {
            toast({ title: "خطأ", description: "الرجاء إدخال اسم الأصل", variant: "destructive" })
            return
        }
        if (!newAsset.branchId) {
            toast({ title: "خطأ", description: "الرجاء اختيار الفرع", variant: "destructive" })
            return
        }

        setIsSubmitting(true)
        try {
            const now = new Date().toISOString()
            const branch = branches.find(b => b.id === newAsset.branchId)

            const asset: BranchAsset = {
                id: uuidv4(),
                branchId: newAsset.branchId,
                branchName: branch?.name,
                name: newAsset.name,
                category: newAsset.category,
                brand: newAsset.brand || undefined,
                model: newAsset.model || undefined,
                serialNumber: newAsset.serialNumber || undefined,
                status: newAsset.status,
                condition: newAsset.condition || undefined,
                purchasePrice: newAsset.purchasePrice ? Number(newAsset.purchasePrice) : undefined,
                images: newAsset.imageUrl ? [newAsset.imageUrl] : undefined,
                assignedDate: now,
                createdAt: now,
                updatedAt: now,
                createdBy: "admin"
            }

            await db.branchAssets.add(asset)

            toast({
                title: "تم إضافة الأصل",
                description: `تم إضافة ${newAsset.name} إلى ${branch?.name}`
            })

            // Sync to Firebase
            syncBranchAsset(asset).catch(console.error)

            setIsAddOpen(false)
            setNewAsset({
                name: "",
                category: "equipment",
                brand: "",
                model: "",
                serialNumber: "",
                branchId: "",
                status: "new",
                condition: "",
                purchasePrice: "",
                imageUrl: ""
            })
        } catch (error) {
            console.error("Add asset error:", error)
            toast({ title: "خطأ", description: "فشل إضافة الأصل", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleEditClick = (asset: BranchAsset) => {
        setEditingAsset(asset)
        setEditForm({
            name: asset.name,
            category: asset.category,
            brand: asset.brand || "",
            model: asset.model || "",
            serialNumber: asset.serialNumber || "",
            branchId: asset.branchId,
            status: asset.status as any,
            condition: asset.condition || "",
            purchasePrice: asset.purchasePrice?.toString() || "",
            imageUrl: asset.images?.[0] || ""
        })
        setIsEditOpen(true)
    }

    const handleUpdateAsset = async () => {
        if (!editingAsset) return
        if (!editForm.name || !editForm.branchId) {
            toast({ title: "خطأ", description: "الرجاء تعبئة الحقول المطلوبة", variant: "destructive" })
            return
        }

        setIsSubmitting(true)
        try {
            const now = new Date().toISOString()
            const branch = branches.find(b => b.id === editForm.branchId)

            await db.branchAssets.update(editingAsset.id, {
                branchId: editForm.branchId,
                branchName: branch?.name,
                name: editForm.name,
                category: editForm.category,
                brand: editForm.brand || undefined,
                model: editForm.model || undefined,
                serialNumber: editForm.serialNumber || undefined,
                status: editForm.status,
                condition: editForm.condition || undefined,
                purchasePrice: editForm.purchasePrice ? Number(editForm.purchasePrice) : undefined,
                images: editForm.imageUrl ? [editForm.imageUrl] : undefined,
                updatedAt: now
            })

            // Sync
            const updated = await db.branchAssets.get(editingAsset.id)
            if (updated && typeof window !== 'undefined') {
                import('@/lib/firebase-sync-engine').then(({ syncBranchAsset }) => {
                    syncBranchAsset(updated).catch(console.error)
                })
            }

            toast({
                title: "تم التحديث",
                description: "تم تحديث بيانات الأصل بنجاح"
            })

            setIsEditOpen(false)
            setEditingAsset(null)
        } catch (error) {
            console.error("Update asset error:", error)
            toast({ title: "خطأ", description: "فشل تحديث الأصل", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-4 p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Wrench className="w-6 h-6" />
                    Assets Management / إدارة الأصول
                </h1>
                <Button onClick={() => setIsAddOpen(true)}>
                    <Plus className="w-4 h-4 ml-2" />
                    Add Asset / إضافة أصل
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">Total / الإجمالي</div>
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
                        <div className="text-xs text-muted-foreground">Maintenance / صيانة</div>
                    </CardContent>
                </Card>
                <Card className={stats.damaged > 0 ? "border-red-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.damaged}</div>
                        <div className="text-xs text-muted-foreground">Damaged / تالفة</div>
                    </CardContent>
                </Card>
                <Card className={stats.pendingRequests > 0 ? "border-blue-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.pendingRequests}</div>
                        <div className="text-xs text-muted-foreground">Requests / طلبات</div>
                    </CardContent>
                </Card>
                <Card className={stats.pendingMaintenance > 0 ? "border-orange-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-orange-600">{stats.pendingMaintenance}</div>
                        <div className="text-xs text-muted-foreground">Pending / معلقة</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="assets">Assets / الأصول</TabsTrigger>
                    <TabsTrigger value="requests">
                        Requests / الطلبات
                        {stats.pendingRequests > 0 && (
                            <Badge variant="destructive" className="ml-2">{stats.pendingRequests}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="maintenance">
                        Maintenance / الصيانة
                        {stats.pendingMaintenance > 0 && (
                            <Badge variant="warning" className="ml-2">{stats.pendingMaintenance}</Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Assets Tab */}
                <TabsContent value="assets" className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input
                                placeholder="Search assets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Branch" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Branches / كل الفروع</SelectItem>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses / كل الحالات</SelectItem>
                                {ASSET_STATUSES.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Category" />
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
                    <Card>
                        <CardContent className="p-0">
                            {filteredAssets.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No assets found</p>
                                    <p className="text-xs">لا توجد أصول</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>#</TableHead>
                                            <TableHead>Asset / الأصل</TableHead>
                                            <TableHead>Branch / الفرع</TableHead>
                                            <TableHead>Price / السعر</TableHead>
                                            <TableHead>Category / التصنيف</TableHead>
                                            <TableHead>Status / الحالة</TableHead>
                                            <TableHead>Attached / مرفقات</TableHead>
                                            <TableHead>Assigned / التسليم</TableHead>
                                            <TableHead>Action / إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAssets.map((asset, idx) => (
                                            <TableRow key={asset.id}>
                                                <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <ProductImageThumbnail
                                                            src={asset.images && asset.images[0]}
                                                            alt={asset.name}
                                                            className="w-10 h-10"
                                                            fallbackIcon={<Wrench className="w-1/2 h-1/2 text-muted-foreground opacity-50" />}
                                                        />
                                                        <div>
                                                            <div className="font-medium">{asset.name}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {asset.brand} {asset.model}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{getBranchName(asset.branchId)}</Badge>
                                                </TableCell>
                                                <TableCell className="font-mono">
                                                    {asset.purchasePrice ? `${asset.purchasePrice.toLocaleString()} SAR` : '-'}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {ASSET_CATEGORIES.find(c => c.value === asset.category)?.label.split(" / ")[0]}
                                                </TableCell>
                                                <TableCell>{getStatusBadge(asset.status)}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {new Date(asset.assignedDate).toLocaleDateString("ar-SA")}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(asset)}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Requests Tab */}
                <TabsContent value="requests">
                    <AdminAssetRequests />
                </TabsContent>

                {/* Maintenance Tab */}
                <TabsContent value="maintenance">
                    <AdminMaintenanceReports />
                </TabsContent>
            </Tabs>

            {/* Add Asset Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add New Asset / إضافة أصل جديد</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Asset Name / اسم الأصل *</Label>
                                <Input
                                    value={newAsset.name}
                                    onChange={(e) => setNewAsset(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Coffee Machine"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Category / التصنيف</Label>
                                <Select value={newAsset.category} onValueChange={(v) => setNewAsset(p => ({ ...p, category: v }))}>
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
                                <Label>Branch / الفرع *</Label>
                                <Select value={newAsset.branchId} onValueChange={(v) => setNewAsset(p => ({ ...p, branchId: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select branch..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map(b => (
                                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Brand / الماركة</Label>
                                <Input
                                    value={newAsset.brand}
                                    onChange={(e) => setNewAsset(p => ({ ...p, brand: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Model / الموديل</Label>
                                <Input
                                    value={newAsset.model}
                                    onChange={(e) => setNewAsset(p => ({ ...p, model: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Serial Number / الرقم التسلسلي</Label>
                                <Input
                                    value={newAsset.serialNumber}
                                    onChange={(e) => setNewAsset(p => ({ ...p, serialNumber: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Purchase Price / سعر الشراء</Label>
                                <Input
                                    type="number"
                                    value={newAsset.purchasePrice}
                                    onChange={(e) => setNewAsset(p => ({ ...p, purchasePrice: e.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <Label>Image / صورة الأصل</Label>
                                <ImageUploadField
                                    value={newAsset.imageUrl}
                                    onChange={(val) => setNewAsset(p => ({ ...p, imageUrl: val }))}
                                    label="Upload Asset Image"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Initial Status / الحالة</Label>
                                <Select value={newAsset.status} onValueChange={(v: any) => setNewAsset(p => ({ ...p, status: v }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ASSET_STATUSES.map(s => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Condition Notes / ملاحظات</Label>
                            <Textarea
                                value={newAsset.condition}
                                onChange={(e) => setNewAsset(p => ({ ...p, condition: e.target.value }))}
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                            Cancel / إلغاء
                        </Button>
                        <Button onClick={handleAddAsset} disabled={isSubmitting}>
                            {isSubmitting ? "..." : "Add / إضافة"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Asset Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Asset / تعديل الأصل</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Asset Name / اسم الأصل *</Label>
                                <Input
                                    value={editForm.name}
                                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Category / التصنيف</Label>
                                <Select value={editForm.category} onValueChange={(v) => setEditForm(p => ({ ...p, category: v }))}>
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
                                <Label>Branch / الفرع *</Label>
                                <Select value={editForm.branchId} onValueChange={(v) => setEditForm(p => ({ ...p, branchId: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select branch..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map(b => (
                                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Brand / الماركة</Label>
                                <Input
                                    value={editForm.brand}
                                    onChange={(e) => setEditForm(p => ({ ...p, brand: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Model / الموديل</Label>
                                <Input
                                    value={editForm.model}
                                    onChange={(e) => setEditForm(p => ({ ...p, model: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Serial Number / الرقم التسلسلي</Label>
                                <Input
                                    value={editForm.serialNumber}
                                    onChange={(e) => setEditForm(p => ({ ...p, serialNumber: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Purchase Price / سعر الشراء</Label>
                                <Input
                                    type="number"
                                    value={editForm.purchasePrice}
                                    onChange={(e) => setEditForm(p => ({ ...p, purchasePrice: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <Label>Image / صورة الأصل</Label>
                                <ImageUploadField
                                    value={editForm.imageUrl}
                                    onChange={(val) => setEditForm(p => ({ ...p, imageUrl: val }))}
                                    label="Update Asset Image"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Status / الحالة</Label>
                                <Select value={editForm.status} onValueChange={(v: any) => setEditForm(p => ({ ...p, status: v }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ASSET_STATUSES.map(s => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Condition Notes / ملاحظات</Label>
                            <Textarea
                                value={editForm.condition}
                                onChange={(e) => setEditForm(p => ({ ...p, condition: e.target.value }))}
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                            Cancel / إلغاء
                        </Button>
                        <Button onClick={handleUpdateAsset} disabled={isSubmitting}>
                            {isSubmitting ? "..." : "Save Changes / حفظ التعديلات"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function EditAssetDialog({ isOpen, onOpenChange, form, setForm, onSave, isSubmitting, branches }: any) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Asset / تعديل الأصل</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Asset Name / اسم الأصل *</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Category / التصنيف</Label>
                            <Select value={form.category} onValueChange={(v) => setForm((p: any) => ({ ...p, category: v }))}>
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
                            <Label>Branch / الفرع *</Label>
                            <Select value={form.branchId} onValueChange={(v) => setForm((p: any) => ({ ...p, branchId: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select branch..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b: any) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Brand / الماركة</Label>
                            <Input
                                value={form.brand}
                                onChange={(e) => setForm((p: any) => ({ ...p, brand: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Model / الموديل</Label>
                            <Input
                                value={form.model}
                                onChange={(e) => setForm((p: any) => ({ ...p, model: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Serial Number / الرقم التسلسلي</Label>
                            <Input
                                value={form.serialNumber}
                                onChange={(e) => setForm((p: any) => ({ ...p, serialNumber: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Purchase Price / سعر الشراء</Label>
                            <Input
                                type="number"
                                value={form.purchasePrice}
                                onChange={(e) => setForm((p: any) => ({ ...p, purchasePrice: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label>Image / صورة الأصل</Label>
                            <ImageUploadField
                                value={form.imageUrl}
                                onChange={(val) => setForm((p: any) => ({ ...p, imageUrl: val }))}
                                label="Update Asset Image"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Status / الحالة</Label>
                            <Select value={form.status} onValueChange={(v: any) => setForm((p: any) => ({ ...p, status: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ASSET_STATUSES.map(s => (
                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Condition Notes / ملاحظات</Label>
                        <Textarea
                            value={form.condition}
                            onChange={(e) => setForm((p: any) => ({ ...p, condition: e.target.value }))}
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel / إلغاء
                    </Button>
                    <Button onClick={onSave} disabled={isSubmitting}>
                        {isSubmitting ? "..." : "Save Changes / حفظ التعديلات"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Asset Requests Management Component
function AdminAssetRequests() {
    const requests = useLiveQuery(
        () => db.assetRequests.reverse().toArray()
    ) || []

    const branches = useLiveQuery(() => db.branches.toArray()) || []

    const handleApprove = async (request: AssetRequest) => {
        await db.assetRequests.update(request.id, {
            status: "approved",
            reviewedBy: "admin",
            reviewedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        toast({ title: "تمت الموافقة", description: `تمت الموافقة على طلب ${request.requestedAsset}` })
        const updated = await db.assetRequests.get(request.id)
        if (updated) syncAssetRequest(updated).catch(console.error)
    }

    const handleReject = async (request: AssetRequest, reason: string) => {
        await db.assetRequests.update(request.id, {
            status: "rejected",
            reviewedBy: "admin",
            reviewedAt: new Date().toISOString(),
            reviewNotes: reason,
            updatedAt: new Date().toISOString()
        })
        toast({ title: "تم الرفض", description: `تم رفض طلب ${request.requestedAsset}` })
        const updated = await db.assetRequests.get(request.id)
        if (updated) syncAssetRequest(updated).catch(console.error)
    }

    const getBranchName = (branchId: string) => {
        return branches.find(b => b.id === branchId)?.name || branchId
    }

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: "warning",
            approved: "success",
            rejected: "destructive",
            fulfilled: "default"
        }
        return <Badge variant={colors[status] as any}>{status}</Badge>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Asset Requests / طلبات الأصول ({requests.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {requests.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>No asset requests</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date / التاريخ</TableHead>
                                <TableHead>Branch / الفرع</TableHead>
                                <TableHead>Asset / الأصل</TableHead>
                                <TableHead>Reason / السبب</TableHead>
                                <TableHead>Status / الحالة</TableHead>
                                <TableHead>Action / إجراء</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map(request => (
                                <TableRow key={request.id}>
                                    <TableCell className="text-xs">
                                        {new Date(request.requestDate).toLocaleDateString("ar-SA")}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{getBranchName(request.branchId)}</Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{request.requestedAsset}</TableCell>
                                    <TableCell className="text-sm max-w-[200px] truncate">{request.reason}</TableCell>
                                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                                    <TableCell>
                                        {request.status === "pending" && (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="default" onClick={() => handleApprove(request)}>
                                                    <CheckCircle className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="destructive" onClick={() => handleReject(request, "Rejected by admin")}>
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}

// Admin Maintenance Reports Component
function AdminMaintenanceReports() {
    const reports = useLiveQuery(
        () => db.maintenanceReports.reverse().toArray()
    ) || []

    const branches = useLiveQuery(() => db.branches.toArray()) || []

    const handleResolve = async (reportId: string) => {
        await db.maintenanceReports.update(reportId, {
            status: "resolved",
            resolvedBy: "admin",
            resolvedDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        toast({ title: "تم الحل", description: "تم تحديث حالة التقرير" })
        const updated = await db.maintenanceReports.get(reportId)
        if (updated) syncMaintenanceReport(updated).catch(console.error)
    }

    const getBranchName = (branchId: string) => {
        return branches.find(b => b.id === branchId)?.name || branchId
    }

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: "warning",
            in_progress: "default",
            resolved: "success",
            requires_replacement: "destructive"
        }
        return <Badge variant={colors[status] as any}>{status}</Badge>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Maintenance Reports / تقارير الصيانة ({reports.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {reports.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>No maintenance reports</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date / التاريخ</TableHead>
                                <TableHead>Branch / الفرع</TableHead>
                                <TableHead>Asset / الأصل</TableHead>
                                <TableHead>Issue / المشكلة</TableHead>
                                <TableHead>Status / الحالة</TableHead>
                                <TableHead>Action / إجراء</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reports.map(report => (
                                <TableRow key={report.id}>
                                    <TableCell className="text-xs">
                                        {new Date(report.reportedDate).toLocaleDateString("ar-SA")}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{getBranchName(report.branchId)}</Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{report.assetName}</TableCell>
                                    <TableCell className="text-sm max-w-[200px] truncate">{report.description}</TableCell>
                                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                                    <TableCell>
                                        {report.status === "pending" && (
                                            <Button size="sm" variant="default" onClick={() => handleResolve(report.id)}>
                                                <CheckCircle className="w-4 h-4 ml-1" />
                                                Resolve
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
