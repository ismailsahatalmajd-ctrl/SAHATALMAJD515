"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Languages, Loader2, Plus, Trash2 } from "lucide-react"
import type { BranchNote, Branch } from "@/lib/types"
import { useBranchesRealtime } from "@/hooks/use-store"
import { addBranchNote } from "@/lib/branch-notes-storage"
import { syncBranchNote } from "@/lib/firebase-sync-engine"
import { toast } from "@/components/ui/use-toast"

export function BranchNoteForm({ onComplete }: { onComplete?: () => void }) {
  const { data: branches = [] } = useBranchesRealtime() as { data: Branch[] }
  const [content, setContent] = useState("")
  const [type, setType] = useState<BranchNote['type']>("info")
  const [animation, setAnimation] = useState<BranchNote['animation']>("pulse")
  const [targetBranchIds, setTargetBranchIds] = useState<string[]>(["all"])
  const [expiresAt, setExpiresAt] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)

  const handleTranslate = async () => {
    if (!content.trim()) return
    setIsTranslating(true)
    try {
      // Detecting if content is Arabic to decide direction
      const isArabic = /[\u0600-\u06FF]/.test(content)
      const langPair = isArabic ? "ar|en" : "en|ar"
      
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(content)}&langpair=${langPair}`)
      const data = await res.json()
      
      if (data.responseData?.translatedText) {
        const translated = data.responseData.translatedText
        // Merge according to user preference or just replace? 
        // User said "خليها عربي انجليزي والعكس", so I'll merge.
        if (isArabic) {
          setContent(`${content} / ${translated}`)
        } else {
          setContent(`${translated} / ${content}`)
        }
        toast({ title: "تمت الترجمة", description: "تم دمج الترجمة بنجاح" })
      }
    } catch (error) {
      toast({ title: "خطأ في الترجمة", description: "فشل الاتصال بخدمة الترجمة", variant: "destructive" })
    } finally {
      setIsTranslating(false)
    }
  }

  const handleSubmit = async () => {
    if (!content || !expiresAt) {
      toast({ title: "خطأ", description: "يرجى إكمال جميع الحقول", variant: "destructive" })
      return
    }

    try {
       const newNote = await addBranchNote({
        content,
        type,
        animation,
        targetBranchIds,
        expiresAt: new Date(expiresAt).toISOString(),
      })
      // Sync to cloud
      syncBranchNote(newNote).catch(console.error)
      
      toast({ title: "Note Added / تم الإضافة", description: "Note added successfully / تمت إضافة الملاحظة بنجاح" })
      setContent("")
      setTargetBranchIds(["all"])
      if (onComplete) onComplete()
    } catch (error) {
      toast({ title: "خطأ", description: "فشلت عملية الإضافة", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4 border p-4 rounded-lg bg-white shadow-sm" dir="rtl">
      <div className="space-y-2">
        <Label>Note Content / محتوى الملاحظة</Label>
        <div className="relative">
          <Textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            placeholder="Write your message here... / اكتب رسالتك هنا..."
            className="min-h-[100px] pl-10"
          />
          <Button 
            variant="ghost" 
            size="sm" 
            className="absolute left-2 bottom-2 text-blue-600 hover:text-blue-800"
            onClick={handleTranslate}
            disabled={isTranslating}
            title="ترجمة مدمجة"
          >
            {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Message Type / نوع الرسالة</Label>
          <Select value={type} onValueChange={(v: any) => setType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info / ملاحظة</SelectItem>
              <SelectItem value="warning">Warning / تنبيه</SelectItem>
              <SelectItem value="error">Alert / تحذير</SelectItem>
              <SelectItem value="success">Success / نجاح</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Animation / نوع الحركة</Label>
          <Select value={animation} onValueChange={(v: any) => setAnimation(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None / بدون حركة</SelectItem>
              <SelectItem value="pulse">Pulse / نبض</SelectItem>
              <SelectItem value="bounce">Bounce / قفز</SelectItem>
              <SelectItem value="fade">Fade / تلاشي</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Expiry Date & Time / تاريخ ووقت الانتهاء</Label>
          <Input 
            type="datetime-local" 
            value={expiresAt} 
            onChange={(e) => setExpiresAt(e.target.value)} 
          />
        </div>

        <div className="space-y-2">
          <Label>Target Branches / الفروع المستهدفة</Label>
          <div className="flex flex-wrap gap-2 border p-2 rounded-md min-h-[40px]">
            <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
              <Checkbox 
                id="target-all" 
                checked={targetBranchIds.includes("all")} 
                onCheckedChange={(checked) => {
                  if (checked) setTargetBranchIds(["all"])
                  else setTargetBranchIds([])
                }}
              />
              <label htmlFor="target-all">All Branches / كل الفروع</label>
            </div>
            {!targetBranchIds.includes("all") && branches.map((b) => (
              <div key={b.id} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                <Checkbox 
                  id={`target-${b.id}`} 
                  checked={targetBranchIds.includes(b.id)} 
                  onCheckedChange={(checked) => {
                    if (checked) setTargetBranchIds([...targetBranchIds, b.id])
                    else setTargetBranchIds(targetBranchIds.filter(id => id !== b.id))
                  }}
                />
                <label htmlFor={`target-${b.id}`}>{b.name}</label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit}>
        <Plus className="ml-2 h-4 w-4" /> Add Note / إضافة الملاحظة
      </Button>
    </div>
  )
}
