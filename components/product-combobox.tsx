"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ProductImage } from "@/components/product-image"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import type { Product } from "@/lib/types"

interface ProductComboboxProps {
    products: Product[]
    value?: string
    onChange: (productId: string) => void
    disabled?: boolean
}

export function ProductCombobox({ products, value, onChange, disabled }: ProductComboboxProps) {
    const { lang } = useI18n()
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const parentRef = useRef<HTMLDivElement>(null)

    const selectedProduct = useMemo(() =>
        products.find(p => p.id === value),
        [products, value])

    const filteredOptions = useMemo(() => {
        if (!searchQuery) return products
        const lower = searchQuery.toLowerCase()
        return products.filter(p =>
            (p.productName || "").toLowerCase().includes(lower) ||
            (p.productCode || "").toLowerCase().includes(lower) ||
            (p.itemNumber || "").toLowerCase().includes(lower)
        )
    }, [products, searchQuery])

    const rowVirtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 60,
        overscan: 5,
    })

    // Reset search when closed
    useEffect(() => {
        if (!open) setSearchQuery("")
    }, [open])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className="w-full justify-between bg-white !text-black h-auto py-2 max-w-full"
                >
                    {selectedProduct ? (
                        <div className="flex-1 text-right text-black">
                            <div className="font-medium text-sm leading-tight break-words whitespace-normal max-h-16 overflow-y-auto pr-1">
                                {selectedProduct.productName}
                            </div>
                            <span className="text-xs text-gray-600 block mt-1">
                                (<DualText k="common.available" /> {selectedProduct.currentStock})
                            </span>
                        </div>
                    ) : (
                        <span className="text-black">
                            <DualText k="purchaseOrder.placeholders.selectProduct" />
                        </span>
                    )}
                    <Search className="mr-2 h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[450px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={getDualString("purchaseOrder.placeholders.search", undefined, lang)}
                        className="text-black"
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <CommandList>
                        {filteredOptions.length === 0 && (
                            <CommandEmpty>
                                <DualText k="common.noProducts" />
                            </CommandEmpty>
                        )}

                        <div ref={parentRef} style={{ height: '300px', overflow: 'auto' }}>
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const product = filteredOptions[virtualRow.index]
                                    return (
                                        <div
                                            key={product.id}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <CommandItem
                                                value={`${product.productName} ${product.productCode}`}
                                                onSelect={() => {
                                                    onChange(product.id)
                                                    setOpen(false)
                                                }}
                                                className="flex items-center gap-2 text-black cursor-pointer w-full h-full"
                                            >
                                                <ProductImage
                                                    product={product}
                                                    className="w-8 h-8 rounded shrink-0"
                                                />
                                                <div className="flex-1 overflow-hidden">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-sm leading-tight break-words whitespace-normal max-h-12 overflow-hidden text-ellipsis">
                                                            {product.productName}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {product.productCode} - {product.currentStock} <DualText k="common.available" /> - {product.price.toFixed(2)} <DualText k="common.riyal" />
                                                        </div>
                                                    </div>
                                                </div>
                                                {product.id === value && <Check className="h-4 w-4 ml-auto" />}
                                            </CommandItem>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
