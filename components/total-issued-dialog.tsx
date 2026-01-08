"use client"

import { useState, useEffect } from "react"
import { Calendar, FileText, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getBranches } from "@/lib/storage"
import type { Branch, Issue } from "@/lib/types"
import { generateTotalIssuedPDF } from "@/lib/total-issued-pdf-generator"
import { useToast } from "@/hooks/use-toast"
import { useI18n } from "@/components/language-provider"

interface TotalIssuedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issues: Issue[]
}

export function TotalIssuedDialog({ open, onOpenChange, issues }: TotalIssuedDialogProps) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedBranch, setSelectedBranch] = useState("all")
  const { toast } = useToast()
  const { lang } = useI18n()

  useEffect(() => {
    if (open) {
      setBranches(getBranches())
      // Set default date range to current month
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setDateFrom(firstDay.toISOString().split("T")[0])
      setDateTo(lastDay.toISOString().split("T")[0])
    }
  }, [open])

  const getFilteredCount = () => {
    let filtered = [...issues]

    if (dateFrom) {
      filtered = filtered.filter((issue) => new Date(issue.createdAt) >= new Date(dateFrom))
    }

    if (dateTo) {
      filtered = filtered.filter((issue) => new Date(issue.createdAt) <= new Date(dateTo + "T23:59:59"))
    }

    if (selectedBranch && selectedBranch !== "all") {
      filtered = filtered.filter((issue) => issue.branchId === selectedBranch)
    }

    return filtered.length
  }

  const handleGeneratePDF = async () => {
    if (getFilteredCount() === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد فواتير صرف في الفترة المحددة",
        variant: "destructive",
      })
      return
    }

    await generateTotalIssuedPDF(issues, { lang,
      dateFrom,
      dateTo,
      branchFilter: selectedBranch,
    })

    onOpenChange(false)
  }

  const handleSetThisMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setDateFrom(firstDay.toISOString().split("T")[0])
    setDateTo(lastDay.toISOString().split("T")[0])
  }

  const handleSetLastMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
    setDateFrom(firstDay.toISOString().split("T")[0])
    setDateTo(lastDay.toISOString().split("T")[0])
  }

  const handleSetThisYear = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), 0, 1)
    const lastDay = new Date(now.getFullYear(), 11, 31)
    setDateFrom(firstDay.toISOString().split("T")[0])
    setDateTo(lastDay.toISOString().split("T")[0])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            فاتورة إجمالي المنتجات المصروفة
          </DialogTitle>
          <DialogDescription>حدد الفترة الزمنية والفرع لإنشاء فاتورة إجمالي المنتجات المصروفة</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleSetThisMonth}>
              هذا الشهر
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleSetLastMonth}>
              الشهر الماضي
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleSetThisYear}>
              هذه السنة
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                من تاريخ
              </Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                إلى تاريخ
              </Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Filter className="h-4 w-4" />
              الفرع
            </Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <SelectValue placeholder="جميع الفروع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الفروع</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">عدد الفواتير المحددة:</span>
              <span className="text-lg font-bold">{getFilteredCount()} فاتورة</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleGeneratePDF} disabled={getFilteredCount() === 0}>
            <FileText className="h-4 w-4 ml-1" />
            إنشاء الفاتورة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
