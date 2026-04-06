"use client"

import { useState } from "react"
import { Package, ImageOff } from "lucide-react"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ProductImageThumbnailProps {
    src?: string | null
    alt: string
    className?: string
    fallbackIcon?: React.ReactNode
}

export function ProductImageThumbnail({ src, alt, className, fallbackIcon }: ProductImageThumbnailProps) {
    const [hasError, setHasError] = useState(false)

    if (!src || hasError) {
        return (
            <div className={cn("rounded-md bg-muted border flex items-center justify-center", className)}>
                {fallbackIcon || <Package className="w-1/2 h-1/2 text-muted-foreground opacity-50" />}
            </div>
        )
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <img
                    src={src}
                    alt={alt}
                    className={cn("rounded-md object-cover border cursor-pointer hover:opacity-80 transition-opacity", className)}
                    onError={() => setHasError(true)}
                />
            </DialogTrigger>
            <DialogContent className="max-w-2xl p-0 overflow-hidden bg-transparent border-none shadow-none">
                <div className="relative w-full h-full flex items-center justify-center">
                    <img
                        src={src}
                        alt={alt}
                        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
