"use client"

import { useMemo } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts"
import type { Product } from "@/lib/types"
import { useI18n } from "@/components/language-provider"
import { getCategories } from "@/lib/storage"

interface CategoryChartProps {
  products: Product[]
}

export function CategoryChart({ products }: CategoryChartProps) {
  const { t } = useI18n()
  const chartData = useMemo(() => {
    const categories = getCategories()
    const categoryMap: { [key: string]: { name: string; value: number; color: string } } = {}

    categories.forEach((cat) => {
      categoryMap[cat.name] = { name: cat.name, value: 0, color: cat.color }
    })

    products.forEach((product) => {
      if (categoryMap[product.category]) {
        categoryMap[product.category].value += product.currentStockValue
      }
    })

    return Object.values(categoryMap).filter((cat) => cat.value > 0)
  }, [products])

  if (chartData.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-muted-foreground">{t("common.noData")}</div>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => `${value.toFixed(2)} ${t("common.currency")}`}
          labelStyle={{ color: "hsl(var(--foreground))" }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
