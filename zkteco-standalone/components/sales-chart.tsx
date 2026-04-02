"use client"

import { useMemo } from "react"
import { formatArabicGregorianDate, formatEnglishNumber } from "@/lib/utils"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Transaction } from "@/lib/types"
import { useI18n } from "@/components/language-provider"

interface SalesChartProps {
  transactions: Transaction[]
  period: string
}

export function SalesChart({ transactions, period }: SalesChartProps) {
  const { t } = useI18n()
  const chartData = useMemo(() => {
    const now = new Date()
    let days = 30

    switch (period) {
      case "today":
        days = 1
        break
      case "week":
        days = 7
        break
      case "month":
        days = 30
        break
      case "year":
        days = 365
        break
      case "all":
        days = 365
        break
    }

    const data: { [key: string]: { date: string; sales: number; purchases: number } } = {}

    // Initialize dates
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = formatArabicGregorianDate(date, { month: "short", day: "numeric" })
      data[dateStr] = { date: dateStr, sales: 0, purchases: 0 }
    }

    // Aggregate transactions
    transactions.forEach((transaction) => {
      const transactionDate = new Date(transaction.createdAt)
      const dateStr = formatArabicGregorianDate(transactionDate, { month: "short", day: "numeric" })

      if (data[dateStr]) {
        if (transaction.type === "sale") {
          data[dateStr].sales += transaction.totalAmount
        } else if (transaction.type === "purchase") {
          data[dateStr].purchases += transaction.totalAmount
        }
      }
    })

    return Object.values(data)
  }, [transactions, period])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip
          formatter={(value: number) => `${formatEnglishNumber(value.toFixed(2))} ${t("common.currency")}`}
          labelStyle={{ color: "hsl(var(--foreground))" }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}
        />
        <Legend />
        <Bar dataKey="sales" fill="hsl(var(--chart-1))" name={t("charts.sales")} />
        <Bar dataKey="purchases" fill="hsl(var(--chart-2))" name={t("charts.purchases")} />
      </BarChart>
    </ResponsiveContainer>
  )
}
