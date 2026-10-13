"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { Loader2, RefreshCw, ArrowRightLeft, ServerCrash, Eye, Printer, Plus, Trash2, Edit, CheckCircle, XCircle, ChevronDown, Search, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { generateOdooTransferPDF } from "@/lib/odoo-transfer-pdf-generator"
import { generateOdooPickingListPDF } from "@/lib/odoo-picking-list-pdf-generator"
import { generateOdooPickingListExcel } from "@/lib/odoo-picking-list-excel-generator"
import { getWarehouseName } from "@/lib/warehouse-mapping"
import { ProductImage } from "@/components/product-image"
import { OdooExcelDeductionModal } from "@/components/odoo-excel-deduction-modal"
import { fetchOdooApi } from "@/lib/odoo-client"

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
            <div className="w-24 text-center">
                <Badge variant="outline" className="w-full justify-center py-1.5 text-[0.65rem] leading-tight font-bold text-blue-700 bg-blue-50/80 line-clamp-2 min-h-[34px] flex items-center gap-1">
                    {websiteProduct ? `${warehouseQty} ${websiteProduct.unit || ''}` : 'وحدة الموقع'}
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
    const { toast } = useToast()
    const [transfers, setTransfers] = useState<OdooTransfer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'action_needed' | 'waiting' | 'ready' | 'done' | 'drafts' | 'all'>('action_needed')
    const [searchQuery, setSearchQuery] = useState('')
    const [pageSize, setPageSize] = useState<number | 'all'>(15)

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

    // Excel Deduction State
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
    const [isProcessingExcel, setIsProcessingExcel] = useState(false)
    const [excelFile, setExcelFile] = useState<File | null>(null)

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

    const fetchAggregatedLines = async () => {
        const allLinesMap = new Map<string, any>();
        
        const res = await fetchOdooApi(`/api/odoo/transfers/batch-lines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds })
        });
        
        const data = await res.json();
        
        if (data.success && data.lines) {
            data.lines.forEach((line: any) => {
                const lineName = line.product_id ? line.product_id[1] : (line.description || '');
                const matchCode = lineName.match(/^\[(.*?)\]/);
                const code = matchCode ? matchCode[1].trim() : '';
                const name = lineName.replace(/^\[.*?\]\s*/, '').trim();
                const uom = line.product_uom_id ? line.product_uom_id[1] : '';
                
                const key = code || name;
                
                if (allLinesMap.has(key)) {
                    const existing = allLinesMap.get(key);
                    existing.quantity += line.quantity;
                    existing.orderCount += 1;
                } else {
                    allLinesMap.set(key, { code, name, quantity: line.quantity, uom, orderCount: 1 });
                }
            });
        }
        
        return Array.from(allLinesMap.values());
    }

    const handleGeneratePickingListPDF = async () => {
        if (selectedIds.length === 0) return;
        toast({ title: "جاري تجهيز قائمة التجميع (PDF)...", description: "يرجى الانتظار...", duration: 5000 });
        try {
            const aggregatedLines = await fetchAggregatedLines();
            const owners = Array.from(new Set(
                selectedIds.map(id => {
                    const owner = transfers.find(t => t.id === id)?.request_owner_id
                    return Array.isArray(owner) ? owner[1] : undefined
                }).filter(Boolean)
            ));
            const orderIds = Array.from(new Set(
                selectedIds.map(id => transfers.find(t => t.id === id)?.name).filter(n => n && n !== '/')
            ));
            await generateOdooPickingListPDF(aggregatedLines, "قائمة تجميع (مفصلة) - Picking List", owners as string[], orderIds as string[]);
            toast({ title: "تم إنشاء قائمة التجميع!", description: "ستفتح نافذة الطباعة الآن." });
        } catch (error: any) {
            toast({ title: "خطأ", description: "فشل إنشاء القائمة.", variant: "destructive" });
        }
    }

    const handleGeneratePickingListExcel = async () => {
        if (selectedIds.length === 0) return;
        toast({ title: "جاري تجهيز قائمة التجميع (Excel)...", description: "يرجى الانتظار...", duration: 5000 });
        try {
            const aggregatedLines = await fetchAggregatedLines();
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

    const handleCreateNew = () => {
        setFormMode('create')
        setFormData({ id: 0, categoryId: '', replenishmentTypeId: '', lines: [] })
        setIsFormOpen(true)
        fetchFormOptions()
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
        if (!formData.categoryId || !formData.replenishmentTypeId || formData.lines.length === 0) {
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
                    replenishmentTypeId: parseInt(formData.replenishmentTypeId),
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
        <div className="container mx-auto py-10 space-y-6" dir="rtl">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-3 rounded-xl">
                        <ArrowRightLeft className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">التحويلات الداخلية</h1>
                        <p className="text-muted-foreground mt-1">
                            {pageSize === 'all' ? 'عرض كافة العمليات' : `عرض أحدث ${pageSize} عملية تحويل`}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {selectedIds.length > 0 && (
                        <>
                            <Button 
                                onClick={handleGeneratePickingListExcel} 
                                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                <Download className="h-4 w-4" />
                                إكسل
                            </Button>
                            <Button 
                                onClick={handleGeneratePickingListPDF} 
                                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Printer className="h-4 w-4" />
                                فاتورة التجميع
                                <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-[10px]">{selectedIds.length}</Badge>
                            </Button>
                            <Button 
                                onClick={() => setIsExcelModalOpen(true)} 
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                أتمتة خصم المخزون
                            </Button>
                        </>
                    )}
                    <Button onClick={handleCreateNew} className="gap-2 bg-primary">
                        <Plus className="h-4 w-4" />
                        إنشاء تحويل داخلي جديد
                    </Button>
                    <Button onClick={fetchTransfers} disabled={loading} variant="outline" className="gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        تحديث
                    </Button>
                </div>
            </div>

            {error ? (
                <Card className="border-red-200 bg-red-50/50">
                    <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                        <ServerCrash className="h-12 w-12 text-red-500" />
                        <div>
                            <h3 className="text-lg font-bold text-red-800 mb-1">تعذر الاتصال بـ Odoo</h3>
                            <p className="text-red-600">{error}</p>
                        </div>
                        <Button variant="destructive" onClick={fetchTransfers}>إعادة المحاولة</Button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-2">
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
                                        className={`pb-2 px-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="text" 
                                    placeholder="بحث برقم العملية أو المستودع..." 
                                    className="p-2 border rounded-md text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <select 
                                    className="p-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
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
                    </CardHeader>
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
                            <div className="rounded-md border overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-12 text-center">
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
                                            <TableCell className="text-right">رقم العملية<br />/Order ID</TableCell>
                                            <TableHead className="text-right">تاريخ الطلب<br />/Date</TableHead>
                                            <TableHead className="text-right">الفئة<br />/Type</TableHead>
                                            <TableHead className="text-right">صاحب الطلب<br />/Customer</TableHead> 
                                            <TableHead className="text-right">نوع التحويل<br />/Transfer Type</TableHead>                                                               
                                            <TableHead className="text-center">الحالة<br />/Status</TableHead>
                                            <TableHead className="text-center">الاجراءات<br />/Actions</TableHead>
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
                                                                <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} disabled={isLoading} title="تعديل">
                                                                    <Edit className="h-4 w-4 text-blue-500" />
                                                                </Button>
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
                                </Table>
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
            <OdooExcelDeductionModal 
                isOpen={isExcelModalOpen} 
                onClose={() => setIsExcelModalOpen(false)}
                selectedIds={selectedIds}
                fetchLinesForIds={async (ids) => {
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

        </div>
    )
}
