"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHistoryStore } from "@/lib/history-store"
import { Trash2, Search, RotateCcw, Printer, Copy, FileDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import * as XLSX from "xlsx"

export default function HistoryPage() {
    const { items, clearHistory, removeItem } = useHistoryStore()
    const [searchTerm, setSearchTerm] = useState("")
    const { toast } = useToast()

    const filteredItems = items.filter(
        (item) =>
            item.productNameArabic.includes(searchTerm) ||
            item.productNameEnglish.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.internalCode.includes(searchTerm) ||
            item.barcode.includes(searchTerm)
    )

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text)
        toast({
            title: "تم النسخ",
            description: "تم نسخ النص بنجاح",
        })
    }

    const handleExportExcel = () => {
        const data = filteredItems.map(item => ({
            "التاريخ": new Date(item.timestamp).toLocaleDateString('ar-SA'),
            "الاسم بالعربية": item.productNameArabic,
            "الاسم بالإنجليزية": item.productNameEnglish,
            "الكود الداخلي": item.internalCode,
            "الباركود": item.barcode,
        }))

        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "History")
        XLSX.writeFile(wb, "barcode_history.xlsx")
    }

    return (
        <div className="min-h-screen bg-muted/30 p-4 sm:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">سجل العمليات</h1>
                        <p className="text-muted-foreground">عرض سجل الباركودات التي تم توليدها سابقاً (آخر 2000 عملية)</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExportExcel}>
                            <FileDown className="ml-2 h-4 w-4" />
                            تصدير Excel
                        </Button>
                        <Button variant="destructive" onClick={() => {
                            if (confirm("هل أنت متأكد من مسح السجل بالكامل؟")) {
                                clearHistory()
                            }
                        }}>
                            <Trash2 className="ml-2 h-4 w-4" />
                            مسح السجل
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث في السجل..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="max-w-sm"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-right">التاريخ</TableHead>
                                        <TableHead className="text-right">الاسم بالعربية</TableHead>
                                        <TableHead className="text-right">الاسم بالإنجليزية</TableHead>
                                        <TableHead className="text-right">الكود الداخلي</TableHead>
                                        <TableHead className="text-right">الباركود</TableHead>
                                        <TableHead className="text-right">إجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                لا توجد سجلات مطابقة
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredItems.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>{new Date(item.timestamp).toLocaleDateString('ar-SA')}</TableCell>
                                                <TableCell className="font-medium">{item.productNameArabic}</TableCell>
                                                <TableCell>{item.productNameEnglish}</TableCell>
                                                <TableCell className="font-mono">
                                                    <span className="cursor-pointer hover:underline" onClick={() => handleCopy(item.internalCode)}>{item.internalCode}</span>
                                                </TableCell>
                                                <TableCell className="font-mono">
                                                    <span className="cursor-pointer hover:underline" onClick={() => handleCopy(item.barcode)}>{item.barcode}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="mt-4 text-sm text-muted-foreground text-center">
                            عرض {filteredItems.length} من {items.length} سجل
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
