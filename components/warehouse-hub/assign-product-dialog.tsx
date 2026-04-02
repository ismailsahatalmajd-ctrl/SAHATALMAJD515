"use client"

import React, { useState, useMemo } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs'
import { Search, Package, Plus, CheckCircle2 } from 'lucide-react'
import { updateProduct, addProduct, getProducts } from '@/lib/storage'
import { WarehouseLocation, Product } from '@/lib/types'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface AssignProductDialogProps {
  location: WarehouseLocation | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AssignProductDialog({ location, open, onOpenChange, onSuccess }: AssignProductDialogProps) {
  const [tab, setTab] = useState('existing')
  const [searchTerm, setSearchTerm] = useState('')
  const { toast } = useToast()
  
  // New product form
  const [newProduct, setNewProduct] = useState({
    name: '',
    code: '',
    stock: '0',
    price: '0'
  })

  const allProducts = getProducts()
  
  const filteredProducts = useMemo(() => {
    // If no search term, show general products (limit for performance)
    if (searchTerm.length < 1) {
      return allProducts.slice(0, 20)
    }
    
    // Search across all products by name or code
    return allProducts.filter(p => 
      p.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.productCode.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 30)
  }, [allProducts, searchTerm])

  const handleAssign = async (productId: string) => {
    if (!location) return
    
    await updateProduct(productId, {
      warehousePositionCode: location.positionCode
    })

    toast({
      title: "تم ربط المنتج بنجاح",
      description: `تم تعيين المنتج للموقع ${location.positionCode}`,
      className: "bg-slate-900 border-slate-700 text-white"
    })
    
    onSuccess()
    setSearchTerm('')
    setNewProduct({ name: '', code: '', stock: '0', price: '0' })
    setTab('existing')
    onOpenChange(false)
  }

  const handleCreateAndAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!location) return

    const productData: any = {
      productName: newProduct.name,
      productCode: newProduct.code || `PROD-${Date.now().toString().slice(-6)}`,
      openingStock: parseFloat(newProduct.stock),
      price: parseFloat(newProduct.price),
      warehousePositionCode: location.positionCode,
      unit: "Piece",
      category: "Uncategorized"
    }

    await addProduct(productData)

    toast({
      title: "تم إنشاء وتعريف المنتج",
      description: `تم إضافة ${newProduct.name} وتعيينه للموقع ${location.positionCode}`,
      className: "bg-slate-900 border-slate-700 text-white"
    })

    onSuccess()
    setSearchTerm('')
    setNewProduct({ name: '', code: '', stock: '0', price: '0' })
    setTab('existing')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[500px] p-0 overflow-hidden rounded-3xl">
        <div className="bg-gradient-to-br from-primary/30 via-slate-950 to-slate-950 p-6 border-b border-slate-800">
          <DialogTitle className="text-2xl font-black mb-1">تخزين منتج / Store Product</DialogTitle>
          <DialogDescription className="text-slate-500 font-bold">
            الموقع المستهدف: <span className="text-primary font-black tracking-widest">{location?.positionCode}</span>
          </DialogDescription>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="px-6 pt-4 border-b border-slate-900">
            <TabsList className="bg-slate-900/50 w-full p-1 h-12 rounded-2xl border border-slate-800">
              <TabsTrigger value="existing" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white gap-2">
                <Package className="h-4 w-4" /> ربط منتج موجود
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white gap-2">
                <Plus className="h-4 w-4" /> إضافة منتج جديد
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="existing" className="p-6 focus-visible:ring-0">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="ابحث باسم المنتج أو الكود..."
                className="bg-slate-900 border-slate-800 pl-9 h-11 rounded-xl focus:border-primary transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredProducts.map(p => (
                <div 
                  key={p.id} 
                  className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-slate-950 rounded-xl flex items-center justify-center border border-slate-800">
                      <Package className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{p.productName}</p>
                      <p className="text-[10px] text-slate-500 font-mono uppercase">{p.productCode}</p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="hover:bg-primary/20 hover:text-primary rounded-xl"
                    onClick={() => handleAssign(p.id)}
                  >
                    تخزين هنا
                  </Button>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="py-10 text-center bg-slate-900/40 rounded-3xl border-2 border-dashed border-slate-800">
                   <Package className="h-8 w-8 text-slate-800 mx-auto mb-2" />
                   <p className="text-slate-600 text-xs font-bold">لا توجد منتجات مطابقة غير مخزنة</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="new" className="p-6 focus-visible:ring-0">
            <form onSubmit={handleCreateAndAssign} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">اسم المنتج</Label>
                <Input 
                  required
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  className="bg-slate-900 border-slate-800 h-11 rounded-xl"
                  placeholder="مثال: زيت محرك 10W40"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">كود المنتج (اختياري)</Label>
                  <Input 
                    value={newProduct.code}
                    onChange={e => setNewProduct({...newProduct, code: e.target.value})}
                    className="bg-slate-900 border-slate-800 h-11 rounded-xl font-mono"
                    placeholder="Auto-generated if empty"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">الكمية الابتدائية</Label>
                  <Input 
                    type="number"
                    value={newProduct.stock}
                    onChange={e => setNewProduct({...newProduct, stock: e.target.value})}
                    className="bg-slate-900 border-slate-800 h-11 rounded-xl"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 font-black rounded-2xl mt-4">
                إنشاء المنتج وتخزينه في {location?.positionCode}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        
        <div className="p-4 bg-slate-950 border-t border-slate-900 text-[9px] text-center text-slate-600 font-bold uppercase tracking-[0.2em]">
          Warehouse Logistics Protocol v2.5
        </div>
      </DialogContent>
    </Dialog>
  )
}
