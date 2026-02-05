"use client"

// export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, Check, X, Eye, FileText, MessageSquare, Send, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getBranchRequests, approveBranchRequest, setRequestStatus, addBranchRequestMessage } from "@/lib/branch-request-storage"
import { hardReset } from "@/lib/storage"
import { useBranchRequestsRealtime } from "@/hooks/use-store"
import type { BranchRequest } from "@/lib/branch-request-types"
import { useToast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { generateBranchRequestPDF } from "@/lib/branch-request-pdf-generator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"

import { BranchDashboard } from "@/components/branch-dashboard"
import { useAuth } from "@/components/auth-provider"

export default function BranchRequestsPage() {
    const router = useRouter()
    const { t } = useI18n()
    const { toast } = useToast()
    const { user, loading: authLoading } = useAuth()

    // Real-time data hook
    const { data: realtimeRequests, loading: realtimeLoading } = useBranchRequestsRealtime()
    const requests = (realtimeRequests as BranchRequest[]) || []

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [role, setRole] = useState<string | null>(null)
    const [chatDialogOpen, setChatDialogOpen] = useState(false)
    const [activeChatRequest, setActiveChatRequest] = useState<BranchRequest | null>(null)
    const [chatMessage, setChatMessage] = useState("")
    const [processingId, setProcessingId] = useState<string | null>(null)

    useEffect(() => {
        if (authLoading) return

        if (user) {
            setRole((user as any).role || null)
            if ((user as any).role === "branch") {
                setLoading(false)
            } else if ((user as any).role === "admin") {
                setLoading(false)
            } else {
                router.replace("/")
            }
        } else {
            router.replace("/login")
        }
    }, [user, authLoading, router])

    if ((user as any)?.role === "branch") {
        return <BranchDashboard />
    }

    const handleApprove = async (id: string) => {
        if (processingId) return
        setProcessingId(id)

        // Yield to main thread for UI update
        await new Promise(r => setTimeout(r, 10))

        try {
            const res = await approveBranchRequest(id, "admin")
            if (res.approved) {
                toast({ title: "تمت الموافقة", description: "تم اعتماد الطلب بنجاح." })
            } else {
                toast({ title: "خطأ", description: "فشل الاعتماد.", variant: "destructive" })
            }
        } finally {
            setProcessingId(null)
        }
    }

    const handleOpenChat = (req: BranchRequest) => {
        setActiveChatRequest(req)
        setChatDialogOpen(true)
    }

    const handleSendChat = () => {
        if (!activeChatRequest || !chatMessage.trim()) return
        const updated = addBranchRequestMessage(activeChatRequest.id, {
            sender: "admin",
            senderName: "الإدارة",
            message: chatMessage,
        })
        if (updated) {
            setActiveChatRequest({ ...updated, chatMessages: updated.chatMessages || [] })
            setChatMessage("")
        }
    }

    const handleReject = async (id: string) => {
        if (processingId) return
        setProcessingId(id)

        await new Promise(r => setTimeout(r, 10))

        try {
            setRequestStatus(id, "cancelled", "admin")
            toast({ title: "تم الرفض", description: "تم إلغاء الطلب." })
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    )

    if (error) return (
        <div className="flex h-screen items-center justify-center flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500" />
            <div className="text-xl font-bold">{error}</div>
            <Button onClick={() => router.push("/")}>العودة للرئيسية</Button>
        </div>
    )

    return (
        <div className="container mx-auto py-10 space-y-6" dir="rtl">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">
                    <DualText k="branchRequests.title" fallback="طلبات الفروع" />
                </h1>
                <div className="flex gap-2 items-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            if (confirm(getDualString('sync.hardResetConfirm'))) {
                                hardReset()
                            }
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        <DualText k="sync.hardReset" />
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/")}>
                        <DualText k="common.back" fallback="العودة" />
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>قائمة الطلبات</CardTitle>
                </CardHeader>
                <CardContent>
                    {requests.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">لا يوجد طلبات حالياً</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الطلب</TableHead>
                                        <TableHead>الفرع</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>الحالة</TableHead>
                                        <TableHead>عدد المنتجات</TableHead>
                                        <TableHead>الإجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.map((req) => (
                                        <TableRow key={req.id}>
                                            <TableCell className="font-mono">{req.requestNumber || req.id.slice(0, 8)}</TableCell>
                                            <TableCell>{req.branchName}</TableCell>
                                            <TableCell>{new Date(req.createdAt).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    req.status === 'draft' || req.status === 'submitted' ? 'outline' :
                                                        req.status === 'approved' ? 'default' :
                                                            'destructive'
                                                }>
                                                    {req.status === 'draft' ? 'مسودة' :
                                                        req.status === 'submitted' ? 'قيد الانتظار' :
                                                            req.status === 'approved' ? 'تمت الموافقة' :
                                                                req.status === 'cancelled' ? 'ملغي' : req.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{req.items.length}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="ghost" onClick={async () => {
                                                        await generateBranchRequestPDF(req)
                                                    }}>
                                                        <FileText className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleOpenChat(req)}>
                                                        <MessageSquare className="h-4 w-4" />
                                                        {(req.chatMessages || []).length > 0 && (
                                                            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500" />
                                                        )}
                                                    </Button>
                                                    {req.status === 'submitted' && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                className="bg-green-600 hover:bg-green-700"
                                                                onClick={() => handleApprove(req.id)}
                                                                disabled={processingId === req.id}
                                                            >
                                                                {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleReject(req.id)}
                                                                disabled={processingId === req.id}
                                                            >
                                                                {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={chatDialogOpen} onOpenChange={setChatDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>المحادثة - {activeChatRequest?.requestNumber || activeChatRequest?.id.slice(0, 8)}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col h-[400px]">
                        <ScrollArea className="flex-1 p-4 border rounded-md mb-4 bg-gray-50">
                            <div className="space-y-4">
                                {(activeChatRequest?.chatMessages || []).map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] p-3 rounded-lg ${msg.sender === 'admin'
                                            ? 'bg-primary text-primary-foreground rounded-tl-none'
                                            : 'bg-white border rounded-tr-none'
                                            }`}>
                                            <p className="text-sm font-bold mb-1">{msg.senderName}</p>
                                            <p className="text-sm">{msg.message}</p>
                                            <p className="text-xs opacity-70 mt-1">{new Date(msg.timestamp).toLocaleTimeString('ar-EG')}</p>
                                        </div>
                                    </div>
                                ))}
                                {(activeChatRequest?.chatMessages || []).length === 0 && (
                                    <div className="text-center text-gray-400 my-10">لا توجد رسائل سابقة</div>
                                )}
                            </div>
                        </ScrollArea>
                        <div className="flex gap-2">
                            <Textarea
                                value={chatMessage}
                                onChange={e => setChatMessage(e.target.value)}
                                placeholder="اكتب رسالتك هنا..."
                                className="resize-none"
                            />
                            <Button onClick={handleSendChat} className="h-auto">
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
