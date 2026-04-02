"use client"

import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DualText } from "@/components/ui/dual-text"

export function InvoicePreview() {
  const { settings } = useInvoiceSettings()

  return (
    <Card className="mt-6 border-dashed border-2 bg-muted/20">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground"><DualText k="invoice.preview.title" /></CardTitle>
      </CardHeader>
      <CardContent>
        {settings.headerText && (
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-primary">{settings.headerText}</h2>
          </div>
        )}
        
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead><DualText k="invoice.columns.product" /></TableHead>
                {settings.showUnit && <TableHead><DualText k="invoice.columns.unit" /></TableHead>}
                {settings.showQuantity && <TableHead><DualText k="invoice.columns.quantity" /></TableHead>}
                {settings.showPrice && <TableHead><DualText k="invoice.columns.price" /></TableHead>}
                {settings.showTotal && <TableHead><DualText k="invoice.columns.total" /></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>1</TableCell>
                <TableCell>منتج تجريبي 1</TableCell>
                {settings.showUnit && <TableCell>قطعة</TableCell>}
                {settings.showQuantity && <TableCell>5</TableCell>}
                {settings.showPrice && <TableCell>10.00 ريال</TableCell>}
                {settings.showTotal && <TableCell>50.00 ريال</TableCell>}
              </TableRow>
              <TableRow>
                <TableCell>2</TableCell>
                <TableCell>منتج تجريبي 2</TableCell>
                {settings.showUnit && <TableCell>علبة</TableCell>}
                {settings.showQuantity && <TableCell>2</TableCell>}
                {settings.showPrice && <TableCell>25.00 ريال</TableCell>}
                {settings.showTotal && <TableCell>50.00 ريال</TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {settings.footerText && (
          <div className="text-center mt-6 text-sm text-muted-foreground border-t pt-4">
            {settings.footerText}
          </div>
        )}
        
        <div className="mt-4 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
          <DualText k="invoice.preview.note" />
        </div>
      </CardContent>
    </Card>
  )
}
