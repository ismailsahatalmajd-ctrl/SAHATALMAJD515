"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface TurnoverThresholds {
  stagnant: number
  slow: number
  normal: number
  fast: number
}

interface TurnoverSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  thresholds: TurnoverThresholds
  onSave: (thresholds: TurnoverThresholds) => void
}

export function TurnoverSettingsDialog({ open, onOpenChange, thresholds, onSave }: TurnoverSettingsDialogProps) {
  const [localThresholds, setLocalThresholds] = useState<TurnoverThresholds>(thresholds)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setLocalThresholds(thresholds)
    }
  }, [open, thresholds])

  const handleSave = () => {
    if (localThresholds.slow <= 0 || localThresholds.normal <= localThresholds.slow) {
      toast({
        title: "خطأ",
        description: "يجب أن تكون القيم صحيحة ومتدرجة",
        variant: "destructive",
      })
      return
    }

    onSave(localThresholds)
    toast({
      title: "تم الحفظ",
      description: "تم حفظ إعدادات معدل الدوران بنجاح",
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعدادات معدل الدوران</DialogTitle>
          <DialogDescription>تعديل عتبات معدل الدوران لتصنيف حالة المنتجات</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="font-medium">راكد</span>
              </div>
              <span className="text-sm text-muted-foreground">0% من المخزون</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <Label>بطيء (أقل من)</Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="99"
                  value={localThresholds.slow}
                  onChange={(e) => setLocalThresholds({ ...localThresholds, slow: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% من المخزون</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <Label>عادي (أقل من)</Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={localThresholds.normal}
                  onChange={(e) => setLocalThresholds({ ...localThresholds, normal: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% من المخزون</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="font-medium">سريع</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {">="} {localThresholds.normal}% من المخزون
              </span>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2">معادلة حساب معدل الدوران:</h4>
            <p className="text-sm text-muted-foreground">معدل الدوران = (المصروفات / المخزون الحالي) × 100</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave}>حفظ الإعدادات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
