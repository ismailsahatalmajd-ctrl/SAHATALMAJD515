"use client"

import { useState, useEffect } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { GripVertical } from "lucide-react"
import { getSettings, updateSettings, NamingElement } from "@/lib/settings-store"
import { useToast } from "@/hooks/use-toast"

interface SortableItemProps {
    id: string
    label: string
    nameEn: string
}

function SortableItem({ id, label, nameEn }: SortableItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-background border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="cursor-grab text-muted-foreground hover:text-foreground transition-colors" {...attributes} {...listeners}>
                <GripVertical className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
                <span className="font-medium text-sm">{label}</span>
                <span className="text-xs text-muted-foreground">{nameEn}</span>
            </div>
            <div className="mr-auto text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">
                #{id}
            </div>
        </div>
    )
}

export function ProductNamingOrder() {
    const { toast } = useToast()

    const [arabicOrder, setArabicOrder] = useState<NamingElement[]>([])
    const [englishOrder, setEnglishOrder] = useState<NamingElement[]>([])

    // Load settings on mount
    useEffect(() => {
        const settings = getSettings()
        if (settings.namingOrder) {
            setArabicOrder(settings.namingOrder.arabic)
            setEnglishOrder(settings.namingOrder.english)
        }
    }, [])

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    function handleArabicDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setArabicOrder((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)
                const newOrder = arrayMove(items, oldIndex, newIndex)

                // Save to settings
                const settings = getSettings()
                if (settings.namingOrder) {
                    settings.namingOrder.arabic = newOrder
                    updateSettings(settings)
                }

                return newOrder
            })
        }
    }

    function handleEnglishDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setEnglishOrder((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)
                const newOrder = arrayMove(items, oldIndex, newIndex)

                // Save to settings
                const settings = getSettings()
                if (settings.namingOrder) {
                    settings.namingOrder.english = newOrder
                    updateSettings(settings)
                }

                return newOrder
            })
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" dir="rtl">
            {/* Arabic Naming Order */}
            <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span>🛠️ ترتيب التسمية العربية</span>
                    </CardTitle>
                    <CardDescription>
                        حدد ترتيب ظهور العناصر في اسم المنتج باللغة العربية. اسحب وأفلت العناصر لتغيير الترتيب.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-lg border border-dashed border-primary/20">
                        <div className="text-sm font-medium mb-2 text-primary">المعاينة الحالية:</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {arabicOrder.map((item, index) => (
                                <div key={item.id} className="flex items-center">
                                    <span className="bg-white px-2 py-1 rounded border shadow-sm text-foreground">{item.nameAr}</span>
                                    {index < arabicOrder.length - 1 && <span className="mx-1">←</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleArabicDragEnd}>
                        <SortableContext items={arabicOrder.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {arabicOrder.map((item) => (
                                    <SortableItem key={item.id} id={item.id} label={item.nameAr} nameEn={item.nameEn} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </CardContent>
            </Card>

            {/* English Naming Order */}
            <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span>🔠 ترتيب التسمية الإنجليزية</span>
                    </CardTitle>
                    <CardDescription>
                        Define the order of elements for the product name in English. Drag and drop to reorder.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-lg border border-dashed border-primary/20" dir="ltr">
                        <div className="text-sm font-medium mb-2 text-primary">Current Preview:</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {englishOrder.map((item, index) => (
                                <div key={item.id} className="flex items-center">
                                    <span className="bg-white px-2 py-1 rounded border shadow-sm text-foreground">{item.nameEn}</span>
                                    {index < englishOrder.length - 1 && <span className="mx-1">→</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnglishDragEnd}>
                        <SortableContext items={englishOrder.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {englishOrder.map((item) => (
                                    <SortableItem key={item.id} id={item.id} label={item.nameEn} nameEn={item.nameAr} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </CardContent>
            </Card>

            <div className="lg:col-span-2">
                <Card className="bg-blue-50/50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="text-base text-blue-800">💡 كيف يعمل هذا؟</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-1 text-sm text-blue-700">
                            <li>يتم استخدام هذا الترتيب عند توليد اسم المنتج تلقائياً في صفحة الباركود.</li>
                            <li>العناصر الفارغة (مثلاً إذا لم يتم اختيار "مجموعة") لن تظهر في الاسم النهائي.</li>
                            <li>يتم حفظ الترتيب تلقائياً عند التغيير.</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
