"use client"

import { useState, useMemo, useEffect } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
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
import { getUnits, addUnit } from "@/lib/storage"
import type { Unit } from "@/lib/types"

interface UnitComboboxProps {
    value: string
    onChange: (value: string) => void
    className?: string
}

export function UnitCombobox({ value, onChange, className }: UnitComboboxProps) {
    const [open, setOpen] = useState(false)
    const [units, setUnits] = useState<Unit[]>([])
    const [searchValue, setSearchValue] = useState("")

    useEffect(() => {
        setUnits(getUnits())
    }, [])

    const refreshUnits = () => {
        setUnits(getUnits())
    }

    const handleAddUnit = async () => {
        if (!searchValue.trim()) return
        const newUnit = await addUnit({
            name: searchValue.trim(),
            abbreviation: searchValue.trim().substring(0, 3)
        })
        refreshUnits()
        onChange(newUnit.name)
        setOpen(false)
        setSearchValue("")
    }

    const filteredUnits = useMemo(() => {
        return units.filter((unit) =>
            unit.name.toLowerCase().includes(searchValue.toLowerCase())
        )
    }, [units, searchValue])

    const exactMatch = useMemo(() => {
        return units.find((u) => u.name.toLowerCase() === searchValue.toLowerCase().trim())
    }, [units, searchValue])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between bg-transparent border-none focus-visible:ring-0 h-8 text-[10px] font-bold text-slate-500 text-center", className)}
                >
                    {value || "Select Unit..."}
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search unit..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                    />
                    <CommandList>
                        <CommandGroup>
                            {filteredUnits.map((unit) => (
                                <CommandItem
                                    key={unit.id}
                                    value={unit.name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === unit.name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {unit.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup className="mt-2 border-t pt-2">
                            <CommandItem
                                onSelect={() => {
                                    if (searchValue.trim() && !exactMatch) {
                                        handleAddUnit()
                                    }
                                }}
                                disabled={!searchValue.trim() || !!exactMatch}
                                className={cn(
                                    "flex items-center gap-2 text-blue-600 font-bold cursor-pointer",
                                    (!searchValue.trim() || exactMatch) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Plus className="h-4 w-4" />
                                {searchValue.trim() ? `إضافة وحدة: "${searchValue}"` : "اكتب لإضافة وحدة جديدة..."}
                            </CommandItem>
                        </CommandGroup>
                        {filteredUnits.length === 0 && searchValue.trim() === "" && (
                            <div className="py-6 text-center text-slate-400 text-[10px] font-bold">
                                لا يوجد وحدات مضافة بعد
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
