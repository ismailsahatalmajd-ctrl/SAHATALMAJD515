"use client"

import { useState, useMemo, useEffect } from "react"
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { getSuppliers, addSupplier } from "@/lib/storage"
import type { Supplier } from "@/lib/types"

interface SupplierComboboxProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
}

export function SupplierCombobox({ value, onChange, placeholder = "اختر المورد / Select Supplier...", className }: SupplierComboboxProps) {
    const [open, setOpen] = useState(false)
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [searchValue, setSearchValue] = useState("")

    useEffect(() => {
        setSuppliers(getSuppliers())
    }, [open])

    const refreshSuppliers = () => {
        setSuppliers(getSuppliers())
    }

    const handleAddSupplier = async () => {
        if (!searchValue.trim()) return
        const newSupplier = await addSupplier({
            name: searchValue.trim()
        })
        refreshSuppliers()
        onChange(newSupplier.name)
        setOpen(false)
        setSearchValue("")
    }

    const filteredSuppliers = useMemo(() => {
        return suppliers.filter((s) =>
            s.name.toLowerCase().includes(searchValue.toLowerCase())
        )
    }, [suppliers, searchValue])

    const exactMatch = useMemo(() => {
        return suppliers.find((s) => s.name.toLowerCase() === searchValue.toLowerCase().trim())
    }, [suppliers, searchValue])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between bg-white border-slate-200 h-10 text-xs font-bold text-slate-700 rounded-xl", className)}
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 shadow-2xl border-blue-100 rounded-2xl overflow-hidden">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="ابحث عن مورد... / Search supplier..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                        className="h-11 border-none focus:ring-0 text-xs font-bold"
                    />
                    <CommandList className="max-h-[300px]">
                        <CommandGroup>
                            {filteredSuppliers.map((supplier) => (
                                <CommandItem
                                    key={supplier.id}
                                    value={supplier.name}
                                    onSelect={(currentValue) => {
                                        onChange(supplier.name) // Use exact name from object
                                        setOpen(false)
                                    }}
                                    className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-blue-50 transition-colors rounded-lg mx-1 my-0.5"
                                >
                                    <div className={cn("h-4 w-4 flex items-center justify-center rounded-sm", value === supplier.name ? "bg-blue-600 text-white" : "border text-transparent")}>
                                        <Check className="h-3 w-3" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{supplier.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <CommandGroup className="mt-2 border-t pt-2 bg-slate-50/50">
                            <CommandItem
                                onSelect={() => {
                                    if (searchValue.trim() && !exactMatch) {
                                        handleAddSupplier()
                                    }
                                }}
                                disabled={!searchValue.trim() || !!exactMatch}
                                className={cn(
                                    "flex items-center gap-2 text-blue-600 font-bold text-xs p-3 cursor-pointer",
                                    (!searchValue.trim() || exactMatch) && "opacity-40 cursor-not-allowed"
                                )}
                            >
                                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-1">
                                    <Plus className="h-3.5 w-3.5" />
                                </div>
                                {searchValue.trim() ? `إضافة مورد جديد: "${searchValue}"` : "اكتب اسم المورد لإضافته..."}
                            </CommandItem>
                        </CommandGroup>

                        {filteredSuppliers.length === 0 && searchValue.trim() === "" && (
                            <div className="py-12 text-center text-slate-400">
                                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-10" />
                                <p className="text-[10px] font-bold">لا يوجد موردين مسجلين حالياً</p>
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
