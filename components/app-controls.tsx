"use client"

import {
    MoreVertical,
    RotateCcw,
    ZoomIn,
    ZoomOut,
    Maximize,
    ChevronRight,
    ChevronLeft,
    XCircle,
    Fullscreen
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { hardReset } from "@/lib/storage"

export function AppControls() {
    const { t } = useI18n()
    const router = useRouter()
    const [zoom, setZoom] = useState(100)

    const handleRefresh = () => {
        window.location.reload()
    }

    const handleZoom = (delta: number) => {
        const newZoom = Math.min(Math.max(zoom + delta, 50), 200)
        setZoom(newZoom)
        document.body.style.zoom = `${newZoom}%`
    }

    const handleResetZoom = () => {
        setZoom(100)
        document.body.style.zoom = "100%"
    }

    const handleExit = () => {
        // For desktop apps (Electron/PWA), this might vary. 
        // In a browser, we can't always close the window, but we can try.
        if (confirm(t("common.confirm"))) {
            window.close()
        }
    }

    return (
        <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-5 w-5" />
                    <span className="sr-only">App Controls</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleRefresh} className="flex justify-between items-center text-right">
                    <div className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        <DualText k="common.refresh" />
                    </div>
                    <span className="text-xs text-muted-foreground">F5</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => {
                    if (confirm(t('sync.hardResetConfirm'))) {
                        hardReset()
                    }
                }} className="flex items-center gap-2 text-right">
                    <RotateCcw className="h-4 w-4 text-destructive" />
                    <DualText k="sync.hardReset" />
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => handleZoom(10)} className="flex items-center gap-2 text-right">
                    <ZoomIn className="h-4 w-4" />
                    <DualText k="common.zoomIn" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleZoom(-10)} className="flex items-center gap-2 text-right">
                    <ZoomOut className="h-4 w-4" />
                    <DualText k="common.zoomOut" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleResetZoom} className="flex items-center gap-2 text-right">
                    <Maximize className="h-4 w-4" />
                    <DualText k="common.resetZoom" />
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => router.back()} className="flex items-center gap-2 text-right">
                    <ChevronRight className="h-4 w-4" />
                    <DualText k="common.back" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.forward()} className="flex items-center gap-2 text-right">
                    <ChevronLeft className="h-4 w-4" />
                    <DualText k="common.forward" />
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleExit} className="flex items-center gap-2 text-destructive text-right focus:text-destructive">
                    <XCircle className="h-4 w-4" />
                    <DualText k="common.exit" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
