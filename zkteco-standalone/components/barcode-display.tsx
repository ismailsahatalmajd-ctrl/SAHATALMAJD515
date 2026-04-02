"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Download, Printer, Settings2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface BarcodeDisplayProps {
  internalCode: string
  barcode: string
  productNameArabic: string
  productNameEnglish: string
  titleArabic?: string
  titleEnglish?: string
}

export default function BarcodeDisplay({
  internalCode,
  barcode,
  productNameArabic,
  productNameEnglish,
  titleArabic = "بطاقة المنتج",
  titleEnglish = "Product Card",
}: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { toast } = useToast()

  // Display options
  const [showArabicName, setShowArabicName] = useState(true)
  const [showEnglishName, setShowEnglishName] = useState(true)
  const [showInternalCode, setShowInternalCode] = useState(true)
  const [showBarcodeNumber, setShowBarcodeNumber] = useState(true)
  const [showDate, setShowDate] = useState(true)
  const [showBarcode, setShowBarcode] = useState(true)

  // Size options
  const [cardSizeMode, setCardSizeMode] = useState<"preset" | "custom">("preset")
  const [cardSize, setCardSize] = useState<"small" | "medium" | "large">("medium")
  const [customWidth, setCustomWidth] = useState("400")
  const [customHeight, setCustomHeight] = useState("auto")
  const [barcodeWidth, setBarcodeWidth] = useState<"thin" | "medium" | "thick">("thin")

  // Font size options
  const [titleFontSize, setTitleFontSize] = useState("20")
  const [nameFontSize, setNameFontSize] = useState("14")
  const [codeFontSize, setCodeFontSize] = useState("14")

  useEffect(() => {
    if (canvasRef.current && showBarcode) {
      drawBarcode(canvasRef.current, barcode, barcodeWidth)
    }
  }, [barcode, barcodeWidth, showBarcode])

  const drawBarcode = (canvas: HTMLCanvasElement, code: string, width: "thin" | "medium" | "thick") => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Safety check: ensure code is valid
    if (!code || typeof code !== 'string' || code.length === 0) {
      // Clear canvas if code is invalid
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "#999999"
      ctx.font = "14px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("الباركود غير صالح", canvas.width / 2, canvas.height / 2)
      return
    }

    // Bar width based on selection
    const barWidthMap = {
      thin: 1.5,
      medium: 2.5,
      thick: 3.5,
    }
    const barWidth = barWidthMap[width]
    const spacing = width === "thin" ? 1 : width === "medium" ? 1.5 : 2

    // Calculate canvas size based on barcode
    const totalWidth = code.length * (barWidth + spacing) + 40
    canvas.width = Math.max(350, totalWidth)
    canvas.height = 120

    // Clear canvas
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw barcode bars
    ctx.fillStyle = "#000000"
    const startX = (canvas.width - (code.length * (barWidth + spacing))) / 2
    const barHeight = 70

    for (let i = 0; i < code.length; i++) {
      const digit = Number.parseInt(code[i])
      const x = startX + i * (barWidth + spacing)
      const height = barHeight + (digit % 3) * 3

      if (digit % 2 === 0) {
        ctx.fillRect(x, 20, barWidth, height)
      }
    }

    // Draw barcode number
    ctx.fillStyle = "#000000"
    ctx.font = "bold 12px monospace"
    ctx.textAlign = "center"
    ctx.fillText(code, canvas.width / 2, 105)
  }

  const getCardDimensions = () => {
    if (cardSizeMode === "custom") {
      return {
        width: customWidth + "px",
        height: customHeight === "auto" ? "auto" : customHeight + "px",
      }
    }

    const presetSizes = {
      small: { width: "300px", height: "auto" },
      medium: { width: "400px", height: "auto" },
      large: { width: "500px", height: "auto" },
    }
    return presetSizes[cardSize]
  }

  const handlePrint = () => {
    const printWindow = window.open("", "", "width=800,height=600")
    if (!printWindow) return

    const dimensions = getCardDimensions()
    const barWidthMap = { thin: 1.5, medium: 2.5, thick: 3.5 }
    const selectedBarWidth = barWidthMap[barcodeWidth]
    const spacing = barcodeWidth === "thin" ? 1 : barcodeWidth === "medium" ? 1.5 : 2

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>طباعة بطاقة المنتج</title>
        <style>
          @media print {
            @page {
              size: auto;
              margin: 10mm;
            }
            body {
              margin: 0;
            }
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .card {
            border: 2px solid #000;
            padding: 20px;
            width: ${dimensions.width};
            ${dimensions.height !== "auto" ? `height: ${dimensions.height};` : ""}
            box-sizing: border-box;
          }
          h2 {
            text-align: center;
            margin-bottom: 20px;
            font-size: ${titleFontSize}px;
          }
          .product-name {
            font-size: ${nameFontSize}px;
            font-weight: bold;
            text-align: center;
            margin: 15px 0;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 5px;
          }
          .product-name-label {
            font-size: ${Math.max(10, Number(nameFontSize) - 3)}px;
            color: #666;
            margin-bottom: 5px;
          }
          .code-section {
            margin: 15px 0;
            font-size: ${codeFontSize}px;
          }
          .code-label {
            color: #666;
          }
          .code-value {
            font-family: monospace;
            font-weight: bold;
            margin-top: 5px;
          }
          .barcode-container {
            text-align: center;
            margin: 20px 0;
          }
          canvas {
            border: 1px solid #ddd;
            max-width: 100%;
          }
          .date {
            text-align: center;
            color: #666;
            font-size: ${Math.max(10, Number(codeFontSize) - 2)}px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🏷️ ${titleArabic}</h2>
          <h3 style="text-align: center; margin-top: -10px; margin-bottom: 20px; font-size: ${parseInt(titleFontSize) - 4}px; color: #666;">${titleEnglish}</h3>
          
          ${showArabicName ? `
          <div class="product-name">
            <div class="product-name-label">الاسم بالعربية:</div>
            <div>${productNameArabic}</div>
          </div>
          ` : ''}
          
          ${showEnglishName ? `
          <div class="product-name">
            <div class="product-name-label">الاسم بالإنجليزية:</div>
            <div>${productNameEnglish}</div>
          </div>
          ` : ''}
          
          ${showBarcode ? `
          <div class="barcode-container">
            <canvas id="barcode"></canvas>
          </div>
          ` : ''}
          
          ${showInternalCode ? `
          <div class="code-section">
            <div class="code-label">الكود الداخلي:</div>
            <div class="code-value">${internalCode}</div>
          </div>
          ` : ''}
          
          ${showBarcodeNumber ? `
          <div class="code-section">
            <div class="code-label">الباركود:</div>
            <div class="code-value">${barcode}</div>
          </div>
          ` : ''}
          
          ${showDate ? `
          <div class="date">التاريخ: ${new Date().toLocaleDateString("ar-SA")}</div>
          ` : ''}
        </div>
        <script>
          ${showBarcode ? `
          const canvas = document.getElementById('barcode');
          const ctx = canvas.getContext('2d');
          const code = '${barcode}';
          const barWidth = ${selectedBarWidth};
          const spacing = ${spacing};
          const totalWidth = code.length * (barWidth + spacing) + 40;
          
          canvas.width = Math.max(300, totalWidth);
          canvas.height = 120;
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.fillStyle = '#000000';
          const startX = (canvas.width - (code.length * (barWidth + spacing))) / 2;
          const barHeight = 70;
          
          for (let i = 0; i < code.length; i++) {
            const digit = parseInt(code[i]);
            const x = startX + i * (barWidth + spacing);
            const height = barHeight + (digit % 3) * 3;
            if (digit % 2 === 0) {
              ctx.fillRect(x, 20, barWidth, height);
            }
          }
          
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(code, canvas.width / 2, 105);
          ` : ''}
          
          window.print();
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleDownload = () => {
    if (!canvasRef.current) return

    const link = document.createElement("a")
    link.download = `barcode-${barcode}.png`
    link.href = canvasRef.current.toDataURL()
    link.click()

    toast({
      title: "تم التنزيل",
      description: "تم تنزيل الباركود بنجاح",
    })
  }

  const dimensions = getCardDimensions()

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          بطاقة المنتج - للطباعة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Display Options */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              خيارات العرض والطباعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Card Size Options */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">حجم البطاقة</Label>
              <Select value={cardSizeMode} onValueChange={(v) => setCardSizeMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preset">أحجام جاهزة</SelectItem>
                  <SelectItem value="custom">حجم مخصص</SelectItem>
                </SelectContent>
              </Select>

              {cardSizeMode === "preset" ? (
                <Select value={cardSize} onValueChange={(v) => setCardSize(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">صغير (300px)</SelectItem>
                    <SelectItem value="medium">متوسط (400px)</SelectItem>
                    <SelectItem value="large">كبير (500px)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">العرض (px)</Label>
                    <Input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      placeholder="400"
                      min="200"
                      max="800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">الارتفاع (px)</Label>
                    <Input
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      placeholder="auto"
                    />
                    <p className="text-xs text-muted-foreground">اكتب "auto" للتلقائي</p>
                  </div>
                </div>
              )}
            </div>

            {/* Font Size Options */}
            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-semibold">أحجام الخطوط</Label>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">العنوان</Label>
                  <Select value={titleFontSize} onValueChange={setTitleFontSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14">14px</SelectItem>
                      <SelectItem value="16">16px</SelectItem>
                      <SelectItem value="18">18px</SelectItem>
                      <SelectItem value="20">20px</SelectItem>
                      <SelectItem value="22">22px</SelectItem>
                      <SelectItem value="24">24px</SelectItem>
                      <SelectItem value="26">26px</SelectItem>
                      <SelectItem value="28">28px</SelectItem>
                      <SelectItem value="30">30px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">الأسماء</Label>
                  <Select value={nameFontSize} onValueChange={setNameFontSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10px</SelectItem>
                      <SelectItem value="11">11px</SelectItem>
                      <SelectItem value="12">12px</SelectItem>
                      <SelectItem value="14">14px</SelectItem>
                      <SelectItem value="16">16px</SelectItem>
                      <SelectItem value="18">18px</SelectItem>
                      <SelectItem value="20">20px</SelectItem>
                      <SelectItem value="22">22px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">الأكواد</Label>
                  <Select value={codeFontSize} onValueChange={setCodeFontSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10px</SelectItem>
                      <SelectItem value="11">11px</SelectItem>
                      <SelectItem value="12">12px</SelectItem>
                      <SelectItem value="14">14px</SelectItem>
                      <SelectItem value="16">16px</SelectItem>
                      <SelectItem value="18">18px</SelectItem>
                      <SelectItem value="20">20px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Barcode Width */}
            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-semibold">سُمك خطوط الباركود</Label>
              <Select value={barcodeWidth} onValueChange={(v) => setBarcodeWidth(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thin">رفيع (موصى به)</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="thick">سميك</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Display Toggles */}
            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-semibold">العناصر المعروضة</Label>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-arabic" className="text-sm">الاسم بالعربية</Label>
                <Switch id="show-arabic" checked={showArabicName} onCheckedChange={setShowArabicName} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-english" className="text-sm">الاسم بالإنجليزية</Label>
                <Switch id="show-english" checked={showEnglishName} onCheckedChange={setShowEnglishName} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-barcode" className="text-sm">صورة الباركود</Label>
                <Switch id="show-barcode" checked={showBarcode} onCheckedChange={setShowBarcode} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-internal" className="text-sm">الكود الداخلي</Label>
                <Switch id="show-internal" checked={showInternalCode} onCheckedChange={setShowInternalCode} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-barcode-num" className="text-sm">رقم الباركود</Label>
                <Switch id="show-barcode-num" checked={showBarcodeNumber} onCheckedChange={setShowBarcodeNumber} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-date" className="text-sm">التاريخ</Label>
                <Switch id="show-date" checked={showDate} onCheckedChange={setShowDate} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <div
          className="space-y-4 rounded-lg border-2 border-dashed p-6 text-center mx-auto"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        >
          <div className="space-y-1">
            <h3 className="font-bold" style={{ fontSize: `${titleFontSize}px` }}>🏷️ {titleArabic}</h3>
            <h4 className="font-semibold text-muted-foreground" style={{ fontSize: `${parseInt(titleFontSize) - 4}px` }}>{titleEnglish}</h4>
          </div>

          {showArabicName && (
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">الاسم بالعربية:</div>
              <div className="font-semibold" style={{ fontSize: `${nameFontSize}px` }}>{productNameArabic}</div>
            </div>
          )}

          {showEnglishName && (
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">الاسم بالإنجليزية:</div>
              <div className="font-semibold" style={{ fontSize: `${nameFontSize}px` }}>{productNameEnglish}</div>
            </div>
          )}

          {showBarcode && (
            <div className="flex justify-center">
              <canvas ref={canvasRef} className="rounded border" />
            </div>
          )}

          <div className="space-y-2 text-right" style={{ fontSize: `${codeFontSize}px` }}>
            {showInternalCode && (
              <div>
                <span className="text-muted-foreground">الكود الداخلي: </span>
                <span className="font-mono font-bold">{internalCode}</span>
              </div>
            )}
            {showBarcodeNumber && (
              <div>
                <span className="text-muted-foreground">الباركود: </span>
                <span className="font-mono font-bold">{barcode}</span>
              </div>
            )}
            {showDate && (
              <div>
                <span className="text-muted-foreground">التاريخ: </span>
                <span>{new Date().toLocaleDateString("ar-SA")}</span>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-2">
            <Button onClick={handlePrint} className="flex-1" variant="default">
              <Printer className="ml-2 h-4 w-4" />
              طباعة البطاقة
            </Button>
            <Button onClick={handleDownload} className="flex-1 bg-transparent" variant="outline">
              <Download className="ml-2 h-4 w-4" />
              تنزيل الباركود
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
