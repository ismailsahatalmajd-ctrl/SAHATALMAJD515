"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { 
  X, 
  Box, 
  RotateCw, 
  Maximize2, 
  Palette,
  Layout,
  Type,
  Trash2
} from 'lucide-react'
import { ManualRack } from './warehouse-hub-engine'
import { cn } from '@/lib/utils'

interface PropertyEditorProps {
  element: ManualRack | null
  onUpdate: (id: string, updates: Partial<ManualRack>) => void
  onClose: () => void
  onDelete: (id: string) => void
}

export function PropertyEditor({ element, onUpdate, onClose, onDelete }: PropertyEditorProps) {
  if (!element) return null

  return (
    <div className="absolute top-6 right-6 bottom-32 w-80 z-50 pointer-events-auto">
      <div className="h-full bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Layout className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-none">خصائص العنصر</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{element.id}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-white/5">
            <X className="h-4 w-4 text-slate-400" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 pl-1 flex items-center gap-2">
                <Layout className="h-3 w-3" /> نوع العنصر / Type
              </Label>
              <Input 
                value={element.type} 
                disabled 
                className="bg-slate-800/50 border-slate-700 h-10 rounded-xl text-xs font-black text-slate-400"
              />
            </div>
          </div>

          {/* Position */}
          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <Box className="h-3 w-3" /> الموقع (m)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {['X', 'Y', 'Z'].map((coord, i) => (
                <div key={coord} className="space-y-1">
                  <Label className="text-[9px] font-bold text-slate-600 block text-center">{coord}</Label>
                  <Input 
                    type="number" 
                    value={element.position[i].toFixed(1)} 
                    onChange={e => {
                      const newPos = [...element.position] as [number, number, number]
                      newPos[i] = parseFloat(e.target.value) || 0
                      onUpdate(element.id, { position: newPos })
                    }}
                    className="h-9 bg-slate-800 border-white/5 rounded-lg text-center font-black text-xs"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Scale / Dimensions */}
          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <Maximize2 className="h-3 w-3" /> الأبعاد / Dimensions (m)
            </h4>
            <div className="space-y-4">
              {['الطول', 'الارتفاع', 'العمق'].map((label, i) => (
                <div key={label} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] font-bold text-slate-400">{label}</Label>
                    <span className="text-[10px] font-black text-white bg-slate-800 px-2 py-0.5 rounded-md">{(element.scale?.[i] || 1).toFixed(2)}m</span>
                  </div>
                  <Slider 
                    value={[element.scale?.[i] || 1]} 
                    min={0.1} 
                    max={10} 
                    step={0.1}
                    onValueChange={([val]) => {
                      const newScale = [...(element.scale || [1, 1, 1])] as [number, number, number]
                      newScale[i] = val
                      onUpdate(element.id, { scale: newScale })
                    }}
                    className="mx-1"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Rotation */}
          <section className="space-y-3">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <RotateCw className="h-3 w-3" /> التدوير / Rotation (Deg)
            </h4>
            <div className="space-y-4">
               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] font-bold text-slate-400">حول المحور Y</Label>
                    <span className="text-[10px] font-black text-white bg-slate-800 px-2 py-0.5 rounded-md">{(element.rotation[1] * (180/Math.PI)).toFixed(0)}°</span>
                  </div>
                  <Slider 
                    value={[element.rotation[1] * (180/Math.PI)]} 
                    min={-180} 
                    max={180} 
                    step={1}
                    onValueChange={([val]) => {
                      const newRot = [...element.rotation] as [number, number, number]
                      newRot[1] = val * (Math.PI/180)
                      onUpdate(element.id, { rotation: newRot })
                    }}
                    className="mx-1"
                  />
                </div>
            </div>
          </section>

          {/* Visual Settings */}
          {(element.type === 'zone_reception' || element.type === 'zone_shipping' || element.type === 'aisle') && (
            <section className="space-y-3">
               <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                <Palette className="h-3 w-3" /> التخصيص / Style
              </h4>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-slate-400">الاسم المعروض / Label</Label>
                <div className="relative">
                  <Type className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <Input 
                    value={element.data?.label || ''} 
                    onChange={e => onUpdate(element.id, { data: { ...element.data, label: e.target.value }})}
                    placeholder="مثال: منطقة شحن A"
                    className="bg-slate-800/50 border-white/5 pl-9 h-10 rounded-xl text-xs font-black"
                  />
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-slate-900 flex gap-2">
          <Button 
            variant="destructive" 
            className="flex-1 h-12 rounded-2xl font-black text-xs flex gap-2 shadow-lg shadow-red-500/10"
            onClick={() => {
              if (confirm('هل أنت متأكد من حذف هذا العنصر؟')) {
                onDelete(element.id)
                onClose()
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            حذف العنصر
          </Button>
        </div>
      </div>
    </div>
  )
}
