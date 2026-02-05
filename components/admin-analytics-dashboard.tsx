"use client"

import { useEffect, useState } from "react"
import { analyzeNetworkRisks, BranchHealthSummary } from "@/lib/analytics"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, TrendingDown, ArrowRight, Zap, Building2, Package } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

export function AdminAnalyticsDashboard() {
    const [summaries, setSummaries] = useState<BranchHealthSummary[]>([])
    const [loading, setLoading] = useState(true)

    // Helper to get branch name
    const branches = useLiveQuery(() => db.branches.toArray()) || []

    const getBranchName = (id: string) => {
        return branches.find(b => b.id === id)?.name || "Unknown Branch"
    }

    useEffect(() => {
        const load = async () => {
            try {
                const data = await analyzeNetworkRisks()
                setSummaries(data)
            } catch (error) {
                console.error("Failed to load network risks", error)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="space-y-4 mb-8">
                <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Branch Network Health
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="h-[200px]" />
                </div>
            </div>
        )
    }

    if (summaries.length === 0) {
        return null // Don't show anything if no risks or empty
    }

    return (
        <div className="space-y-6 mb-8 border-b pb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        Branch Network Health / صحة الشبكة
                    </h2>
                    <p className="text-muted-foreground text-sm">AI-Powered Risk Assessment for All Branches</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {summaries.map(summary => (
                    <Card key={summary.branchId} className="border-l-4 border-l-amber-500 shadow-sm overflow-hidden flex flex-col">
                        <CardHeader className="bg-amber-50/50 pb-3 border-b py-3">
                            <div className="flex items-center justify-between">
                                <div className="font-bold text-base flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-amber-700" />
                                    {getBranchName(summary.branchId)}
                                </div>
                                <Badge variant="destructive">
                                    {summary.criticalItems} Critical
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col">
                            <ScrollArea className="h-[200px] flex-1">
                                <div className="divide-y">
                                    {summary.insights.filter(i => i.status !== 'stable').map(item => (
                                        <div key={item.inventoryId} className="p-3 hover:bg-muted/50 text-sm">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-medium truncate max-w-[120px]" title={item.productName}>{item.productName}</span>
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                    {item.daysRemaining} Days
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                                                <span>Stock: {item.currentStock}</span>
                                                <span>Rate: {item.dailyRate}/day</span>
                                            </div>
                                            <div className="mt-1.5 bg-red-50 text-red-700 text-[11px] p-1.5 rounded flex justify-between items-center">
                                                <span>Order:</span>
                                                <span className="font-bold">{item.recommendedRestock} Units</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
