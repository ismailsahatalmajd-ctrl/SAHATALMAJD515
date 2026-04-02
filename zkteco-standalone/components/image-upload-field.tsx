"use client"

import type React from "react"

import { useState } from "react"
import { Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface ImageUploadFieldProps {
  value?: string
  onChange: (value: string) => void
  label?: string
}

export function ImageUploadField({ value, onChange, label }: ImageUploadFieldProps) {
  const [preview, setPreview] = useState<string | null>(value || null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("حجم الصورة يجب أن يكون أقل من 5 ميجابايت")
      return
    }

    setIsLoading(true)

    try {
      // Convert to base64
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        setPreview(base64)
        onChange(base64)
        setIsLoading(false)
      }
      reader.onerror = () => {
        alert("فشل تحميل الصورة")
        setIsLoading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error("[v0] Error uploading image:", error)
      alert("فشل تحميل الصورة")
      setIsLoading(false)
    }
  }

  const handleRemove = () => {
    setPreview(null)
    onChange("")
  }

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}

      {preview ? (
        <div className="relative inline-block">
          <img src={preview || "/placeholder.svg"} alt="Preview" className="w-32 h-32 object-cover rounded-lg border" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <span className="text-xs text-muted-foreground">رفع صورة</span>
          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isLoading} />
        </label>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
    </div>
  )
}
