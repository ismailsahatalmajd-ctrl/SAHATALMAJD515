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

  const handleSubmit = () => {
    if (!selectedIssueId) {
      toast({ title: t("toast.error"), description: t("returnDialog.selectIssue"), variant: "destructive" })
      return
    }

    if (!reason.trim()) {
      toast({ title: t("toast.error"), description: t("returnDialog.enterReason"), variant: "destructive" })
      return
    }

    const issue = issues.find((i) => i.id === selectedIssueId)
    if (!issue) return

    addReturn({
      issueId: selectedIssueId,
      branchId: issue.branchId,
      branchName: issue.branchName,
      products: issue.products,
      totalValue: issue.totalValue,
      reason,
    })

    toast({ title: t("toast.success"), description: t("returnDialog.addedSuccess") })
    resetForm()
    onSuccess()
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
          <DialogTitle>{t("returnDialog.title")}</DialogTitle>
          <DialogDescription>{t("returnDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("returnDialog.issueLabel")}</Label>
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
                <span className="text-muted-foreground">{t("returnDialog.branchLabel")}</span>
                <span className="font-medium">{selectedIssue.branchName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("returnDialog.productsCount")}</span>
                <span className="font-medium">{selectedIssue.products.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("returnDialog.totalValue")}</span>
                <span className="font-medium">{selectedIssue.totalValue.toFixed(2)} {t("common.currency")}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("returnDialog.reasonLabel")}</Label>
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
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit}>{t("returnDialog.addReturnBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
