"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Plus, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"
import { TransactionForm } from "@/components/transaction-form"
import { InventoryAdjustmentForm } from "@/components/inventory-adjustment-form"
import type { Transaction, Product, InventoryAdjustment } from "@/lib/types"
import { getTransactions, addTransaction, getProducts, getAdjustments, addAdjustment } from "@/lib/storage"
import { syncTransaction, syncAdjustment } from "@/lib/sync-api"
import { useTransactionsRealtime, useAdjustmentsRealtime, useProductsRealtime } from "@/hooks/use-store"
import Link from "next/link"
import { formatArabicGregorianDate, formatEnglishNumber } from "@/lib/utils"
import { DualText } from "@/components/ui/dual-text"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useI18n } from "@/components/language-provider"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"

export default function TransactionsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const settings = useInvoiceSettings()
  const { t } = useI18n()
  
  useEffect(() => {
    if (user?.role === 'branch') {
        router.replace('/branch-requests')
    }
  }, [user, router])

  if (user?.role === 'branch') return null

  // Realtime Hooks
  const transactions = useTransactionsRealtime()
  const adjustments = useAdjustmentsRealtime()
  const products = useProductsRealtime()
  
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false)
  const [isAdjustmentFormOpen, setIsAdjustmentFormOpen] = useState(false)
  const [filterType, setFilterType] = useState<string>("all")
  const { toast } = useToast()

  // Removed useEffect loading data manually as hooks handle it

  const handleAddTransaction = async (transaction: Omit<Transaction, "id" | "createdAt">) => {
    // Optimistic
    const newTransaction = addTransaction(transaction)
    // No need to set state manually, hook updates automatically via event
    
    if (user) {
        try {
            await syncTransaction(newTransaction)
        } catch (e) {
            console.error(e)
            toast({ title: "Sync Error", description: "Failed to sync transaction", variant: "destructive" })
        }
    }
  }

  const handleAddAdjustment = async (adjustment: Omit<InventoryAdjustment, "id" | "createdAt" | "difference">) => {
    // Optimistic
    const newAdjustment = addAdjustment(adjustment)
    
    if (user) {
        try {
            await syncAdjustment(newAdjustment)
        } catch (e) {
            console.error(e)
            toast({ title: "Sync Error", description: "Failed to sync adjustment", variant: "destructive" })
        }
    }
  }

  const filteredTransactions = filterType === "all" ? transactions : transactions.filter((t) => t.type === filterType)

  const getTypeLabel = (type: Transaction["type"]) => {
    const labels = {
      purchase: "شراء",
      sale: "بيع",
      return: "إرجاع",
      adjustment: "تعديل",
    }
    return labels[type]
  }

  const getTypeVariant = (type: Transaction["type"]) => {
    const variants = {
      purchase: "default",
      sale: "secondary",
      return: "outline",
      adjustment: "destructive",
    }
    return variants[type] as "default" | "secondary" | "outline" | "destructive"
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link href="/">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="text-3xl font-bold">العمليات والجرد</h1>
              </div>
              <p className="text-muted-foreground">إدارة عمليات الشراء والبيع وتعديلات المخزون</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setIsAdjustmentFormOpen(true)} variant="outline">
                <Plus className="ml-2 h-4 w-4" />
                تعديل مخزون
              </Button>
              <Button onClick={() => setIsTransactionFormOpen(true)}>
                <Plus className="ml-2 h-4 w-4" />
                عملية جديدة
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>العمليات الأخيرة</CardTitle>
                <CardDescription>سجل عمليات الشراء والبيع</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger>
                      <Filter className="ml-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع العمليات</SelectItem>
                      <SelectItem value="purchase">المشتريات</SelectItem>
                      <SelectItem value="sale">المبيعات</SelectItem>
                      <SelectItem value="return">المرتجعات</SelectItem>
                      <SelectItem value="adjustment">التعديلات</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">المنتج</TableHead>
                          {settings.showUnit && <TableHead className="text-right">الوحدة</TableHead>}
                          <TableHead className="text-right">النوع</TableHead>
                          {settings.showQuantity && <TableHead className="text-right">الكمية</TableHead>}
                          {settings.showTotal && <TableHead className="text-right">المبلغ</TableHead>}
                          <TableHead className="text-right">التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              لا توجد عمليات
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredTransactions.slice(0, 10).map((transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell className="font-medium">{transaction.productName}</TableCell>
                              {settings.showUnit && <TableCell>{products.find(p => p.id === transaction.productId)?.unit || '-'}</TableCell>}
                              <TableCell>
                                <Badge variant={getTypeVariant(transaction.type)}>
                                  {getTypeLabel(transaction.type)}
                                </Badge>
                              </TableCell>
                              {settings.showQuantity && <TableCell>{transaction.quantity}</TableCell>}
                              {settings.showTotal && <TableCell>{transaction.totalAmount.toFixed(2)} ر.س</TableCell>}
                              <TableCell className="text-muted-foreground">
            {formatArabicGregorianDate(new Date(transaction.createdAt))}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><DualText k="transactions.adjustments" /></CardTitle>
                <CardDescription><DualText k="transactions.adjustmentsDesc" /></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right"><DualText k="transactions.table.product" /></TableHead>
                        <TableHead className="text-right"><DualText k="transactions.adj.old" /></TableHead>
                        <TableHead className="text-right"><DualText k="transactions.adj.new" /></TableHead>
                        <TableHead className="text-right"><DualText k="transactions.adj.diff" /></TableHead>
                        <TableHead className="text-right"><DualText k="transactions.table.date" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            <DualText k="transactions.noAdjustments" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        adjustments.slice(0, 10).map((adjustment) => (
                          <TableRow key={adjustment.id}>
                            <TableCell className="font-medium">{adjustment.productName}</TableCell>
                            <TableCell>{adjustment.oldQuantity}</TableCell>
                            <TableCell>{adjustment.newQuantity}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  adjustment.difference > 0
                                    ? "text-green-600 font-medium"
                                    : adjustment.difference < 0
                                      ? "text-red-600 font-medium"
                                      : ""
                                }
                              >
                                {adjustment.difference > 0 ? "+" : ""}
                                {adjustment.difference}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
            {formatArabicGregorianDate(new Date(adjustment.createdAt))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <TransactionForm
        open={isTransactionFormOpen}
        onOpenChange={setIsTransactionFormOpen}
        onSubmit={handleAddTransaction}
        products={products}
      />

      <InventoryAdjustmentForm
        open={isAdjustmentFormOpen}
        onOpenChange={setIsAdjustmentFormOpen}
        onSubmit={handleAddAdjustment}
        products={products}
      />
    </div>
  )
}
