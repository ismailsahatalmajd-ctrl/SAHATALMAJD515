import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { Receipt, FileText, LayoutTemplate } from "lucide-react"

interface InvoiceTemplateSelectorProps {
    value: 'classic' | 'modern' | 'thermal'
    onChange: (val: 'classic' | 'modern' | 'thermal') => void
}

export function InvoiceTemplateSelector({ value, onChange }: InvoiceTemplateSelectorProps) {
    return (
        <div className="space-y-3">
            <Label className="text-base font-semibold">قالب الفاتورة (Invoice Template)</Label>
            <RadioGroup
                value={value}
                onValueChange={(v) => onChange(v as any)}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
                <div>
                    <RadioGroupItem value="classic" id="t-classic" className="peer sr-only" />
                    <Label
                        htmlFor="t-classic"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <FileText className="mb-3 h-6 w-6" />
                        <div className="text-center space-y-1">
                            <div className="font-semibold">رسمي (Classic)</div>
                            <div className="text-xs text-muted-foreground">أبيض وأسود، حدود واضحة، مناسب للطباعة A4</div>
                        </div>
                    </Label>
                </div>

                <div>
                    <RadioGroupItem value="modern" id="t-modern" className="peer sr-only" />
                    <Label
                        htmlFor="t-modern"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <LayoutTemplate className="mb-3 h-6 w-6 text-blue-500" />
                        <div className="text-center space-y-1">
                            <div className="font-semibold">حديث (Modern)</div>
                            <div className="text-xs text-muted-foreground">ألوان عصرية، زوايا دائرية، مناسب للمشاركة الإلكترونية</div>
                        </div>
                    </Label>
                </div>

                <div>
                    <RadioGroupItem value="thermal" id="t-thermal" className="peer sr-only" />
                    <Label
                        htmlFor="t-thermal"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <Receipt className="mb-3 h-6 w-6 text-orange-500" />
                        <div className="text-center space-y-1">
                            <div className="font-semibold">إيصال (Thermal)</div>
                            <div className="text-xs text-muted-foreground">مصغر للطابعات الحرارية (80mm)</div>
                        </div>
                    </Label>
                </div>
            </RadioGroup>
        </div>
    )
}
