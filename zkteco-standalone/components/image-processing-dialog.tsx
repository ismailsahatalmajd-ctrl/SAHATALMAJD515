"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import type { ImageProcessingProgress } from "@/lib/async-image-processor"

interface ImageProcessingDialogProps {
  open: boolean
  progress: ImageProcessingProgress
}

export function ImageProcessingDialog({ open, progress }: ImageProcessingDialogProps) {
  const percentage = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>جاري معالجة الصور...</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{percentage}%</p>
            <p className="text-sm text-muted-foreground mt-1">
              {progress.processed} من {progress.total} صورة
            </p>
          </div>

          <Progress value={percentage} className="h-2" />

          {progress.currentImage && (
            <div className="text-xs text-muted-foreground text-center truncate">{progress.currentImage}</div>
          )}

          <div className="text-center text-sm text-muted-foreground">الرجاء الانتظار، لا تغلق النافذة...</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
