"use client"

import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { BranchNoteForm } from "@/components/branch-note-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Trash2, Calendar, LayoutDashboard, ArrowRight } from "lucide-react"
import { deleteBranchNote } from "@/lib/branch-notes-storage"
import { deleteBranchNoteApi } from "@/lib/firebase-sync-engine"
import { toast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { DualText } from "@/components/ui/dual-text"

export default function BranchNotesAdminPage() {
  const router = useRouter()
  const notes = useLiveQuery(() => db.branchNotes.toArray()) || []
  
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this note? / هل أنت متأكد من حذف هذه الملاحظة؟")) return
    await deleteBranchNote(id)
    await deleteBranchNoteApi(id)
    toast({ title: "Deleted / تم الحذف", description: "Note deleted successfully / تم حذف الملاحظة بنجاح" })
  }

  return (
    <div className="container mx-auto py-10 space-y-8" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            <DualText k="nav.branchNotes" />
          </h1>
          <p className="text-gray-500 mt-1">Create and schedule alerts for branches / إنشاء وجدولة التنبيهات التي تظهر للفروع</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/branch-requests")} className="gap-2">
          <ArrowRight className="h-4 w-4" /> Back / العودة
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New Note / إضافة ملاحظة جديدة</CardTitle>
            </CardHeader>
            <CardContent>
              <BranchNoteForm />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scheduled & Active Notes / الملاحظات المجدولة والحالية</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <div className="text-center py-20 text-gray-400">No notes added yet / لا توجد ملاحظات مضافة حالياً</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Content / المحتوى</TableHead>
                        <TableHead>Type / النوع</TableHead>
                        <TableHead>Branches / الفروع</TableHead>
                        <TableHead>Expires / ينتهي في</TableHead>
                        <TableHead>Actions / الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notes.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((note) => (
                        <TableRow key={note.id}>
                          <TableCell className="max-w-[200px] truncate font-medium">{note.content}</TableCell>
                          <TableCell>
                            <Badge variant={
                              note.type === 'error' ? 'destructive' : 
                              note.type === 'warning' ? 'secondary' : 
                              note.type === 'success' ? 'default' : 'outline'
                            }>
                              {note.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {note.targetBranchIds.includes('all') ? 'All / الكل' : `${note.targetBranchIds.length} Branches / فروع`}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500" dir="ltr">
                            {new Date(note.expiresAt).toLocaleString('en-GB')}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(note.id)} className="text-red-600 hover:text-red-800">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
