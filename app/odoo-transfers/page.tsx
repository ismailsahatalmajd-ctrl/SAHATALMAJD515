"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { Loader2, RefreshCw, ArrowRightLeft, ServerCrash, Eye, Printer, Plus, Trash2, Edit, CheckCircle, XCircle, ChevronDown, Search, Download, Settings2, Calculator, ShoppingCart, Flame, PackageCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { generateOdooTransferPDF } from "@/lib/odoo-transfer-pdf-generator"
import { generateOdooPickingListPDF, DEFAULT_ODOO_PICKING_COLUMNS, type OdooPickingListColumnSettings } from "@/lib/odoo-picking-list-pdf-generator"
import { generateOdooPickingListExcel } from "@/lib/odoo-picking-list-excel-generator"
import { generateOdooPurchaseRequestsPDF, type PurchaseRequestPrintItem } from "@/lib/odoo-purchase-request-pdf-generator"
import { getWarehouseName } from "@/lib/warehouse-mapping"
import { ProductImage } from "@/components/product-image"
import { OdooExcelDeductionModal } from "@/components/odoo-excel-deduction-modal"
import { OdooUnitFixerModal } from "@/components/odoo-unit-fixer-modal"
import { OdooRequestCreatorModal, type OdooRequestCreateMode } from "@/components/odoo-request-creator-modal"
import { OdooPOReceiptsModal } from "@/components/odoo-po-receipts-modal"
import { fetchOdooApi } from "@/lib/odoo-client"
import { useAuth } from "@/components/auth-provider"
import Link from "next/link"

interface OdooTransfer {
    id: number;
    name: string;
    category_id: [number, string] | false;
    replenishment_operation_type_id: [number, string] | false;
    request_status: string;
    date: string;
    create_date: string;
    write_date?: string;
    request_owner_id?: [number, string] | false;
    product_line_ids?: number[];
    pickings?: PickingDetail[];
}

interface PickingDetail {
    id: number;
    name: string;
    state: string;
    has_tracking: boolean;
    products_availability_state: string;
}

interface OdooTransferLine {
    id: number;
    product_id: [number, string] | false;
    description: string;
    quantity: number; 
    reserved_quantity?: number;
    missing_quantity?: number;
    has_moves?: boolean;
    state?: string;
    display_name?: string;
}

import { db } from "@/lib/db"
import { useLiveQuery } from "dexie-react-hooks"

interface Category {
    id: number;
    name: string;
}

interface ReplenishmentType {
    id: number;
    display_name: string;
}

interface Product {
    id: number;
    display_name: string;
    default_code: string;
    uom_id: [number, string];
}

const WebsiteProductImage = ({ productCode, className, hideOnMissing = false }: {
    productCode?: string;
    className?: string;
    hideOnMissing?: boolean;
}) => {
    const websiteProduct = useLiveQuery(
        () => productCode ? db.products.where('productCode').equals(productCode).first() : undefined,
        [productCode]
    );

    if (!websiteProduct) {
        return hideOnMissing ? null : <ProductImage product={{ id: `odoo-${productCode || 'unknown'}` }} className={className} />;
    }

    return <ProductImage product={websiteProduct} className={className} hideOnMissing={hideOnMissing} />;
};

const OdooTransferLineRow = ({ 
    line, 
    index, 
    products, 
    updateLine, 
    removeLine 
}: { 
    line: any, 
    index: number, 
    products: Product[], 
    updateLine: (index: number, field: 'productId' | 'quantity', val: any) => void,
    removeLine: (index: number) => void
}) => {
    const odooProduct = useMemo(() => products.find(p => p.id.toString() === line.productId), [products, line.productId]);
    const odooCode = odooProduct?.default_code;
    const odooUnit = odooProduct?.uom_id?.[1] || '';

    const websiteProduct = useLiveQuery(
        () => odooCode ? db.products.where('productCode').equals(odooCode).first() : undefined,
        [odooCode]
    );

    const quantityPerCarton = websiteProduct?.quantityPerCarton || 1;
    const rawQty = (line.quantity || 0) / quantityPerCarton;
    const warehouseQty = Number.isInteger(rawQty) ? rawQty : Number(rawQty.toFixed(2));
    const isBrokenCarton = quantityPerCarton > 1 && !Number.isInteger(rawQty);

    return (
        <div className="flex items-center gap-2 w-full" dir="rtl">
            <div className="flex-1">
                <div className={`rounded-md ${line.originalProductId !== undefined && line.productId !== line.originalProductId ? 'ring-2 ring-orange-500 shadow-sm' : ''}`}>
                    <ProductCombobox 
                        products={products}
                        value={line.productId}
                        onChange={(val) => updateLine(index, 'productId', val)}
                    />
                </div>
            </div>
            <div className="w-32 text-center flex flex-col items-center gap-0.5">
                <Badge
                    variant="outline"
                    onClick={() => {
                        if (isBrokenCarton) {
                            const fixedQty = Math.max(1, Math.ceil(rawQty)) * quantityPerCarton;
                            updateLine(index, 'quantity', fixedQty);
                        }
                    }}
                    title={isBrokenCarton ? `كسر كرتون (الشد = ${quantityPerCarton}). اضغط للتصحيح التلقائي إلى ${Math.max(1, Math.ceil(rawQty)) * quantityPerCarton}` : `شد الكرتون: ${quantityPerCarton}`}
                    className={`w-full justify-center py-1.5 text-[0.65rem] leading-tight font-bold line-clamp-2 min-h-[34px] flex items-center gap-1 ${
                        isBrokenCarton
                            ? 'text-red-700 bg-red-50 border-red-300 cursor-pointer hover:bg-red-100'
                            : 'text-blue-700 bg-blue-50/80'
                    }`}
                >
                    {websiteProduct ? `${warehouseQty} ${websiteProduct.unit || 'كرتون'}${isBrokenCarton ? ' ⚠️ صحح' : ''}` : 'وحدة الموقع'}
                </Badge>
            </div>
            <div className="w-20">
                <input 
                    type="number" 
                    min="1"
                    className={`w-full p-2 border rounded-md text-center ${line.originalQuantity !== undefined && line.quantity !== line.originalQuantity ? 'border-orange-500 text-orange-600 font-bold outline-orange-500' : ''}`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value))}
                />
            </div>
            <div className="w-20 text-center">
                <Badge variant="outline" className="w-full justify-center py-1.5 text-[0.65rem] leading-tight bg-slate-50 line-clamp-2 min-h-[34px] flex items-center">
                    {odooUnit || 'Odoo Unit'}
                </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeLine(index)}>
                <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
        </div>
    );
};

const ProductCombobox = ({ products, value, onChange }: { products: Product[], value: string, onChange: (val: string) => void }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const selected = useMemo(() => products.find(p => p.id.toString() === value), [products, value]);

    const filtered = useMemo(() => {
        if (!search) return products;
        const lower = search.toLowerCase();
        return products.filter(p => 
            p.display_name.toLowerCase().includes(lower) || 
            (p.default_code && p.default_code.toLowerCase().includes(lower))
        );
    }, [products, search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div 
                    className="w-full p-2 border rounded-md bg-white cursor-pointer flex justify-between items-center"
                >
                    <span className="truncate text-sm flex items-center gap-2">
                        {selected ? (
                            <>
                                {selected.default_code && (
                                    <WebsiteProductImage
                                        productCode={selected.default_code}
                                        className="w-6 h-6 flex-shrink-0 rounded object-cover border"
                                        hideOnMissing={true}
                                    />
                                )}
                                <span className="truncate">{`[${selected.default_code}] ${selected.display_name}`}</span>
                            </>
                        ) : "اختر المنتج..."}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
            </PopoverTrigger>
           <PopoverContent className="p-0" align="start" style={{ width: '800px', maxWidth: '90vw' }}>
                <div className="flex flex-col h-[300px]" dir="rtl">
                    <div className="p-2 border-b bg-gray-50">
                        <div className="relative">
                            <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input 
                                type="text"
                                className="w-full pr-8 pl-2 py-1.5 text-sm border rounded-sm outline-none focus:ring-1 focus:ring-primary bg-white"
                                placeholder="ابحث بالاسم أو الكود..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div 
    className="overflow-y-auto flex-1 p-1" 
    onWheel={(e) => e.stopPropagation()} 
    onTouchMove={(e) => e.stopPropagation()}
>
                        {filtered.length === 0 ? (
                            <div className="p-3 text-center text-sm text-muted-foreground">لا يوجد نتائج.</div>
                        ) : (
                            filtered.map(p => (
                                <div 
                                    key={p.id}
                                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-3 hover:bg-slate-100 border-b last:border-0 rounded-sm ${value === p.id.toString() ? 'bg-slate-50 font-medium text-blue-700' : ''}`}
                                    onClick={() => {
                                        onChange(p.id.toString());
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    {p.default_code && (
                                        <WebsiteProductImage
                                            productCode={p.default_code}
                                            className="w-10 h-10 flex-shrink-0 rounded-md object-cover border"
                                            hideOnMissing={true}
                                        />
                                    )}
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="truncate font-medium">{p.display_name}</span>
                                        {p.default_code && <span className="text-xs text-muted-foreground">{p.default_code}</span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default function OdooTransfersPage() {
    const { user, loading: authLoading } = useAuth()
    const { toast } = useToast()
    const [transfers, setTransfers] = useState<OdooTransfer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'action_needed' | 'waiting' | 'ready' | 'done' | 'drafts' | 'all'>('action_needed')
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'shafa' | 'roastery' | 'purchase'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [pageSize, setPageSize] = useState<number | 'all'>(15)

    // New Multi-Type Request Creator Modal State
    const [isCreatorOpen, setIsCreatorOpen] = useState(false)
    const [creatorMode, setCreatorMode] = useState<OdooRequestCreateMode>('shafa_transfer')
    const [printingPrPdf, setPrintingPrPdf] = useState(false)

    // Details Modal State
    const [selectedTransfer, setSelectedTransfer] = useState<OdooTransfer | null>(null)
    const [transferLines, setTransferLines] = useState<OdooTransferLine[]>([])
    const [viewedIds, setViewedIds] = useState<number[]>([])
    const [showMissingOnly, setShowMissingOnly] = useState(false)
    const [detailsLoading, setDetailsLoading] = useState(false)
    const [detailsError, setDetailsError] = useState<string | null>(null)

    // Form Modal State (Create / Edit)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create'|'edit'>('create')
    const [categories, setCategories] = useState<Category[]>([])
    const [replenishmentTypes, setReplenishmentTypes] = useState<ReplenishmentType[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [formData, setFormData] = useState({
        id: undefined as number | undefined,
        categoryId: '',
        replenishmentTypeId: '',
        lines: [] as { productId: string; quantity: number; originalProductId?: string; originalQuantity?: number }[]
    })
    const [formLoading, setFormLoading] = useState(false)
    const [formSubmitting, setFormSubmitting] = useState(false)
    
    // Action Loading States
    const [actionLoading, setActionLoading] = useState<number | null>(null)
    const [selectedIds, setSelectedIds] = useState<number[]>([])

    // Excel Deduction / Receive State
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
    const [excelModalMode, setExcelModalMode] = useState<'deduct' | 'receive'>('deduct')
    const [receiveSelectedIds, setReceiveSelectedIds] = useState<number[]>([])
    const [isProcessingExcel, setIsProcessingExcel] = useState(false)
    const [excelFile, setExcelFile] = useState<File | null>(null)

    // PO Receipts Modal State
    const [isPoReceiptsOpen, setIsPoReceiptsOpen] = useState(false)

    // Unit Fixer Modal State (Single Branch or Multi-Transfer)
    const [isUnitFixerOpen, setIsUnitFixerOpen] = useState(false)
    const [unitFixerTransferIds, setUnitFixerTransferIds] = useState<number[]>([])

    const openUnitFixer = (ids: number[]) => {
        if (!ids || ids.length === 0) return
        const editableIds = ids.filter(id => {
            const tr = transfers.find(t => t.id === id)
            return tr && (tr.request_status === 'new' || tr.request_status === 'pending')
        })
        if (editableIds.length === 0) {
            toast({
                title: "غير مسموح بالتعديل / Edit Not Allowed",
                description: "الطلبات المرسلة (المقبولة) أو الملغاة لا يمكن تعديلها. التعديل متاح فقط للمسودات والطلبات قيد الانتظار.",
                variant: "destructive"
            })
            return
        }
        if (editableIds.length < ids.length) {
            toast({
                title: "تم استبعاد الطلبات المقبولة / Approved Skipped",
                description: `تم استبعاد ${ids.length - editableIds.length} طلب لأنه بحالة (تم الإرسال / مقبول) ولا يُسمح بتعديله.`
            })
        }
        setUnitFixerTransferIds(editableIds)
        setIsUnitFixerOpen(true)
    }

    // Picking List Columns Filter Dialog State
    const [isPickingDialogOpen, setIsPickingDialogOpen] = useState(false)
    const [pickingColumns, setPickingColumns] = useState<OdooPickingListColumnSettings>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('odooPickingListColumns')
                if (saved) return { ...DEFAULT_ODOO_PICKING_COLUMNS, ...JSON.parse(saved) }
            } catch {}
        }
        return DEFAULT_ODOO_PICKING_COLUMNS
    })

    const updatePickingColumn = (key: keyof OdooPickingListColumnSettings, val: boolean) => {
        setPickingColumns(prev => {
            const next = { ...prev, [key]: val }
            try { localStorage.setItem('odooPickingListColumns', JSON.stringify(next)) } catch {}
            return next
        })
    }

    const fetchTransfers = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetchOdooApi(`/api/odoo/transfers?limit=${pageSize}`, { cache: 'no-store' })
            const data = await response.json()
            if (!response.ok || !data.success) throw new Error(data.error || "فشل في جلب التحويلات الداخلية من أودو")
            setTransfers(data.transfers || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const getTransferBranchName = (t?: OdooTransfer) => {
        if (!t) return "فرع غير محدد";
        const owner = Array.isArray(t.request_owner_id) ? t.request_owner_id[1] : "";
        if (owner && !owner.includes("@")) return owner;
        const op = Array.isArray(t.replenishment_operation_type_id) ? t.replenishment_operation_type_id[1] : "";
        const matchTo = op.match(/To\s+([A-Za-z0-9_]+)/i);
        if (matchTo) {
            const code = matchTo[1];
            const mapped = getWarehouseName(`${code}/Stock`);
            return mapped !== `${code}/Stock` ? mapped.replace(/^\d+\s*-\s*/, '').replace(/\s*W\.H$/i, '') : code;
        }
        return owner || (t.name !== '/' ? t.name : `طلب #${t.id}`);
    }

    const isPurchaseRequestTransfer = (t?: OdooTransfer) => {
        if (!t) return false;
        const catName = (t.category_id && t.category_id[1] ? t.category_id[1] : '').toLowerCase();
        const reqName = (t.name || '').toUpperCase();
        return catName.includes('purchase request') || reqName.startsWith('PR');
    }

    const prSelectedIds = useMemo(
        () => selectedIds.filter(id => isPurchaseRequestTransfer(transfers.find(t => t.id === id))),
        [selectedIds, transfers]
    )

    const internalSelectedIds = useMemo(
        () => selectedIds.filter(id => {
            const tr = transfers.find(t => t.id === id)
            return tr && !isPurchaseRequestTransfer(tr)
        }),
        [selectedIds, transfers]
    )

    const fetchAggregatedLines = async (idsToAggregate: number[] = internalSelectedIds) => {
        const allLinesMap = new Map<string, any>();
        const branchProductCounts: Record<string, number> = {};
        
        const res = await fetchOdooApi(`/api/odoo/transfers/batch-lines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: idsToAggregate })
        });
        
        const data = await res.json();
        
        if (data.success && data.lines) {
            data.lines.forEach((line: any) => {
                const lineName = line.product_id ? line.product_id[1] : (line.description || '');
                const matchCode = lineName.match(/^\[(.*?)\]/);
                const code = matchCode ? matchCode[1].trim() : '';
                const name = lineName.replace(/^\[.*?\]\s*/, '').trim();
                const uom = line.product_uom_id ? line.product_uom_id[1] : '';
                const reqId = Array.isArray(line.approval_request_id) ? line.approval_request_id[0] : line.approval_request_id;
                const transfer = transfers.find(t => t.id === reqId || (t.product_line_ids && t.product_line_ids.includes(line.id)));
                const branchName = getTransferBranchName(transfer);

                branchProductCounts[branchName] = (branchProductCounts[branchName] || 0) + 1;
                
                const key = code || name;
                
                if (allLinesMap.has(key)) {
                    const existing = allLinesMap.get(key);
                    existing.quantity += line.quantity;
                    existing.orderCount += 1;
                    existing.branchQuantities[branchName] = (existing.branchQuantities[branchName] || 0) + line.quantity;
                } else {
                    allLinesMap.set(key, {
                        code,
                        name,
                        quantity: line.quantity,
                        uom,
                        orderCount: 1,
                        branchQuantities: { [branchName]: line.quantity }
                    });
                }
            });
        }
        
        return { lines: Array.from(allLinesMap.values()), branchProductCounts };
    }

    const handleGeneratePickingListPDF = async () => {
        if (internalSelectedIds.length === 0) return;
        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write('<html dir="rtl"><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#1e293b;"><h2>جاري تجهيز فاتورة التجميع (Matrix)... يرجى الانتظار</h2></body></html>');
        }
        toast({ title: "جاري تجهيز قائمة التجميع (PDF)...", description: "يرجى الانتظار...", duration: 5000 });
        try {
            const { lines: aggregatedLines, branchProductCounts } = await fetchAggregatedLines(internalSelectedIds);
            const owners = Array.from(new Set(
                internalSelectedIds.map(id => {
                    const t = transfers.find(tr => tr.id === id)
                    return t ? getTransferBranchName(t) : undefined
                }).filter(Boolean)
            ));
            const orderIds = Array.from(new Set(
                internalSelectedIds.map(id => transfers.find(t => t.id === id)?.name).filter(n => n && n !== '/')
            ));
            await generateOdooPickingListPDF(aggregatedLines, "قائمة تجميع (مفصلة) - Picking List", owners as string[], orderIds as string[], branchProductCounts, pickingColumns, printWindow);
            setIsPickingDialogOpen(false);
            toast({ title: "تم إنشاء قائمة التجميع!", description: "ستفتح نافذة الطباعة الآن." });
        } catch (error: any) {
            if (printWindow && !printWindow.closed) printWindow.close();
            toast({ title: "خطأ", description: "فشل إنشاء القائمة.", variant: "destructive" });
        }
    }

    const handleGeneratePickingListExcel = async () => {
        if (internalSelectedIds.length === 0) return;
        toast({ title: "جاري تجهيز قائمة التجميع (Excel)...", description: "يرجى الانتظار...", duration: 5000 });
        try {
            const { lines: aggregatedLines } = await fetchAggregatedLines(internalSelectedIds);
            await generateOdooPickingListExcel(aggregatedLines, "قائمة تجميع - Picking List");
            toast({ title: "تم التصدير!", description: "تم تنزيل ملف الإكسل بنجاح." });
        } catch (error: any) {
            toast({ title: "خطأ", description: "فشل التصدير.", variant: "destructive" });
        }
    }

    const fetchFormOptions = async () => {
        if (categories.length > 0 && products.length > 0) return; // Already fetched
        setFormLoading(true)
        try {
            const [catRes, repRes, prodRes] = await Promise.all([
                fetchOdooApi('/api/odoo/approval-categories'),
                fetchOdooApi('/api/odoo/replenishment-types'),
                fetchOdooApi('/api/odoo/products')
            ])
            const catData = await catRes.json()
            const repData = await repRes.json()
            const prodData = await prodRes.json()
            
            if (catData.success) setCategories(catData.categories)
            if (repData.success) setReplenishmentTypes(repData.types)
            if (prodData.success) setProducts(prodData.products)
        } catch (err) {
            console.error(err)
        } finally {
            setFormLoading(false)
        }
    }

    useEffect(() => {
        fetchTransfers()
    }, [pageSize])

    const handleViewDetails = async (transfer: OdooTransfer) => {
        setSelectedTransfer(transfer)
        setViewedIds(prev => Array.from(new Set([...prev, transfer.id])))
        toast({ title: "تم عرض فاتورة", description: `جاري عرض تفاصيل الفاتورة ${transfer.name !== '/' ? transfer.name : 'مسودة'}` })
        setDetailsLoading(true)
        setDetailsError(null)
        setTransferLines([])
        try {
            const response = await fetchOdooApi(`/api/odoo/transfers/${transfer.id}`)
            const data = await response.json()
            if (!response.ok || !data.success) throw new Error(data.error || "فشل في جلب تفاصيل التحويل من أودو")
            setTransferLines(data.lines || [])
        } catch (err: any) {
            setDetailsError(err.message)
        } finally {
            setDetailsLoading(false)
        }
    }

    const handleCreateNew = (mode: OdooRequestCreateMode = 'shafa_transfer') => {
        setCreatorMode(mode)
        setIsCreatorOpen(true)
        fetchFormOptions()
    }

    const handlePrintSelectedPRsPDF = async (idsToPrint: number[]) => {
        if (!idsToPrint || idsToPrint.length === 0) return
        setPrintingPrPdf(true)
        try {
            const res = await fetchOdooApi('/api/odoo/transfers/batch-lines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToPrint })
            })
            const data = await res.json()
            if (!res.ok || !data.success) throw new Error(data.error || "فشل جلب بيانات الطلبات للطباعة")

            const rawLines: any[] = data.lines || []
            const printItems: PurchaseRequestPrintItem[] = rawLines.map((l: any) => {
                const reqId = Array.isArray(l.approval_request_id) ? l.approval_request_id[0] : Number(l.approval_request_id)
                const reqName = Array.isArray(l.approval_request_id) ? l.approval_request_id[1] : ''
                const tr = transfers.find(t => t.id === reqId)
                const prNum = (tr?.name && tr.name !== '/') ? tr.name : (reqName || `#${reqId}`)
                const rawDate = tr?.write_date || tr?.date || tr?.create_date
                const reqDateStr = rawDate ? new Date(rawDate).toLocaleString('en-GB') : '-'

                const lineName = Array.isArray(l.product_id) && l.product_id[1] ? l.product_id[1] : (l.description || '')
                const matchCode = lineName.match(/^\[(.*?)\]/)
                const code = matchCode ? matchCode[1].trim() : ''
                const cleanName = lineName.replace(/^\[.*?\]\s*/, '').trim() || lineName

                return {
                    prNumber: prNum,
                    requestDate: reqDateStr,
                    requestStatus: tr?.request_status,
                    productCode: code,
                    productName: cleanName,
                    odooQty: Number(l.quantity) || 0,
                    odooUnit: Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : 'Units',
                }
            })

            await generateOdooPurchaseRequestsPDF(
                printItems,
                "PR Report"
            )
        } catch (err: any) {
            toast({ title: "خطأ في الطباعة", description: err.message, variant: "destructive" })
        } finally {
            setPrintingPrPdf(false)
        }
    }

    const handleEdit = async (transfer: OdooTransfer) => {
        setActionLoading(transfer.id)
        try {
            await fetchFormOptions()
            const response = await fetchOdooApi(`/api/odoo/transfers/${transfer.id}`)
            const linesRes = await response.json()
            if (!response.ok || !linesRes.success) throw new Error(linesRes.error || "فشل في جلب تفاصيل التحويل")
            
            setFormData({
                id: transfer.id,
                categoryId: transfer.category_id ? transfer.category_id[0].toString() : '',
                replenishmentTypeId: transfer.replenishment_operation_type_id ? transfer.replenishment_operation_type_id[0].toString() : '',
                lines: (linesRes.lines || []).map((l: any) => ({
                    productId: l.product_id ? l.product_id[0].toString() : '',
                    quantity: l.quantity,
                    originalProductId: l.product_id ? l.product_id[0].toString() : '',
                    originalQuantity: l.quantity
                }))
            })
            setFormMode('edit')
            setIsFormOpen(true)
        } catch (err) {
            alert("خطأ في جلب بيانات التعديل")
        } finally {
            setActionLoading(null)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("هل أنت متأكد من حذف هذه المسودة نهائياً؟")) return;
        setActionLoading(id)
        try {
            const response = await fetchOdooApi(`/api/odoo/transfers/${id}`, { method: 'DELETE' })
            const data = await response.json()
            if (!data.success) throw new Error(data.error)
            fetchTransfers()
        } catch (err: any) {
            alert("فشل الحذف: " + err.message)
        } finally {
            setActionLoading(null)
        }
    }

    const handleAction = async (id: number, action: 'confirm' | 'reject') => {
        if (action === 'reject' && !confirm("هل أنت متأكد من رفض/إلغاء هذا التحويل؟")) return;
        if (action === 'confirm' && !confirm("هل أنت متأكد من اعتماد هذا التحويل للإرسال؟ لا يمكن التراجع عن هذه الخطوة.")) return;
        
        setActionLoading(id)
        try {
            const response = await fetchOdooApi(`/api/odoo/transfers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            })
            const data = await response.json()
            if (!data.success) throw new Error(data.error)
            fetchTransfers()
        } catch (err: any) {
            alert("فشل الإجراء: " + err.message)
        } finally {
            setActionLoading(null)
        }
    }

    const handleFormSubmit = async () => {
        const selectedCategoryObj = categories.find(c => String(c.id) === String(formData.categoryId))
        const isPurchaseCat = selectedCategoryObj?.name?.toLowerCase().includes("purchase request")
        if (!formData.categoryId || (!isPurchaseCat && !formData.replenishmentTypeId) || formData.lines.length === 0) {
            alert("يرجى تعبئة كافة الحقول وإضافة منتج واحد على الأقل")
            return
        }
        setFormSubmitting(true)
        try {
            const method = formMode === 'create' ? 'POST' : 'PUT'
            const url = formMode === 'create' ? '/api/odoo/transfers' : `/api/odoo/transfers/${formData.id}`
            
            const response = await fetchOdooApi(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryId: parseInt(formData.categoryId),
                    replenishmentTypeId: formData.replenishmentTypeId ? parseInt(formData.replenishmentTypeId) : null,
                    lines: formData.lines.map(l => ({ productId: parseInt(l.productId), quantity: l.quantity }))
                })
            })
            const data = await response.json()
            if (!data.success) throw new Error(data.error)
            
            setIsFormOpen(false)
            fetchTransfers()
            if (formMode === 'create' && data.id) {
                toast({ title: "تم الحفظ بنجاح", description: `تم إنشاء المسودة بنجاح! (رقم المرجع الداخلي: #${data.id})` })
            } else {
                toast({ title: "تم التعديل", description: "تم حفظ التعديلات في أودو بنجاح" })
            }
        } catch (err: any) {
            toast({ title: "خطأ", description: "فشل الحفظ: " + err.message, variant: "destructive" })
        } finally {
            setFormSubmitting(false)
        }
    }

    const handleReorderMissing = () => {
        if (!selectedTransfer) return;
        const missingLines = transferLines.filter(l => l.missing_quantity && l.missing_quantity > 0);
        if (missingLines.length === 0) {
            toast({ title: "لا توجد نواقص", description: "هذه الفاتورة مكتملة ولا يوجد بها نواقص لإعادة طلبها." });
            return;
        }

        setFormData({
            id: undefined,
            categoryId: selectedTransfer.category_id ? selectedTransfer.category_id[0].toString() : '',
            replenishmentTypeId: selectedTransfer.replenishment_operation_type_id ? selectedTransfer.replenishment_operation_type_id[0].toString() : '',
            lines: missingLines.map(l => ({
                productId: l.product_id ? l.product_id[0].toString() : '',
                quantity: Number(l.missing_quantity?.toFixed(2)) || 1
            })).filter(l => l.productId !== '') // Ensure no empty products
        });
        
        setFormMode('create');
        setSelectedTransfer(null); // Close details modal
        setIsFormOpen(true); // Open form modal
        fetchFormOptions(); // Fetch products and categories for the combobox
        toast({ title: "طلب نواقص جديد", description: "تمت تعبئة الفاتورة بالنواقص. يرجى اختيار المستودع المُراد الطلب منه." });
    }

    const addLine = () => {
        setFormData(prev => ({
            ...prev,
            lines: [...prev.lines, { productId: '', quantity: 1 }]
        }))
        toast({ title: "إضافة منتج", description: "تم إضافة سطر منتج جديد للفاتورة" })
    }

    const removeLine = (index: number) => {
        setFormData(prev => ({
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index)
        }))
        toast({ title: "إزالة منتج", description: "تم إزالة المنتج من الفاتورة", variant: "destructive" })
    }

    const updateLine = (index: number, field: 'productId' | 'quantity', value: any) => {
        setFormData(prev => {
            const newLines = [...prev.lines]
            newLines[index] = { ...newLines[index], [field]: value }
            return { ...prev, lines: newLines }
        })
        if (field === 'productId' && value) {
            toast({ title: "تعديل منتج", description: "تم اختيار منتج جديد في السطر" })
        }
    }

    const translateState = (state: string) => {
        const states: Record<string, { label: string, color: string }> = {
            new: { label: "مسودة", color: "bg-slate-100 text-slate-800" },
            pending: { label: "في الانتظار", color: "bg-yellow-100 text-yellow-800" },
            approved: { label: "تم الإرسال (مقبول)", color: "bg-green-100 text-green-800" },
            refused: { label: "مرفوض", color: "bg-red-100 text-red-800" },
            cancel: { label: "ملغي", color: "bg-red-100 text-red-800" },
        }
        return states[state] || { label: state, color: "bg-gray-100 text-gray-800" }
    }

    const getTransferComputedState = (t: OdooTransfer) => {
        if (t.request_status === 'new' || t.request_status === 'pending') return 'drafts';
        if (t.request_status === 'cancel' || t.request_status === 'refused') return 'canceled';
        if (t.pickings && t.pickings.length > 0) {
            const states = t.pickings.map(p => p.state);
            // If all active pickings are done, it's done
            const activeStates = states.filter(s => s !== 'cancel');
            if (activeStates.length > 0 && activeStates.every(s => s === 'done')) return 'done';
            if (states.includes('assigned')) return 'ready';
            if (states.includes('confirmed') || states.includes('waiting')) return 'waiting';
        }
        return 'approved_no_picking';
    }

    const hasTrackingAlert = (t: OdooTransfer) => {
        if (!t.pickings) return false;
        return t.pickings.some(p => p.has_tracking && p.state !== 'done' && p.state !== 'cancel');
    }

    const filteredTransfers = transfers.filter(t => {
        const cState = getTransferComputedState(t);
        
        if (activeTab === 'drafts' && cState !== 'drafts') return false;
        if (activeTab === 'waiting' && cState !== 'waiting') return false;
        if (activeTab === 'ready' && cState !== 'ready') return false;
        if (activeTab === 'done' && cState !== 'done') return false;
        if (activeTab === 'action_needed' && ['done', 'canceled'].includes(cState)) return false; // Hide done and canceled in action needed

        if (categoryFilter !== 'all') {
            const catName = (t.category_id && t.category_id[1] ? t.category_id[1] : '').toLowerCase();
            if (categoryFilter === 'shafa' && !(catName.includes('01000') || catName.includes('shafa'))) return false;
            if (categoryFilter === 'roastery' && !(catName.includes('34000') || catName.includes('roastery') || catName.includes('mahmasa'))) return false;
            if (categoryFilter === 'purchase' && !catName.includes('purchase request')) return false;
        }
        
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.category_id && t.category_id[1] && t.category_id[1].toLowerCase().includes(q)) ||
            (t.replenishment_operation_type_id && t.replenishment_operation_type_id[1] && t.replenishment_operation_type_id[1].toLowerCase().includes(q)) ||
            (t.pickings && t.pickings.some(p => p.name && p.name.toLowerCase().includes(q)))
        )
    });

    return (
        <div className="container mx-auto py-4 space-y-4" dir="rtl">
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-3 px-2 rounded-b-xl shadow-sm border-b space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-xl">
                            <ArrowRightLeft className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">التحويلات وطلبات المستودع (Odoo)</h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {pageSize === 'all' ? 'عرض كافة العمليات' : `عرض أحدث ${pageSize} عملية`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                        {selectedIds.length > 0 && (() => {
                            const editableInternalSelectedIds = internalSelectedIds.filter(id => {
                                const tr = transfers.find(t => t.id === id)
                                return tr && (tr.request_status === 'new' || tr.request_status === 'pending')
                            })
                            const editablePrSelectedIds = prSelectedIds.filter(id => {
                                const tr = transfers.find(t => t.id === id)
                                return tr && (tr.request_status === 'new' || tr.request_status === 'pending')
                            })
                            return (
                            <>
                                {editableInternalSelectedIds.length > 0 && (
                                    <Button 
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openUnitFixer(editableInternalSelectedIds)} 
                                        className="gap-1.5 bg-white border-2 border-amber-600 text-black hover:bg-amber-50 font-bold shadow-sm"
                                        title="Fix Units for Selected Internal Transfers"
                                    >
                                        <Calculator className="h-4 w-4 text-amber-600" />
                                        Fix Units
                                        <Badge variant="outline" className="ml-1 px-1.5 py-0.5 text-[10px] border-amber-500 text-black bg-white">{editableInternalSelectedIds.length}</Badge>
                                    </Button>
                                )}
                                {editablePrSelectedIds.length > 0 && (
                                    <Button 
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openUnitFixer(editablePrSelectedIds)} 
                                        className="gap-1.5 bg-white border-2 border-violet-600 text-black hover:bg-violet-50 font-bold shadow-sm"
                                        title="Fix Units for Selected Purchase Requests (PR)"
                                    >
                                        <Calculator className="h-4 w-4 text-violet-600" />
                                        Fix PR Units
                                        <Badge variant="outline" className="ml-1 px-1.5 py-0.5 text-[10px] border-violet-500 text-black bg-white">{editablePrSelectedIds.length}</Badge>
                                    </Button>
                                )}
                                {prSelectedIds.length > 0 && (
                                    <Button 
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handlePrintSelectedPRsPDF(prSelectedIds)} 
                                        disabled={printingPrPdf}
                                        className="gap-1.5 bg-white border-2 border-violet-600 text-black hover:bg-violet-50 font-bold shadow-sm"
                                        title="Print Selected PRs (PDF)"
                                    >
                                        {printingPrPdf ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : <Printer className="h-4 w-4 text-violet-600" />}
                                        Print PR (PDF)
                                        <Badge variant="outline" className="ml-1 px-1.5 py-0.5 text-[10px] border-violet-500 text-black bg-white">{prSelectedIds.length}</Badge>
                                    </Button>
                                )}
                                {internalSelectedIds.length > 0 && (
                                    <>
                                        <Button 
                                            size="sm"
                                            variant="outline"
                                            onClick={handleGeneratePickingListExcel} 
                                            className="gap-1.5 bg-white border-2 border-indigo-600 text-black hover:bg-indigo-50 font-bold shadow-sm"
                                        >
                                            <Download className="h-4 w-4 text-indigo-600" />
                                            Excel
                                        </Button>
                                        <Button 
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setIsPickingDialogOpen(true)} 
                                            className="gap-1.5 bg-white border-2 border-blue-600 text-black hover:bg-blue-50 font-bold shadow-sm"
                                        >
                                            <Printer className="h-4 w-4 text-blue-600" />
                                            Picking List
                                            <Badge variant="outline" className="ml-1 px-1.5 py-0.5 text-[10px] border-blue-500 text-black bg-white">{internalSelectedIds.length}</Badge>
                                        </Button>
                                        <Button 
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setExcelModalMode("deduct")
                                                setIsExcelModalOpen(true)
                                            }} 
                                            className="gap-1.5 bg-white border-2 border-emerald-600 text-black hover:bg-emerald-50 font-bold shadow-sm"
                                        >
                                            Auto Deduct Stock
                                        </Button>
                                    </>
                                )}
                            </>
                            )
                        })()}

                        {/* 0. PO Receipts (01000 Shafa) */}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsPoReceiptsOpen(true)}
                            className="gap-1.5 bg-white border-2 border-emerald-600 text-black hover:bg-emerald-50 font-bold shadow-sm"
                        >
                            <PackageCheck className="h-4 w-4 text-emerald-600" />
                            PO Receipts (01000)
                        </Button>

                        {/* 1. Internal Transfer (Shafa) */}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateNew('shafa_transfer')}
                            className="gap-1.5 bg-white border-2 border-blue-600 text-black hover:bg-blue-50 font-bold shadow-sm"
                        >
                            <Plus className="h-4 w-4 text-blue-600" />
                            Internal Transfer (Shafa)
                        </Button>

                        {/* 2. Roastery Resupply Request (34000 MHMSA -> MRSHF) */}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateNew('roastery_transfer')}
                            className="gap-1.5 bg-white border-2 border-amber-600 text-black hover:bg-amber-50 font-bold shadow-sm"
                        >
                            <Flame className="h-4 w-4 text-amber-600" />
                            Roastery Request (34000)
                        </Button>

                        {/* 3. Purchase Request Approval (PR) */}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateNew('purchase_request')}
                            className="gap-1.5 bg-white border-2 border-violet-600 text-black hover:bg-violet-50 font-bold shadow-sm"
                        >
                            <ShoppingCart className="h-4 w-4 text-violet-600" />
                            Purchase Request (PR)
                        </Button>

                        <Button size="sm" onClick={fetchTransfers} disabled={loading} variant="outline" className="gap-1.5 bg-white text-black font-bold">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
                </div>

                {!error && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t pt-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                { id: 'action_needed', label: 'تحتاج انتباهك (الكل)/need your attention' },
                                { id: 'drafts', label: 'مسودات /drafts' },
                                { id: 'ready', label: 'جاهزة  /ready' },
                                { id: 'waiting', label: 'نواقص /waiting' },
                                { id: 'done', label: 'مكتملة /done' },
                                { id: 'all', label: 'كافة الفواتير /all' }
                            ].map(tab => (
                                <button 
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)} 
                                    className={`pb-1.5 px-2.5 font-semibold text-xs border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Category Filter Pills */}
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border text-xs">
                                {[
                                    { id: 'all', label: 'All Types' },
                                    { id: 'shafa', label: 'Shafa (01000)' },
                                    { id: 'roastery', label: 'Roastery (34000)' },
                                    { id: 'purchase', label: 'Purchase (PR)' },
                                ].map((cf) => (
                                    <button
                                        key={cf.id}
                                        onClick={() => setCategoryFilter(cf.id as any)}
                                        className={`px-2 py-1 rounded-md font-bold transition-colors ${
                                            categoryFilter === cf.id
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        {cf.label}
                                    </button>
                                ))}
                            </div>
                            <input 
                                type="text" 
                                placeholder="بحث برقم العملية أو المستودع..." 
                                className="p-1.5 border rounded-md text-xs w-52 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <select 
                                className="p-1.5 border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                                value={pageSize}
                                onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            >
                                <option value={15}>15 فاتورة</option>
                                <option value={30}>30 فاتورة</option>
                                <option value={60}>60 فاتورة</option>
                                <option value="all">الكل</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {error ? (
                <Card className="border-red-200 bg-red-50/50">
                    <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                        <ServerCrash className="h-12 w-12 text-red-500" />
                        <div>
                            <h3 className="text-lg font-bold text-red-800 mb-1">تعذر الاتصال بـ Odoo</h3>
                            <p className="text-red-600">{error}</p>
                        </div>
                        <div className="flex gap-2">
                            {(!user || error.includes("Sign in")) && (
                                <Button asChild className="bg-primary">
                                    <Link href="/login?redirect=/odoo-transfers">تسجيل الدخول</Link>
                                </Button>
                            )}
                            <Button variant="destructive" onClick={fetchTransfers}>إعادة المحاولة</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-4">
                        {loading && transfers.length === 0 ? (
                            <div className="flex justify-center items-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : filteredTransfers.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                لا توجد فواتير في هذا القسم.
                            </div>
                        ) : (
                            <div className="rounded-md border overflow-auto max-h-[calc(100vh-220px)] relative">
                                <table className="w-full caption-bottom text-sm border-collapse">
                                    <TableHeader className="bg-slate-50 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                                        <TableRow>
                                            <TableHead className="w-12 text-center sticky top-0 z-20 bg-slate-50">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 cursor-pointer"
                                                    checked={selectedIds.length === filteredTransfers.length && filteredTransfers.length > 0}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedIds(filteredTransfers.map(t => t.id))
                                                        else setSelectedIds([])
                                                    }}
                                                />
                                            </TableHead>
                                            <TableCell className="text-right sticky top-0 z-20 bg-slate-50 font-semibold">رقم العملية<br />/Order ID</TableCell>
                                            <TableHead className="text-right sticky top-0 z-20 bg-slate-50">تاريخ الطلب<br />/Date</TableHead>
                                            <TableHead className="text-right sticky top-0 z-20 bg-slate-50">الفئة<br />/Type</TableHead>
                                            <TableHead className="text-right sticky top-0 z-20 bg-slate-50">صاحب الطلب<br />/Customer</TableHead> 
                                            <TableHead className="text-right sticky top-0 z-20 bg-slate-50">نوع التحويل<br />/Transfer Type</TableHead>                                                               
                                            <TableHead className="text-center sticky top-0 z-20 bg-slate-50">الحالة<br />/Status</TableHead>
                                            <TableHead className="text-center sticky top-0 z-20 bg-slate-50">الاجراءات<br />/Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredTransfers.map((t) => {
                                            const status = translateState(t.request_status)
                                            const cState = getTransferComputedState(t)
                                            const hasAlert = hasTrackingAlert(t)
                                            const isLoading = actionLoading === t.id
                                            
                                            // Determine background color
                                            const isModified = t.write_date && t.create_date && new Date(t.write_date).getTime() - new Date(t.create_date).getTime() > 10000;
                                            const isViewed = viewedIds.includes(t.id);
                                            
                                            let rowBg = '';
                                            if (cState === 'done') rowBg = 'bg-green-50 hover:bg-green-100/50'
                                            else if (cState === 'waiting') rowBg = 'bg-orange-50 hover:bg-orange-100/50'
                                            else if (cState === 'canceled') rowBg = 'bg-red-50 hover:bg-red-100/50'
                                            else if (t.request_status === 'approved') rowBg = 'bg-blue-50 hover:bg-blue-100/50'
                                            else if (isModified) rowBg = 'bg-amber-50 hover:bg-amber-100/50'
                                            else if (isViewed) rowBg = 'bg-slate-50/50'

                                            return (
                                                <TableRow key={t.id} className={rowBg}>
                                                    <TableCell className="text-center">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 cursor-pointer"
                                                            checked={selectedIds.includes(t.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedIds([...selectedIds, t.id])
                                                                else setSelectedIds(selectedIds.filter(id => id !== t.id))
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-bold">
                                                        <div className="flex items-center gap-2">
                                                            {t.name !== '/' ? t.name : 'مسودة جديدة'}
                                                            {hasAlert && <span title="يحتاج أرقام تتبع / لوت" className="text-red-500 animate-pulse">🔔</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell dir="ltr" className="text-right text-muted-foreground">
                                                        {(t.write_date || t.date || t.create_date) ? new Date(t.write_date || t.date || t.create_date).toLocaleString('en-GB') : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {t.category_id ? t.category_id[1] : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium">
                                                        {t.request_owner_id ? t.request_owner_id[1] : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {t.replenishment_operation_type_id ? t.replenishment_operation_type_id[1] : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold">
                                                        {t.product_line_ids ? t.product_line_ids.length : 0}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`px-2 py-1 rounded-full text-[10px] font-medium inline-block text-center ${status.color}`}>
                                                                الطلب: {status.label}
                                                            </span>
                                                            {cState === 'ready' && <span className="px-2 py-1 rounded-full text-[10px] font-medium inline-block text-center bg-blue-100 text-blue-800">السحب: جاهز</span>}
                                                            {cState === 'waiting' && <span className="px-2 py-1 rounded-full text-[10px] font-medium inline-block text-center bg-orange-100 text-orange-800">السحب: نواقص</span>}
                                                            {cState === 'done' && <span className="px-2 py-1 rounded-full text-[10px] font-medium inline-block text-center bg-green-100 text-green-800">السحب: مكتمل وتم الخصم</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button variant="ghost" size="sm" onClick={() => handleViewDetails(t)} title="عرض / طباعة">
                                                                <Eye className="h-4 w-4 text-slate-500" />
                                                            </Button>

                                                            {(t.request_status === 'new' || t.request_status === 'pending') && (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => openUnitFixer([t.id])}
                                                                        disabled={isLoading}
                                                                        title="فحص وتصحيح وحدات الطلب (الكرتون ⇄ الحبة) / Fix Units (Carton ⇄ Piece)"
                                                                    >
                                                                        <Calculator className="h-4 w-4 text-amber-600" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} disabled={isLoading} title="تعديل">
                                                                        <Edit className="h-4 w-4 text-blue-500" />
                                                                    </Button>
                                                                </>
                                                            )}

                                                            {t.request_status === 'new' && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" onClick={() => handleAction(t.id, 'confirm')} disabled={isLoading} title="موافقة (إرسال)">
                                                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} disabled={isLoading} title="حذف">
                                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                                    </Button>
                                                                </>
                                                            )}

                                                            {t.request_status === 'pending' && (
                                                                <Button variant="ghost" size="sm" onClick={() => handleAction(t.id, 'reject')} disabled={isLoading} title="رفض (إلغاء)">
                                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                                </Button>
                                                            )}
                                                            
                                                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary ml-2" />}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Transfer Details Dialog */}
            <Dialog open={!!selectedTransfer} onOpenChange={(open) => !open && setSelectedTransfer(null)}>
                <DialogContent className="sm:max-w-[80vw] md:max-w-5xl lg:max-w-6xl w-full" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                تفاصيل التحويل الداخلي
                                {selectedTransfer && (
                                    <Badge variant="outline" className="text-lg font-mono bg-slate-50">
                                        {selectedTransfer.name !== '/' ? selectedTransfer.name : 'مسودة'}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedTransfer && (selectedTransfer.request_status === 'new' || selectedTransfer.request_status === 'pending') && (
                                    <Button
                                        variant="outline"
                                        className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                                        onClick={() => openUnitFixer([selectedTransfer.id])}
                                        disabled={detailsLoading || transferLines.length === 0}
                                    >
                                        <Calculator className="w-4 h-4" />
                                        تصحيح الوحدات / Fix Units
                                    </Button>
                                )}
                                {transferLines.some(l => l.missing_quantity && l.missing_quantity > 0) && (
                                    <Button
                                        variant="default"
                                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                                        onClick={handleReorderMissing}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        إنشاء طلب بالنواقص 🔄
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => {
                                        if (selectedTransfer) {
                                            generateOdooTransferPDF(selectedTransfer, transferLines);
                                        }
                                    }}
                                    disabled={detailsLoading || transferLines.length === 0}
                                >
                                    <Printer className="w-4 h-4" />
                                    طباعة PDF
                                </Button>
                            </div>
                        </DialogTitle>
                        <DialogDescription className="flex flex-col gap-1 mt-2">
                            <span>الفئة: <strong className="text-foreground">{selectedTransfer?.category_id ? selectedTransfer.category_id[1] : ''}</strong></span>
                            <span>نوع التحويل: <strong className="text-foreground">{selectedTransfer?.replenishment_operation_type_id ? selectedTransfer.replenishment_operation_type_id[1] : ''}</strong></span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer bg-red-50 text-red-700 px-3 py-1.5 rounded-md border border-red-200 hover:bg-red-100 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={showMissingOnly} 
                                    onChange={(e) => setShowMissingOnly(e.target.checked)} 
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer" 
                                />
                                <span className="text-sm font-bold">عرض النواقص فقط ⚠️</span>
                            </label>
                        </div>
                        {detailsLoading ? (
                            <div className="flex justify-center items-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="ml-3 mr-3 text-muted-foreground">جاري جلب تفاصيل المنتجات من Odoo...</span>
                            </div>
                        ) : detailsError ? (
                            <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
                                خطأ: {detailsError}
                            </div>
                        ) : transferLines.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground border rounded-md">
                                لا توجد منتجات مسجلة في عملية التحويل هذه.
                            </div>
                        ) : (
                            <div className="rounded-md border max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <Table>
                                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <TableRow>
                                            <TableHead className="text-right">المنتج (الوصف)</TableHead>
                                            <TableHead className="text-center">الوحدة</TableHead>
                                            <TableHead className="text-center">الكمية المطلوبة</TableHead>
                                            <TableHead className="text-center">الكمية المحجوزة/المتوفرة</TableHead>
                                            <TableHead className="text-center font-bold text-red-600">الكمية الناقصة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(showMissingOnly ? transferLines.filter(l => l.missing_quantity && l.missing_quantity > 0) : transferLines).map((line) => {
                                            const isMissing = line.missing_quantity && line.missing_quantity > 0;
                                            const lineName = line.product_id ? line.product_id[1] : (line.display_name || '');
                                            const matchCode = lineName.match(/^\[(.*?)\]/);
                                            const extractedCode = matchCode ? matchCode[1].trim() : undefined;
                                            
                                            return (
                                                <TableRow key={line.id} className={isMissing ? 'bg-red-50/40' : ''}>
                                                    <TableCell className="font-medium max-w-[300px]">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-shrink-0 h-10 w-10">
                                                                <WebsiteProductImage
                                                                    productCode={extractedCode}
                                                                    className="h-10 w-10 rounded-md object-cover border bg-white"
                                                                />
                                                            </div>
                                                            <span>{lineName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center text-sm text-muted-foreground">
                                                        {(line as any).product_uom_id ? (line as any).product_uom_id[1] : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center font-semibold">
                                                        {line.quantity}
                                                    </TableCell>
                                                    <TableCell className={`text-center font-bold ${line.has_moves ? (isMissing ? 'text-orange-600' : 'text-green-600') : 'text-gray-400'}`}>
                                                        {line.has_moves ? line.reserved_quantity : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isMissing ? (
                                                            <span className="bg-red-100 text-red-800 px-2 py-1 rounded-md font-bold text-sm">
                                                                {Number(line.missing_quantity?.toFixed(2))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-green-600 text-sm font-medium">✔️ مكتمل</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        {showMissingOnly && transferLines.filter(l => l.missing_quantity && l.missing_quantity > 0).length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-green-600 font-medium">
                                                    لا توجد أي نواقص في هذه الفاتورة! 🎉
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create / Edit Form Dialog */}
            <Dialog open={isFormOpen} onOpenChange={(open) => !open && setIsFormOpen(false)}>
                <DialogContent className="sm:max-w-[80vw] md:max-w-5xl lg:max-w-6xl w-full" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl flex items-center gap-2">
                            {formMode === 'create' ? 'إنشاء فاتورة تحويل جديدة (مسودة)' : 'تعديل فاتورة التحويل'}
                            {formMode === 'edit' && formData.id ? (
                                <Badge variant="outline" className="text-lg font-mono bg-slate-50">
                                    {transfers.find(t => t.id === formData.id)?.name !== '/' ? transfers.find(t => t.id === formData.id)?.name : 'مسودة'}
                                </Badge>
                            ) : null}
                        </DialogTitle>
                    </DialogHeader>

                    {formLoading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-6 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">الفئة (Category)</label>
                                    <select 
                                        className="w-full p-2 border rounded-md"
                                        value={formData.categoryId}
                                        onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                                    >
                                        <option value="">اختر الفئة...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">نوع التحويل (Replenishment Type)</label>
                                    <select 
                                        className="w-full p-2 border rounded-md"
                                        value={formData.replenishmentTypeId}
                                        onChange={(e) => setFormData({...formData, replenishmentTypeId: e.target.value})}
                                    >
                                        <option value="">اختر نوع التحويل...</option>
                                        {replenishmentTypes.map(rep => (
                                            <option key={rep.id} value={rep.id}>{rep.display_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-semibold">المنتجات المراد تحويلها</label>
                                    <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-2">
                                        <Plus className="h-4 w-4" /> إضافة سطر
                                    </Button>
                                </div>
                                
                                <div className="max-h-[50vh] overflow-y-auto p-1 space-y-3">
                                    {formData.lines.map((line, index) => (
                                        <OdooTransferLineRow 
                                            key={index} 
                                            line={line} 
                                            index={index} 
                                            products={products} 
                                            updateLine={updateLine} 
                                            removeLine={removeLine} 
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={formSubmitting}>
                                    إلغاء
                                </Button>
                                <Button onClick={handleFormSubmit} disabled={formSubmitting} className="gap-2">
                                    {formSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    حفظ الفاتورة كمسودة
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            {/* Picking List Columns Filter Dialog */}
            <Dialog open={isPickingDialogOpen} onOpenChange={setIsPickingDialogOpen}>
                <DialogContent className="sm:max-w-[540px]" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Settings2 className="h-5 w-5 text-blue-600" />
                            <span>إعدادات وأعمدة فاتورة التجميع</span>
                        </DialogTitle>
                        <DialogDescription className="text-right">
                            اختر الأعمدة التي ترغب في إظهارها أو إخفائها في فاتورة التجميع قبل الطباعة.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center justify-between text-sm">
                            <span className="font-medium text-blue-800">عدد التحويلات المحددة:</span>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs bg-white"
                                    onClick={() => {
                                        setPickingColumns(DEFAULT_ODOO_PICKING_COLUMNS)
                                        try { localStorage.setItem('odooPickingListColumns', JSON.stringify(DEFAULT_ODOO_PICKING_COLUMNS)) } catch {}
                                    }}
                                >
                                    إظهار الكل
                                </Button>
                                <Badge variant="secondary" className="bg-blue-600 text-white border-none">
                                    {internalSelectedIds.length} عملية
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border rounded-lg p-3 bg-slate-50/50">
                            {[
                                { key: 'showImage', label: 'صورة المنتج (Image)' },
                                { key: 'showCode', label: 'كود المنتج (Code)' },
                                { key: 'showOdooUnit', label: 'وحدة أودو (Odoo Unit)' },
                                { key: 'showBranchesMatrix', label: 'أعمدة الفروع (Matrix)' },
                                { key: 'showBranchWhSubQty', label: 'كمية الموقع داخل خلايا الفروع' },
                                { key: 'showTotalOdooQty', label: 'إجمالي الكمية / كمية أودو' },
                                { key: 'showWhQty', label: 'كمية الموقع (WH Qty)' },
                                { key: 'showWhUnit', label: 'وحدة الموقع (WH Unit)' },
                                { key: 'showDateLot', label: 'التاريخ / اللوت (DATE / LOT)' },
                                { key: 'showActual', label: 'عمود فعلي (Actual)' },
                                { key: 'showPick', label: 'عمود التحضير (✔ Pick)' },
                                { key: 'showCheck', label: 'عمود الفحص (🔍 Check)' },
                            ].map((col) => (
                                <label
                                    key={col.key}
                                    className="flex items-center justify-between gap-2 p-2.5 rounded-md border bg-white hover:bg-blue-50/40 cursor-pointer transition-colors"
                                >
                                    <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                                    <Switch
                                        checked={!!pickingColumns[col.key as keyof OdooPickingListColumnSettings]}
                                        onCheckedChange={(checked) => updatePickingColumn(col.key as keyof OdooPickingListColumnSettings, checked)}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                            onClick={handleGeneratePickingListPDF}
                        >
                            <Printer className="h-4 w-4" />
                            طباعة فاتورة التجميع
                        </Button>
                        <Button variant="outline" onClick={() => setIsPickingDialogOpen(false)}>
                            إلغاء
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <OdooExcelDeductionModal 
                isOpen={isExcelModalOpen} 
                onClose={() => setIsExcelModalOpen(false)}
                mode={excelModalMode}
                selectedIds={excelModalMode === "receive" ? receiveSelectedIds : internalSelectedIds}
                fetchLinesForIds={async (ids) => {
                    if (!ids || ids.length === 0) return [];
                    if (excelModalMode === "receive") {
                        try {
                            const res = await fetchOdooApi(`/api/odoo/po-receipts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids })
                            });
                            const data = await res.json();
                            if (data.success && Array.isArray(data.lines)) {
                                return data.lines;
                            }
                        } catch(e) {}
                        return [];
                    }

                    try {
                        const res = await fetchOdooApi(`/api/odoo/transfers/batch-lines`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids })
                        });
                        const data = await res.json();
                        if (data.success && Array.isArray(data.lines)) {
                            return data.lines;
                        }
                    } catch(e) {}
                    const allLines: any[] = [];
                    for (const id of ids) {
                        try {
                            const res = await fetchOdooApi(`/api/odoo/transfers/${id}`);
                            const data = await res.json();
                            if (data.success && data.lines) {
                                allLines.push(...data.lines);
                            }
                        } catch(e) {}
                    }
                    return allLines;
                }}
            />

            <OdooPOReceiptsModal
                isOpen={isPoReceiptsOpen}
                onClose={() => setIsPoReceiptsOpen(false)}
                onOpenExcelReceiveModal={(receiptIds) => {
                    setExcelModalMode("receive")
                    setReceiveSelectedIds(receiptIds)
                    setIsExcelModalOpen(true)
                }}
            />

            <OdooUnitFixerModal
                isOpen={isUnitFixerOpen}
                onClose={() => setIsUnitFixerOpen(false)}
                transferIds={unitFixerTransferIds}
                transfersInfo={unitFixerTransferIds.map((id) => {
                    const tr = transfers.find((t) => t.id === id);
                    return {
                        id,
                        name: tr?.name && tr.name !== "/" ? tr.name : `طلب #${id}`,
                        branchName: getTransferBranchName(tr),
                        request_status: tr?.request_status,
                    };
                })}
                onUpdated={(updatedLines) => {
                    // 1. Update open details modal lines immediately if open
                    if (selectedTransfer) {
                        setTransferLines((prev) =>
                            prev.map((l) => {
                                const found = updatedLines.find((u) => u.lineId === l.id);
                                if (!found) return l;
                                const newMissing = l.has_moves
                                    ? Math.max(0, found.quantity - (l.reserved_quantity || 0))
                                    : l.missing_quantity;
                                return {
                                    ...l,
                                    quantity: found.quantity,
                                    missing_quantity: newMissing,
                                };
                            })
                        );
                    }
                    // 2. Update open edit form lines if open for that transfer
                    if (isFormOpen && formData.id) {
                        const relevant = updatedLines.filter((u) => u.requestId === formData.id);
                        if (relevant.length > 0) {
                            setFormData((prev) => ({
                                ...prev,
                                lines: prev.lines.map((l) => {
                                    const match = relevant.find(
                                        (r) => r.productId && String(r.productId) === String(l.productId)
                                    );
                                    return match ? { ...l, quantity: match.quantity } : l;
                                }),
                            }));
                        }
                    }
                    // 3. Refresh transfers table in background
                    fetchTransfers();
                }}
            />

            {/* New 3-Type Request Creator Modal (Shafa / Roastery / Purchase Request PR) */}
            <OdooRequestCreatorModal
                isOpen={isCreatorOpen}
                onClose={() => setIsCreatorOpen(false)}
                mode={creatorMode}
                categories={categories}
                replenishmentTypes={replenishmentTypes}
                onSuccess={() => fetchTransfers()}
            />

        </div>
    )
}
