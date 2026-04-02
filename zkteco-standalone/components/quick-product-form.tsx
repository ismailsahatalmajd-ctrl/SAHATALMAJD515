"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, X, Loader2, Save, PackagePlus } from "lucide-react"
import { addProduct, generateNextItemNumber } from "@/lib/storage"
import { CategoryCombobox } from "./category-combobox"
import { LocationCombobox } from "./location-combobox"
import { UnitCombobox } from "./unit-combobox"
import { useToast } from "@/hooks/use-toast"
import { getSafeImageSrc } from "@/lib/utils"
import type { Product } from "@/lib/types"

interface QuickProductFormProps {
    onSuccess: (product: Product) => void
    onCancel?: () => void
}

export function QuickProductForm({ onSuccess, onCancel }: QuickProductFormProps) {
    const { toast } = useToast()
    const [isSaving, setIsSaving] = useState(false)
    const [formData, setFormData] = useState<Partial<Product>>({
        productName: "",
        productCode: "",
        itemNumber: "",
        category: "",
        location: "",
        unit: "قطعة",
        openingStock: 0,
        currentStock: 0,
        price: 0,
    })
    const [imagePreview, setImagePreview] = useState<string | undefined>(undefined)

    useEffect(() => {
        setFormData(prev => ({ ...prev, itemNumber: generateNextItemNumber() }))
    }, [])

    const handleChange = (field: keyof Product, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onloadend = () => {
            const base64 = reader.result as string
            setImagePreview(base64)
            setFormData(prev => ({ ...prev, image: base64 }))
        }
        reader.readAsDataURL(file)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.productName || !formData.productCode) {
            toast({ title: "بيانات ناقصة", description: "يرجى إدخال اسم المنتج وكوده", variant: "destructive" })
            return
        }

        setIsSaving(true)
        try {
            const newProduct = await addProduct(formData as Product)
            toast({ title: "تمت الإضافة", description: `تم حفظ ${newProduct.productName} بنجاح` })
            onSuccess(newProduct)
        } catch (error) {
            console.error(error)
            toast({ title: "خطأ", description: "فشل حفظ المنتج", variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold text-sm border-b pb-2">
                <PackagePlus className="h-4 w-4" />
                <span>إضافة منتج جديد سريع / Quick Add</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">رقم المنتج (تلقائي)</Label>
                    <Input
                        value={formData.itemNumber}
                        readOnly
                        className="h-8 text-xs bg-slate-100 font-mono"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">كود الصنف / Code</Label>
                    <Input
                        value={formData.productCode}
                        onChange={e => handleChange("productCode", e.target.value)}
                        className="h-8 text-xs"
                        required
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-slate-500 font-bold">اسم المنتج / Name</Label>
                <Input
                    value={formData.productName}
                    onChange={e => handleChange("productName", e.target.value)}
                    className="h-8 text-xs"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">التصنيف / Category</Label>
                    <CategoryCombobox
                        value={formData.category || ""}
                        onChange={val => handleChange("category", val)}
                        className="h-8 bg-white border-slate-200"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">الموقع / Location</Label>
                    <LocationCombobox
                        value={formData.location || ""}
                        onChange={val => handleChange("location", val)}
                        className="h-8 bg-white border-slate-200"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">الوحدة / Unit</Label>
                    <UnitCombobox
                        value={formData.unit || ""}
                        onChange={val => handleChange("unit", val)}
                        className="h-8 bg-white border-slate-200"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-bold">الصورة / Image</Label>
                    <div className="flex gap-2">
                        {imagePreview ? (
                            <div className="relative h-8 w-8 rounded border overflow-hidden">
                                <img src={getSafeImageSrc(imagePreview)} className="h-full w-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => setImagePreview(undefined)}
                                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 hover:opacity-100 transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <label className="h-8 w-8 flex items-center justify-center border-2 border-dashed rounded bg-white hover:bg-slate-50 cursor-pointer">
                                <Upload className="h-3 w-3 text-slate-400" />
                                <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                            </label>
                        )}
                        <span className="text-[9px] text-slate-400 self-center">PNG/JPG</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
                <Button
                    type="submit"
                    className="flex-1 h-8 text-xs font-bold gap-1"
                    disabled={isSaving}
                >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    حفظ المنتج / Save Product
                </Button>
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-xs font-bold"
                        onClick={onCancel}
                    >
                        إلغاء
                    </Button>
                )}
            </div>
        </form>
    )
}
