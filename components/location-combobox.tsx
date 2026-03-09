"use client"

import { useState, useMemo, useEffect } from "react"
import { Check, ChevronsUpDown, Plus, MapPin } from "lucide-react"
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
import { getLocations, addLocation } from "@/lib/storage"
import type { Location } from "@/lib/types"

interface LocationComboboxProps {
    value: string
    onChange: (value: string) => void
    className?: string
    placeholder?: string
}

export function LocationCombobox({ value, onChange, className, placeholder }: LocationComboboxProps) {
    const [open, setOpen] = useState(false)
    const [locations, setLocations] = useState<Location[]>([])
    const [searchValue, setSearchValue] = useState("")

    useEffect(() => {
        setLocations(getLocations())
    }, [])

    const refreshLocations = () => {
        setLocations(getLocations())
    }

    const handleAddLocation = async () => {
        if (!searchValue.trim()) return
        const newLocation = await addLocation({
            name: searchValue.trim()
        })
        refreshLocations()
        onChange(newLocation.name)
        setOpen(false)
        setSearchValue("")
    }

    const filteredLocations = useMemo(() => {
        return locations.filter((loc) =>
            loc.name.toLowerCase().includes(searchValue.toLowerCase())
        )
    }, [locations, searchValue])

    const exactMatch = useMemo(() => {
        return locations.find((l) => l.name.toLowerCase() === searchValue.toLowerCase().trim())
    }, [locations, searchValue])

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
                        <MapPin className="h-3 w-3 opacity-50" />
                        {value || placeholder || "اختر الموقع..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 shadow-xl border-slate-200">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="بحث عن موقع..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                        className="h-9"
                    />
                    <CommandList>
                        <CommandGroup>
                            {filteredLocations.map((loc) => (
                                <CommandItem
                                    key={loc.id}
                                    value={loc.name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue)
                                        setOpen(false)
                                    }}
                                    className="text-xs py-2"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value === loc.name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {loc.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup className="mt-1 border-t pt-1">
                            <CommandItem
                                onSelect={() => {
                                    if (searchValue.trim() && !exactMatch) {
                                        handleAddLocation()
                                    }
                                }}
                                disabled={!searchValue.trim() || !!exactMatch}
                                className={cn(
                                    "flex items-center gap-2 text-blue-600 font-bold cursor-pointer text-xs",
                                    (!searchValue.trim() || exactMatch) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Plus className="h-3 w-3" />
                                {searchValue.trim() ? `إضافة: "${searchValue}"` : "اكتب لإضافة موقع جديد..."}
                            </CommandItem>
                        </CommandGroup>
                        {filteredLocations.length === 0 && searchValue.trim() === "" && (
                            <div className="py-6 text-center text-slate-400 text-[10px] font-bold">
                                لا يوجد مواقع مضافة بعد
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
