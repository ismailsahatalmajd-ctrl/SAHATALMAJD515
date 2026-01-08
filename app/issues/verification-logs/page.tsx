"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  FileText, 
  Search,
  Calendar,
  User,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { getVerificationLogs } from "@/lib/storage-verification"
import type { VerificationLog } from "@/lib/types"
import { formatArabicGregorianDate } from "@/lib/utils"

export default function VerificationLogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<VerificationLog[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    getVerificationLogs().then(logs => {
      // Deduplicate logs by ID
      const uniqueLogs = Array.from(new Map(logs.map(log => [log.id, log])).values())
      setLogs(uniqueLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
    })
  }, [])

  const filteredLogs = logs.filter(log => 
    log.issueNumber.includes(searchTerm) ||
    (log.user && log.user.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">سجل المطابقات</h1>
              <p className="text-muted-foreground">
                عرض تاريخ عمليات مطابقة الفواتير
              </p>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="بحث برقم الفاتورة أو اسم المستخدم..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>المنتجات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      لا توجد سجلات مطابقة
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.issueNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span dir="ltr">{new Date(log.timestamp).toLocaleDateString('en-GB')}</span>
                          <span className="text-muted-foreground text-xs">{new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {log.user || "غير معروف"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.status === 'matched' ? (
                          <Badge className="bg-green-600 hover:bg-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            مطابق
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            فروقات
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.items.length} منتج
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => router.push(`/issues/verification-logs/${log.id}`)}>
                          <FileText className="mr-2 h-4 w-4" />
                          عرض التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
