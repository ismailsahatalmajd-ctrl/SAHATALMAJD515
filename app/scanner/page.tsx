"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Keyboard, Camera, Search, X, Package, Barcode, Calendar, History } from "lucide-react"
import { useHistoryStore } from "@/lib/history-store"
import { Html5QrcodeScanner } from "html5-qrcode"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"

type ScanMode = 'usb' | 'camera'

export default function ScannerPage() {
    const [mode, setMode] = useState<ScanMode>('usb')
    const [searchQuery, setSearchQuery] = useState("")
    const [scannedItem, setScannedItem] = useState<any | null>(null)

    // History store to search in
    const { items: history } = useHistoryStore()
    const { toast } = useToast()

    const usbInputRef = useRef<HTMLInputElement>(null)
    const scannerRef = useRef<Html5QrcodeScanner | null>(null)

    // Focus input when in USB mode
    useEffect(() => {
        if (mode === 'usb' && usbInputRef.current) {
            usbInputRef.current.focus()
        }
    }, [mode, scannedItem])

    // Handle successful scan (from any source)
    const handleScan = (code: string) => {
        console.log("Searching for:", code)

        // Normalize code (trim spaces)
        const cleanCode = code.trim()

        // Search in history items
        // We check barcode, internalCode
        const found = history.find(item =>
            item.barcode === cleanCode ||
            item.internalCode === cleanCode ||
            item.internalCode.toLowerCase() === cleanCode.toLowerCase()
        )

        if (found) {
            setScannedItem(found)
            setSearchQuery("") // Clear query for next scan
            toast({
                title: "✅ تم العثور على المنتج",
                description: found.productNameArabic,
            })
        } else {
            setScannedItem(null)
            toast({
                title: "❌ منتج غير موجود",
                description: `لم يتم العثور على الكود: ${cleanCode}`,
                variant: "destructive"
            })
        }
    }

    // Handle USB Keyboard Input (Enter key)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (searchQuery) {
                handleScan(searchQuery)
            }
        }
    }

    // Setup Camera Scanner
    useEffect(() => {
        if (mode === 'camera') {
            // Small delay to ensure DOM is ready
            const timeoutId = setTimeout(() => {
                try {
                    if (!scannerRef.current) {
                        scannerRef.current = new Html5QrcodeScanner(
                            "reader",
                            {
                                fps: 10,
                                qrbox: { width: 250, height: 250 },
                                aspectRatio: 1.0,
                            },
              /* verbose= */ false
                        )

                        scannerRef.current.render(
                            (decodedText) => {
                                handleScan(decodedText)
                                // Optionally pause or close generic scanner after success if desired
                                // scannerRef.current?.pause(true)
                            },
                            (errorMessage) => {
                                // Ignore parse errors, scanning is continuous
                            }
                        )
                    }
                } catch (err) {
                    console.error("Failed to start scanner", err)
                }
            }, 100)

            return () => {
                clearTimeout(timeoutId)
                if (scannerRef.current) {
                    try {
                        scannerRef.current.clear().catch(e => console.error("Failed to clear scanner", e))
                    } catch (e) {
                        // ignore
                    }
                    scannerRef.current = null
                }
            }
        } else {
            // Cleanup if switching away from camera
            if (scannerRef.current) {
                try {
                    scannerRef.current.clear().catch(e => console.error("Failed to clear scanner", e))
                } catch (e) {
                    // ignore
                }
                scannerRef.current = null
            }
        }
    }, [mode])

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8" dir="rtl">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <Barcode className="w-8 h-8 text-blue-600" />
                        ماسح الباركود
                    </h1>

                    <div className="flex bg-white rounded-lg p-1 shadow-sm border">
                        <Button
                            variant={mode === 'usb' ? "default" : "ghost"}
                            onClick={() => setMode('usb')}
                            className="gap-2"
                        >
                            <Keyboard className="w-4 h-4" />
                            ماسح يدوي/USB
                        </Button>
                        <Button
                            variant={mode === 'camera' ? "default" : "ghost"}
                            onClick={() => setMode('camera')}
                            className="gap-2"
                        >
                            <Camera className="w-4 h-4" />
                            كاميرا الجهاز
                        </Button>
                    </div>
                </div>

                {/* Scanner Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Input Section */}
                    <Card className="h-fit shadow-md">
                        <CardHeader>
                            <CardTitle>فحص الكود</CardTitle>
                            <CardDescription>
                                {mode === 'usb'
                                    ? "قم بتوصيل الماسح الضوئي أو أدخل الكود يدوياً"
                                    : "وجه الكاميرا نحو الباركود"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {mode === 'usb' ? (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            ref={usbInputRef}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="أدخل الباركود أو امسحه هنا..."
                                            className="pr-9 h-12 text-lg font-mono focus-visible:ring-blue-600"
                                            autoComplete="off"
                                        />
                                    </div>
                                    <Button
                                        className="w-full h-10"
                                        onClick={() => handleScan(searchQuery)}
                                    >
                                        بحث
                                    </Button>
                                </div>
                            ) : (
                                <div className="w-full bg-black/5 rounded-lg overflow-hidden border">
                                    <div id="reader" className="w-full"></div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Result Section */}
                    <Card className={`shadow-md transition-all duration-300 ${scannedItem ? 'ring-2 ring-blue-500' : ''}`}>
                        <CardHeader className="bg-slate-100/50 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-slate-600" />
                                نتيجة الفحص
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {scannedItem ? (
                                <div className="space-y-6">
                                    {/* Status Badge */}
                                    <div className="flex justify-center">
                                        <span className="bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                            منتج موجود
                                        </span>
                                    </div>

                                    {/* Product Names */}
                                    <div className="text-center space-y-2">
                                        <h2 className="text-2xl font-bold text-slate-900">{scannedItem.productNameArabic}</h2>
                                        <p className="text-lg text-slate-500 font-medium">{scannedItem.productNameEnglish}</p>
                                    </div>

                                    {/* Details Grid */}
                                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">الكود الداخلي</Label>
                                            <p className="font-mono font-bold text-blue-700 truncate" title={scannedItem.internalCode}>
                                                {scannedItem.internalCode}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">الباركود</Label>
                                            <p className="font-mono font-bold text-slate-700">
                                                {scannedItem.barcode}
                                            </p>
                                        </div>

                                        {scannedItem.category && (
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">الفئة</Label>
                                                <p className="font-medium">{scannedItem.category}</p>
                                            </div>
                                        )}

                                        {scannedItem.timestamp && (
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">تاريخ الإنشاء</Label>
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-sm">
                                                        {new Date(scannedItem.timestamp).toLocaleDateString('en-GB')}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 pt-2">
                                        <Button
                                            variant="outline"
                                            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                            onClick={() => setScannedItem(null)}
                                        >
                                            <X className="w-4 h-4 ml-2" />
                                            مسح النتيجة
                                        </Button>
                                    </div>

                                </div>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground space-y-4">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p className="text-lg font-medium">بانتظار الفحص...</p>
                                    <p className="text-sm max-w-xs mx-auto opacity-70">
                                        امسح الباركود أو أدخل الرقم للبحث عن بيانات المنتج
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            <Toaster />
        </div>
    )
}
