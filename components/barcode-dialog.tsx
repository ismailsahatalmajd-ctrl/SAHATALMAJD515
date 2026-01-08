"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Product } from "@/lib/types"
import { Barcode } from "lucide-react"
import { BarcodeGenerator } from "@/components/barcode-generator"

interface BarcodeDialogProps {
  products: Product[]
}

export function BarcodeDialog({ products }: BarcodeDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Barcode className="ml-2 h-4 w-4" />
          طباعة الباركود/QR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طباعة الباركود أو رمز QR</DialogTitle>
        </DialogHeader>
        
        <BarcodeGenerator 
            products={products} 
            onGenerate={() => setOpen(false)} 
        />
      </DialogContent>
    </Dialog>
  )
}
