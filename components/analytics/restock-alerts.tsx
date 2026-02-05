"use client"

import { useEffect, useState } from "react"
import { analyzeBranchRisks, BranchHealthSummary } from "@/lib/analytics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, TrendingDown, ArrowRight, Zap } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SmartRestockWidgetProps {
    branchId: string
}

export function SmartRestockWidget({ branchId }: SmartRestockWidgetProps) {
    const [summary, setSummary] = useState<BranchHealthSummary | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const data = await analyzeBranchRisks(branchId)
                setSummary(data)
            } catch (error) {
                console.error("Failed to load analytics", error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [branchId])

    if (loading) {
        return <Skeleton className="w-full h-[300px]" />
    }

    if (!summary || (summary.criticalItems === 0 && summary.warningItems === 0)) {
        return (
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-emerald-100">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center h-[200px]">
                    <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                        <Zap className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h3 className="font-semibold text-emerald-900">Stock Health is Excellent!</h3>
                    <p className="text-emerald-700 text-sm mt-1">
                        AI analysis shows no predicted shortages for the next 14 days.
                    </p>
                </CardContent>
            </Card>
        )
    }

    // Filter to show only relevant items
    const alerts = summary.insights.filter(i => i.status !== 'stable')

    return (
        <Card className="border-l-4 border-l-amber-500 shadow-sm overflow-hidden">
            <CardHeader className="bg-amber-50/50 pb-3 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-900">
                        <Zap className="w-5 h-5 text-amber-600 fill-amber-600" />
                        AI Stock Prediction / تنبؤ المخزون
                    </CardTitle>
                    <Badge variant={summary.criticalItems > 0 ? "destructive" : "secondary"}>
                        {summary.criticalItems + summary.warningItems} Alerts
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                    <div className="divide-y">
                        {alerts.map((item) => (
                            <div key={item.inventoryId} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground/90">{item.productName}</span>
                                        {item.status === 'critical' && (
                                            <Badge variant="destructive" className="h-5 text-[10px] px-1">Critical</Badge>
                                        )}
                                    </div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-3">
                                        <span className="flex items-center gap-1">
                                            <TrendingDown className="w-3 h-3" />
                                            {item.dailyRate} / day
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span>Stock: {item.currentStock}</span>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="font-bold text-lg text-amber-700">
                                        {item.daysRemaining} Days Left
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Rec. Order: <span className="font-medium text-foreground">{item.recommendedRestock}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <div className="p-3 bg-amber-50/30 border-t text-center">
                    <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 w-full">
                        View Full Analysis <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
