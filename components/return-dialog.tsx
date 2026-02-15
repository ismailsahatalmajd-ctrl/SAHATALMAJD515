"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getIssues, addReturn } from "@/lib/storage"
import type { Issue } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { useI18n } from "@/components/language-provider"
import { DualText, getDualString } from "@/components/ui/dual-text"

interface ReturnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ReturnDialog({ open, onOpenChange, onSuccess }: ReturnDialogProps) {
  const { t } = useI18n()
  const [issues, setIssues] = useState<Issue[]>([])
  const [selectedIssueId, setSelectedIssueId] = useState("")
  const [reason, setReason] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setIssues(getIssues())
    }
  }, [open])

  const handleSubmit = async () => {
    if (!selectedIssueId) {
      toast({ title: getDualString("toast.error"), description: getDualString("returnDialog.selectIssue"), variant: "destructive" })
      return
    }

    if (!reason.trim()) {
      toast({ title: getDualString("toast.error"), description: getDualString("returnDialog.enterReason"), variant: "destructive" })
      return
    }

    const issue = issues.find((i) => i.id === selectedIssueId)
    if (!issue) return

    try {
      // إضافة المرتجع
      const newReturn = await addReturn({
        issueId: selectedIssueId,
        branchId: issue.branchId,
        branchName: issue.branchName,
        products: issue.products,
        totalValue: issue.totalValue,
        reason,
        sourceType: 'issue',
        status: 'pending', // سيتم تغييره للموافقة مباشرة
      })

      // الموافقة على المرتجع تلقائياً لتحديث المخزون
      const { approveReturn } = await import('@/lib/storage')
      await approveReturn(newReturn.id, 'admin')

      toast({ title: getDualString("toast.success"), description: getDualString("returnDialog.addedSuccess") })
      resetForm()
      onSuccess()
    } catch (error) {
      console.error('Error creating return:', error)
      toast({ title: getDualString("toast.error"), description: "فشل إنشاء المرتجع", variant: "destructive" })
    }
  }

  const resetForm = () => {
    setSelectedIssueId("")
    setReason("")
  }

  const selectedIssue = issues.find((i) => i.id === selectedIssueId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <DualText k="returnDialog.title" />
          </DialogTitle>
          <DialogDescription>
            <DualText k="returnDialog.description" />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              <DualText k="returnDialog.issueLabel" />
            </Label>
            <Select value={selectedIssueId} onValueChange={setSelectedIssueId}>
              <SelectTrigger>
                <SelectValue placeholder={t("returnDialog.issuePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {issues.map((issue) => (
                  <SelectItem key={issue.id} value={issue.id}>
                    #{issue.id.slice(-6)} - {issue.branchName} ({issue.totalValue.toFixed(2)} {t("common.currency")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedIssue && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  <DualText k="returnDialog.branchLabel" />
                </span>
                <span className="font-medium">{selectedIssue.branchName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  <DualText k="returnDialog.productsCount" />
                </span>
                <span className="font-medium">{selectedIssue.products.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  <DualText k="returnDialog.totalValue" />
                </span>
                <span className="font-medium">{selectedIssue.totalValue.toFixed(2)} {t("common.currency")}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              <DualText k="returnDialog.reasonLabel" />
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("returnDialog.reasonPlaceholder")}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <DualText k="common.cancel" />
          </Button>
          <Button onClick={handleSubmit}>
            <DualText k="returnDialog.addReturnBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
