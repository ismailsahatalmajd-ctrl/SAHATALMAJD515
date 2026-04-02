"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getAuditLogs, exportAuditLogs, type AuditLogEntry } from "@/lib/audit-log"
import { FileText, Download, Search } from "lucide-react"

const actionLabels: Record<AuditLogEntry["action"], string> = {
  create: "إنشاء",
  update: "تحديث",
  delete: "حذف",
  export: "تصدير",
  import: "استيراد",
}

const entityLabels: Record<AuditLogEntry["entity"], string> = {
  product: "منتج",
  transaction: "معاملة",
  issue: "صرف",
  return: "مرتجع",
  purchase: "شراء",
  branch: "فرع",
  category: "فئة",
  location: "موقع",
  unit: "وحدة",
  branch_request: "طلب فرع",
}

const actionColors: Record<AuditLogEntry["action"], string> = {
  create: "bg-green-500",
  update: "bg-blue-500",
  delete: "bg-red-500",
  export: "bg-purple-500",
  import: "bg-orange-500",
}

export function AuditLogViewer() {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [entityFilter, setEntityFilter] = useState<string>("all")

  useEffect(() => {
    if (open) {
      getAuditLogs().then(allLogs => {
        setLogs(allLogs)
        setFilteredLogs(allLogs)
      })
    }
  }, [open])

  useEffect(() => {
    let filtered = logs

    if (searchTerm) {
      filtered = filtered.filter(
        (log) =>
          log.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.userName.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (actionFilter !== "all") {
      filtered = filtered.filter((log) => log.action === actionFilter)
    }

    if (entityFilter !== "all") {
      filtered = filtered.filter((log) => log.entity === entityFilter)
    }

    setFilteredLogs(filtered)
  }, [searchTerm, actionFilter, entityFilter, logs])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="ml-2 h-4 w-4" />
          سجل العمليات
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>سجل العمليات</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="نوع العملية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع العمليات</SelectItem>
                <SelectItem value="create">إنشاء</SelectItem>
                <SelectItem value="update">تحديث</SelectItem>
                <SelectItem value="delete">حذف</SelectItem>
                <SelectItem value="export">تصدير</SelectItem>
                <SelectItem value="import">استيراد</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="نوع البيانات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                <SelectItem value="product">منتج</SelectItem>
                <SelectItem value="transaction">معاملة</SelectItem>
                <SelectItem value="issue">صرف</SelectItem>
                <SelectItem value="return">مرتجع</SelectItem>
                <SelectItem value="purchase">شراء</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportAuditLogs} variant="outline">
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </Button>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>العملية</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      لا توجد سجلات
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{new Date(log.timestamp).toLocaleString("ar-SA")}</TableCell>
                      <TableCell>{log.userName}</TableCell>
                      <TableCell>
                        <Badge className={actionColors[log.action]}>{actionLabels[log.action]}</Badge>
                      </TableCell>
                      <TableCell>{entityLabels[log.entity]}</TableCell>
                      <TableCell>{log.entityName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.changes && log.changes.length > 0 && (
                          <div className="space-y-1">
                            {log.changes.map((change, idx) => (
                              <div key={idx}>
                                {change.field}: {JSON.stringify(change.oldValue)} → {JSON.stringify(change.newValue)}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-muted-foreground">
            إجمالي السجلات: {filteredLogs.length} من {logs.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
