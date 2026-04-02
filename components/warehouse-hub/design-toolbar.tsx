"use client"

import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Box, 
  Ruler, 
  Grid3X3, 
  ArrowRightLeft, 
  RotateCw,
  Trash2,
  Save,
  Plus,
  Sun,
  Moon,
  Palette,
  Warehouse,
  DoorOpen,
  ThermometerSnowflake,
  Truck,
  Construction,
  Cylinder as ColumnIcon,
  Wind,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Layout
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WarehouseConfig {
  floorWidth: number
  floorDepth: number
  gridSize: number
  snapToGrid: boolean
  theme: 'day' | 'night'
  backgroundColor: string
  floorColor: string
}

interface DesignToolbarProps {
  config: WarehouseConfig
  onConfigChange: (config: WarehouseConfig) => void
  onAddElement: (type: 'rack' | 'pallet_1x1' | 'pallet_1x12' | 'wall' | 'door' | 'cold_storage' | 'forklift' | 'pallet_jack' | 'column' | 'window') => void
  onDeleteSelected: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  isBlueprintMode: boolean
  onToggleBlueprint: () => void
}

export function DesignToolbar({ 
  config, 
  onConfigChange, 
  onAddElement, 
  onDeleteSelected, 
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isBlueprintMode,
  onToggleBlueprint
}: DesignToolbarProps) {
  return (
    <div className="absolute bottom-6 right-1/2 translate-x-1/2 z-30 pointer-events-none w-full max-w-3xl px-6">
      <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-2xl border border-white/5 rounded-3xl p-3 shadow-2xl flex items-center justify-between gap-4">
        
        {/* Floor Size */}
        <div className="flex items-center gap-4 border-r border-slate-700/50 pr-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1">
              <Ruler className="h-3 w-3" /> أبعاد الأرضية (m)
            </span>
            <div className="flex gap-2 mt-1">
              <div className="relative w-16">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-bold">W</span>
                <Input 
                  type="number" 
                  value={config.floorWidth} 
                  onChange={e => onConfigChange({...config, floorWidth: parseInt(e.target.value) || 10})}
                  className="h-8 bg-slate-800 border-slate-700 pl-4 text-xs font-black"
                />
              </div>
              <div className="relative w-16">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-bold">D</span>
                <Input 
                  type="number" 
                  value={config.floorDepth} 
                  onChange={e => onConfigChange({...config, floorDepth: parseInt(e.target.value) || 10})}
                  className="h-8 bg-slate-800 border-slate-700 pl-4 text-xs font-black"
                />
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 border-r border-slate-700/50 pr-6">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleBlueprint}
            className={cn(
              "h-10 px-4 rounded-xl flex items-center gap-2 font-black text-[11px] transition-all duration-500",
              isBlueprintMode 
                ? "bg-primary text-white border-transparent shadow-lg shadow-primary/20" 
                : "bg-slate-800 border-white/5 text-slate-300 hover:text-white"
            )}
          >
            {isBlueprintMode ? <Layout className="h-4 w-4" /> : <Box className="h-4 w-4" />}
            {isBlueprintMode ? "وضع المخطط (2D)" : "الواقعية (3D)"}
          </Button>
        </div>

        {/* Theme & Colors */}
        <div className="flex items-center gap-4 border-r border-slate-700/50 pr-6">
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-10 w-10 rounded-xl", config.theme === 'day' ? "bg-amber-500/20 text-amber-500" : "bg-indigo-500/20 text-indigo-500")}
            onClick={() => onConfigChange({...config, theme: config.theme === 'day' ? 'night' : 'day'})}
           >
             {config.theme === 'day' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase">الخلفية</span>
              <div className="relative h-7 w-7 rounded-lg overflow-hidden border border-slate-700">
                <input 
                  type="color" 
                  value={config.backgroundColor} 
                  onChange={e => onConfigChange({...config, backgroundColor: e.target.value})}
                  className="absolute inset-0 h-full w-full cursor-pointer p-0 border-0 scale-150"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-500 uppercase">الأرضية</span>
              <div className="relative h-7 w-7 rounded-lg overflow-hidden border border-slate-700">
                <input 
                  type="color" 
                  value={config.floorColor} 
                  onChange={e => onConfigChange({...config, floorColor: e.target.value})}
                  className="absolute inset-0 h-full w-full cursor-pointer p-0 border-0 scale-150"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Grid Tools */}
        <div className="flex items-center gap-2 border-r border-slate-700/50 pr-6">
           <Button 
            variant="ghost" 
            size="sm" 
            className={cn("gap-2 h-10 px-4 rounded-xl", config.snapToGrid ? "bg-primary/20 text-primary" : "text-slate-400")}
            onClick={() => onConfigChange({...config, snapToGrid: !config.snapToGrid})}
           >
             <Grid3X3 className="h-4 w-4" />
             <span className="text-xs font-bold">المحاذاة للشبكة</span>
           </Button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-2 border-r border-slate-700/50 pr-6">
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={!canUndo}
            onClick={onUndo}
            className="h-10 w-10 text-slate-400 disabled:opacity-20 translate-x-1"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={!canRedo}
            onClick={onRedo}
            className="h-10 w-10 text-slate-400 disabled:opacity-20 -translate-x-1"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

          <div className="flex gap-2">
            <Button 
                onClick={onSave}
                className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl px-5 h-10 flex gap-2 shadow-lg shadow-primary/20 items-center"
            >
                <Save className="h-4 w-4" />
                <span className="text-xs">حفظ</span>
            </Button>
          </div>

      </div>
    </div>
  )
}
