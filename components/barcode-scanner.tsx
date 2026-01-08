"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScanLine } from "lucide-react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import type { Product } from "@/lib/types"
import { getProducts, updateProduct } from "@/lib/storage"

interface BarcodeScannerProps {
  onDetected?: (code: string, product?: Product) => void
}

export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>("")
  const [lastCode, setLastCode] = useState<string>("")
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const cams = await BrowserMultiFormatReader.listVideoInputDevices()
      setDevices(cams)
      if (cams.length && !deviceId) setDeviceId(cams[0].deviceId)
    })()
  }, [open])

  useEffect(() => {
    if (!open || !deviceId || !videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader
    ;(async () => {
      try {
        await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (result) {
            const code = result.getText()
            if (code && code !== lastCode) {
              setLastCode(code)
              const products = getProducts()
              const product = products.find((p) => p.productCode === code)
              onDetected?.(code, product)
            }
          }
        })
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      try { (reader as any).reset?.() } catch {}
    }
  }, [deviceId, open])

  // بديل لمسح القارئ اليدوي (عند استخدام ماسحات تعمل كلوحة مفاتيح)
  const manualInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim()
      if (!code) return
      const products = getProducts()
      const product = products.find((p) => p.productCode === code)
      onDetected?.(code, product)
      setLastCode(code)
      ;(e.target as HTMLInputElement).value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ScanLine className="ml-2 h-4 w-4" />
          مسح الباركود للجرد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ماسح الباركود</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر الكاميرا" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem value={d.deviceId} key={d.deviceId}>
                    {d.label || "كاميرا"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <video ref={videoRef} className="w-full rounded bg-black" muted playsInline />
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">إدخال يدوي (يدعم ماسحات لوحة المفاتيح)</label>
            <Input placeholder="أدخل/امسح الكود ثم Enter" onKeyDown={manualInput} />
          </div>
          {lastCode && (
            <div className="text-sm">آخر رمز: {lastCode}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
