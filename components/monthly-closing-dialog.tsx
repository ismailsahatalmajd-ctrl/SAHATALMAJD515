"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Calendar, Package, Loader2 } from "lucide-react"
import { closeMonth } from "@/lib/storage"
import { toast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"

interface MonthlyClosingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    totalProducts: number
}

export function MonthlyClosingDialog({ open, onOpenChange, totalProducts }: MonthlyClosingDialogProps) {
    const [isProcessing, setIsProcessing] = useState(false)

    const handleConfirm = async () => {
        setIsProcessing(true)
        try {
            const result = await closeMonth()

            toast({
                title: "✅ تم إقفال الشهر بنجاح",
                description: `تم معالجة ${result.totalProducts} منتج. تم توليد تقرير PDF للشهر السابق.`,
            })

            onOpenChange(false)

            // Reload page to reflect changes
            setTimeout(() => window.location.reload(), 1000)
        } catch (error: any) {
            console.error("Month closing failed:", error)
            toast({
                title: "❌ فشل إقفال الشهر",
                description: error.message || "حدث خطأ أثناء إقفال الشهر",
                variant: "destructive",
            })
        } finally {
            setIsProcessing(false)
        }
    }

    const currentMonth = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Calendar className="h-5 w-5" />
                        <span>إقفال الشهر</span>
                    </DialogTitle>
                    <DialogDescription className="text-base pt-2">
                        أنت على وشك إقفال شهر <span className="font-bold text-foreground">{currentMonth}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Summary Card */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                عدد المنتجات
                            </span>
                            <span className="font-bold">{totalProducts}</span>
                        </div>
                    </div>

                    {/* Warning Box */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div className="text-sm text-yellow-900 space-y-1">
                                <p className="font-semibold">سيتم تنفيذ الإجراءات التالية:</p>
                                <ul className="list-disc list-inside space-y-1 mr-4">
                                    <li>توليد تقرير PDF للشهر الحالي</li>
                                    <li>نقل المخزون الحالي → مخزون بداية الشهر</li>
                                    <li>إعادة تصفير المشتريات والصرفيات</li>
                                </ul>
                                <p className="font-semibold mt-2 text-red-700">⚠️ هذه العملية لا يمكن التراجع عنها!</p>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isProcessing}
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                جاري الإقفال...
                            </>
                        ) : (
                            <>
                                <Calendar className="ml-2 h-4 w-4" />
                                تأكيد الإقفال
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
