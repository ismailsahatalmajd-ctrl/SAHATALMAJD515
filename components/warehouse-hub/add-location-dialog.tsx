"use client"

import React, { useState } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Plus, MapPin } from 'lucide-react'
import { addWarehouseLocation } from '@/lib/storage'
import { useToast } from '@/components/ui/use-toast'

export function AddLocationDialog({ activeWarehouse, onAdded }: { activeWarehouse: string, onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  
  const [formData, setFormData] = useState({
    zone: 'Z1',
    aisle: 'A1',
    rack: 'R1',
    level: '1',
    side: 'R' as 'R' | 'L'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const positionCode = `${formData.zone}-${formData.aisle}-${formData.rack}-L${formData.level}-${formData.side}`
    
    addWarehouseLocation({
      warehouse: activeWarehouse,
      zone: formData.zone,
      aisle: formData.aisle,
      rack: formData.rack,
      level: formData.level,
      side: formData.side,
      positionCode
    })

    toast({
      title: "تمت الإضافة بنجاح",
      description: `تمت إضافة الموقع ${positionCode} إلى المستودع ${activeWarehouse}`,
      className: "bg-slate-900 border-slate-700 text-white"
    })
    
    onAdded()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white gap-2 h-11">
          <MapPin className="h-4 w-4 text-primary" />
          إضافة موقع جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            إنشاء إحداثيات موقع جديد
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-400">المنطقة (Zone)</Label>
              <Input 
                value={formData.zone} 
                onChange={e => setFormData({...formData, zone: e.target.value.toUpperCase()})}
                className="bg-slate-800 border-slate-700" 
                placeholder="Ex: Z1"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">الممر (Aisle)</Label>
              <Input 
                value={formData.aisle} 
                onChange={e => setFormData({...formData, aisle: e.target.value.toUpperCase()})}
                className="bg-slate-800 border-slate-700" 
                placeholder="Ex: A1"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">الرف (Rack)</Label>
              <Input 
                value={formData.rack} 
                onChange={e => setFormData({...formData, rack: e.target.value.toUpperCase()})}
                className="bg-slate-800 border-slate-700" 
                placeholder="Ex: R1"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">المستوى (Level)</Label>
              <Select value={formData.level} onValueChange={v => setFormData({...formData, level: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="1">Level 1 (Ground)</SelectItem>
                  <SelectItem value="2">Level 2 (Middle)</SelectItem>
                  <SelectItem value="3">Level 3 (Top)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-400">الاتجاه (Side)</Label>
            <div className="flex gap-2">
              <Button 
                type="button"
                variant={formData.side === 'R' ? 'default' : 'outline'}
                onClick={() => setFormData({...formData, side: 'R'})}
                className="flex-1"
              >يمين Right</Button>
              <Button 
                type="button"
                variant={formData.side === 'L' ? 'default' : 'outline'}
                onClick={() => setFormData({...formData, side: 'L'})}
                className="flex-1"
              >يسار Left</Button>
            </div>
          </div>
          
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 mt-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Generated Code</p>
            <p className="text-lg font-mono text-primary font-bold">
              {formData.zone}-{formData.aisle}-{formData.rack}-L{formData.level}-{formData.side}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 font-black">
              تأكيد إضافة الموقع
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
