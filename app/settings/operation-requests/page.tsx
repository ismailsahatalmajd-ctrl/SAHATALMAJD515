"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db } from "@/lib/db"
import type { OperationRequest } from "@/lib/types"
import { ArrowLeft, ClipboardList } from "lucide-react"

function statusVariant(status: OperationRequest["status"]) {
  switch (status) {
    case "synced":
    case "applied":
      return "default" as const
    case "pending":
      return "secondary" as const
    case "failed":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

export default function OperationRequestsPage() {
  const rows = useLiveQuery(() => db.operationRequests.toArray(), [])

  const list: OperationRequest[] = useMemo(() => {
    const all = (rows ?? []) as OperationRequest[]
    return [...all]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 500)
  }, [rows])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold">سجل طلبات العمليات</h1>
              <p className="text-muted-foreground text-sm">
                تتبّع معرفات الطلبات وحالاتها (مشتريات، مرتجعات، تأكيد استلام، تعديل منتج) — محليًا في
                IndexedDB
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/settings" className="gap-2 inline-flex items-center">
              <ArrowLeft className="h-4 w-4" />
              العودة للإعدادات
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>آخر الطلبات</CardTitle>
            <CardDescription>
              يعرض حتى 500 طلبًا مرتبة حسب آخر تحديث. الحقول: المعرف، النوع، الحالة، الكيان المرتبط،
              رقم العملية، الخطأ إن وجد.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">المعرف (Request ID)</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الكيان</TableHead>
                  <TableHead>Op No</TableHead>
                  <TableHead>آخر تحديث</TableHead>
                  <TableHead>خطأ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      لا توجد طلبات مسجلة بعد. نفّذ عملية شراء أو مرتجع أو تأكيد استلام أو حفظ تعديل
                      منتج ليظهر السجل هنا.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate" title={r.id}>
                        {r.id}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.operationType}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.entityId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.operationNumber ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{r.updatedAt}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[240px] truncate" title={r.error}>
                        {r.error ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
