"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Archive, Download, Search, Trash2 } from "lucide-react"
import { getIssues, getTransactions } from "@/lib/storage"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"

type ArchiveItem = {
  id: string
  type: "issue" | "transaction"
  date: string
  description: string
  amount?: number
  archived: boolean
}

export default function ArchivePage() {
  const settings = useInvoiceSettings()
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "issue" | "transaction">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState({ from: "", to: "" })

  useEffect(() => {
    loadArchiveData()
  }, [])

  const loadArchiveData = async () => {
    setLoading(true)
    try {
      const [issues, transactions] = await Promise.all([getIssues(), getTransactions()])

      const archiveItems: ArchiveItem[] = [
        ...issues.map((issue) => ({
          id: issue.id,
          type: "issue" as const,
          date: issue.createdAt,
          description: `صرف إلى ${issue.branchName}`,
          archived: false,
        })),
        ...transactions.map((transaction) => ({
          id: transaction.id,
          type: "transaction" as const,
          date: transaction.createdAt,
          description: transaction.notes || "معاملة",
          amount: transaction.totalAmount,
          archived: false,
        })),
      ]

      // Sort by date (oldest first for archive)
      archiveItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      setItems(archiveItems)
    } catch (error) {
      console.error("Error loading archive:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter !== "all" && item.type !== filter) return false
    if (searchQuery && !item.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (dateRange.from && new Date(item.date) < new Date(dateRange.from)) return false
    if (dateRange.to && new Date(item.date) > new Date(dateRange.to)) return false
    return true
  })

  const exportArchive = () => {
    const csv = [
      ["النوع", "التاريخ", "الوصف", "المبلغ"].join(","),
      ...filteredItems.map((item) =>
        [item.type === "issue" ? "صرف" : "معاملة", item.date, item.description, item.amount || ""].join(","),
      ),
    ].join("\n")

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `archive_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="h-8 w-8" />
          <h1 className="text-3xl font-bold">الأرشيف</h1>
        </div>
        <Button onClick={exportArchive}>
          <Download className="h-4 w-4 ml-2" />
          تصدير الأرشيف
        </Button>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <Label>البحث</Label>
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>

          <div>
            <Label>النوع</Label>
            <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="issue">صرف</SelectItem>
                <SelectItem value="transaction">معاملة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>من تاريخ</Label>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            />
          </div>

          <div>
            <Label>إلى تاريخ</Label>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>النوع</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>الوصف</TableHead>
              {settings.showTotal && <TableHead>المبلغ</TableHead>}
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  لا توجد عناصر في الأرشيف
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className={item.type === "issue" ? "text-blue-600" : "text-green-600"}>
                      {item.type === "issue" ? "صرف" : "معاملة"}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(item.date).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  {settings.showTotal && <TableCell>{item.amount ? `${item.amount.toLocaleString()} ريال` : "-"}</TableCell>}
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
