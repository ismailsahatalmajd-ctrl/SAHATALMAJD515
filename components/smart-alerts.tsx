"use client"

import { useState, useEffect } from "react"
import { Bell, Clock, Package, Check } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
// Removed unused import
import { getProducts } from "@/lib/storage"
import { getBranchRequests } from "@/lib/branch-request-storage"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"

interface AlertItem {
    id: string
    type: 'low-stock' | 'pending-request'
    title: string
    description: string
    severity: 'high' | 'medium'
    actionLabel?: string
    actionUrl?: string
}

export function SmartAlerts() {
    const [open, setOpen] = useState(false)
    const [alerts, setAlerts] = useState<AlertItem[]>([])
    const router = useRouter()
    const { t } = useI18n()

    useEffect(() => {
        // Check for alerts on mount
        const checkAlerts = () => {
            const newAlerts: AlertItem[] = []

            // 1. Check Low Stock
            const products = getProducts()
            const lowStockProducts = products.filter(p =>
                p.minStockLimit !== undefined && (p.currentStock || 0) <= p.minStockLimit
            )

            if (lowStockProducts.length > 0) {
                newAlerts.push({
                    id: 'low-stock-summary',
                    type: 'low-stock',
                    title: t("smartAlerts.lowStock.title"),
                    description: t("smartAlerts.lowStock.desc").replace("{count}", String(lowStockProducts.length)),
                    severity: 'high',
                    actionLabel: t("smartAlerts.lowStock.action"),
                    actionUrl: '/?filter=low'
                })
            }

            // 2. Check Pending Requests (> 24 hours)
            const requests = getBranchRequests()
            const pendingOldRequests = requests.filter(r => {
                if (r.status !== 'submitted') return false
                const created = new Date(r.createdAt).getTime()
                const now = Date.now()
                const hoursDiff = (now - created) / (1000 * 60 * 60)
                return hoursDiff > 24
            })

            if (pendingOldRequests.length > 0) {
                newAlerts.push({
                    id: 'pending-requests-summary',
                    type: 'pending-request',
                    title: t("smartAlerts.pendingRequests.title"),
                    description: t("smartAlerts.pendingRequests.desc").replace("{count}", String(pendingOldRequests.length)),
                    severity: 'medium',
                    actionLabel: t("smartAlerts.pendingRequests.action"),
                    actionUrl: '/branch-requests'
                })
            }

            setAlerts(newAlerts)

            // Auto-open if we have alerts and haven't dismissed them this session
            const dismissed = sessionStorage.getItem('smart_alerts_dismissed')
            if (newAlerts.length > 0 && !dismissed) {
                setOpen(true)
            }
        }

        // Run check after a short delay to ensure data load
        const timer = setTimeout(checkAlerts, 1000)
        return () => clearTimeout(timer)
    }, [t])

    const handleDismiss = () => {
        setOpen(false)
        sessionStorage.setItem('smart_alerts_dismissed', 'true')
    }

    if (alerts.length === 0) return null

    return (
        <>
            {/* Floating Bell Icon for Manual Trigger if alerts exist */}
            <Button
                variant="secondary"
                size="icon"
                className="fixed bottom-4 left-4 z-40 rounded-full shadow-lg h-12 w-12 bg-white border-2 border-primary/20 hover:border-primary/50"
                onClick={() => setOpen(true)}
            >
                <Bell className="h-6 w-6 text-primary animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] text-white justify-center items-center">
                        {alerts.length}
                    </span>
                </span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-primary" />
                            <DualText k="smartAlerts.title" />
                        </DialogTitle>
                        <DialogDescription>
                            <DualText k="smartAlerts.desc" />
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="flex flex-col gap-3 py-4">
                            {alerts.map(alert => (
                                <div key={alert.id} className={`p-4 rounded-lg border ${alert.severity === 'high' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}>
                                    <div className="flex items-start gap-3">
                                        {alert.type === 'low-stock' ? (
                                            <Package className={`h-5 w-5 mt-0.5 ${alert.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />
                                        ) : (
                                            <Clock className={`h-5 w-5 mt-0.5 ${alert.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />
                                        )}
                                        <div className="flex-1">
                                            <h4 className={`text-sm font-semibold ${alert.severity === 'high' ? 'text-red-900' : 'text-yellow-900'}`}>
                                                {alert.title}
                                            </h4>
                                            <p className={`text-sm mt-1 ${alert.severity === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                                                {alert.description}
                                            </p>

                                            {alert.actionUrl && (
                                                <Button
                                                    variant="link"
                                                    className={`p-0 h-auto mt-2 text-xs font-semibold ${alert.severity === 'high' ? 'text-red-800 underline' : 'text-yellow-800 underline'}`}
                                                    onClick={() => {
                                                        setOpen(false)
                                                        router.push(alert.actionUrl!)
                                                    }}
                                                >
                                                    {alert.actionLabel} &larr;
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    <DialogFooter>
                        <Button onClick={handleDismiss} className="w-full">
                            <Check className="mr-2 h-4 w-4" />
                            <DualText k="smartAlerts.acknowledged" />
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
