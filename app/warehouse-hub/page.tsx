"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Header } from '@/components/header'
import WarehouseHubEngine, { ManualRack, WarehouseHubEngineRef } from '@/components/warehouse-hub/warehouse-hub-engine'
import { AddLocationDialog } from '@/components/warehouse-hub/add-location-dialog'
import { AssignProductDialog } from '@/components/warehouse-hub/assign-product-dialog'
import { DesignToolbar, WarehouseConfig } from '@/components/warehouse-hub/design-toolbar'
import { PropertyEditor } from '@/components/warehouse-hub/property-editor'
import { NavigationHUD } from '@/components/warehouse-hub/navigation-hud'
import { 
  getWarehouseLocations, 
  getProducts,
  updateProduct,
  addWarehouseLocation,
  clearAllWarehouseLocations,
  getWarehouseDesignElements,
  saveWarehouseLayout
} from '@/lib/storage'
import { WarehouseLocation, Product } from '@/lib/types'
import { subscribe } from '@/lib/events'
import { useToast } from '@/components/ui/use-toast'
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Search,
  Box,
  Layout,
  LayoutDashboard,
  Package,
  Info,
  ChevronRight,
  Maximize2,
  Trash2,
  Link as LinkIcon,
  Slash,
  Warehouse,
  DoorOpen,
  ThermometerSnowflake,
  Truck,
  Construction,
  Cylinder as ColumnIcon,
  Wind,
  RotateCw,
  PlusCircle,
  Wrench,
  Eye,
  Grid3X3,
  Ruler,
  GripVertical,
  Sparkles,
  Zap
} from 'lucide-react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Floor Settings Helper Dialog
function FloorSettingsDialog({ config, onConfigChange, open, onOpenChange }: { config: WarehouseConfig, onConfigChange: (c: WarehouseConfig) => void, open: boolean, onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[400px] rounded-[2rem] p-6 shadow-2xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-black">إعدادات الأرضية / Floor Settings</DialogTitle>
          <DialogDescription className="text-slate-500 font-bold">تحديد أبعاد ومساحة المستودع</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 pl-1">الطول (W)</Label>
              <Input 
                type="number" 
                value={config.floorWidth} 
                onChange={e => onConfigChange({...config, floorWidth: parseInt(e.target.value) || 10})}
                className="bg-slate-900 border-slate-800 h-12 rounded-2xl font-black text-primary focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 pl-1">العرض (D)</Label>
              <Input 
                type="number" 
                value={config.floorDepth} 
                onChange={e => onConfigChange({...config, floorDepth: parseInt(e.target.value) || 10})}
                className="bg-slate-900 border-slate-800 h-12 rounded-2xl font-black text-primary focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-500 pl-1">حجم الشبكة / Grid Size</Label>
            <Input 
              type="number" 
              value={config.gridSize} 
              onChange={e => onConfigChange({...config, gridSize: parseInt(e.target.value) || 1})}
              className="bg-slate-900 border-slate-800 h-12 rounded-2xl font-black"
            />
          </div>
        </div>
        <Button onClick={() => onOpenChange(false)} className="w-full h-12 bg-primary hover:bg-primary/90 font-black rounded-2xl mt-4 shadow-xl shadow-primary/20">
          تحديث مساحة العمل
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// Helper component for the tools menu buttons
function ToolButton({ onClick, icon, label, color }: { onClick: () => void, icon: React.ReactNode, label: string, color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-600/10 text-blue-500 border-blue-500/20 hover:bg-blue-600 hover:text-white",
    orange: "bg-orange-600/10 text-orange-500 border-orange-500/20 hover:bg-orange-600 hover:text-white",
    slate: "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white",
    cyan: "bg-cyan-600/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-600 hover:text-white",
    "blue-intense": "bg-blue-900/10 text-blue-400 border-blue-400/20 hover:bg-blue-600 hover:text-white",
    amber: "bg-amber-600/10 text-amber-500 border-amber-500/20 hover:bg-amber-600 hover:text-white",
    red: "bg-red-600/10 text-red-500 border-red-500/20 hover:bg-red-600 hover:text-white"
  }

  return (
    <Button 
      variant="outline" 
      onClick={onClick}
      className={cn("h-16 flex flex-col gap-1 items-center justify-center rounded-2xl border transition-all text-[10px] font-bold p-1 group", colorMap[color])}
    >
      {React.cloneElement(icon as any, { className: "h-5 w-5 group-hover:scale-110 transition-transform" })}
      <span>{label}</span>
    </Button>
  )
}

export default function WarehouseHubPage() {
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeWarehouse, setActiveWarehouse] = useState("W1")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedLoc, setSelectedLoc] = useState<WarehouseLocation | null>(null)
  const [highlightedCode, setHighlightedCode] = useState<string | undefined>()
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [designMode, setDesignMode] = useState(false)
  const [manualRacks, setManualRacks] = useState<ManualRack[]>([])
  const [selectedManualRackId, setSelectedManualRackId] = useState<string | null>(null)
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [isFloorSettingsOpen, setIsFloorSettingsOpen] = useState(false)
  const [isBlueprintMode, setIsBlueprintMode] = useState(false)
  
  // History State for Undo/Redo
  const [history, setHistory] = useState<ManualRack[][]>([[]])
  const [historyIndex, setHistoryIndex] = useState(0)
  
  const pushToHistory = (newState: ManualRack[]) => {
    // Deep clone to avoid reference issues
    const clonedState = JSON.parse(JSON.stringify(newState))
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(clonedState)
    
    // Limit to 10 operations (initial + 10)
    if (newHistory.length > 11) {
      newHistory.shift()
    }
    
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1
      setHistoryIndex(prevIndex)
      setManualRacks(JSON.parse(JSON.stringify(history[prevIndex])))
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1
      setHistoryIndex(nextIndex)
      setManualRacks(JSON.parse(JSON.stringify(history[nextIndex])))
    }
  }

  const engineRef = React.useRef<WarehouseHubEngineRef>(null)
  const [floorConfig, setFloorConfig] = useState<WarehouseConfig>({
    floorWidth: 100,
    floorDepth: 100,
    gridSize: 2,
    snapToGrid: true,
    theme: 'day',
    backgroundColor: '#f8fafc',
    floorColor: '#f1f5f9'
  })
  const { toast } = useToast()

  const loadData = () => {
    setLocations(getWarehouseLocations())
    setProducts(getProducts())
    
    // Load persisted layout
    const elements = getWarehouseDesignElements()
    if (elements && elements.length > 0) {
      const mapped = elements.map(el => ({
        id: el.id,
        type: el.type as any,
        position: el.position,
        rotation: el.rotation,
        scale: el.scale,
        data: el.data,
        zone: 'Z1', // Default
        aisle: 'A1'
      }))
      setManualRacks(mapped)
      setHistory([mapped])
      setHistoryIndex(0)
    }
  }

  useEffect(() => {
    loadData()
    const unsub1 = subscribe("change", loadData)
    const unsub2 = subscribe("products_change", loadData)
    const unsub3 = subscribe("warehouse_design_change" as any, loadData)
    return () => { unsub1(); unsub2(); unsub3(); }
  }, [])

  const handleSaveLayout = async () => {
    try {
      await saveWarehouseLayout(activeWarehouse, manualRacks)
      toast({
        title: "تم حفظ المخطط",
        description: "تم مزامنة تصميم المستودع مع السحابة بنجاح",
      })
    } catch (error) {
      toast({
        title: "خطأ في الحفظ",
        description: "فشل حفظ المخطط، يرجى المحاولة لاحقاً",
        variant: "destructive"
      })
    }
  }

  const handleRemoveProductFromLoc = async (productId: string) => {
    await updateProduct(productId, { warehousePositionCode: "" })
    toast({
      title: "تم إخلاء المنتج",
      description: "تم حذف تعيين الموقع لهذا المنتج بنجاح",
      className: "bg-slate-900 border-slate-700 text-white"
    })
    loadData()
  }

  const handleAddElement = (type: ManualRack['type']) => {
    const prefix = type === 'rack' ? 'R' : 
                   type.startsWith('pallet_') ? 'P' : 
                   type === 'wall' ? 'W' : 
                   type === 'door' ? 'D' : 
                   type === 'cold_storage' ? 'CS' : 
                   type === 'aisle' ? 'AL' :
                   type === 'zone_reception' ? 'ZR' :
                   type === 'zone_shipping' ? 'ZS' :
                   type === 'office_desk' ? 'OD' :
                   type === 'locker' ? 'LK' :
                   type === 'safety_barrier' ? 'SB' :
                   type === 'structural_room' ? 'SR' :
                   type === 'column' ? 'C' :
                   type === 'window' ? 'WN' : 'M'
    
    const newId = `${prefix}${manualRacks.length + 1}`
    const newRack: ManualRack = {
      id: newId,
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      zone: 'Z1',
      aisle: 'A1'
    }
    const updatedRacks = [...manualRacks, newRack]
    setManualRacks(updatedRacks)
    setSelectedManualRackId(newRack.id)
    pushToHistory(updatedRacks)

    // AI Logic: If it's a storage element (Rack or Pallet), create logical DB locations automatically
    if (type === 'rack' || type.startsWith('pallet_')) {
      const levels = type === 'rack' ? 4 : 1
      for (let l = 1; l <= levels; l++) {
        addWarehouseLocation({
          warehouse: activeWarehouse,
          zone: 'Z1',
          aisle: 'A1',
          rack: newId,
          level: l.toString(),
          slot: 1,
          side: 'right', // default
          positionCode: `${activeWarehouse}-Z1-A1-${newId}-L${l}`,
          status: 'inactive'
        }).catch(console.error)
      }
      toast({ title: "تم توليد المواقع", description: `تم إنشاء ${levels} مستويات لهذا الرف في قاعدة البيانات.` })
    }
  }

  const handleUpdateManualRack = (id: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) => {
    setManualRacks(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, position: pos, rotation: rot, scale } : r)
      return updated
    })
  }

  const handleUpdateElementProps = (id: string, updates: Partial<ManualRack>) => {
    setManualRacks(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r)
      pushToHistory(updated)
      return updated
    })
  }

  const handleGenerateLayout = async () => {
    const newElements: ManualRack[] = []
    
    await clearAllWarehouseLocations()

    // 1. Central Aisle
    newElements.push({
      id: 'main_aisle', type: 'aisle',
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [80, 1, 5], zone: 'P1', aisle: 'P1',
      data: { label: 'الممر الرئيسي (P1)' }
    })

    // 2. Cold Storage (Left Side)
    newElements.push({
      id: 'fridge_1', type: 'cold_storage',
      position: [-25, 0, -12], rotation: [0, 0, 0], scale: [14, 1, 12], zone: 'Z1', aisle: 'A1',
      data: { label: 'ثلاجة 1' }
    })
    newElements.push({
      id: 'fridge_3', type: 'cold_storage',
      position: [-8, 0, -12], rotation: [0, 0, 0], scale: [14, 1, 12], zone: 'Z3', aisle: 'A1',
      data: { label: 'ثلاجة 3' }
    })
    newElements.push({
      id: 'freezer_1', type: 'cold_storage',
      position: [-28, 0, 12], rotation: [0, 0, 0], scale: [10, 1, 12], zone: 'Z2', aisle: 'A2',
      data: { label: 'فريزر 1' }
    })
    newElements.push({
      id: 'fridge_2', type: 'cold_storage',
      position: [-13, 0, 12], rotation: [0, 0, 0], scale: [14, 1, 12], zone: 'Z4', aisle: 'A2',
      data: { label: 'ثلاجة 2' }
    })
    newElements.push({
      id: 'fridge_4', type: 'cold_storage',
      position: [4, 0, 12], rotation: [0, 0, 0], scale: [14, 1, 12], zone: 'Z4', aisle: 'A2',
      data: { label: 'ثلاجة 4' }
    })

    // 3. Inspection Area and Office (Far Left)
    newElements.push({
      id: 'inspection_zone', type: 'zone_reception',
      position: [-40, 0, -4], rotation: [0, 0, 0], scale: [10, 1, 20], zone: 'Z0', aisle: 'IN',
      data: { label: 'منطقة الفحص والاستلام (CHK 1)' }
    })
    newElements.push({
      id: 'office_1', type: 'office_desk',
      position: [-42, 0, 12], rotation: [0, 0, 0], scale: [1, 1, 1], zone: 'Office', aisle: 'OUT'
    })
    newElements.push({
      id: 'office_2', type: 'office_desk',
      position: [-42, 0, 15], rotation: [0, 0, 0], scale: [1, 1, 1], zone: 'Office', aisle: 'OUT'
    })

    // 4. Heavy Racks (Right Half)
    const addRacks = (startX: number, startZ: number, count: number, zone: string, isVertical = false) => {
        for (let i = 0; i < count; i++) {
           ['A', 'B', 'C'].forEach((col, j) => {
              const rId = `R-${zone}-${col}${i}`
              const posX = isVertical ? startX + (j * 4) : startX + (i * 3.2)
              const posZ = isVertical ? startZ + (i * 3.2) : startZ + (j * 4)
              const rotY = isVertical ? Math.PI / 2 : 0

              newElements.push({
                id: rId, type: 'rack',
                position: [posX, 0, posZ], rotation: [0, rotY, 0], scale: [3, 1, 1], zone: zone, aisle: `A-${zone}`
              })

              for (let l = 1; l <= 4; l++) {
                addWarehouseLocation({
                  warehouse: activeWarehouse, zone: zone, aisle: `A-${zone}`, rack: rId, level: l.toString(), slot: 1, side: 'L',
                  positionCode: `${activeWarehouse}-${zone}-A${zone}-${rId}-L${l}-L`, status: 'inactive'
                })
              }
           })
        }
    }

    addRacks(24, -18, 6, 'Z13', false) // Top Right
    addRacks(24, 10, 6, 'Z14', false)  // Bottom Right

    // Vertical Racks (Zones 11, 12, 9, 10)
    for (let i = 0; i < 4; i++) {
       const rackId1 = `R-Z11-${i}`
       newElements.push({ id: rackId1, type: 'rack', position: [15, 0, -14 + (i * 3.2)], rotation: [0, Math.PI/2, 0], scale: [3, 1, 1], zone: 'Z11', aisle: 'A11' })
       const rackId2 = `R-Z12-${i}`
       newElements.push({ id: rackId2, type: 'rack', position: [15, 0, 8 + (i * 3.2)], rotation: [0, Math.PI/2, 0], scale: [3, 1, 1], zone: 'Z12', aisle: 'A12' })
       
       for (let l = 1; l <= 4; l++) {
         addWarehouseLocation({ warehouse: activeWarehouse, zone: 'Z11', aisle: 'A11', rack: rackId1, level: l.toString(), slot: 1, side: 'L', positionCode: `${activeWarehouse}-Z11-A11-${rackId1}-L${l}-L`, status: 'inactive' })
         addWarehouseLocation({ warehouse: activeWarehouse, zone: 'Z12', aisle: 'A12', rack: rackId2, level: l.toString(), slot: 1, side: 'L', positionCode: `${activeWarehouse}-Z12-A12-${rackId2}-L${l}-L`, status: 'inactive' })
       }
    }

    // Machinery
    newElements.push({
      id: 'forklift_main', type: 'forklift',
      position: [5, 0, 0], rotation: [0, Math.PI/2, 0], scale: [1, 1, 1], zone: 'Main', aisle: 'M1'
    })

    setManualRacks(newElements)
    pushToHistory(newElements)
    loadData()
    toast({
      title: "تم استنساخ المخطط",
      description: "تم بناء المستودع بناءً على المخطط المرجعي بنجاح (Zones 1-14).",
      className: "bg-primary border-primary text-white"
    })
  }

  const handleSmartLinkInventory = async () => {
    const unassigned = products.filter(p => !p.warehousePositionCode)
    const emptyLocs = locations.filter(l => {
      const isOccupied = products.some(p => p.warehousePositionCode === l.positionCode)
      return !isOccupied
    })

    if (unassigned.length === 0) {
      toast({ title: "لا توجد منتجات للربط", description: "جميع المنتجات لديها مواقع بالفعل." })
      return
    }

    let linkedCount = 0
    for (let i = 0; i < Math.min(unassigned.length, emptyLocs.length); i++) {
        await updateProduct(unassigned[i].id, { warehousePositionCode: emptyLocs[i].positionCode })
        linkedCount++
    }

    loadData()
    toast({
      title: "تم الربط الذكي",
      description: `تم توزيع ${linkedCount} منتجات على الرفوف المتاحة تلقائياً.`,
      className: "bg-green-600 border-green-500 text-white"
    })
  }

  const handleUpdateEnd = () => {
    pushToHistory(manualRacks)
  }

  const handleDeleteManualRack = () => {
    if (!selectedManualRackId) return
    const updatedRacks = manualRacks.filter(r => r.id !== selectedManualRackId)
    setManualRacks(updatedRacks)
    setSelectedManualRackId(null)
    pushToHistory(updatedRacks)
  }

  const handleSaveDesign = () => {
    toast({
      title: "تم حفظ المخطط",
      description: "تم حفظ أبعاد المستودع وتوزيع الرفوف بنجاح",
      className: "bg-slate-900 border-slate-700 text-white"
    })
  }

  // Keyboard Shortcuts for Design Mode
  useEffect(() => {
    if (!designMode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        handleDeleteManualRack()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [designMode, selectedManualRackId, manualRacks])

  // Search logic
  useEffect(() => {
    if (searchTerm.length >= 2) {
      const match = locations.find(l => 
        l.positionCode.toLowerCase().includes(searchTerm.toLowerCase())
      )
      if (match) {
        setHighlightedCode(match.positionCode)
        if (match.warehouse !== activeWarehouse) {
          setActiveWarehouse(match.warehouse)
        }
      }
    } else {
      setHighlightedCode(undefined)
    }
  }, [searchTerm, locations, activeWarehouse])

  const warehouseStats = useMemo(() => {
    const wLocs = locations.filter(l => l.warehouse === activeWarehouse)
    const occupied = products.filter(p => p.warehousePositionCode?.startsWith(activeWarehouse)).length
    return {
      total: wLocs.length,
      occupied,
      free: wLocs.length - occupied
    }
  }, [locations, products, activeWarehouse])

  const selectedLocProducts = useMemo(() => {
    if (!selectedLoc) return []
    return products.filter(p => p.warehousePositionCode === selectedLoc.positionCode)
  }, [selectedLoc, products])

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      <Header />
      
      {/* Main Container */}
      <div className="flex-1 relative flex">
        
        {/* Sidebar Controls - HUD Left */}
        <div className="absolute top-6 left-6 z-20 w-80 flex flex-col gap-4 pointer-events-none">
          <div className="pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-xl font-black flex items-center gap-3 mb-4 text-primary" onClick={() => setDesignMode(!designMode)}>
              <LayoutDashboard className="h-6 w-6" />
              مركز التحكم بالمستودع
            </h2>
            
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button 
                  onClick={() => setDesignMode(!designMode)}
                  className={cn(
                    "flex-1 gap-2 rounded-xl h-10 font-black",
                    designMode ? "bg-primary text-white" : "bg-slate-800 text-slate-400"
                  )}
                >
                  {designMode ? <Eye className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  {designMode ? "وضع المشاهدة" : "وضع المصمم"}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">اختيار المستودع</label>
                <Select value={activeWarehouse} onValueChange={setActiveWarehouse}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["W1", "W2", "W3", "W4", "W5"].map(w => (
                      <SelectItem key={w} value={w}>{w} - Central Hub</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">بحث ذكي عن موقع</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input 
                    placeholder="مثال: Z1-A1-R1..."
                    className="bg-slate-800/50 border-slate-700 pl-9 h-11"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Setup Assistant */}
          <div className="pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-primary/20 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
            <h3 className="text-xs font-black uppercase text-primary mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> مساعد التجهيز الذكي / AI Setup
            </h3>
            
            <div className="space-y-4">
              {/* Step 1: Design */}
              <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black shrink-0 border border-primary/30">1</div>
                  <div className="flex-1">
                      <p className="text-[11px] font-black text-white">تخطيط الهيكل / Layout</p>
                      <p className="text-[9px] text-slate-500 leading-tight mt-1">قم ببناء الجدران والرفوف يدوياً أو استخدم القالب التلقائي.</p>
                      <div className="flex gap-2 mt-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          disabled={!designMode}
                          className="h-7 text-[9px] border-primary/30 hover:bg-primary/10" 
                          onClick={handleGenerateLayout}
                        >
                          <Zap className="h-3 w-3 mr-1" /> بناء قالب ضخم
                        </Button>
                      </div>
                  </div>
              </div>

              {/* Step 2: Sync */}
              <div className="flex items-start gap-3 border-t border-slate-800/50 pt-4">
                  <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black shrink-0 border border-slate-700">2</div>
                  <div className="flex-1">
                      <p className="text-[11px] font-black text-white">توليد المواقع / DB Sync</p>
                      <p className="text-[9px] text-slate-500 leading-tight mt-1">يتم الآن ربط كل رف تضعه منطقياً بقاعدة البيانات تلقائياً.</p>
                  </div>
              </div>

              {/* Step 3: Stock */}
              <div className="flex items-start gap-3 border-t border-slate-800/50 pt-4">
                  <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black shrink-0 border border-slate-700">3</div>
                  <div className="flex-1">
                      <p className="text-[11px] font-black text-white">توزيع المخزون / Smart Link</p>
                      <p className="text-[9px] text-slate-500 leading-tight mt-1">ربط المنتجات غير المصنفة بالمواقع الفارغة المتاحة.</p>
                      <Button 
                        size="sm" 
                        className="h-8 w-full text-[10px] font-black mt-2 bg-primary hover:bg-primary/90 text-white shadow-lg" 
                        onClick={handleSmartLinkInventory}
                      >
                        تشغيل الربط الذكي / Auto-Stock
                      </Button>
                  </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
            <h3 className="text-xs font-black uppercase text-slate-400 mb-3 flex items-center gap-2">
              <Info className="h-3 w-3" /> إحصائيات فورية
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <p className="text-lg font-black text-white">{warehouseStats.total}</p>
                <p className="text-[9px] text-slate-500 uppercase">إجمالي</p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <p className="text-lg font-black text-orange-400">{warehouseStats.occupied}</p>
                <p className="text-[9px] text-slate-500 uppercase">مشغول</p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg">
                <p className="text-lg font-black text-green-400">{warehouseStats.free}</p>
                <p className="text-[9px] text-slate-500 uppercase">فارغ</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3D Engine Viewport */}
        <div className="flex-1 bg-black relative">
          <WarehouseHubEngine 
            ref={engineRef}
            locations={locations}
            products={products}
            activeWarehouse={activeWarehouse}
            onLocationSelect={setSelectedLoc}
            highlightedCode={highlightedCode}
            designMode={designMode}
            floorSize={{ width: floorConfig.floorWidth, depth: floorConfig.floorDepth }}
            manualRacks={manualRacks}
            selectedManualRackId={selectedManualRackId}
            onManualRackSelect={setSelectedManualRackId}
            onManualRackUpdate={handleUpdateManualRack}
            onManualRackUpdateEnd={handleUpdateEnd}
            theme={floorConfig.theme}
            backgroundColor={floorConfig.backgroundColor}
            floorColor={floorConfig.floorColor}
            isBlueprintMode={isBlueprintMode}
          />

          {designMode && selectedManualRackId && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[50] pointer-events-none">
              <div className="bg-slate-900/90 backdrop-blur-2xl border border-primary/40 rounded-2xl p-4 flex items-center gap-6 shadow-[0_0_40px_rgba(0,0,0,0.5)] pointer-events-auto">
                {/* Element Info */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">العنصر المختار / Selection</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-black">
                      {manualRacks.find(r => r.id === selectedManualRackId)?.type.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <span className="text-white font-mono text-xs opacity-60">#{selectedManualRackId}</span>
                  </div>
                </div>

                {/* Dimensions */}
                <div className="h-10 w-px bg-slate-800" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">القياسات / Scale</span>
                  <div className="flex gap-4 text-xs font-black text-white">
                    <span>{manualRacks.find(r => r.id === selectedManualRackId)?.scale[0].toFixed(1)}m <span className="text-slate-500 text-[9px]">عرض</span></span>
                    <span>{manualRacks.find(r => r.id === selectedManualRackId)?.scale[2].toFixed(1)}m <span className="text-slate-500 text-[9px]">عمق</span></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="h-10 w-px bg-slate-800" />
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-9 px-4 font-black gap-2 shadow-lg shadow-red-500/20"
                  onClick={handleDeleteManualRack}
                >
                  <Trash2 className="h-4 w-4" />
                  حذف العنصر
                </Button>
              </div>
            </div>
          )}

          {designMode && (
            <DesignToolbar 
              config={floorConfig}
              onConfigChange={setFloorConfig}
              onAddElement={handleAddElement}
              onDeleteSelected={handleDeleteManualRack}
              onSave={handleSaveLayout}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              isBlueprintMode={isBlueprintMode}
              onToggleBlueprint={() => setIsBlueprintMode(!isBlueprintMode)}
            />
          )}

          {designMode && selectedManualRackId && (
            <PropertyEditor 
              element={manualRacks.find(r => r.id === selectedManualRackId) || null}
              onUpdate={handleUpdateElementProps}
              onClose={() => setSelectedManualRackId(null)}
              onDelete={handleDeleteManualRack}
            />
          )}

          <NavigationHUD 
            onMove={(dir) => engineRef.current?.navigate(dir)}
            onSelect={() => engineRef.current?.focusCurrent()}
            className="absolute bottom-12 left-[360px] z-40 transition-all duration-300"
          />

          {/* Top Right Tools Menu */}
          {designMode && (
            <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
              <Button 
                onClick={() => setIsToolsOpen(!isToolsOpen)}
                className={cn(
                  "h-14 w-14 rounded-2xl shadow-2xl transition-all duration-300 pointer-events-auto border-2",
                  isToolsOpen 
                    ? "bg-slate-900 border-primary text-white scale-110" 
                    : "bg-white border-slate-200 text-slate-900 hover:scale-105"
                )}
              >
                <Wrench className={cn("h-6 w-6 transition-transform", isToolsOpen && "rotate-45")} />
              </Button>

              <div className={cn(
                "w-64 bg-slate-950/90 backdrop-blur-2xl border border-slate-800 rounded-3xl p-5 shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-500 origin-top-right pointer-events-auto",
                isToolsOpen 
                  ? "opacity-100 scale-100 translate-y-0" 
                  : "opacity-0 scale-90 -translate-y-10 pointer-events-none"
              )}>
                <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
                  <h3 className="text-sm font-black uppercase text-slate-400 flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-primary" /> قائمة الأدوات
                  </h3>
                  <Badge variant="outline" className="text-[9px] border-slate-800 text-slate-500">V2.5</Badge>
                </div>

                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {/* Category: Floor & Layout */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-widest pl-1">تخطيط الأرض / Floor Planning</label>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton onClick={() => setIsFloorSettingsOpen(true)} icon={<Ruler />} label="أبعاد الأرض" color="cyan" />
                      <ToolButton onClick={() => handleGenerateLayout()} icon={<Zap />} label="توليد تلقائي" color="orange" />
                      <ToolButton onClick={() => handleAddElement('aisle')} icon={<Slash />} label="ممر / Aisle" color="slate" />
                      <ToolButton onClick={() => handleAddElement('zone_reception')} icon={<PlusCircle />} label="منطقة استلام" color="blue" />
                      <ToolButton onClick={() => handleAddElement('zone_shipping')} icon={<PlusCircle />} label="منطقة شحن" color="red" />
                    </div>
                  </div>

                  {/* Category: Storage */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-widest pl-1">أنظمة التخزين / Storage</label>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton onClick={() => handleAddElement('rack')} icon={<Warehouse />} label="رف تخزين" color="blue" />
                      <ToolButton onClick={() => handleAddElement('pallet_1x1')} icon={<Box />} label="طبلية 1x1" color="orange" />
                      <ToolButton onClick={() => handleAddElement('pallet_1x12')} icon={<Box />} label="طبلية 1.2" color="orange" />
                    </div>
                  </div>

                  {/* Category: Structure */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-widest pl-1">الهيكل الإنشائي / Architecture</label>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton onClick={() => handleAddElement('wall')} icon={<Construction />} label="جدار" color="slate" />
                      <ToolButton onClick={() => handleAddElement('door')} icon={<DoorOpen />} label="باب" color="slate" />
                      <ToolButton onClick={() => handleAddElement('window')} icon={<Wind />} label="نافذة" color="cyan" />
                      <ToolButton onClick={() => handleAddElement('column')} icon={<ColumnIcon />} label="عمود خرساني" color="slate" />
                      <ToolButton onClick={() => handleAddElement('cold_storage')} icon={<ThermometerSnowflake />} label="غرفة تبريد" color="blue-intense" />
                    </div>
                  </div>

                  {/* Category: Machinery */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-widest pl-1">الأدوات والمعدات / Tools & Machinery</label>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton onClick={() => handleAddElement('forklift')} icon={<Truck />} label="فوركليفت" color="amber" />
                      <ToolButton onClick={() => handleAddElement('pallet_jack')} icon={<RotateCw />} label="جك يدوي" color="red" />
                    </div>
                  </div>

                  {/* Category: Furniture */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-widest pl-1">الأثاث والمرافق / Furniture & Facilities</label>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton onClick={() => handleAddElement('office_desk')} icon={<LayoutDashboard />} label="مكتب إداري" color="slate" />
                      <ToolButton onClick={() => handleAddElement('locker')} icon={<Box />} label="خزانة ملابس" color="slate" />
                      <ToolButton onClick={() => handleAddElement('safety_barrier')} icon={<GripVertical />} label="حاجز حماية" color="amber" />
                      <ToolButton onClick={() => handleAddElement('structural_room')} icon={<Layout />} label="غرفة / كتلة بناء" color="blue" />
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Info Panel - HUD Right */}
        <div className={cn(
          "absolute top-6 right-6 bottom-6 w-96 z-20 transition-all duration-500 translate-x-[120%] opacity-0",
          selectedLoc && "translate-x-0 opacity-100"
        )}>
          <div className="h-full bg-slate-900/80 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 bg-gradient-to-br from-primary/20 to-transparent border-b border-slate-700/50 relative">
              <button 
                onClick={() => setSelectedLoc(null)}
                className="absolute top-4 left-4 h-8 w-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-primary hover:bg-primary font-black uppercase tracking-widest">{selectedLoc?.warehouse}</Badge>
                  <span className="text-slate-500 text-xs font-bold uppercase">Location Protocol</span>
                </div>
                <h1 className="text-4xl font-black text-white">{selectedLoc?.positionCode}</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <section>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">تفاصيل الموقع / Logistics Info</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                    <span className="block text-[10px] text-slate-500 font-bold mb-1">المنطقة</span>
                    <span className="text-xl font-black">{selectedLoc?.zone}</span>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                    <span className="block text-[10px] text-slate-500 font-bold mb-1">الممر</span>
                    <span className="text-xl font-black">{selectedLoc?.aisle}</span>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                    <span className="block text-[10px] text-slate-500 font-bold mb-1">الرف / المستوى</span>
                    <span className="text-xl font-black">{selectedLoc?.rack} - L{selectedLoc?.level}</span>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                    <span className="block text-[10px] text-slate-500 font-bold mb-1">الاتجاه</span>
                    <span className="text-xl font-black">{selectedLoc?.side === 'R' ? 'يمين' : 'يسار'}</span>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">المنتجات المخزنة / Inventory</h4>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="h-7 px-2 text-[10px] gap-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                      onClick={() => setIsAssignOpen(true)}
                    >
                      <PlusCircle className="h-3 w-3" /> ربط منتج
                    </Button>
                    <Badge variant="outline" className="border-slate-700 text-slate-400">{selectedLocProducts.length}</Badge>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {selectedLocProducts.map(p => (
                    <div key={p.id} className="group p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-2xl transition-all hover:scale-[1.02] relative cursor-pointer">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveProductFromLoc(p.id); }}
                        className="absolute -top-2 -left-2 h-7 w-7 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-full border border-red-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex gap-4 items-center">
                        <div className="h-12 w-12 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                          {p.image ? (
                            <img src={p.image === 'DB_IMAGE' ? '' : p.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="h-6 w-6 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-sm truncate">{p.productName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{p.productCode}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between items-end border-t border-slate-700/50 pt-3">
                        <div>
                          <p className="text-[9px] text-slate-500 font-bold mb-1 uppercase">الرصيد الحالي</p>
                          <p className="text-lg font-black text-primary">{p.currentStock} <span className="text-xs text-slate-400">{p.unit}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-500 font-bold mb-1 uppercase">حالة الدوران</p>
                          <Badge className={cn(
                            "text-[9px] px-1 py-0",
                            p.status === 'fast' ? "bg-green-500/20 text-green-500" : "bg-blue-500/20 text-blue-500"
                          )}>
                            {p.status || 'Normal'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {selectedLocProducts.length === 0 && (
                    <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                      <Box className="h-10 w-10 text-slate-800 mx-auto mb-3" />
                      <p className="text-slate-600 font-black text-sm italic">الموقع متاح حالياً للتخزين</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="p-6 bg-slate-900 border-t border-slate-700/50">
              <button className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                تعديل بيانات الموقع
              </button>
            </div>
          </div>
        </div>

        {/* Legend / Info - Bottom Left */}
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2 flex gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              <span>متاح / Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.5)]"></div>
              <span>مشغول / Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
              <span>محدد / Target</span>
            </div>
          </div>
        </div>
      </div>

      <AssignProductDialog 
        location={selectedLoc}
        open={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        onSuccess={loadData}
      />

      <FloorSettingsDialog 
        config={floorConfig}
        onConfigChange={setFloorConfig}
        open={isFloorSettingsOpen}
        onOpenChange={setIsFloorSettingsOpen}
      />
    </div>
  )
}
