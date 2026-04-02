"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Package, Tag, MapPin } from "lucide-react"
import type { Product } from "@/lib/types"
import { Button } from "@/components/ui/button"

interface GlobalSearchProps {
  products: Product[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onProductSelect?: (product: Product) => void
}

export function GlobalSearch({ products, open, onOpenChange, onProductSelect }: GlobalSearchProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []

    const term = searchTerm.toLowerCase()
    return products
      .filter(
        (product) =>
          product.productName.toLowerCase().includes(term) ||
          product.productCode?.toLowerCase().includes(term) ||
          product.category?.toLowerCase().includes(term) ||
          product.location?.toLowerCase().includes(term),
      )
      .slice(0, 20)
  }, [products, searchTerm])

  const handleSelect = (product: Product) => {
    onProductSelect?.(product)
    onOpenChange(false)
    setSearchTerm("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>البحث في المنتجات</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن منتج بالاسم، الكود، التصنيف، أو الموقع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
              autoFocus
            />
          </div>

          {searchTerm && (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {searchResults.length > 0 ? (
                searchResults.map((product) => (
                  <Button
                    key={product.id}
                    variant="ghost"
                    className="w-full justify-start h-auto p-3"
                    onClick={() => handleSelect(product)}
                  >
                    <div className="flex items-start gap-3 w-full">
                      {product.image && (
                        <img
                          src={product.image || "/placeholder.svg"}
                          alt={product.productName}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 text-right">
                        <div className="font-medium">{product.productName}</div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {product.productCode}
                          </span>
                          {product.category && (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {product.category}
                            </span>
                          )}
                          {product.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {product.location}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          المخزون: {product.currentStock} {product.unit}
                        </div>
                      </div>
                    </div>
                  </Button>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">لا توجد نتائج</div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
