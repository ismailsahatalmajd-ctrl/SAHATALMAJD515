"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserProfile, UserRole, Permissions } from "@/lib/types"
import { DEFAULT_PERMISSIONS, ROLE_LABELS } from "@/lib/auth-utils"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Plus, ShieldCheck } from "lucide-react"

interface UserDialogProps {
    userToEdit?: UserProfile | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (user: Partial<UserProfile>, password?: string) => Promise<void>
}

// Group permissions logic for display
const PERMISSION_GROUPS = [
    {
        id: "inventory",
        label: "إدارة المخزون",
        keys: ["inventory.view", "inventory.add", "inventory.edit", "inventory.delete", "inventory.adjust"]
    },
    {
        id: "transactions",
        label: "الحركات والفواتير",
        keys: ["transactions.purchase", "transactions.issue", "transactions.return", "transactions.approve"]
    },
    {
        id: "branches",
        label: "الفروع",
        keys: ["branches.view", "branches.manage", "branch_requests.view", "branch_requests.approve"]
    },
    {
        id: "admin",
        label: "الإدارة والنظام",
        keys: ["users.view", "users.manage", "system.settings", "system.backup", "system.logs"]
    }
]

const PAGE_PERMISSIONS = [
    { key: "page.dashboard", label: "الرئيسية" },
    { key: "page.inventory", label: "المنتجات" },
    { key: "page.transactions", label: "الحركات" },
    { key: "page.branches", label: "الفروع" },
    { key: "page.reports", label: "التقارير" },
    { key: "page.settings", label: "الإعدادات" },
    { key: "page.users", label: "المستخدمين" },
]

export function UserDialog({ userToEdit, open, onOpenChange, onSave }: UserDialogProps) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)

    // Form State
    const [email, setEmail] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [password, setPassword] = useState("") // Only for new or reset
    const [role, setRole] = useState<UserRole>("staff")
    const [branchId, setBranchId] = useState<string>("all") // 'all' means no branch restriction (HQ)
    const [permissions, setPermissions] = useState<Partial<Permissions>>({})

    useEffect(() => {
        if (userToEdit) {
            setEmail(userToEdit.email)
            setDisplayName(userToEdit.displayName)
            setRole(userToEdit.role)
            setBranchId(userToEdit.branchId || "all")
            setPermissions(userToEdit.permissions || {})
            setPassword("") // Don't show password
        } else {
            resetForm()
        }
    }, [userToEdit, open])

    const resetForm = () => {
        setEmail("")
        setDisplayName("")
        setPassword("")
        setRole("staff")
        setBranchId("all")
        setPermissions(DEFAULT_PERMISSIONS["staff"])
    }

    const handleRoleChange = (newRole: UserRole) => {
        setRole(newRole)
        // If switching to a standard role, load its defaults
        // If switching to Custom, keep current selection or load base
        if (newRole !== 'custom') {
            setPermissions(DEFAULT_PERMISSIONS[newRole] || {})
        }
    }

    const getEffectivePermission = (key: keyof Permissions) => {
        if (permissions[key] !== undefined) return permissions[key];
        return DEFAULT_PERMISSIONS[role]?.[key] ?? false;
    }

    const togglePermission = (key: keyof Permissions) => {
        const current = getEffectivePermission(key);
        setPermissions(prev => ({
            ...prev,
            [key]: !current
        }))
    }

    const handleSave = async () => {
        if (!email || !displayName) {
            toast({ title: "خطأ", description: "يرجى ملء كافة الحقول المطلوبة", variant: "destructive" })
            return
        }
        if (!userToEdit && !password) {
            toast({ title: "خطأ", description: "كلمة المرور مطلوبة للمستخدم الجديد", variant: "destructive" })
            return
        }

        setLoading(true)
        try {
            const userData: Partial<UserProfile> = {
                email,
                displayName,
                role,
                branchId: branchId === "all" ? undefined : branchId,
                permissions: permissions as Permissions,
                isActive: userToEdit ? userToEdit.isActive : true
            }

            await onSave(userData, password)
            onOpenChange(false)
        } catch (error) {
            console.error(error)
            // Toast handled by parent usually
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{userToEdit ? "تعديل المستخدم" : "مستخدم جديد"}</DialogTitle>
                    <DialogDescription>
                        {userToEdit ? `تعديل صلاحيات وبيانات ${userToEdit.displayName}` : "إنشاء حساب موظف جديد وتحديد صلاحياته"}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 px-1">
                    <div className="space-y-6 py-4">

                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>الاسم الكامل</Label>
                                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="مثال: أحمد محمد" />
                            </div>
                            <div className="space-y-2">
                                <Label>البريد الإلكتروني</Label>
                                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" disabled={!!userToEdit} />
                            </div>
                            {!userToEdit && (
                                <div className="space-y-2 col-span-2">
                                    <Label>كلمة المرور</Label>
                                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
                                </div>
                            )}
                            {userToEdit && (
                                <div className="space-y-2 col-span-2">
                                    <Label>تغيير كلمة المرور (اختياري)</Label>
                                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="اتركه فارغاً للإبقاء على الحالية" />
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-border my-2" />

                        {/* Role & Context */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>الدور الوظيفي</Label>
                                <Select value={role} onValueChange={(v) => handleRoleChange(v as UserRole)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                                            <SelectItem key={r} value={r}>{ROLE_LABELS[r].ar}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {role === 'owner' && "كامل الصلاحيات، لا يمكن تقييده."}
                                    {role === 'manager' && "إدارة شاملة للمخزون والموظفين."}
                                    {role === 'staff' && "صلاحيات محدودة للعمليات اليومية."}
                                    {role === 'view_only' && "مشاهدة فقط دون أي تعديل."}
                                    {role === 'custom' && "تخصيص يدوي لكل صلاحية."}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>الفرع</Label>
                                <Select value={branchId} onValueChange={setBranchId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر الفرع" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">المقر الرئيسي (الكل)</SelectItem>
                                        {/* TODO: Load branches dynamically if needed, for now we assume simple setup */}
                                        <SelectItem value="main">الفرع الرئيسي</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Permissions Matrix - Only visible for Custom or to review others */}
                        {(role === 'custom' || role === 'view_only') && (
                            <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
                                <div className="flex items-center gap-2 mb-4">
                                    <ShieldCheck className="w-5 h-5 text-primary" />
                                    <h3 className="font-semibold">تخصيص الصلاحيات</h3>
                                </div>

                                <Tabs defaultValue="pages">
                                    <TabsList className="w-full">
                                        <TabsTrigger value="pages" className="flex-1">الوصول للصفحات</TabsTrigger>
                                        <TabsTrigger value="actions" className="flex-1">العمليات</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="pages" className="space-y-4 mt-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            {PAGE_PERMISSIONS.map(p => (
                                                <div key={p.key} className="flex items-center space-x-2 space-x-reverse">
                                                    <Checkbox
                                                        id={p.key}
                                                        checked={permissions[p.key as keyof Permissions] === true}
                                                        onCheckedChange={() => togglePermission(p.key as keyof Permissions)}
                                                        disabled={role === 'view_only'} // View Only typically has read access, but we might want to restrict pages too
                                                    />
                                                    <Label htmlFor={p.key}>{p.label}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="actions" className="space-y-6 mt-4">
                                        {PERMISSION_GROUPS.map(group => (
                                            <div key={group.id}>
                                                <h4 className="text-sm font-bold mb-2 text-muted-foreground">{group.label}</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {group.keys.map(key => (
                                                        <div key={key} className="flex items-center space-x-2 space-x-reverse">
                                                            <Checkbox
                                                                id={key}
                                                                checked={getEffectivePermission(key as keyof Permissions)}
                                                                onCheckedChange={() => togglePermission(key as keyof Permissions)}
                                                                disabled={role === 'view_only' && !key.includes('view')} // Disable write actions in view only always
                                                            />
                                                            <Label htmlFor={key} className="text-sm font-normal dir-ltr font-mono text-xs text-muted-foreground">
                                                                {key.split('.')[1]}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </TabsContent>
                                </Tabs>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="pt-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        حفظ المستخدم
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
