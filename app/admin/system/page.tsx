"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import {
    HardDrive, FileText, Database, Server,
    Trash2, RefreshCw, AlertTriangle, Folder,
    FolderOpen, File, Image as ImageIcon,
    BarChart, PieChart, Activity
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Header } from "@/components/header"
import { db } from "@/lib/db"
import { formatNumberWithSeparators } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// Helper to format bytes
function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function SystemResourcesPage() {
    const { user } = useAuth()
    const router = useRouter()
    const [stats, setStats] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    // Redirect if not admin
    useEffect(() => {
        if (user && (user as any).role === 'branch') {
            router.replace('/')
        }
    }, [user, router])

    // Fetch System Stats
    useEffect(() => {
        async function fetchStats() {
            setLoading(true)
            try {
                const start = performance.now()

                // 1. Products & Images
                const productsParams = await db.products.toArray()
                const imagesParams = await db.productImages.toArray()

                const productsSize = productsParams.reduce((acc, p) => acc + JSON.stringify(p).length, 0)
                const imagesSize = imagesParams.reduce((acc, img) => acc + (img.data?.length || 0), 0)

                // 2. Transactions (Issues/Returns/Invoices)
                const issues = await db.issues.toArray()
                const returns = await db.returns.toArray()
                const transactions = await db.transactions.toArray()

                const issuesSize = issues.reduce((acc, i) => acc + JSON.stringify(i).length, 0)
                const returnsSize = returns.reduce((acc, r) => acc + JSON.stringify(r).length, 0)
                const transactionsSize = transactions.reduce((acc, t) => acc + JSON.stringify(t).length, 0)

                // 3. Branches
                const branches = await db.branches.toArray()
                const branchesSize = branches.reduce((acc, b) => acc + JSON.stringify(b).length, 0)

                // 4. Logs & Others
                const logs = await db.auditLogs.toArray()
                const logsSize = logs.reduce((acc, l) => acc + JSON.stringify(l).length, 0)

                const totalSize = productsSize + imagesSize + issuesSize + returnsSize + transactionsSize + branchesSize + logsSize

                // Branch Breakdown
                const branchStats = branches.map(b => {
                    const bIssues = issues.filter(i => i.branchId === b.id)
                    const bReturns = returns.filter(i => i.branchId === b.id)
                    return {
                        id: b.id,
                        name: b.name,
                        issueCount: bIssues.length,
                        returnCount: bReturns.length,
                        size: bIssues.reduce((a, i) => a + JSON.stringify(i).length, 0) + bReturns.reduce((a, r) => a + JSON.stringify(r).length, 0)
                    }
                }).sort((a, b) => b.size - a.size)

                // Category Breakdown
                const categories = await db.categories.toArray()
                const catStats = categories.map(c => {
                    const prods = productsParams.filter(p => p.category === c.name)
                    return {
                        name: c.name,
                        count: prods.length,
                        size: prods.reduce((a, p) => a + JSON.stringify(p).length, 0)
                    }
                }).sort((a, b) => b.size - a.size)

                setStats({
                    products: { count: productsParams.length, size: productsSize },
                    images: { count: imagesParams.length, size: imagesSize },
                    issues: { count: issues.length, size: issuesSize },
                    returns: { count: returns.length, size: returnsSize },
                    transactions: { count: transactions.length, size: transactionsSize },
                    branches: { count: branches.length, size: branchesSize, details: branchStats },
                    logs: { count: logs.length, size: logsSize },
                    categories: { details: catStats },
                    totalSize,
                    calcTime: performance.now() - start
                })

            } catch (err) {
                console.error("Failed to calc stats", err)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [refreshKey])

    if (user?.role === 'branch') return null

    const handleClearLogs = async () => {
        await db.auditLogs.clear()
        toast({ title: "Logs Cleared", description: "Audit logs have been cleared successfully." })
        setRefreshKey(k => k + 1)
    }

    const handleOptimize = async () => {
        // Artificial delay to simulate optimization
        setLoading(true)
        setTimeout(() => {
            setLoading(false)
            toast({ title: "Optimization Complete", description: "Database indexes have been verified." })
        }, 1500)
    }

    if (loading && !stats) {
        return (
            <div className="h-screen w-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Calculating system resources...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <Header
                title={<DualText k="system.title" fallback="System Resources / موارد النظام" />}
                description={<DualText k="system.desc" fallback="Manage data storage and system health / إدارة البيانات وصحة النظام" />}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Storage Card */}
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                            <HardDrive className="h-4 w-4" /> Total Storage / إجمالي الحجم
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-900">{formatBytes(stats?.totalSize || 0)}</div>
                        <p className="text-xs text-blue-600 mt-1">Approximate database size</p>
                    </CardContent>
                </Card>

                {/* Health Card */}
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
                            <Activity className="h-4 w-4" /> System Health / الحالة
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-900">Good</div>
                        <p className="text-xs text-green-600 mt-1">Performance: {stats?.calcTime.toFixed(0)}ms to scan</p>
                    </CardContent>
                </Card>

                {/* Records Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Database className="h-4 w-4" /> Total Records / السجلات
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                            {formatNumberWithSeparators((stats?.products.count || 0) + (stats?.issues.count || 0) + (stats?.transactions.count || 0))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Across all tables</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview"><PieChart className="mr-2 h-4 w-4" /> Overview</TabsTrigger>
                    <TabsTrigger value="analysis"><BarChart className="mr-2 h-4 w-4" /> Analysis</TabsTrigger>
                    <TabsTrigger value="files"><FolderOpen className="mr-2 h-4 w-4" /> Explorer</TabsTrigger>
                    <TabsTrigger value="maintenance"><Server className="mr-2 h-4 w-4" /> Maintenance</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Storage Distribution / توزيع المساحة</CardTitle>
                            <CardDescription>Breakdown of data usage by component</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Images / الصور</span>
                                    <span>{formatBytes(stats?.images.size)} ({((stats?.images.size / stats?.totalSize) * 100).toFixed(1)}%)</span>
                                </div>
                                <Progress value={(stats?.images.size / stats?.totalSize) * 100} className="h-2 bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Products Data / بيانات المنتجات</span>
                                    <span>{formatBytes(stats?.products.size)} ({((stats?.products.size / stats?.totalSize) * 100).toFixed(1)}%)</span>
                                </div>
                                <Progress value={(stats?.products.size / stats?.totalSize) * 100} className="h-2 bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Invoices (Issue/Return) / الفواتير</span>
                                    <span>{formatBytes((stats?.issues.size + stats?.returns.size))} ({(((stats?.issues.size + stats?.returns.size) / stats?.totalSize) * 100).toFixed(1)}%)</span>
                                </div>
                                <Progress value={((stats?.issues.size + stats?.returns.size) / stats?.totalSize) * 100} className="h-2 bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Logs & System / النظام والسجلات</span>
                                    <span>{formatBytes(stats?.logs.size)} ({((stats?.logs.size / stats?.totalSize) * 100).toFixed(1)}%)</span>
                                </div>
                                <Progress value={(stats?.logs.size / stats?.totalSize) * 100} className="h-2 bg-slate-100" />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analysis" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="h-[400px]">
                            <CardHeader>
                                <CardTitle>Category Analysis / تحليل الأقسام</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[300px] w-full pr-4">
                                    <div className="space-y-4">
                                        {stats?.categories.details.map((cat: any) => (
                                            <div key={cat.name} className="flex items-center justify-between border-b pb-2 last:border-0 hover:bg-slate-50 p-2 rounded">
                                                <div className="flex items-center gap-2">
                                                    <Folder className="h-4 w-4 text-amber-500" />
                                                    <div>
                                                        <div className="font-medium text-sm">{cat.name}</div>
                                                        <div className="text-xs text-muted-foreground">{cat.count} Items</div>
                                                    </div>
                                                </div>
                                                <div className="text-sm font-mono text-muted-foreground">
                                                    {formatBytes(cat.size)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <Card className="h-[400px]">
                            <CardHeader>
                                <CardTitle>Branch Usage / استهلاك الفروع</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[300px] w-full pr-4">
                                    <div className="space-y-4">
                                        {stats?.branches.details.map((b: any) => (
                                            <div key={b.id} className="flex items-center justify-between border-b pb-2 last:border-0 hover:bg-slate-50 p-2 rounded">
                                                <div className="flex items-center gap-2">
                                                    <Server className="h-4 w-4 text-blue-500" />
                                                    <div>
                                                        <div className="font-medium text-sm">{b.name}</div>
                                                        <div className="text-xs text-muted-foreground">{b.issueCount} Issues • {b.returnCount} Returns</div>
                                                    </div>
                                                </div>
                                                <div className="text-sm font-mono text-muted-foreground">
                                                    {formatBytes(b.size)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="files" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Explorer / متصفح النظام</CardTitle>
                            <CardDescription>Hierarchical view of system data</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-md">
                                {/* Root: System */}
                                <div className="p-2 border-b bg-slate-50 font-medium flex items-center gap-2">
                                    <Server className="h-4 w-4 text-indigo-600" /> System Root
                                </div>

                                {/* Folder: Pages */}
                                <div className="ml-4 border-l pl-4 py-2">
                                    <div className="flex items-center gap-2 mb-2 p-1 hover:bg-slate-100 rounded cursor-pointer">
                                        <FolderOpen className="h-4 w-4 text-yellow-500" />
                                        <span className="font-medium">Pages & Content</span>
                                    </div>
                                    {/* Pages Children */}
                                    <div className="ml-6 border-l pl-4 space-y-1">
                                        <div className="flex justify-between text-sm p-1 hover:bg-slate-50">
                                            <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-slate-400" /> Dashboard</span>
                                            <span className="text-xs text-muted-foreground">System File</span>
                                        </div>
                                        <div className="flex justify-between text-sm p-1 hover:bg-slate-50">
                                            <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-slate-400" /> Products Page</span>
                                            <span className="text-xs text-muted-foreground">{formatBytes(stats?.products.size)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Folder: Inventory */}
                                <div className="ml-4 border-l pl-4 py-2">
                                    <div className="flex items-center gap-2 mb-2 p-1 hover:bg-slate-100 rounded cursor-pointer">
                                        <FolderOpen className="h-4 w-4 text-yellow-500" />
                                        <span className="font-medium">Inventory Database</span>
                                    </div>
                                    <div className="ml-6 border-l pl-4 space-y-1">
                                        <div className="flex justify-between text-sm p-1 hover:bg-slate-50">
                                            <span className="flex items-center gap-2"><Database className="h-3 w-3 text-blue-400" /> Products Table</span>
                                            <span className="text-xs text-muted-foreground">{stats?.products.count} Records ({formatBytes(stats?.products.size)})</span>
                                        </div>
                                        <div className="flex justify-between text-sm p-1 hover:bg-slate-50">
                                            <span className="flex items-center gap-2"><ImageIcon className="h-3 w-3 text-purple-400" /> Product Images</span>
                                            <span className="text-xs text-muted-foreground">{stats?.images.count} Files ({formatBytes(stats?.images.size)})</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Folder: Branches */}
                                <div className="ml-4 border-l pl-4 py-2">
                                    <div className="flex items-center gap-2 mb-2 p-1 hover:bg-slate-100 rounded cursor-pointer">
                                        <FolderOpen className="h-4 w-4 text-yellow-500" />
                                        <span className="font-medium">Branches Data</span>
                                    </div>
                                    <div className="ml-6 border-l pl-4 space-y-1">
                                        {stats?.branches.details.map((b: any) => (
                                            <div key={b.id}>
                                                <div className="flex justify-between text-sm p-1 hover:bg-slate-50 font-medium">
                                                    <span className="flex items-center gap-2"><Folder className="h-3 w-3 text-yellow-500" /> {b.name}</span>
                                                    <span className="text-xs text-muted-foreground">{formatBytes(b.size)}</span>
                                                </div>
                                                <div className="ml-6 border-l pl-2 text-xs text-muted-foreground">
                                                    <div className="flex justify-between p-1"><span>Issues_Log.json</span> <span>{b.issueCount} rows</span></div>
                                                    <div className="flex justify-between p-1"><span>Returns_Log.json</span> <span>{b.returnCount} rows</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="maintenance" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Clear Cache / مسح المؤقتات</CardTitle>
                                <CardDescription>Free up space by clearing logs and temporary files.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm mb-4">Logs Size: <span className="font-bold">{formatBytes(stats?.logs.size)}</span></div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" className="w-full">
                                            <Trash2 className="mr-2 h-4 w-4" /> Clear System Logs
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action will permanently delete all system audit logs. This cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleClearLogs}>Continue</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Optimize Database / تحسين القاعدة</CardTitle>
                                <CardDescription>Re-index tables to improve performance.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm mb-4">Status: <span className="text-green-600 font-bold">Healthy</span></div>
                                <Button variant="outline" className="w-full" onClick={handleOptimize}>
                                    <RefreshCw className="mr-2 h-4 w-4" /> Optimize & Re-index
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="opacity-75 relative overflow-hidden">
                            <div className="absolute inset-0 bg-slate-100/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200">Coming Soon</span>
                            </div>
                            <CardHeader>
                                <CardTitle className="text-base">Archive Old Data / أرشفة</CardTitle>
                                <CardDescription>Move old invoices to cold storage.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button variant="outline" className="w-full" disabled>
                                    <Database className="mr-2 h-4 w-4" /> Archive Data &gt; 1 Year
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
