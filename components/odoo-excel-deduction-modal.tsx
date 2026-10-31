"use client"

import { useState } from "react"
import { Loader2, Download, X, LayoutGrid } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ExcelJS from "exceljs"
import { db } from "@/lib/db"

interface OdooExcelDeductionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedIds: number[]
  fetchLinesForIds: (ids: number[]) => Promise<any[]>
  invoiceType?: string
}

export function OdooExcelDeductionModal({ isOpen, onClose, selectedIds, fetchLinesForIds, invoiceType = 'transfers' }: OdooExcelDeductionModalProps) {
  const { toast } = useToast()
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [excelCodeCol, setExcelCodeCol] = useState("")
  const [excelStockCol, setExcelStockCol] = useState("")
  const [excelIssuesCol, setExcelIssuesCol] = useState("")

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExcelFile(file)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error("لم يتم العثور على ورقة عمل نشطة في الملف.")
        
        const firstRow = worksheet.getRow(1)
        const headers: string[] = []
        firstRow.eachCell((cell) => {
          headers.push(String(cell.value || "").trim())
        })

        setExcelHeaders(headers)
        
        const codeMatch = headers.find(h => {
          const hL = h.toLowerCase()
          return hL.includes("كود") || hL.includes("رمز") || hL.includes("code") || hL.includes("sku") || hL.includes("barcode")
        })
        const stockMatch = headers.find(h => {
          const hL = h.toLowerCase()
          return hL.includes("رصيد") || hL.includes("مخزن") || hL.includes("stock") || hL.includes("كمية") || hL.includes("qty")
        })
        const issuesMatch = headers.find(h => {
          const hL = h.toLowerCase()
          return hL.includes("صرف") || hL.includes("issues") || hL.includes("مصروف") || hL.includes("منصرف")
        })

        setExcelCodeCol(codeMatch || headers[0] || "")
        setExcelStockCol(stockMatch || headers[3] || headers[0] || "")
        setExcelIssuesCol(issuesMatch || "")
      } catch (err: any) {
        toast({ title: "خطأ", description: err.message || "فشل قراءة ملف الإكسل. تأكد من صحة الملف وصيغة xlsx.", variant: "destructive" })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const clearExcelFile = () => {
    setExcelFile(null)
    setExcelHeaders([])
    setExcelCodeCol("")
    setExcelStockCol("")
    setExcelIssuesCol("")
  }

  const processExcel = async () => {
    if (!excelFile || !excelCodeCol || !excelStockCol) {
      toast({ title: "خطأ", description: "يرجى تحديد الملف وأعمدة المطابقة", variant: "destructive" })
      return
    }

    setIsProcessing(true)
    try {
      const buffer = await excelFile.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      const worksheet = workbook.worksheets[0]
      if (!worksheet) throw new Error("لا توجد بيانات في الملف")

      // 1. Fetch lines for selected transfers/invoices
      const allLines = await fetchLinesForIds(selectedIds)
      
      // 2. Aggregate quantities by product code and fetch warehouse data
      const itemMap = new Map<string, { odooQty: number, odooUnit: string, warehouseQty: number, warehouseUnit: string }>()
      
      for (const line of allLines) {
        // Also check line.description because some APIs return description instead of display_name
        const lineName = line.product_id ? line.product_id[1] : (line.display_name || line.name || line.description || '')
        const matchCode = lineName.match(/\[(.*?)\]/)
        let code = matchCode ? matchCode[1].trim() : undefined
        
        if (code) {
          code = code.replace(/\s+/g, '')
          const qty = line.quantity || line.product_qty || line.qty_received || 0
          if (qty > 0) {
            const odooUnit = line.product_uom_id ? line.product_uom_id[1] : 'Units'
            const existing = itemMap.get(code) || { odooQty: 0, odooUnit, warehouseQty: 0, warehouseUnit: '' }
            existing.odooQty += qty
            existing.odooUnit = odooUnit
            itemMap.set(code, existing)
          }
        }
      }

      // Enhance itemMap with warehouse info
      for (const [code, data] of itemMap.entries()) {
        const websiteProduct = await db.products.where('productCode').equals(code).first()
        if (websiteProduct) {
          const quantityPerCarton = websiteProduct.quantityPerCarton || 1
          data.warehouseQty = data.odooQty / quantityPerCarton
          data.warehouseUnit = websiteProduct.unit || ''
        } else {
          data.warehouseQty = data.odooQty
        }
        itemMap.set(code, data)
      }

      // 3. Update Excel quantities
      const firstRow = worksheet.getRow(1)
      let codeColIndex = -1
      let stockColIndex = -1
      let issuesColIndex = -1
      const lastCol = worksheet.columnCount

      firstRow.eachCell((cell, colNumber) => {
        const val = String(cell.text || "").trim()
        if (val === excelCodeCol) codeColIndex = colNumber
        if (val === excelStockCol) stockColIndex = colNumber
        if (val === excelIssuesCol) issuesColIndex = colNumber
      })

      if (codeColIndex === -1 || stockColIndex === -1) {
        throw new Error("لم يتم العثور على الأعمدة المحددة في ملف الإكسل")
      }

      // Add Headers for new columns
      const warehouseQtyColIndex = lastCol + 1
      const odooQtyColIndex = lastCol + 2

      firstRow.getCell(warehouseQtyColIndex).value = "Qty Warehouse"
      firstRow.getCell(odooQtyColIndex).value = "Qty Odoo"

      let deductionCount = 0
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        
        const codeCell = row.getCell(codeColIndex)
        let codeVal = String(codeCell.text || "").trim()
        
        if (!codeVal && codeCell.value) {
          if (typeof codeCell.value === 'object' && 'result' in codeCell.value) {
            codeVal = String(codeCell.value.result || "").trim()
          } else {
            codeVal = String(codeCell.value || "").trim()
          }
        }

        // Normalize code: remove .0 at the end if it was parsed as float, remove spaces
        if (codeVal) {
           codeVal = codeVal.replace(/\.0$/, '').replace(/\s+/g, '')
        }

        if (!codeVal) return

        const itemData = itemMap.get(codeVal)
        if (itemData) {
          const stockCell = row.getCell(stockColIndex)
          let currentStock = 0
          if (typeof stockCell.value === 'number') {
            currentStock = stockCell.value
          } else if (stockCell.value && typeof stockCell.value === 'object' && 'result' in stockCell.value) {
            currentStock = Number(stockCell.value.result) || 0
          } else {
            currentStock = Number(stockCell.value) || 0
          }

          // Deduct from original stock
          const newStock = currentStock - itemData.warehouseQty
          stockCell.value = newStock
          
          // Accumulate in issues column if selected
          if (issuesColIndex !== -1) {
            const issuesCell = row.getCell(issuesColIndex)
            let currentIssues = 0
            if (typeof issuesCell.value === 'number') {
              currentIssues = issuesCell.value
            } else if (issuesCell.value && typeof issuesCell.value === 'object' && 'result' in issuesCell.value) {
              currentIssues = Number(issuesCell.value.result) || 0
            } else {
              currentIssues = Number(issuesCell.value) || 0
            }
            issuesCell.value = currentIssues + itemData.warehouseQty
          }
          
          // Format numbers to max 2 decimal places
          const wQtyNum = Number(itemData.warehouseQty.toFixed(2))
          const oQtyNum = Number(itemData.odooQty.toFixed(2))

          // Write to new columns
          const wQtyCell = row.getCell(warehouseQtyColIndex)
          wQtyCell.value = itemData.warehouseUnit ? `${wQtyNum} ${itemData.warehouseUnit}` : wQtyNum
          
          const oQtyCell = row.getCell(odooQtyColIndex)
          oQtyCell.value = itemData.odooUnit ? `${oQtyNum} ${itemData.odooUnit}` : oQtyNum

          // Highlight the new cells
          const highlightStyle = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF046' } // Yellow
          } as const;
          
          const highlightFont = { bold: true, color: { argb: 'FFB91C1C' } } as const;

          wQtyCell.fill = highlightStyle;
          wQtyCell.font = highlightFont;
          
          oQtyCell.fill = highlightStyle;
          oQtyCell.font = highlightFont;
          
          // Also highlight original stock cell if you want? Wait, user said "فقط خلة الكمية المصروفة في عامود كمية المستودع و كمية الاودو"
          // This means DO NOT highlight the original stock cell.
          
          deductionCount++
        }
      })

      // Download file
      const updatedBuffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([updatedBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `updated_odoo_${excelFile.name}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (deductionCount === 0) {
        const foundCodes = Array.from(itemMap.keys()).join(', ')
        toast({
          title: "لم يتم خصم أي منتج",
          description: `الأكواد المطلوبة في الفاتورة: (${foundCodes || 'لا يوجد أكواد'}). تأكد من اختيار عمود الكود الصحيح وتطابق الأرقام.`,
          variant: "destructive"
        })
      } else {
        toast({
          title: "تمت العملية بنجاح",
          description: `تم خصم كميات ${deductionCount} صنفاً من ملف الإكسل. وتم تحميل الملف المحدث.`,
        })
      }
      onClose()

    } catch (err: any) {
      console.error("Excel process error:", err)
      toast({ title: "خطأ", description: err.message || "حدث خطأ أثناء معالجة الملف", variant: "destructive" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 text-emerald-600">
            <Download className="w-5 h-5" />
            أتمتة خصم المخزون من الفواتير
          </DialogTitle>
          <DialogDescription>
            سيتم استخراج المنتجات من الفواتير/التحويلات المحددة ({selectedIds.length} فواتير) وخصم كمياتها مباشرة من ملف الإكسل الخاص بك.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-3">
            <Label className="text-sm font-bold">رفع ملف المخزون (Excel)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                className="cursor-pointer flex-1"
              />
              {excelFile && (
                <Button variant="ghost" size="sm" onClick={clearExcelFile} className="text-red-500">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {excelHeaders.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-md border text-sm space-y-4 mt-2">
                <p className="font-bold text-slate-700">تأكيد أعمدة ملف الإكسل:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>عمود كود المنتج (للمطابقة)</Label>
                    <select
                      className="w-full p-2 border rounded-md text-sm"
                      value={excelCodeCol}
                      onChange={(e) => setExcelCodeCol(e.target.value)}
                    >
                      <option value="">اختر العمود...</option>
                      {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>عمود الرصيد (للخصم)</Label>
                    <select
                      className="w-full p-2 border rounded-md text-sm"
                      value={excelStockCol}
                      onChange={(e) => setExcelStockCol(e.target.value)}
                    >
                      <option value="">اختر العمود...</option>
                      {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>عمود الصرف (للإضافة - اختياري)</Label>
                    <select
                      className="w-full p-2 border rounded-md text-sm"
                      value={excelIssuesCol}
                      onChange={(e) => setExcelIssuesCol(e.target.value)}
                    >
                      <option value="">بدون إضافة...</option>
                      {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>إلغاء</Button>
          <Button 
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            onClick={processExcel}
            disabled={isProcessing || !excelFile || !excelCodeCol || !excelStockCol}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
            تحديث ملف الإكسل وتحميله
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

