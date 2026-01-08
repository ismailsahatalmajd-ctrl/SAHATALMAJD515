"use client"

import React, { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { 
  ArrowLeft, 
  Calendar,
  User,
  CheckCircle,
  AlertTriangle,
  Package
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { getVerificationLogs } from "@/lib/storage-verification"
import type { VerificationLog } from "@/lib/types"
import { getSafeImageSrc } from "@/lib/utils"
import { DualText } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"

export default function VerificationLogDetailsClient() {
  const router = useRouter()
  const params = useParams()
  const { lang } = useI18n()
  const [log, setLog] = useState<VerificationLog | null>(null)
  const [loading, setLoading] = useState(true)
  
  const id = params.id as string

  useEffect(() => {
    getVerificationLogs().then(logs => {
      const found = logs.find(l => l.id === id)
      if (found) {
        setLog(found)
      }
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-muted-foreground"><DualText k="common.loading" fallback="Loading..." /></p>
        </div>
      </div>
    )
  }

  if (!log) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-destructive font-medium mb-4"><DualText k="issues.verify.toast.notFound" fallback="Not Found" /></p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            <DualText k="common.back" fallback="Back" />
          </Button>
        </div>
      </div>
    )
  }

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
                <DualText k="issues.verify.details" fallback="Verification Details" />
                <span className="text-muted-foreground">#{log.issueNumber}</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <DualText k="common.date" fallback="Date" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-2xl font-bold">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <span dir="ltr" className="text-lg">
                  {new Date(log.timestamp).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(log.timestamp).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <DualText k="common.user" fallback="User" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-2xl font-bold">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="text-lg">{log.user || "Unknown"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <DualText k="common.status" fallback="Status" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {log.status === 'matched' ? (
                  <Badge className="bg-green-600 hover:bg-green-700 text-lg py-1 px-3">
                    <CheckCircle className="mr-2 h-5 w-5" />
                    <DualText k="issues.verify.status.matched" fallback="Matched" />
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-lg py-1 px-3">
                    <AlertTriangle className="mr-2 h-5 w-5" />
                    <DualText k="issues.verify.status.discrepancy" fallback="Discrepancy" />
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <DualText k="issues.verify.products" fallback="Products" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]"><DualText k="common.image" fallback="Image" /></TableHead>
                  <TableHead><DualText k="common.product" fallback="Product" /></TableHead>
                  <TableHead><DualText k="common.code" fallback="Code" /></TableHead>
                  <TableHead className="text-center"><DualText k="issues.verify.expectedQty" fallback="Expected Qty" /></TableHead>
                  <TableHead className="text-center"><DualText k="issues.verify.scannedQty" fallback="Scanned Qty" /></TableHead>
                  <TableHead className="text-center"><DualText k="common.status" fallback="Status" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.items.map((item, index) => (
                  <TableRow key={index} className={
                    item.status === 'match' ? "bg-green-50/50" : 
                    item.status === 'extra' ? "bg-red-50/50" : "bg-yellow-50/50"
                  }>
                    <TableCell>
                      <img 
                        src={getSafeImageSrc(item.image || "")} 
                        alt={item.productName}
                        className="w-10 h-10 object-cover rounded border"
                        onError={(e) => { e.currentTarget.src = "/placeholder.svg" }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.productCode}</TableCell>
                    <TableCell className="text-center text-lg">{item.expectedQty}</TableCell>
                    <TableCell className="text-center text-lg font-bold">{item.scannedQty}</TableCell>
                    <TableCell className="text-center">
                      {item.status === 'match' ? (
                        <Badge className="bg-green-600">
                          <DualText k="issues.verify.status.matched" fallback="Matched" />
                        </Badge>
                      ) : item.status === 'extra' ? (
                        <Badge variant="destructive">
                          <DualText k="issues.verify.status.extra" fallback="Extra" />
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
                          <DualText k="issues.verify.status.missing" fallback="Missing" />
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}