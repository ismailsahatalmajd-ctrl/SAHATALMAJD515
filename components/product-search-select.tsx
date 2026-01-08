"use client"

import { useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProductImage } from "@/components/product-image"

interface Product {
  id: string
  name: string
  code?: string
  image?: string
}

interface ProductSearchSelectProps {
  products: Product[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
}

export function ProductSearchSelect({
  products,
  value,
  onValueChange,
  placeholder = "اختر منتج...",
}: ProductSearchSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedProduct = products.find((p) => p.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-transparent"
        >
          {selectedProduct ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <ProductImage
                product={selectedProduct}
                className="w-6 h-6 rounded flex-shrink-0"
              />
              <span className="line-clamp-1 text-right">{selectedProduct.name}</span>
            </div>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث بالاسم أو الكود..." />
          <CommandList>
            <CommandEmpty>لا توجد نتائج</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.code || ""}`}
                  onSelect={() => {
                    onValueChange(product.id)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <Check className={cn("h-4 w-4 flex-shrink-0", value === product.id ? "opacity-100" : "opacity-0")} />
                  <ProductImage
                    product={product}
                    className="w-10 h-10 rounded flex-shrink-0 object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-2 text-sm text-right">{product.name}</p>
                    {product.code && <p className="text-xs text-muted-foreground mt-0.5">{product.code}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
