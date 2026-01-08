"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface ColumnMapperProps {
  open: boolean
  onClose: () => void
  detectedColumns: string[]
  expectedColumns: string[]
  onConfirm: (mapping: Record<string, string>) => void
}

export function ExcelColumnMapper({ open, onClose, detectedColumns, expectedColumns, onConfirm }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({})

  const handleConfirm = () => {
    onConfirm(mapping)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مطابقة الأعمدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">قم بمطابقة أعمدة ملف Excel مع الحقول المطلوبة في النظام</p>

          {expectedColumns.map((expectedCol) => (
            <div key={expectedCol} className="grid grid-cols-2 gap-4 items-center">
              <Label>{expectedCol}</Label>
              <Select
                value={mapping[expectedCol] || ""}
                onValueChange={(value) => setMapping((prev) => ({ ...prev, [expectedCol]: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر العمود..." />
                </SelectTrigger>
                <SelectContent>
                  {detectedColumns.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleConfirm}>تأكيد المطابقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
