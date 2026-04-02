"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Filter, RotateCcw } from "lucide-react"

interface AdvancedFiltersProps {
  categories: string[]
  locations: string[]
  selectedCategory: string
  setSelectedCategory: (value: string) => void
  selectedLocation: string
  setSelectedLocation: (value: string) => void
  hideZeroStock: boolean
  setHideZeroStock: (value: boolean) => void
  mergeIdentical: boolean
  setMergeIdentical: (value: boolean) => void
  bestSellerThreshold: number
  setBestSellerThreshold: (value: number) => void
  minStock?: number
  setMinStock?: (value: number) => void
  maxStock?: number
  setMaxStock?: (value: number) => void
  onReset?: () => void
}

export function AdvancedFilters({
  categories,
  locations,
  selectedCategory,
  setSelectedCategory,
  selectedLocation,
  setSelectedLocation,
  hideZeroStock,
  setHideZeroStock,
  mergeIdentical,
  setMergeIdentical,
  bestSellerThreshold,
  setBestSellerThreshold,
  minStock,
  setMinStock,
  maxStock,
  setMaxStock,
  onReset,
}: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              الفلاتر المتقدمة
            </CardTitle>
            <CardDescription>قم بتخصيص التقارير حسب التصنيف والموقع والمخزون</CardDescription>
          </div>
          <div className="flex gap-2">
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                إعادة تعيين
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? "إخفاء" : "إظهار المزيد"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>التصنيف</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>الموقع</Label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المواقع</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="threshold" className="whitespace-nowrap">
              حد الأكثر مبيعاً:
            </Label>
            <input
              id="threshold"
              type="number"
              min="1"
              value={bestSellerThreshold}
              onChange={(e) => setBestSellerThreshold(Number(e.target.value))}
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {isExpanded && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4 pt-4 border-t">
            {setMinStock && (
              <div className="space-y-2">
                <Label htmlFor="min-stock">الحد الأدنى للمخزون</Label>
                <input
                  id="min-stock"
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(Number(e.target.value))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            {setMaxStock && (
              <div className="space-y-2">
                <Label htmlFor="max-stock">الحد الأقصى للمخزون</Label>
                <input
                  id="max-stock"
                  type="number"
                  min="0"
                  value={maxStock}
                  onChange={(e) => setMaxStock(Number(e.target.value))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch id="hide-zero" checked={hideZeroStock} onCheckedChange={setHideZeroStock} />
              <Label htmlFor="hide-zero">إخفاء المخزون الصفري</Label>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch id="merge-identical" checked={mergeIdentical} onCheckedChange={setMergeIdentical} />
              <Label htmlFor="merge-identical">دمج المنتجات المتطابقة</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
