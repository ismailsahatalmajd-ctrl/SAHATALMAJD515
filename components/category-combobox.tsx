"use client"

import { useState, useMemo, useEffect } from "react"
import { Check, ChevronsUpDown, Plus, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
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
import { getCategories, addCategory } from "@/lib/storage"
import type { Category } from "@/lib/types"

interface CategoryComboboxProps {
    value: string
    onChange: (value: string) => void
    className?: string
    placeholder?: string
}

export function CategoryCombobox({ value, onChange, className, placeholder }: CategoryComboboxProps) {
    const [open, setOpen] = useState(false)
    const [categories, setCategories] = useState<Category[]>([])
    const [searchValue, setSearchValue] = useState("")

    useEffect(() => {
        setCategories(getCategories())
    }, [])

    const refreshCategories = () => {
        setCategories(getCategories())
    }

    const handleAddCategory = async () => {
        if (!searchValue.trim()) return
        const newCategory = await addCategory({
            name: searchValue.trim(),
            color: "#6366f1" // Default indigo
        })
        refreshCategories()
        onChange(newCategory.name)
        setOpen(false)
        setSearchValue("")
    }

    const filteredCategories = useMemo(() => {
        return categories.filter((cat) =>
            cat.name.toLowerCase().includes(searchValue.toLowerCase())
        )
    }, [categories, searchValue])

    const exactMatch = useMemo(() => {
        return categories.find((c) => c.name.toLowerCase() === searchValue.toLowerCase().trim())
    }, [categories, searchValue])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-9 text-xs", className)}
                >
                    <div className="flex items-center gap-2 truncate">
                        <Layers className="h-3 w-3 opacity-50" />
                        {value || placeholder || "اختر التصنيف..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 shadow-xl border-slate-200">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="بحث عن تصنيف..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                        className="h-9"
                    />
                    <CommandList>
                        <CommandGroup>
                            {filteredCategories.map((cat) => (
                                <CommandItem
                                    key={cat.id}
                                    value={cat.name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue)
                                        setOpen(false)
                                    }}
                                    className="text-xs py-2"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value === cat.name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {cat.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup className="mt-1 border-t pt-1">
                            <CommandItem
                                onSelect={() => {
                                    if (searchValue.trim() && !exactMatch) {
                                        handleAddCategory()
                                    }
                                }}
                                disabled={!searchValue.trim() || !!exactMatch}
                                className={cn(
                                    "flex items-center gap-2 text-blue-600 font-bold cursor-pointer text-xs",
                                    (!searchValue.trim() || exactMatch) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Plus className="h-3 w-3" />
                                {searchValue.trim() ? `إضافة: "${searchValue}"` : "اكتب لإضافة تصنيف جديد..."}
                            </CommandItem>
                        </CommandGroup>
                        {filteredCategories.length === 0 && searchValue.trim() === "" && (
                            <div className="py-6 text-center text-slate-400 text-[10px] font-bold">
                                لا يوجد تصنيفات مضافة بعد
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
