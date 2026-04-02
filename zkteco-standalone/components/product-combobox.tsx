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
    className?: string
}

export function ProductCombobox({ products, value, onChange, disabled, className }: ProductComboboxProps) {
    const { lang } = useI18n()
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const parentRef = useRef<HTMLDivElement>(null)

    const selectedProduct = useMemo(() =>
        products.find(p => p.id === value),
        [products, value])

    // عرض جميع المنتجات عند الفتح، وتطبيق البحث كفلتر
    const filteredOptions = useMemo(() => {
        const lower = searchQuery.toLowerCase()
        if (!lower) return products // عرض جميع المنتجات عند الفتح
        return products.filter(p =>
            (p.productName || "").toLowerCase().includes(lower) ||
            (p.productCode || "").toLowerCase().includes(lower) ||
            (p.itemNumber || "").toLowerCase().includes(lower)
        )
    }, [products, searchQuery])

    // ارتفاع ثابت لكل صف لتجنب التداخل
    const rowVirtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 68, // ارتفاع ثابت
        overscan: 2, // تقليل للأداء الأفضل
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
                    className={`w-full justify-between bg-white !text-black h-auto py-2 max-w-full ${className || ""}`}
                >
                    {selectedProduct ? (
                        <div className="flex-1 text-right text-black">
                            <div className="font-medium text-sm leading-tight break-words whitespace-normal max-h-16 overflow-y-auto pr-1">
                                {selectedProduct.productName}
                            </div>
                            <span className="text-xs text-gray-600 block mt-1">
                                {selectedProduct.productCode} - (<DualText k="common.available" /> {selectedProduct.currentStock})
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
            <PopoverContent className="w-[550px] p-0" align="start">
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

                        <div
                            ref={parentRef}
                            className="scroll-smooth"
                            style={{
                                height: '350px',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch'
                            }}
                            onWheel={(e) => {
                                // تأكيد أن التمرير بالماوس يعمل
                                if (parentRef.current) {
                                    parentRef.current.scrollTop += e.deltaY;
                                }
                            }}
                        >
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
                                                height: `68px`, // ارتفاع ثابت
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <CommandItem
                                                value={`${product.productName} ${product.productCode}`}
                                                onSelect={() => {
                                                    onChange(product.id)
                                                    setOpen(false)
                                                }}
                                                className="flex items-center gap-3 text-black cursor-pointer w-full px-3 py-2 hover:bg-gray-100"
                                                style={{ height: '68px' }}
                                            >
                                                <ProductImage
                                                    product={product}
                                                    className="w-12 h-12 rounded shrink-0"
                                                />
                                                <div className="flex-1 overflow-hidden min-w-0">
                                                    <div className="font-medium text-sm leading-tight break-words line-clamp-2">
                                                        {product.productName}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{product.productCode}</span>
                                                        <span className="text-green-600 font-semibold">
                                                            <DualText k="common.available" />: {product.currentStock}
                                                        </span>
                                                        <span>{product.price.toFixed(2)} <DualText k="common.riyal" /></span>
                                                    </div>
                                                </div>
                                                {product.id === value && <Check className="h-5 w-5 ml-auto text-green-600 shrink-0" />}
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
