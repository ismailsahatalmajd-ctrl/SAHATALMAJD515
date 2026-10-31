"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, ShoppingCart, Plus, Minus, Trash2 } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { addAssetInvoice } from "@/lib/assets-storage"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { generateAssetBranchRequestPDF } from "@/lib/assets-pdf-generator"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"
import { Label } from "@/components/ui/label"

interface BranchAssetsCatalogProps {
    branchId: string
    branchName: string
}

export function BranchAssetsCatalog({ branchId, branchName }: BranchAssetsCatalogProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [filterCategory, setFilterCategory] = useState<"ALL" | "ASSET" | "MATERIAL">("ALL")
    const [cart, setCart] = useState<{ asset: any; quantity: number }[]>([])
    const [isCartOpen, setIsCartOpen] = useState(false)
    const [generalNotes, setGeneralNotes] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const assetItems = useLiveQuery(() => db.assetItems.toArray()) || []

    const filteredItems = useMemo(() => {
        return assetItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  item.code.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = filterCategory === "ALL" || item.category === filterCategory;
            return matchesSearch && matchesCat;
        })
    }, [assetItems, searchTerm, filterCategory])

    const addToCart = (asset: any) => {
        setCart(prev => {
            const existing = prev.find(i => i.asset.id === asset.id)
            if (existing) {
                return prev.map(i => i.asset.id === asset.id ? { ...i, quantity: i.quantity + 1 } : i)
            }
            return [...prev, { asset, quantity: 1 }]
        })
        toast({ title: "تم الإضافة", description: `تمت إضافة ${asset.name} إلى السلة` })
    }

    const updateQuantity = (id: string, qty: number) => {
        if (qty <= 0) {
            setCart(prev => prev.filter(i => i.asset.id !== id))
            return
        }
        setCart(prev => prev.map(i => i.asset.id === id ? { ...i, quantity: qty } : i))
    }

    const handleSubmit = async () => {
        if (cart.length === 0) return
        setIsSubmitting(true)

        try {
            const invoiceItems = cart.map(item => ({
                id: crypto.randomUUID(),
                assetId: item.asset.id,
                name: item.asset.name,
                code: item.asset.code,
                image: item.asset.image,
                requestedQuantity: item.quantity,
                remainingInBranch: 0, 
                status: "PENDING" as const,
                category: item.asset.category,
                subCategory: item.asset.subCategory,
                type: item.asset.type
            }))

            const newInvoice = await addAssetInvoice({
                invoiceNumber: `REQ-AST-${Date.now().toString().slice(-6)}`,
                branchId,
                branchName,
                items: invoiceItems,
                status: "PENDING",
                generalNotes,
                requestedAt: new Date().toISOString(),
            } as any) 

            generateAssetBranchRequestPDF(newInvoice).catch(console.error)

            toast({ title: "تم إرسال الطلب", description: "تم إرسال طلب الأصول والمواد للمستودع بنجاح." })
            setCart([])
            setIsCartOpen(false)
            setGeneralNotes("")
        } catch (e) {
            console.error(e)
            toast({ title: "خطأ", description: "حدث خطأ أثناء إرسال الطلب", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header / Search / Cart Button */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                <div className="flex gap-4 flex-1 w-full">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input 
                            placeholder="ابحث عن أصل أو مادة بالاسم أو الكود..." 
                            className="pr-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                        <Button 
                            variant={filterCategory === "ALL" ? "default" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilterCategory("ALL")}
                            className={filterCategory === "ALL" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                        >
                            الكل
                        </Button>
                        <Button 
                            variant={filterCategory === "ASSET" ? "default" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilterCategory("ASSET")}
                            className={filterCategory === "ASSET" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                        >
                            أصول فقط
                        </Button>
                        <Button 
                            variant={filterCategory === "MATERIAL" ? "default" : "ghost"} 
                            size="sm" 
                            onClick={() => setFilterCategory("MATERIAL")}
                            className={filterCategory === "MATERIAL" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                        >
                            مواد فقط
                        </Button>
                    </div>
                </div>
                
                <Button 
                    className="relative bg-orange-500 hover:bg-orange-600 text-white w-full md:w-auto h-12 px-6 rounded-xl transition-all shadow-md hover:shadow-lg"
                    onClick={() => setIsCartOpen(true)}
                >
                    <ShoppingCart className="ml-2 h-5 w-5" />
                    السلة
                    {cart.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center animate-pulse">
                            {cart.length}
                        </span>
                    )}
                </Button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-10">
                {filteredItems.map(item => {
                    const cartItem = cart.find(i => i.asset.id === item.id)
                    return (
                        <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow bg-white flex flex-col group border-gray-200">
                            <div className="relative aspect-square bg-gray-50 border-b overflow-hidden p-4">
                                <ProductImageThumbnail 
                                    src={item.image} 
                                    alt={item.name}
                                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute top-2 right-2">
                                    <Badge variant={item.category === "ASSET" ? "default" : "secondary"} className={item.category === "MATERIAL" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-blue-600 hover:bg-blue-600"}>
                                        {item.category === "ASSET" ? "أصل" : "مادة"}
                                    </Badge>
                                </div>
                            </div>
                            <CardContent className="p-4 flex-1 flex flex-col">
                                <div className="text-xs text-gray-500 mb-1">{item.code}</div>
                                <h3 className="font-bold text-sm leading-tight text-gray-800 line-clamp-2 mb-2 flex-1">{item.name}</h3>
                                
                                <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
                                    <span>الوحدة: {item.unit || "حبة"}</span>
                                </div>

                                {cartItem ? (
                                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-1 border">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => updateQuantity(item.id, cartItem.quantity - 1)}>
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className="font-bold text-blue-700">{cartItem.quantity}</span>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => updateQuantity(item.id, cartItem.quantity + 1)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button 
                                        className="w-full bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 transition-colors"
                                        onClick={() => addToCart(item)}
                                    >
                                        <Plus className="ml-2 h-4 w-4" /> إضافة للسلة
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
                {filteredItems.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-500">
                        لا يوجد أصول أو مواد تطابق بحثك.
                    </div>
                )}
            </div>

            {/* Cart Dialog */}
            <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
                <DialogContent className="max-w-2xl bg-gray-50" dir="rtl">
                    <DialogHeader className="bg-white p-6 border-b -mx-6 -mt-6 mb-6 rounded-t-lg">
                        <DialogTitle className="text-xl flex items-center">
                            <ShoppingCart className="ml-2 h-6 w-6 text-orange-500" />
                            سلة طلبات الأصول والمواد
                        </DialogTitle>
                    </DialogHeader>

                    {cart.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            السلة فارغة. قم بإضافة الأصول والمواد أولاً.
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto px-2">
                            {cart.map(item => (
                                <div key={item.asset.id} className="flex items-center gap-4 bg-white p-3 rounded-lg border shadow-sm">
                                    <ProductImageThumbnail src={item.asset.image} alt={item.asset.name} className="w-16 h-16 rounded object-cover border" />
                                    <div className="flex-1">
                                        <div className="text-xs text-gray-500">{item.asset.code}</div>
                                        <h4 className="font-bold text-sm">{item.asset.name}</h4>
                                        <div className="text-xs text-gray-400 mt-1">الوحدة: {item.asset.unit || "حبة"}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border">
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.asset.id, item.quantity - 1)}>
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="font-bold w-6 text-center">{item.quantity}</span>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.asset.id, item.quantity + 1)}>
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-red-500 h-6 px-2 text-xs" onClick={() => updateQuantity(item.asset.id, 0)}>
                                            <Trash2 className="ml-1 h-3 w-3" /> إزالة
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            <div className="mt-6 space-y-2">
                                <Label>ملاحظات عامة للطلب (اختياري)</Label>
                                <Textarea 
                                    placeholder="اكتب أي ملاحظات أو توضيح لسبب الطلب..."
                                    value={generalNotes}
                                    onChange={(e) => setGeneralNotes(e.target.value)}
                                    className="resize-none"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-white p-4 border-t -mx-6 -mb-6 mt-6 rounded-b-lg flex justify-between items-center w-full sm:justify-between">
                        <div className="text-gray-500 text-sm">
                            إجمالي العناصر: <span className="font-bold text-blue-600 text-lg mx-1">{cart.length}</span>
                        </div>
                        <Button 
                            className="bg-orange-500 hover:bg-orange-600 text-white px-8" 
                            disabled={cart.length === 0 || isSubmitting}
                            onClick={handleSubmit}
                        >
                            {isSubmitting ? "جاري الإرسال..." : "تأكيد وإرسال الطلب"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
