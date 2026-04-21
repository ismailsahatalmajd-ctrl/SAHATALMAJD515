"use client"

import { useState, useMemo, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { normalize } from "@/lib/utils"
import { formatInventoryNumber } from "@/lib/id-generator"
import type { Product, BranchInventoryReport, BranchInventoryReportItem } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { ClipboardList, Search, Trash2, Printer, Save, Plus, Package, ShoppingCart, Filter, Building2, LayoutGrid } from "lucide-react"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"
import { UnitCombobox } from "@/components/unit-combobox"
import { generateInventoryReportPDF } from "@/lib/inventory-report-pdf-generator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { syncBranchInventoryReport } from "@/lib/firebase-sync-engine"

interface BranchInventoryReportProps {
  branchId: string
  branchName: string
}

export function BranchInventoryReportComponent({ branchId, branchName }: BranchInventoryReportProps) {
  // Filters for product selection
  const [productSearch, setProductSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedLocation, setSelectedLocation] = useState("all")

  // Added items (Cart)
  const [items, setItems] = useState<BranchInventoryReportItem[]>([])
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch all products, categories, and locations
  const allProducts = useLiveQuery(() => db.products.toArray()) || []
  
  const categories = useMemo(() => {
    const unique = new Set(allProducts.map(p => p.category).filter(Boolean))
    return Array.from(unique).sort()
  }, [allProducts])

  const locations = useMemo(() => {
    const unique = new Set(allProducts.map(p => p.location).filter(Boolean))
    return Array.from(unique).sort()
  }, [allProducts])

  // Filtered Products for selection
  const filteredProducts = useMemo(() => {
    let result = allProducts
    
    if (productSearch.trim()) {
      const q = normalize(productSearch)
      result = result.filter(p => 
        normalize(p.productName).includes(q) || 
        normalize(p.productCode).includes(q) ||
        (p.itemNumber && normalize(p.itemNumber).includes(q)) ||
        (p.cartonBarcode && normalize(p.cartonBarcode).includes(q))
      )
    }

    if (selectedCategory !== "all") {
      result = result.filter(p => p.category === selectedCategory)
    }

    if (selectedLocation !== "all") {
      result = result.filter(p => p.location === selectedLocation)
    }

    return result
  }, [allProducts, productSearch, selectedCategory, selectedLocation])

  const addItem = (p: Product) => {
    const existing = items.find(i => i.productId === p.id)
    if (existing) {
      toast({ title: "Product already added / المنتج مضاف مسبقاً" })
      return
    }

    const newItem: BranchInventoryReportItem = {
      id: Math.random().toString(36).substring(7),
      productId: p.id,
      productCode: p.productCode,
      productName: p.productName,
      quantity: 1,
      unit: p.unit || "Piece",
      price: p.price || 0,
      image: p.image
    }

    setItems([newItem, ...items])
    toast({ title: "Added / تمت الإضافة", description: p.productName })
  }

  const updateItem = (id: string, field: keyof BranchInventoryReportItem, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast({ title: "No items to save / لا يوجد منتجات للحفظ", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      const reportCode = await formatInventoryNumber(branchId)
      const report: BranchInventoryReport = {
        id: Math.random().toString(36).substring(7),
        reportCode,
        branchId,
        branchName,
        items,
        notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await db.branchInventoryReports.add(report)
      
      // Cloud Sync
      if (typeof window !== 'undefined') {
        syncBranchInventoryReport(report).catch(console.error)
      }

      toast({ title: "Inventory report saved / تم حفظ تقرير الجرد", description: `Code: ${reportCode}` })
      
      await generateInventoryReportPDF(report)

      setItems([])
      setNotes("")
    } catch (error) {
      console.error("Save inventory report error:", error)
      toast({ title: "Error saving report / خطأ في حفظ التقرير", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Product Selection Section - Matching Order/Return System Style */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-1">
          <Label>Unified Search / بحث موحد</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="Search or Scan / ابحث أو امسح الباركود"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Category / تصنيف</Label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="All / الكل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All / الكل</SelectItem>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Location / الموقع</Label>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger>
              <SelectValue placeholder="All / الكل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All / الكل</SelectItem>
              {locations.map(l => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <div className="flex bg-blue-600 text-white px-4 py-2 rounded font-bold shadow-sm items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <span>Cart / السلة: {items.length}</span>
          </div>
        </div>
      </div>

      <div className="overflow-auto border rounded max-h-[600px]">
        <Table>
          <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead>Image / الصورة</TableHead>
              <TableHead>Code / الكود</TableHead>
              <TableHead>Name / الاسم</TableHead>
              <TableHead>Stock / المخزون</TableHead>
              <TableHead>Unit / الوحدة</TableHead>
              <TableHead className="text-right">Add / إضافة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                  {allProducts.length === 0 ? "Loading products..." : "No products matching filters / لا توجد منتجات تطابق البحث"}
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map(p => (
                <TableRow key={p.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell>
                    <ProductImageThumbnail src={p.image} className="w-10 h-10 object-cover rounded border" />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.productCode}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm">{p.productName}</div>
                  </TableCell>
                  <TableCell>
                    {p.quantity > 0 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                        Available / متوفر
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                        Out of Stock / نفذت الكمية
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {p.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      onClick={() => addItem(p)}
                      disabled={items.some(i => i.productId === p.id)}
                    >
                      Add / أضف
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 2. Inventory Report (Cart) Section */}
      {items.length > 0 && (
        <Card className="border-blue-200 shadow-xl shadow-blue-50">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-3 bg-blue-50/50">
            <CardTitle className="text-xl flex items-center gap-2 text-blue-800">
              <ClipboardList className="w-6 h-6" />
              Selected Items / المنتجات المختارة للجرد
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                className="text-slate-500 hover:text-red-600"
                onClick={() => {
                  if (confirm("Clear all items? / مسح جميع المنتجات؟")) setItems([])
                }}
              >
                Clear All / مسح الكل
              </Button>
              <Button 
                onClick={handleSubmit} 
                className="bg-green-600 hover:bg-green-700 shadow-md gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save & Export PDF / حفظ وتصدير"}
                <Printer className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="max-w-xl">
              <Label className="text-slate-500 font-bold mb-2 block">Report Notes / ملاحظات التقرير</Label>
              <Input
                placeholder="Enter overall report notes... / اكتب ملاحظات التقرير العامة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="bg-slate-50"
              />
            </div>

            <div className="border rounded-xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="w-[80px]">Image</TableHead>
                    <TableHead>Product / المنتج</TableHead>
                    <TableHead className="w-[140px] text-center">Qty <br/> الكمية</TableHead>
                    <TableHead className="w-[140px] text-center">Warehouse Unit <br/> وحدة المستودع</TableHead>
                    <TableHead className="w-[180px] text-center">Inventory Unit <br/> وحدة الجرد</TableHead>
                    <TableHead>Notes <br/> ملاحظات</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-mono text-xs text-slate-400">{idx + 1}</TableCell>
                      <TableCell>
                        <ProductImageThumbnail src={item.image} className="w-10 h-10 rounded border bg-white" />
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-sm text-slate-1200 line-clamp-1">{item.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono uppercase">{item.productCode}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24 mx-auto text-center font-bold border-blue-100 focus:border-blue-400 bg-blue-50/30"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-center font-bold text-blue-700 bg-blue-100/50 py-1 rounded border border-blue-100">
                          {item.unit}
                        </div>
                      </TableCell>
                      <TableCell>
                        <UnitCombobox
                          value={item.optionalUnit || ""}
                          onChange={(val) => updateItem(item.id, "optionalUnit", val)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="..."
                          value={item.notes || ""}
                          onChange={(e) => updateItem(item.id, "notes", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
