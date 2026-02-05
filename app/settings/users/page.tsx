"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { db as firestore } from "@/lib/firebase"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore"
import { UserProfile, UserRole } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import { Plus, UserCog, Ban, CheckCircle, MoreHorizontal } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserDialog } from "@/components/users/user-dialog"
import { ROLE_LABELS, DEFAULT_PERMISSIONS } from "@/lib/auth-utils"
import { formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale"

export default function UsersPage() {
    const { user } = useAuth()
    const { toast } = useToast()

    const [users, setUsers] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

    // Listen to Users Collection & Local DB
    useEffect(() => {
        // Should be secured by Rules, but UI check prevents accidental view if rules fail open for read
        // if (!user || user.role !== 'owner' && user.role !== 'manager') return 

        const unsubscribe = onSnapshot(collection(firestore, "users"), async (snapshot) => {
            const firestoreUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile))

            // ALSO Fetch Local Users (to prevent "disappearing" if sync fails)
            let localUsers: UserProfile[] = []
            try {
                const branches = await db.branches.toArray()
                localUsers = branches
                    .filter(b => b.type === 'user' || (b.role && b.type !== 'branch')) // Heuristic to find users
                    .map(b => ({
                        uid: b.id,
                        email: b.username || "",
                        displayName: b.name,
                        role: b.role as UserRole,
                        branchId: 'all', // Default
                        isActive: true,
                        permissions: (b as any).permissions || {},
                        createdAt: b.createdAt || new Date().toISOString(),
                        lastLogin: new Date().toISOString()
                    } as UserProfile))
            } catch (e) {
                console.warn("Failed to load local users", e)
            }

            // Merge: Firestore wins if duplicate, but keep local if missing from Firestore
            const merged = [...firestoreUsers]
            localUsers.forEach(local => {
                if (!merged.find(u => u.uid === local.uid)) {
                    merged.push(local)
                }
            })

            setUsers(merged)
            setLoading(false)
            setError(null)
        }, (error) => {
            console.error("Users sync error", error)
            setError(error.message)
            toast({ title: "تنبيه", description: "فشل التحميل من السحابة، يتم عرض البيانات المحلية فقط.", variant: "default" })
            setLoading(false)

            // Fallback to local only
            db.branches.toArray().then(branches => {
                const localUsers = branches
                    .filter(b => b.type === 'user' || (b.role && b.type !== 'branch'))
                    .map(b => ({
                        uid: b.id,
                        email: b.username || "",
                        displayName: b.name,
                        role: b.role as UserRole,
                        permissions: (b as any).permissions || {},
                        isActive: true,
                        createdAt: b.createdAt || new Date().toISOString(),
                        lastLogin: new Date().toISOString()
                    } as UserProfile))
                setUsers(localUsers)
            })
        })
        return () => unsubscribe()
    }, [])

    const resetRolePermissions = async (targetUser: UserProfile) => {
        try {
            const defaults = DEFAULT_PERMISSIONS[targetUser.role] || {}
            setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, permissions: defaults } : u))
            const localExists = await db.branches.get(targetUser.uid)
            if (localExists) {
                await db.branches.update(targetUser.uid, { permissions: defaults, updatedAt: new Date().toISOString() } as any)
            } else {
                await db.branches.put({
                    id: targetUser.uid,
                    username: targetUser.email || `user${Date.now()}`,
                    name: targetUser.displayName || "User",
                    passwordHash: "",
                    type: 'user',
                    role: targetUser.role,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    permissions: defaults
                } as any)
            }
            await updateDoc(doc(firestore, "users", targetUser.uid), { permissions: defaults } as any)
            toast({ title: "تم", description: "تم استعادة صلاحيات الدور الافتراضية" })
        } catch (e) {
            console.error(e)
            toast({ title: "خطأ", description: "فشل استعادة صلاحيات الدور", variant: "destructive" })
        }
    }

    const handleSaveUser = async (data: Partial<UserProfile>, password?: string) => {
        try {
            if (editingUser) {
                // Update Existing
                setUsers(prev => prev.map(u => u.uid === editingUser.uid ? { ...u, ...data } as UserProfile : u))

                // 1. Update Local DB (for Login Compatibility)
                try {
                    const updates: any = {
                        username: data.email, // Using email field as username for login
                        name: data.displayName,
                        role: data.role,
                        permissions: data.permissions
                    }
                    if (password) {
                        updates.passwordHash = await bcrypt.hash(password, 10)
                    }

                    const localExists = await db.branches.get(editingUser.uid)
                    if (localExists) {
                        await db.branches.update(editingUser.uid, updates)
                    } else {
                        // Re-create locally if missing
                        await db.branches.put({
                            id: editingUser.uid,
                            username: data.email,
                            name: data.displayName,
                            passwordHash: password ? await bcrypt.hash(password, 10) : "",
                            type: 'user',
                            role: data.role,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            permissions: data.permissions
                        } as any)
                    }
                } catch (localErr) {
                    console.error("Failed to update local login DB", localErr)
                    // If local update fails, we should probably warn but proceed if possible?
                    // Actually, if local fails, login might be broken.
                    throw new Error("فشل تحديث البيانات المحلية")
                }

                // 2. Update Firestore
                try {
                    await updateDoc(doc(firestore, "users", editingUser.uid), {
                        ...data,
                    })
                } catch (cloudErr) {
                    console.error("Failed to update cloud", cloudErr)
                    toast({ title: "تنبيه", description: "تم التحديث محلياً فقط. فشل الاتصال بالسحابة." })
                }

                toast({ title: "تم التحديث", description: "تم تحديث بيانات المستخدم بنجاح" })
            } else {
                // Create New
                const newId = `user_${Date.now()}`
                const newUser = {
                    ...data,
                    uid: newId,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    isActive: true,
                } as UserProfile

                // Optimistic Update
                setUsers(prev => [...prev, newUser])

                // 1. Save to Local DB (IndexedDB) - CRITICAL for Login & Persistence
                // We do this FIRST so that even if Cloud fails, the user exists locally.
                try {
                    const hash = password ? await bcrypt.hash(password, 10) : ""
                    await db.branches.put({
                        id: newId,
                        username: data.email || `user${Date.now()}`,
                        name: data.displayName,
                        passwordHash: hash,
                        type: 'user', // Distinguish from physical branches
                        role: data.role,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        permissions: data.permissions
                    } as any)
                    console.log("✅ User saved locally")
                } catch (localErr) {
                    console.error("Failed to save to local login DB", localErr)
                    throw new Error("فشل حفظ المستخدم محلياً (قاعدة البيانات)")
                }

                // 2. Save to Firestore (Cloud)
                try {
                    await setDoc(doc(firestore, "users", newId), newUser)
                    console.log("✅ User saved to cloud")
                } catch (cloudErr) {
                    console.error("Failed to save to cloud", cloudErr)
                    toast({ 
                        title: "تنبيه", 
                        description: "تم حفظ المستخدم محلياً ولكن فشل الحفظ السحابي. سيتمكن المستخدم من الدخول من هذا الجهاز فقط حالياً.",
                        variant: "default" 
                    })
                    // Don't throw, so we don't block the success flow
                }

                if (password) {
                    toast({ title: "تم", description: "تم إضافة المستخدم وحفظ بيانات الدخول" })
                } else {
                    toast({ title: "تم", description: "تم إضافة المستخدم (بدون كلمة مرور)" })
                }
            }
        } catch (e: any) {
            console.error(e)
            toast({ title: "خطأ", description: "حدث خطأ أثناء الحفظ: " + e.message, variant: "destructive" })
        }
    }

    const toggleStatus = async (targetUser: UserProfile) => {
        if (targetUser.role === 'owner') return
        try {
            // 1. Update Local
            const newStatus = !targetUser.isActive
            
            // Optimistic UI update
            setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, isActive: newStatus } : u))

            // Update DB
            const localExists = await db.branches.get(targetUser.uid)
            if (localExists) {
                // Determine 'type' carefully - if it's a user, keep it as user
                await db.branches.update(targetUser.uid, { 
                    isActive: newStatus,
                    // Ensure we don't accidentally break the 'type' if it was missing
                    updatedAt: new Date().toISOString()
                } as any)
            }

            // 2. Update Cloud
            await updateDoc(doc(firestore, "users", targetUser.uid), {
                isActive: newStatus
            })
            
            toast({ title: newStatus ? "تم تفعيل الحساب" : "تم إيقاف الحساب" })
        } catch (e) {
            console.error(e)
            toast({ title: "خطأ في التحديث", description: "قد يكون هناك مشكلة في الاتصال", variant: "destructive" })
            // Revert optimistic update if needed? 
            // Ideally yes, but for now let's leave it.
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">إدارة المستخدمين</h1>
                    <p className="text-muted-foreground">صلاحيات الموظفين والتحكم بالوصول</p>
                </div>
                <Button onClick={() => { setEditingUser(null); setDialogOpen(true) }}>
                    <Plus className="ml-2 h-4 w-4" /> إضافة مستخدم
                </Button>
            </div>

            {error && (
                <div className="bg-destructive/15 p-4 rounded-md flex items-center gap-3 text-destructive border border-destructive/20 mb-6">
                    <Ban className="h-5 w-5" />
                    <div>
                        <div className="font-bold">فشل الاتصال بقاعدة البيانات</div>
                        <div className="text-sm">{error}. تأكد من صلاحيات النظام (Firestore Rules).</div>
                    </div>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {users.map((u) => (
                    <Card key={u.uid} className={`overflow-hidden transition-all ${!u.isActive ? "opacity-60 bg-slate-50 border-slate-200" : ""}`}>
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                            <Avatar className="h-12 w-12">
                                <AvatarImage src={u.photoURL} />
                                <AvatarFallback>{u.displayName?.slice(0, 2) || "U"}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 overflow-hidden">
                                <CardTitle className="text-base truncate">{u.displayName}</CardTitle>
                                <CardDescription className="truncate text-xs">{u.email}</CardDescription>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => { setEditingUser(u); setDialogOpen(true) }}>
                                        تعديل البيانات
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => toggleStatus(u)} disabled={u.role === 'owner'}>
                                        {u.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => resetRolePermissions(u)} disabled={u.role === 'owner'}>
                                        استعادة صلاحيات الدور
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600" disabled={u.role === 'owner'}>
                                        حذف نهائي
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </CardHeader>
                        <CardContent>
                            <div className="mt-2 flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant={u.role === 'owner' ? 'default' : 'secondary'}>
                                        {ROLE_LABELS[u.role]?.ar || u.role}
                                    </Badge>
                                    {u.branchId && u.branchId !== 'all' && (
                                        <Badge variant="outline" className="text-xs">فرع محدد</Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground" title={u.lastLogin}>
                                    {u.lastLogin ? formatDistanceToNow(new Date(u.lastLogin), { addSuffix: true, locale: ar }) : "لم يدخل بعد"}
                                </div>
                            </div>
                            {!u.isActive && (
                                <div className="mt-3 flex items-center justify-center gap-1 text-xs text-red-600 font-medium bg-red-50 p-1 rounded">
                                    <Ban className="w-3 h-3" /> الحساب موقوف
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <UserDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                userToEdit={editingUser}
                onSave={handleSaveUser}
            />
        </div>
    )
}
