"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Scan,
  Upload,
  Search,
  Save,
  RotateCcw
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { useToast } from "@/hooks/use-toast"
import { getIssues } from "@/lib/storage"
import { addVerificationLog } from "@/lib/storage-verification"
import { performOcrOnFile, normalizeCode } from "@/lib/ocr-utils"
import type { Issue, VerificationItem } from "@/lib/types"
import { getNumericInvoiceNumber, getSafeImageSrc } from "@/lib/utils"
import { DualText } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"

import { ProductImage } from "@/components/product-image"

export default function VerifyIssueClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { t, lang } = useI18n()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [scannedItems, setScannedItems] = useState<Map<string, number>>(new Map())
  const [inputCode, setInputCode] = useState("")
  const [processingImage, setProcessingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const id = searchParams.get('id')

  useEffect(() => {
    if (!id) return

    const issues = getIssues()
    const found = issues.find(i => i.id === id)
    if (found) {
      setIssue(found)
      // Initialize scanned items with 0
      const initial = new Map<string, number>()
      found.products.forEach(p => initial.set(p.productId, 0))
      setScannedItems(initial)
    } else {
      toast({ title: t("common.error"), description: t("issues.verify.toast.invoiceNotFound"), variant: "destructive" })
      router.push("/issues")
    }
  }, [id, router, toast, t])

  const handleScan = (code: string) => {
    if (!issue) return false
    const normalizedInput = normalizeCode(code)

    // Find product by code or name
    const product = issue.products.find(p => {
      const pCode = normalizeCode(p.productCode || "")
      const pName = normalizeCode(p.productName || "")
      return pCode === normalizedInput || pName.includes(normalizedInput)
    })

    if (product) {
      setScannedItems(prev => {
        const next = new Map(prev)
        const current = next.get(product.productId) || 0
        next.set(product.productId, current + 1)
        return next
      })
      toast({ title: t("issues.verify.toast.matched"), description: product.productName })
      return true
    } else {
      toast({ title: t("issues.verify.toast.notFound"), description: t("issues.verify.toast.notFoundDesc"), variant: "destructive" })
      return false
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputCode.trim()) {
      handleScan(inputCode)
      setInputCode("")
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProcessingImage(true)
    try {
      const code = await performOcrOnFile(file)
      if (code) {
        handleScan(code)
      } else {
        toast({ title: t("issues.verify.toast.failedRecognize"), description: t("issues.verify.toast.failedRecognizeDesc"), variant: "destructive" })
      }
    } catch (error) {
      toast({ title: t("issues.verify.toast.error"), description: t("issues.verify.toast.failedRecognizeDesc"), variant: "destructive" })
    } finally {
      setProcessingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!issue) return

    const verificationItems: VerificationItem[] = issue.products.map(p => {
      const scanned = scannedItems.get(p.productId) || 0
      let status: 'match' | 'missing' | 'extra' = 'match'
      if (scanned < p.quantity) status = 'missing'
      if (scanned > p.quantity) status = 'extra'

      return {
        productId: p.productId,
        productName: p.productName,
        productCode: p.productCode,
        image: p.image,
        expectedQty: p.quantity,
        scannedQty: scanned,
        status
      }
    })

    const hasDiscrepancy = verificationItems.some(i => i.status !== 'match')

    await addVerificationLog({
      issueId: issue.id,
      issueNumber: getNumericInvoiceNumber(issue.id, new Date(issue.createdAt)),
      timestamp: new Date().toISOString(),
      status: hasDiscrepancy ? 'discrepancy' : 'matched',
      items: verificationItems,
      user: "Current User" // In a real app, get from auth context
    })

    toast({ title: t("issues.verify.toast.saved"), description: t("issues.verify.toast.savedDesc") })
    router.push("/issues/verification-logs")
  }

  const progress = useMemo(() => {
    if (!issue) return 0
    const total = issue.products.reduce((acc, p) => acc + p.quantity, 0)
    const scanned = Array.from(scannedItems.values()).reduce((acc, v) => acc + v, 0)
    return Math.min(100, Math.round((scanned / total) * 100))
  }, [issue, scannedItems])

  if (!id) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-6 text-center text-muted-foreground">
          <DualText k="common.loading" fallback="Loading..." />
        </div>
      </div>
    )
  }

  if (!issue) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className={`h-6 w-6 ${lang === 'ar' ? 'rotate-180' : ''}`} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <DualText k="issues.verify.title" />
                <span>{getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))}</span>
              </h1>
              <p className="text-muted-foreground">
                <DualText k="issues.verify.subtitle" />
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScannedItems(new Map(issue.products.map(p => [p.productId, 0])))}>
              <RotateCcw className="mr-2 h-4 w-4" />
              <DualText k="issues.verify.reset" />
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              <DualText k="issues.verify.save" />
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle><DualText k="issues.verify.enterProducts" /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <form onSubmit={handleManualSubmit} className="flex-1 flex gap-2">
                  <Input
                    placeholder={t("issues.verify.placeholder")}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit">
                    <Search className="h-4 w-4" />
                  </Button>
                </form>

                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={processingImage}>
                    {processingImage ? (
                      <span className="animate-spin mr-2">⏳</span>
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    <DualText k="issues.verify.imageMatch" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span><DualText k="issues.verify.progress" /></span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle><DualText k="issues.verify.summary" /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-2 bg-muted rounded">
                  <span><DualText k="issues.verify.totalProducts" /></span>
                  <span className="font-bold">{issue.products.reduce((a, b) => a + b.quantity, 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-green-50 text-green-700 rounded">
                  <span><DualText k="issues.verify.matched" /></span>
                  <span className="font-bold">{Array.from(scannedItems.values()).reduce((a, b) => a + b, 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-red-50 text-red-700 rounded">
                  <span><DualText k="issues.verify.remaining" /></span>
                  <span className="font-bold">
                    {Math.max(0, issue.products.reduce((a, b) => a + b.quantity, 0) - Array.from(scannedItems.values()).reduce((a, b) => a + b, 0))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]"><DualText k="common.image" fallback="Image" /></TableHead>
                  <TableHead><DualText k="common.product" /></TableHead>
                  <TableHead><DualText k="common.code" fallback="Code" /></TableHead>
                  <TableHead className="text-center"><DualText k="issues.verify.requiredQty" /></TableHead>
                  <TableHead className="text-center"><DualText k="issues.verify.matchedQty" /></TableHead>
                  <TableHead className="text-center"><DualText k="issues.verify.status" /></TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issue.products.map((product) => {
                  const scanned = scannedItems.get(product.productId) || 0
                  const isMatch = scanned === product.quantity
                  const isOver = scanned > product.quantity

                  return (
                    <TableRow key={product.productId} className={isMatch ? "bg-green-50/50" : isOver ? "bg-red-50/50" : ""}>
                      <TableCell>
                        <ProductImage
                          product={{ id: product.productId, image: product.image }}
                          className="w-10 h-10 rounded border"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.productName}</TableCell>
                      <TableCell className="text-muted-foreground">{product.productCode}</TableCell>
                      <TableCell className="text-center text-lg">{product.quantity}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setScannedItems(prev => new Map(prev.set(product.productId, Math.max(0, scanned - 1))))}
                          >
                            -
                          </Button>
                          <span className={`text-lg font-bold ${isOver ? "text-red-600" : isMatch ? "text-green-600" : ""}`}>
                            {scanned}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setScannedItems(prev => new Map(prev.set(product.productId, scanned + 1)))}
                          >
                            +
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {isMatch ? (
                          <Badge className="bg-green-600"><DualText k="issues.verify.status.matched" /></Badge>
                        ) : isOver ? (
                          <Badge variant="destructive"><DualText k="issues.verify.status.extra" /></Badge>
                        ) : (
                          <Badge variant="outline"><DualText k="issues.verify.status.missing" /></Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setScannedItems(prev => new Map(prev.set(product.productId, product.quantity)))}
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
