"use client"

import { useState, useMemo, useEffect } from "react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Box, 
  Map as MapIcon, 
  Plus, 
  Search, 
  Settings2, 
  Layers, 
  Info,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  getWarehouseLocations, 
  addWarehouseLocation, 
  updateWarehouseLocation, 
  deleteWarehouseLocation,
  getProducts,
  updateProduct
} from "@/lib/storage"
import { WarehouseLocation, Product } from "@/lib/types"
import { subscribe } from "@/lib/events"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { Package } from "lucide-react"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Warehouse3DView from "@/components/warehouse/warehouse-3d-view"

export default function WarehouseLayoutPage() {
  const [locations, setWarehouseLocations] = useState<WarehouseLocation[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("W1")
  const [selectedZone, setSelectedZone] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d")
  const [highlightedPosition, setHighlightedPosition] = useState<string | undefined>()
  
  // Form State for adding new location
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLoc, setNewLoc] = useState({
    warehouse: "W1",
    zone: "Z1",
    aisle: "A1",
    rack: "R1",
    level: "1",
    side: "R",
    notes: "",
    productId: "none"
  })

  // Bulk Assignment State
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [selectedLocationForView, setSelectedLocationForView] = useState<WarehouseLocation | null>(null)
  const [bulkData, setBulkData] = useState({
    warehouse: "W1",
    zone: "Z1",
    aisle: "A1",
    rack: "R1",
    level: "1",
    side: "R",
    selectedProductIds: [] as string[],
    productSearch: ""
  })

  const zones = useMemo(() => {
    const z = new Set(locations.map(l => l.zone))
    return Array.from(z).sort()
  }, [locations])

  const aisles = useMemo(() => {
    const existing = Array.from(new Set(locations.map(l => l.aisle))).filter(Boolean)
    const numbers = existing.map(a => parseInt(a.replace(/\D/g, ''))).filter(n => !isNaN(n))
    const max = Math.max(10, ...numbers)
    return Array.from({ length: max + 1 }, (_, i) => `A${i + 1}`)
  }, [locations])

  const racks = useMemo(() => {
    const existing = Array.from(new Set(locations.map(l => l.rack))).filter(Boolean)
    const numbers = existing.map(r => parseInt(r.replace(/\D/g, ''))).filter(n => !isNaN(n))
    const max = Math.max(10, ...numbers)
    return Array.from({ length: max + 1 }, (_, i) => `R${i + 1}`)
  }, [locations])

  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      const matchSearch = loc.positionCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         loc.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchWarehouse = selectedWarehouse === "all" || loc.warehouse === selectedWarehouse
      const matchZone = selectedZone === "all" || loc.zone === selectedZone
      return matchSearch && matchWarehouse && matchZone
    })
  }, [locations, searchTerm, selectedWarehouse, selectedZone])

  useEffect(() => {
    if (searchTerm && filteredLocations.length > 0 && filteredLocations.length < 5) {
      setHighlightedPosition(filteredLocations[0].positionCode)
    } else {
      setHighlightedPosition(undefined)
    }
  }, [searchTerm, filteredLocations])

  const deduplicatedLocations = useMemo(() => {
    const seen = new Set<string>()
    return filteredLocations.filter(loc => {
      if (seen.has(loc.positionCode)) return false
      seen.add(loc.positionCode)
      return true
    })
  }, [filteredLocations])

  const warehouses = ["W1", "W2", "W3", "W4", "W5"]

  useEffect(() => {
    const loadData = () => {
      setWarehouseLocations(getWarehouseLocations())
      setProducts(getProducts())
    }
    loadData()
    return subscribe("change", loadData)
  }, [])

  const filteredBulkProducts = useMemo(() => {
    return products.filter(p => {
      const search = bulkData.productSearch.toLowerCase()
      return p.productName.toLowerCase().includes(search) || 
             (p.productCode && p.productCode.toLowerCase().includes(search)) ||
             (p.warehousePositionCode && p.warehousePositionCode.toLowerCase().includes(search))
    })
  }, [products, bulkData.productSearch])

  const handleAddLocation = async () => {
    if (!newLoc.warehouse || !newLoc.zone || !newLoc.aisle || !newLoc.rack) {
      toast({ title: "يرجى إكمال البيانات الأساسية", variant: "destructive" })
      return
    }

    const positionCode = `${newLoc.warehouse}-${newLoc.zone}-${newLoc.aisle}-${newLoc.rack}-L${newLoc.level}-${newLoc.side}`
    
    // Check if location already exists
    const existingLoc = locations.find(loc => loc.positionCode === positionCode)
    if (existingLoc) {
      toast({ title: "هذا الموقع موجود بالفعل", variant: "destructive" })
      return
    }
    
    const createdLoc = await addWarehouseLocation({
      warehouse: newLoc.warehouse,
      zone: newLoc.zone,
      aisle: newLoc.aisle,
      rack: newLoc.rack,
      level: newLoc.level,
      side: newLoc.side,
      positionCode,
      status: "active",
      notes: newLoc.notes
    })

    // If a product was selected, link it to this new location
    if (newLoc.productId && newLoc.productId !== "none") {
      await updateProduct(newLoc.productId, {
        warehouseLocationId: createdLoc.id,
        warehousePositionCode: createdLoc.positionCode
      })
    }

    toast({ title: "تم إضافة الموقع بنجاح" })
    setShowAddForm(false)
    // Reset but keep warehouse/zone for faster entry
    setNewLoc(prev => ({ ...prev, notes: "", productId: "none" }))
  }

  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  const handleBulkAssign = async () => {
    console.log('=== BULK ASSIGN START ===')
    console.log('isBulkAssigning:', isBulkAssigning)
    console.log('bulkData:', bulkData)
    
    if (isBulkAssigning) {
      console.log('Already in progress, exiting...')
      return
    }

    setIsBulkAssigning(true)
    console.log('Set isBulkAssigning to true')
    
    try {
      if (bulkData.selectedProductIds.length === 0) {
        console.log('No products selected')
        toast({ title: "يرجى اختيار منتج واحد على الأقل", variant: "destructive" })
        return
      }

      console.log('Creating position code...')
      const positionCode = `${bulkData.warehouse}-${bulkData.zone}-${bulkData.aisle}-${bulkData.rack}-L${bulkData.level}-${bulkData.side}`
      console.log('Position code:', positionCode)
      
      // 1. Check if location already exists
      console.log('Checking if location already exists...')
      console.log('Total locations:', locations.length)
      console.log('Deduplicated locations:', deduplicatedLocations.length)
      
      const existingLoc = deduplicatedLocations.find(loc => loc.positionCode === positionCode) || 
                        locations.find(loc => loc.positionCode === positionCode)
      
      console.log('Existing location found:', existingLoc)
      
      let targetLoc
      if (existingLoc) {
        console.log('Using existing location:', existingLoc)
        targetLoc = existingLoc
      } else {
        // 2. Create new location
        console.log('Creating new warehouse location...')
        targetLoc = await addWarehouseLocation({
          warehouse: bulkData.warehouse,
          zone: bulkData.zone,
          aisle: bulkData.aisle,
          rack: bulkData.rack,
          level: bulkData.level,
          side: bulkData.side,
          positionCode,
          status: "active"
        })
        console.log('New location created:', targetLoc)
      }

      // 3. Update products
      console.log('Updating products...')
      console.log('Products to update:', bulkData.selectedProductIds)
      
      for (const pid of bulkData.selectedProductIds) {
        console.log('Updating product:', pid)
        await updateProduct(pid, {
          warehouseLocationId: targetLoc.id,
          warehousePositionCode: targetLoc.positionCode
        })
        console.log('Product updated successfully')
      }

      console.log('All products updated')
      toast({ title: `تم تعيين ${bulkData.selectedProductIds.length} منتج للموقع ${targetLoc.positionCode} بنجاح` })
      setShowBulkForm(false)
      setBulkData(prev => ({ ...prev, selectedProductIds: [] }))
    } catch (error) {
      console.error('Error in bulk assign:', error)
      toast({ title: "حدث خطأ أثناء تعيين المواقع", variant: "destructive" })
    } finally {
      console.log('Setting isBulkAssigning to false')
      setIsBulkAssigning(false)
      console.log('=== BULK ASSIGN END ===')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <MapIcon className="h-8 w-8 text-primary" />
              مخطط المستودع / Warehouse Layout
            </h1>
            <p className="text-muted-foreground text-base mt-1">إدارة المناطق والممرات والرفوف وتوزيع المنتجات</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowBulkForm(!showBulkForm)} variant="outline" className="h-12 px-6 font-black gap-2 shadow-sm border-primary text-primary hover:bg-primary/5">
              <Layers className="h-5 w-5" /> تعيين دفعة واحدة / Bulk Assign
            </Button>
            <Button onClick={() => setShowAddForm(!showAddForm)} className="h-12 px-6 font-black gap-2 shadow-lg">
              <Plus className="h-5 w-5" /> تسجيل موقع جديد / New Location
            </Button>
          </div>
        </div>

        {showBulkForm && (
          <Card className="border-2 border-orange-500/20 shadow-xl animate-in slide-in-from-top-4 duration-300">
            <CardHeader className="bg-orange-500/5 border-b py-4">
              <CardTitle className="text-lg font-black flex items-center gap-2 text-orange-700">
                <Layers className="h-5 w-5" /> تعيين موقع لمجموعة منتجات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold">المستودع</Label>
                  <Select value={bulkData.warehouse} onValueChange={v => setBulkData({...bulkData, warehouse: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">المنطقة</Label>
                  <Input placeholder="Z1" value={bulkData.zone} onChange={e => setBulkData({...bulkData, zone: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الممر</Label>
                  <Select value={bulkData.aisle} onValueChange={v => setBulkData({...bulkData, aisle: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {aisles.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الرف</Label>
                  <Select value={bulkData.rack} onValueChange={v => setBulkData({...bulkData, rack: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {racks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">المستوى</Label>
                  <Select value={bulkData.level} onValueChange={v => setBulkData({...bulkData, level: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الاتجاه</Label>
                  <Select value={bulkData.side} onValueChange={v => setBulkData({...bulkData, side: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R">يمين</SelectItem>
                      <SelectItem value="L">يسار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <Label className="font-bold">اختر المنتجات / Select Products</Label>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="بحث عن منتج أو موقع..." 
                      value={bulkData.productSearch}
                      onChange={(e) => setBulkData({...bulkData, productSearch: e.target.value})}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
                <div className="border rounded-md p-2 max-h-60 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredBulkProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer border border-slate-100 hover:border-slate-300 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={bulkData.selectedProductIds.includes(p.id)}
                        onChange={(e) => {
                          const ids = e.target.checked 
                            ? [...bulkData.selectedProductIds, p.id]
                            : bulkData.selectedProductIds.filter(id => id !== p.id)
                          setBulkData({...bulkData, selectedProductIds: ids})
                        }}
                        className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate">{p.productName}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                            {p.productCode || 'N/A'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-black">
                            الموقع الحالي: {p.warehousePositionCode || '-'}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                  {filteredBulkProducts.length === 0 && (
                    <div className="col-span-full py-8 text-center text-muted-foreground italic">
                      لا توجد منتجات تطابق البحث
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button 
                  onClick={handleBulkAssign} 
                  disabled={isBulkAssigning || bulkData.selectedProductIds.length === 0}
                  className="h-10 px-8 font-black bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkAssigning ? 'جاري المعالجة...' : 'تطبيق على الكل / Apply Bulk'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showAddForm && (
          <Card className="border-2 border-primary/20 shadow-xl animate-in slide-in-from-top-4 duration-300">
            <CardHeader className="bg-primary/5 border-b py-4">
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> إضافة موقع تخزين جديد
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold">المستودع / Warehouse</Label>
                  <Select value={newLoc.warehouse} onValueChange={v => setNewLoc({...newLoc, warehouse: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">المنطقة / Zone</Label>
                  <Input placeholder="مثال: Z1" value={newLoc.zone} onChange={e => setNewLoc({...newLoc, zone: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الممر / Aisle</Label>
                  <Select value={newLoc.aisle} onValueChange={v => setNewLoc({...newLoc, aisle: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {aisles.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الرف / Rack</Label>
                  <Select value={newLoc.rack} onValueChange={v => setNewLoc({...newLoc, rack: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {racks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">المستوى / Level</Label>
                  <Select value={newLoc.level} onValueChange={v => setNewLoc({...newLoc, level: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 (أرضي / Ground)</SelectItem>
                      <SelectItem value="2">2 (وسط / Middle)</SelectItem>
                      <SelectItem value="3">3 (علوي / Top)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">الاتجاه / Side</Label>
                  <Select value={newLoc.side} onValueChange={v => setNewLoc({...newLoc, side: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R">يمين / Right</SelectItem>
                      <SelectItem value="L">يسار / Left</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">المنتج / Product (اختياري)</Label>
                  <Select value={newLoc.productId} onValueChange={v => setNewLoc({...newLoc, productId: v})}>
                    <SelectTrigger><SelectValue placeholder="اختر منتجاً لربطه" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون منتج / No Product</SelectItem>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.productName} ({p.productCode})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label className="font-bold">ملاحظات إضافية / Notes</Label>
                  <Input placeholder="..." value={newLoc.notes} onChange={e => setNewLoc({...newLoc, notes: e.target.value})} />
                </div>
                <Button onClick={handleAddLocation} className="h-10 px-8 font-black bg-green-600 hover:bg-green-700">حفظ الموقع / Save</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader className="bg-slate-900 text-white py-4">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" /> تصفية وبحث
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="font-black">بحث برمز الموقع</Label>
                  <Input 
                    placeholder="ابحث عن Z1-A2..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black">تصفية حسب المستودع</Label>
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كافة المستودعات / All Warehouses</SelectItem>
                      {warehouses.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-black">تصفية حسب المنطقة</Label>
                  <Select value={selectedZone} onValueChange={setSelectedZone}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كافة المناطق / All Zones</SelectItem>
                      {zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-blue-100">
              <CardHeader className="bg-blue-50 py-4">
                <CardTitle className="text-sm font-black flex items-center gap-2 text-blue-900">
                  <Info className="h-4 w-4" /> إحصائيات المواقع
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold border-b pb-2">
                  <span>إجمالي المواقع:</span>
                  <Badge variant="outline" className="text-lg">{locations.length}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm font-bold border-b pb-2">
                  <span>مواقع مشغولة:</span>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-0">{products.filter(p => p.warehouseLocationId).length}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm font-bold border-b pb-2">
                  <span>مواقع فارغة:</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">{locations.length - products.filter(p => p.warehouseLocationId).length}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Visual/List Area */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-xl shadow-xl border overflow-hidden">
              <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="text-primary border-primary">Layout View</Badge>
                  <span className="font-black text-lg">الخريطة التفاعلية للمستودع</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 bg-green-500 rounded-full"></div> فارغ</div>
                  <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 bg-orange-500 rounded-full"></div> مشغول</div>
                </div>
              </div>
              
              <div className="p-8 bg-slate-100/50 min-h-[400px] flex flex-wrap gap-6 justify-center">
                {/* Visual Representation of Zones/Aisles */}
                {zones.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
                    <MapIcon className="h-20 w-20" />
                    <p className="font-black text-xl">لا توجد مناطق معرفة حالياً</p>
                  </div>
                ) : (
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "2d" | "3d")} className="w-full">
                    <div className="flex justify-center p-4 bg-slate-100 border-b">
                      <TabsList className="bg-slate-200">
                        <TabsTrigger value="3d" className="font-black gap-2">
                          <Box className="h-4 w-4" /> العرض ثلاثي الأبعاد / 3D
                        </TabsTrigger>
                        <TabsTrigger value="2d" className="font-black gap-2">
                          <MapIcon className="h-4 w-4" /> المخطط الثنائي / 2D
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="2d" className="p-8 flex flex-wrap gap-6 justify-center">
                      {zones.map(zone => (
                        <div key={zone} className="space-y-3">
                          {/* Existing 2D Zone Rendering */}
                          <div className="bg-primary text-white px-4 py-1 rounded-t-lg font-black text-center text-sm">Zone {zone}</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white p-3 rounded-b-lg border-2 border-t-0 shadow-md">
                            {deduplicatedLocations.filter(l => l.zone === zone).map(loc => {
                              const locProducts = products.filter(p => p.warehousePositionCode === loc.positionCode)
                              const isOccupied = locProducts.length > 0
                              const isHighlighted = highlightedPosition === loc.positionCode
                              return (
                                <div 
                                  key={loc.id} 
                                  onClick={() => setSelectedLocationForView(loc)}
                                  className={cn(
                                    "group relative w-20 h-20 rounded border-2 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-110 shadow-sm",
                                    isOccupied ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-green-50 border-green-200 text-green-700",
                                    isHighlighted && "ring-4 ring-primary ring-offset-2 animate-pulse"
                                  )}
                                  title={`${loc.positionCode} ${isOccupied ? `(${locProducts.length} منتجات)` : '(فارغ)'}`}
                                >
                                  <span className="text-[10px] font-black">{loc.warehouse}</span>
                                  <span className="text-[10px] font-black">{loc.aisle}</span>
                                  <span className="text-xs font-black">{loc.rack}</span>
                                  {locProducts.length > 1 && (
                                    <Badge className="absolute -top-2 -left-2 h-5 w-5 p-0 flex items-center justify-center bg-blue-600 text-[10px]">
                                      {locProducts.length}
                                    </Badge>
                                  )}
                                  <div className={cn(
                                    "absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white",
                                    isOccupied ? "bg-orange-500" : "bg-green-500"
                                  )}></div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </TabsContent>

                    <TabsContent value="3d" className="p-0">
                      <Warehouse3DView 
                        locations={locations}
                        products={products}
                        selectedWarehouse={selectedWarehouse === "all" ? "W1" : selectedWarehouse}
                        onLocationSelect={setSelectedLocationForView}
                        highlightedPosition={highlightedPosition}
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </div>

            <Card className="shadow-xl">
              <CardHeader className="bg-slate-50 border-b py-4 px-6 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" /> قائمة المواقع التفصيلية
                </CardTitle>
                <Badge variant="outline" className="font-bold">{filteredLocations.length} موقع</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-50/50 border-b">
                      <tr className="text-slate-500 text-xs font-black uppercase">
                        <th className="p-4">الرمز / Position Code</th>
                        <th className="p-4">المنطقة</th>
                        <th className="p-4">الممر</th>
                        <th className="p-4">الرف</th>
                        <th className="p-4">المستوى</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredLocations.map(loc => {
                        const isOccupied = products.some(p => p.warehouseLocationId === loc.id)
                        return (
                          <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-black text-primary">{loc.positionCode}</td>
                            <td className="p-4 font-bold">{loc.zone}</td>
                            <td className="p-4 font-bold">{loc.aisle}</td>
                            <td className="p-4 font-bold">{loc.rack}</td>
                            <td className="p-4">
                              <Badge variant="secondary" className="font-black">L{loc.level} - {loc.side}</Badge>
                            </td>
                            <td className="p-4">
                              {isOccupied ? (
                                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0 font-bold">مشغول / Occupied</Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 font-bold">فارغ / Empty</Badge>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary"><Settings2 className="h-4 w-4" /></Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-destructive"
                                  onClick={() => { if(confirm("حذف الموقع؟")) deleteWarehouseLocation(loc.id) }}
                                >
                                  <Plus className="h-4 w-4 rotate-45" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {filteredLocations.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-muted-foreground italic font-bold">
                            لا توجد نتائج مطابقة للبحث
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Dialog open={!!selectedLocationForView} onOpenChange={(open) => !open && setSelectedLocationForView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-primary" />
              منتجات الموقع: {selectedLocationForView?.positionCode}
            </DialogTitle>
            <DialogDescription>
              عرض كافة المنتجات المخزنة في هذا الموقع بالتحديد
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedLocationForView && products.filter(p => p.warehousePositionCode === selectedLocationForView.positionCode).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products
                  .filter(p => p.warehousePositionCode === selectedLocationForView.positionCode)
                  .map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
                      <div className="w-12 h-12 bg-white rounded border flex items-center justify-center overflow-hidden">
                        {p.image ? (
                          <img src={p.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-6 w-6 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{p.productName}</p>
                        <p className="text-xs text-muted-foreground">{p.productCode || 'بدون كود'}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground italic">
                لا توجد منتجات مرتبطة بهذا الموقع حالياً
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
