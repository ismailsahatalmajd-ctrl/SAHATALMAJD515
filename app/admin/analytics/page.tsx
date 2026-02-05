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

export default function AdminAnalyticsPage() {
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
            <div className="p-8 space-y-4">
                <h1 className="text-2xl font-bold mb-6">Branch Network Health / صحة الشبكة</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Skeleton className="h-[300px]" />
                    <Skeleton className="h-[300px]" />
                    <Skeleton className="h-[300px]" />
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Zap className="w-6 h-6 text-amber-500" />
                        Branch Network Health
                    </h1>
                    <p className="text-muted-foreground">AI-Powered Risk Assessment for All Branches</p>
                </div>
            </div>

            {summaries.length === 0 ? (
                <Card className="bg-emerald-50 border-emerald-100">
                    <CardContent className="p-8 text-center">
                        <div className="bg-white p-4 rounded-full shadow-sm inline-block mb-4">
                            <Zap className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h2 className="text-xl font-bold text-emerald-900">All Systems Normal</h2>
                        <p className="text-emerald-700">No critical stock risks detected across the network.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {summaries.map(summary => (
                        <Card key={summary.branchId} className="border-l-4 border-l-amber-500 shadow-sm overflow-hidden flex flex-col">
                            <CardHeader className="bg-amber-50/50 pb-3 border-b">
                                <div className="flex items-center justify-between">
                                    <div className="font-bold text-lg flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-amber-700" />
                                        {getBranchName(summary.branchId)}
                                    </div>
                                    <Badge variant="destructive">
                                        {summary.criticalItems} Critical
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 flex flex-col">
                                <ScrollArea className="h-[300px] flex-1">
                                    <div className="divide-y">
                                        {summary.insights.filter(i => i.status !== 'stable').map(item => (
                                            <div key={item.inventoryId} className="p-4 hover:bg-muted/50">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-medium">{item.productName}</span>
                                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                                        {item.daysRemaining} Days
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                                                    <span>Stock: {item.currentStock}</span>
                                                    <span>Rate: {item.dailyRate}/day</span>
                                                </div>
                                                <div className="mt-2 bg-red-50 text-red-700 text-xs p-2 rounded flex justify-between">
                                                    <span>Recommended Order:</span>
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
            )}
        </div>
    )
}
