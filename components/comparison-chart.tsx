"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import type { Transaction } from "@/lib/types"

interface ComparisonChartProps {
  transactions: Transaction[]
  comparisonPeriod: "month" | "quarter" | "year"
}

export function ComparisonChart({ transactions, comparisonPeriod }: ComparisonChartProps) {
  const now = new Date()
  const data: { period: string; sales: number; purchases: number }[] = []

  if (comparisonPeriod === "month") {
    // Last 6 months comparison
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthName = date.toLocaleDateString("ar-SA", { month: "long", year: "numeric" })

      const monthTransactions = transactions.filter((t) => {
        const tDate = new Date(t.createdAt)
        return tDate.getMonth() === date.getMonth() && tDate.getFullYear() === date.getFullYear()
      })

      const sales = monthTransactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.totalAmount, 0)
      const purchases = monthTransactions
        .filter((t) => t.type === "purchase")
        .reduce((sum, t) => sum + t.totalAmount, 0)

      data.push({ period: monthName, sales, purchases })
    }
  } else if (comparisonPeriod === "quarter") {
    // Last 4 quarters comparison
    for (let i = 3; i >= 0; i--) {
      const quarterStart = new Date(now.getFullYear(), now.getMonth() - i * 3 - 2, 1)
      const quarterEnd = new Date(now.getFullYear(), now.getMonth() - i * 3, 0)
      const quarterName = `Q${Math.floor(quarterStart.getMonth() / 3) + 1} ${quarterStart.getFullYear()}`

      const quarterTransactions = transactions.filter((t) => {
        const tDate = new Date(t.createdAt)
        return tDate >= quarterStart && tDate <= quarterEnd
      })

      const sales = quarterTransactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.totalAmount, 0)
      const purchases = quarterTransactions
        .filter((t) => t.type === "purchase")
        .reduce((sum, t) => sum + t.totalAmount, 0)

      data.push({ period: quarterName, sales, purchases })
    }
  } else {
    // Last 3 years comparison
    for (let i = 2; i >= 0; i--) {
      const year = now.getFullYear() - i
      const yearTransactions = transactions.filter((t) => {
        const tDate = new Date(t.createdAt)
        return tDate.getFullYear() === year
      })

      const sales = yearTransactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.totalAmount, 0)
      const purchases = yearTransactions.filter((t) => t.type === "purchase").reduce((sum, t) => sum + t.totalAmount, 0)

      data.push({ period: year.toString(), sales, purchases })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>مقارنة الفترات</CardTitle>
        <CardDescription>
          مقارنة المبيعات والمشتريات عبر{" "}
          {comparisonPeriod === "month" ? "الأشهر" : comparisonPeriod === "quarter" ? "الأرباع" : "السنوات"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value: number) => `${value.toFixed(2)} ريال`} labelStyle={{ direction: "rtl" }} />
            <Legend />
            <Bar dataKey="sales" fill="#10b981" name="المبيعات" />
            <Bar dataKey="purchases" fill="#ef4444" name="المشتريات" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
