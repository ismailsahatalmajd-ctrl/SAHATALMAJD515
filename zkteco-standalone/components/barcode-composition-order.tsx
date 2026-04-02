"use client"

import { useState, useEffect } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { GripVertical, Lock } from "lucide-react"
import { getSettings, updateSettings, BarcodeElement } from "@/lib/settings-store"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface SortableItemProps {
    id: string
    element: BarcodeElement
    onToggle: (id: string, enabled: boolean) => void
    onValueChange: (id: string, value: string) => void
}

function SortableItem({ id, element, onToggle, onValueChange }: SortableItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: element.fixed })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const isEditable = ["saudiCode", "companyCode", "year", "month"].includes(id)

    return (
        <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 bg-background border rounded-lg shadow-sm transition-shadow ${element.fixed ? 'opacity-80 bg-muted' : 'hover:shadow-md'}`}>
            {!element.fixed ? (
                <div className="cursor-grab text-muted-foreground hover:text-foreground transition-colors" {...attributes} {...listeners}>
                    <GripVertical className="h-5 w-5" />
                </div>
            ) : (
                <div className="text-muted-foreground px-1">
                    <Lock className="h-4 w-4" />
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex flex-col">
                    <span className="font-medium text-sm flex items-center gap-2">
                        {element.nameAr}
                        {!element.enabled && <span className="text-[10px] bg-muted px-1 rounded text-muted-foreground">(معطل)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{element.nameEn}</span>
                </div>

                <div className="flex items-center gap-3 justify-end">
                    {isEditable && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor={`val-${id}`} className="sr-only">قيمة</Label>
                            <Input
                                id={`val-${id}`}
                                value={element.value}
                                onChange={(e) => onValueChange(id, e.target.value)}
                                className="h-8 w-24 text-center font-mono text-xs"
                                placeholder="قيمة"
                                disabled={!element.enabled}
                            />
                        </div>
                    )}
                    {!element.fixed && (
                        <Switch
                            checked={element.enabled}
                            onCheckedChange={(checked) => onToggle(id, checked)}
                        />
                    )}
                </div>
            </div>

            <div className="mr-2 text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground min-w-[30px] text-center">
                {element.length}
            </div>
        </div>

    )
}

export function BarcodeCompositionOrder() {
    const [elements, setElements] = useState<BarcodeElement[]>([])

    // Load settings on mount
    useEffect(() => {
        const settings = getSettings()
        if (settings.barcodeOrder?.elements) {
            setElements(settings.barcodeOrder.elements)
        }
    }, [])

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setElements((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)

                // Don't allow moving fixed items or moving items past fixed items if necessary
                // Simple logic: just move
                const newOrder = arrayMove(items, oldIndex, newIndex)

                // Save to settings
                saveSettings(newOrder)

                return newOrder
            })
        }
    }

    function handleToggle(id: string, enabled: boolean) {
        const newElements = elements.map(el => el.id === id ? { ...el, enabled } : el)
        setElements(newElements)
        saveSettings(newElements)
    }

    function handleValueChange(id: string, value: string) {
        const newElements = elements.map(el => el.id === id ? { ...el, value } : el)
        setElements(newElements)
        saveSettings(newElements)
    }

    function saveSettings(newElements: BarcodeElement[]) {
        const settings = getSettings()
        if (!settings.barcodeOrder) {
            settings.barcodeOrder = { elements: [] }
        }
        settings.barcodeOrder.elements = newElements
        updateSettings(settings)
    }

    // Generate preview
    const previewCode = elements
        .filter(e => e.enabled)
        .map(e => {
            // Mock values for preview
            if (e.value) return e.value.padStart(e.length, '0')
            if (e.id === 'year') return '25'
            if (e.id === 'month') return '12'
            if (e.id === 'sequence') return '1234'.slice(0, e.length)
            if (e.id === 'checksum') return 'X'
            return '0'.repeat(e.length)
        })
        .join('')

    const totalDigits = elements
        .filter(e => e.enabled)
        .reduce((sum, e) => sum + e.length, 0)

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir="rtl">
            <div className="lg:col-span-2">
                <Card className="border-2 border-primary/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <span>🔢 ترتيب الباركود الرقمي</span>
                            <span className="text-sm text-muted-foreground font-normal">({totalDigits} رقم)</span>
                        </CardTitle>
                        <CardDescription>
                            حدد مكونات الباركود وترتيبها. يمكنك تفعيل/تعطيل المكونات وتغيير القيم الثابتة.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={elements.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-2">
                                    {elements.map((item) => (
                                        <SortableItem
                                            key={item.id}
                                            id={item.id}
                                            element={item}
                                            onToggle={handleToggle}
                                            onValueChange={handleValueChange}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card className="bg-muted/50">
                    <CardHeader>
                        <CardTitle className="text-base">معاينة الباركود</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-white p-4 rounded border text-center font-mono text-xl tracking-widest break-all">
                            {previewCode}
                        </div>

                        <div className="text-center mt-4 mb-2">
                            <div className="text-3xl font-bold text-primary">{totalDigits}</div>
                            <div className="text-sm text-muted-foreground">إجمالي الأرقام</div>
                        </div>

                        <div className="mt-4 text-xs text-muted-foreground space-y-2">
                            {elements.filter(e => e.enabled).map(e => (
                                <div key={e.id} className="flex justify-between">
                                    <span>{e.nameAr}:</span>
                                    <span className="font-mono">
                                        {e.id === 'checksum' ? 'X' :
                                            e.value ? e.value.padStart(e.length, '0') :
                                                '0'.repeat(e.length)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50/50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="text-base text-blue-800">💡 ملاحظات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-1 text-sm text-blue-700">
                            <li>كود الدولة والشركة يجب أن يكونا ثابتين عادةً.</li>
                            <li>رقم التحقق (Checksum) يتم حسابه تلقائياً ولا يمكن تغيير مكانه (دائماً في النهاية).</li>
                            <li>تغيير الترتيب سيؤثر على قراءة الباركود في الأنظمة الخارجية.</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
