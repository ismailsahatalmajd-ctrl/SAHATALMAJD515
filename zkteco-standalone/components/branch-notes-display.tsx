"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface BranchNotesDisplayProps {
  branchId: string
  isAdmin?: boolean
}

export function BranchNotesDisplay({ branchId, isAdmin }: BranchNotesDisplayProps) {
  const notes = useLiveQuery(async () => {
    const now = new Date().toISOString()
    const all = await db.branchNotes.toArray()
    return all.filter(note => {
      const isNotExpired = note.expiresAt > now
      const isTargeted = isAdmin || note.targetBranchIds.includes("all") || note.targetBranchIds.includes(branchId)
      return isNotExpired && isTargeted
    })
  }, [branchId, isAdmin])

  if (!notes || notes.length === 0) return null

  const getIcon = (type: string) => {
    switch (type) {
      case "warning": return <AlertTriangle className="h-4 w-4" />
      case "error": return <AlertCircle className="h-4 w-4" />
      case "success": return <CheckCircle className="h-4 w-4" />
      default: return <Info className="h-4 w-4" />
    }
  }

  const getTypeStyles = (type: string) => {
    switch (type) {
      case "warning": return "border-yellow-500 bg-yellow-50 text-yellow-900"
      case "error": return "border-red-500 bg-red-50 text-red-900"
      case "success": return "border-green-500 bg-green-50 text-green-900"
      default: return "border-blue-500 bg-blue-50 text-blue-900"
    }
  }

  const getAnimationClass = (anim: string) => {
    switch (anim) {
      case "pulse": return "animate-pulse"
      case "bounce": return "animate-bounce"
      case "fade": return "animate-in fade-in duration-1000 repeat-infinite"
      default: return ""
    }
  }

  return (
    <div className="space-y-4 w-full mt-4">
      {notes.map((note) => (
        <Alert 
          key={note.id} 
          className={cn(
            "border-l-4 shadow-sm transition-all",
            getTypeStyles(note.type),
            getAnimationClass(note.animation)
          )}
        >
          {getIcon(note.type)}
          <AlertTitle className="font-bold flex justify-between items-center">
            <span>
              {note.type === 'warning' ? 'تنبيه / Warning' : 
               note.type === 'error' ? 'تحذير / Alert' : 
               note.type === 'success' ? 'نجاح / Success' : 'ملاحظة / Note'}
            </span>
            {isAdmin && (
              <span className="text-[10px] opacity-50 font-normal">
                {note.targetBranchIds.includes('all') ? 'All / الكل' : 'Specific / محدد'}
              </span>
            )}
          </AlertTitle>
          <AlertDescription className="mt-1 text-sm whitespace-pre-wrap">
            {note.content}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
