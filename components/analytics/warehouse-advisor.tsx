"use client"

import { useEffect, useState } from "react"
import { analyzeWarehouseProcurementNeeds, WarehouseProcurementInsight } from "@/lib/analytics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Factory, ArrowRight, TrendingUp, Package } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

export function WarehouseAdvisor() {
    const [insights, setInsights] = useState<WarehouseProcurementInsight[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const data = await analyzeWarehouseProcurementNeeds()
                setInsights(data)
            } catch (error) {
                console.error("Failed to load warehouse insights", error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return <Skeleton className="w-full h-[300px]" />
    }

    if (insights.length === 0) {
        return (
            <Card className="bg-indigo-50 border-indigo-100 mb-6">
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="bg-white p-3 rounded-full shadow-sm">
                        <Factory className="w-6 h-6 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-indigo-900">Warehouse Supply is Healthy</h3>
                        <p className="text-indigo-700 text-sm">
                            Aggregate branch demand is well-covered by current warehouse stocks.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const criticalCount = insights.filter(i => i.status === 'critical').length
    const lowCount = insights.filter(i => i.status === 'low').length

    return (
        <Card className="border-l-4 border-l-red-500 shadow-sm overflow-hidden mb-8">
            <CardHeader className="bg-red-50/50 pb-3 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-red-900">
                        <TrendingUp className="w-5 h-5 text-red-600" />
                        Procurement Advisor / مستشار المشتريات
                    </CardTitle>
                    <div className="flex gap-2">
                        {criticalCount > 0 && <Badge variant="destructive">{criticalCount} Critical</Badge>}
                        {lowCount > 0 && <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">{lowCount} Low</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                    <div className="divide-y">
                        {insights.map((item) => (
                            <div key={item.productId} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground/90">{item.productName}</span>
                                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-slate-100 rounded">{item.productCode}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-3">
                                        <span className="flex items-center gap-1" title="Network Daily Consumption">
                                            <TrendingUp className="w-3 h-3" />
                                            {item.networkDailyConsumption} / day
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span title="Current Warehouse Stock">Whse Stock: {item.currentWarehouseStock}</span>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className={`font-bold text-lg ${item.status === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                                        {item.daysOfCover} Days Cover
                                    </div>
                                    <div className="text-xs font-semibold bg-green-50 text-green-700 px-2 py-1 rounded inline-block mt-1">
                                        + Order {item.recommendedOrder}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <div className="p-3 bg-red-50/30 border-t text-center">
                    <p className="text-xs text-muted-foreground">
                        Recommendations based on aggregate daily consumption across all branches.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
