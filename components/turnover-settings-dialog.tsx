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
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"

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
  const { lang } = useI18n()

  useEffect(() => {
    if (open) {
      setLocalThresholds(thresholds)
    }
  }, [open, thresholds])

  const handleSave = () => {
    if (localThresholds.slow <= 0 || localThresholds.normal <= localThresholds.slow) {
      toast({
        title: getDualString("common.error"),
        description: getDualString("turnover.toast.invalidValues"),
        variant: "destructive",
      })
      return
    }

    onSave(localThresholds)
    toast({
      title: getDualString("toast.success"),
      description: getDualString("turnover.toast.saveSuccess"),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><DualText k="turnover.title" /></DialogTitle>
          <DialogDescription>
            <DualText k="turnover.description" />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="font-medium"><DualText k="turnover.stagnant" /></span>
              </div>
              <span className="text-sm text-muted-foreground">0 <DualText k="turnover.ofStock" className="inline" /></span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <Label><DualText k="turnover.slow" /></Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localThresholds.slow}
                  onChange={(e) => setLocalThresholds({ ...localThresholds, slow: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground"><DualText k="turnover.ofStock" /></span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <Label><DualText k="turnover.normal" /></Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localThresholds.normal}
                  onChange={(e) => setLocalThresholds({ ...localThresholds, normal: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground"><DualText k="turnover.ofStock" /></span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="font-medium"><DualText k="turnover.fast" /></span>
              </div>
              <span className="text-sm text-muted-foreground">
                {">"} {localThresholds.normal} <DualText k="turnover.ofStock" className="inline" />
              </span>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2"><DualText k="turnover.formula.header" /></h4>
            <p className="text-sm text-muted-foreground"><DualText k="turnover.formula.text" /></p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <DualText k="common.cancel" />
          </Button>
          <Button onClick={handleSave}><DualText k="common.save" /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
