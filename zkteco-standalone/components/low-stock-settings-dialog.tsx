"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { db } from "@/lib/db"
import { Product } from "@/lib/types"

interface LowStockSettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    categories: string[]
    locations: string[]
    onSave: () => void
}

export function LowStockSettingsDialog({ open, onOpenChange, categories, locations, onSave }: LowStockSettingsDialogProps) {
    const [percentage, setPercentage] = useState<number>(33.33)
    const [scope, setScope] = useState<"all" | "category" | "location">("all")
    const [targetValue, setTargetValue] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)
    const { toast } = useToast()

    // Reset when opened
    useEffect(() => {
        if (open) {
            // Load default or saved global preference if we had one, but for now specific input
            setScope("all")
            setTargetValue("")
        }
    }, [open])

    const handleSave = async () => {
        const numPercentage = Number(percentage)
        console.log("Saving Low Stock Settings:", { scope, targetValue, percentage: numPercentage })

        if (isNaN(numPercentage) || numPercentage < 0 || numPercentage > 100) {
            toast({
                title: getDualString("common.error"),
                description: "Percentage must be between 0 and 100 / النسبة يجب أن تكون رقم بين 0 و 100",
                variant: "destructive",
            })
            return
        }

        if ((scope === "category" || scope === "location") && !targetValue) {
            toast({
                title: getDualString("common.error"),
                description: "Please select a target value / يرجى اختيار القيمة المستهدفة",
                variant: "destructive",
            })
            return
        }

        setIsSaving(true)
        try {
            // 1. Fetch products based on scope
            let productsToUpdate: Product[] = []

            // Use simple filter for reliability if exact match fails
            if (scope === "all") {
                productsToUpdate = await db.products.toArray()
            } else if (scope === "category") {
                // Determine if we need exact match or if category is stored differently
                productsToUpdate = await db.products.filter(p => p.category === targetValue).toArray()
            } else if (scope === "location") {
                productsToUpdate = await db.products.filter(p => p.location === targetValue).toArray()
            }

            console.log(`Found ${productsToUpdate.length} products to update`)

            if (productsToUpdate.length === 0) {
                toast({
                    title: getDualString("common.warning"),
                    description: "No products found matches criteria / لم يتم العثور على منتجات تطابق المعايير",
                    variant: "destructive", // Orange-ish warning ideally, but destructive works for attention
                })
                setIsSaving(false)
                return
            }

            // 2. Update logic
            const updates = productsToUpdate.map(p => ({
                ...p,
                lowStockThresholdPercentage: numPercentage,
                updatedAt: new Date().toISOString()
            }))

            // 3. Bulk Put
            if (updates.length > 0) {
                await db.products.bulkPut(updates)
            }

            toast({
                title: getDualString("toast.success"),
                description: `Updated ${updates.length} products successfully / تم تحديث ${updates.length} منتج بنجاح`,
            })

            onSave() // Refresh parent
            onOpenChange(false)
        } catch (error) {
            console.error("Failed to update low stock settings", error)
            toast({
                title: getDualString("common.error"),
                description: `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        إعدادات تنبيهات المخزون / Low Stock Settings
                    </DialogTitle>
                    <DialogDescription>
                        Configure how low stock is calculated. Actions are applied immediately.
                        <br />
                        قم بضبط كيفية حساب المخزون المنخفض. يتم تطبيق التغييرات فوراً.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">

                    {/* Percentage Input */}
                    <div className="space-y-2">
                        <Label>Low Stock Percentage / نسبة المخزون المنخفض (%)</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={percentage}
                                onChange={(e) => setPercentage(parseFloat(e.target.value))}
                            />
                            <span className="text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Default: 33.33%. If stock drops below this % of (Opening + Purchases), it's flagged as Low.
                        </p>
                    </div>

                    {/* Scope Selection */}
                    <div className="space-y-2">
                        <Label>Apply To / تطبيق على</Label>
                        <Select value={scope} onValueChange={(val: any) => setScope(val)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Products / جميع المنتجات</SelectItem>
                                <SelectItem value="category">Specific Category / تصنيف محدد</SelectItem>
                                <SelectItem value="location">Specific Location / موقع محدد</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Target Value Input (Conditional) */}
                    {scope === "category" && (
                        <div className="space-y-2">
                            <Label>Select Category / اختر التصنيف</Label>
                            <Select value={targetValue} onValueChange={setTargetValue}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {scope === "location" && (
                        <div className="space-y-2">
                            <Label>Select Location / اختر الموقع</Label>
                            <Select value={targetValue} onValueChange={setTargetValue}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Location" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locations.map(l => (
                                        <SelectItem key={l} value={l}>{l}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel / إلغاء
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save & Apply / حفظ وتطبيق"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
