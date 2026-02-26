"use client"

import { useState, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, UploadCloud, CheckCircle2, XCircle, ShieldCheck } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { ref, uploadString, getDownloadURL } from "firebase/storage"
import { doc, updateDoc, Timestamp, setDoc } from "firebase/firestore"
import { storage, db as firestore, auth } from "@/lib/firebase"
import { COLLECTIONS } from "@/lib/firebase-sync-engine"
import { onAuthStateChanged, signInAnonymously } from "firebase/auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

type MigrationStatus = 'pending' | 'uploading' | 'success' | 'error'

interface MigrationItem {
  id: string
  name: string
  code: string
  imageSize: number // rough estimate
  status: MigrationStatus
  error?: string
}

export default function ImageMigrationPage() {
  const [items, setItems] = useState<MigrationItem[]>([])
  const [orphanedItems, setOrphanedItems] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isDev, setIsDev] = useState(false)
  const [authCheck, setAuthCheck] = useState(false)

  useEffect(() => {
    // Simple check: Only allow if running in development environment
    if (process.env.NODE_ENV === 'development') {
      setIsDev(true)
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setIsAuthLoading(false)
      setAuthCheck(true)
    })

    return () => unsub()
  }, [])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMigrating, setIsMigrating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState({ total: 0, cloud: 0, local: 0, orphaned: 0, noImage: 0 })
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const refreshData = async () => {
    setIsLoadingData(true)
    try {
      const prods = await db.products.toArray()
      setAllProducts(prods)
    } catch (e) {
      console.error("Failed to load products", e)
      toast({ title: "Error", description: "Failed to load products from local DB", variant: "destructive" })
    } finally {
      setIsLoadingData(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  // 2. Process products to find candidates and calc stats
  useEffect(() => {
    if (allProducts.length === 0 && isLoadingData) return

    const loadItems = async () => {
      const candidates: MigrationItem[] = []
      const orphans: any[] = []
      let s = { total: allProducts.length, cloud: 0, local: 0, orphaned: 0, noImage: 0 }

      for (const p of allProducts) {
        if (!p.image) {
          s.noImage++;
          continue;
        }

        if (p.image.startsWith('http') || p.image.startsWith('https') || p.image.startsWith('/')) {
          s.cloud++;
          continue;
        }

        let size = 0
        let isCandidate = false
        let isOrphan = false
        let orphanReason = ""

        if (p.image === 'DB_IMAGE') {
          try {
            const rec = await db.productImages.get(p.id)
            size = rec?.data?.length || 0
            if (size > 0) isCandidate = true;
            else {
              isOrphan = true
              orphanReason = "Missing data in productImages table"
            }
          } catch {
            isOrphan = true
            orphanReason = "Error reading productImages table"
          }
        } else if (p.image.length > 50) {
          size = p.image.length
          isCandidate = true
        } else {
          isOrphan = true
          orphanReason = `Invalid image string: "${p.image}"`
        }

        if (isCandidate) {
          s.local++;
          candidates.push({
            id: p.id,
            name: p.productName,
            code: p.productCode || p.itemNumber || '?',
            imageSize: size,
            status: 'pending'
          })
        }

        if (isOrphan) {
          s.orphaned++;
          orphans.push({
            id: p.id,
            name: p.productName,
            code: p.productCode || p.itemNumber || '?',
            reason: orphanReason
          })
        }
      }

      setItems(candidates)
      setOrphanedItems(orphans)
      setStats(s)
    }
    loadItems()
  }, [allProducts, isLoadingData])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectTestBatch = () => {
    const first5 = items.filter(i => i.status === 'pending').slice(0, 5)
    setSelectedIds(new Set(first5.map(i => i.id)))
    toast({ title: "Test Mode", description: "Selected first 5 items for safe testing." })
  }

  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(i => i.id)))
  }

  const migrateSelected = async () => {
    if (!currentUser) {
      toast({
        title: "Not Authenticated",
        description: "You must be signed in to Firebase to upload to Storage. Check the 'Firebase Status' box.",
        variant: "destructive"
      })
      return
    }

    if (!confirm(`Are you sure you want to migrate ${selectedIds.size} images to Firebase Storage?`)) return;

    setIsMigrating(true)
    setProgress(0)
    const idsToProcess = Array.from(selectedIds)
    let completed = 0
    let successCount = 0

    for (const id of idsToProcess) {
      // Update Item Status to Uploading
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'uploading' } : i))

      try {
        // 1. Get Data
        let imageData = ""
        const product = await db.products.get(id)
        if (!product) throw new Error("Product not found")

        if (product.image === 'DB_IMAGE') {
          const rec = await db.productImages.get(id)
          if (rec?.data) imageData = rec.data
        } else {
          imageData = product.image || ""
        }

        if (!imageData) throw new Error("No image data found")

        // 2. Upload to Firebase Storage
        const storageRef = ref(storage, `product-images/${id}`)
        await uploadString(storageRef, imageData, 'data_url')
        const url = await getDownloadURL(storageRef)

        // 3. Update Firestore (Use set merge to be safe)
        const productRef = doc(firestore, COLLECTIONS.PRODUCTS, id)
        await setDoc(productRef, {
          image: url,
          lastSyncedAt: Timestamp.now()
        }, { merge: true })

        // 4. Update Local DB (Clear blob, set URL)
        await db.products.update(id, { image: url })
        if (product.image === 'DB_IMAGE') {
          await db.productImages.delete(id)
        }

        // Success
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'success' } : i))
        successCount++;

      } catch (err: any) {
        console.error(`Migration failed for ${id}`, err)
        let errMsg = err.message
        if (err.code === 'storage/unauthorized') {
          errMsg = "Permission Denied: Ensure your Firebase Storage rules allow writes to 'product-images/' and you are logged in."
        }
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: errMsg } : i))
      }

      completed++
      setProgress((completed / idsToProcess.length) * 100)

      // Artificial delay to prevent overwhelming
      await new Promise(r => setTimeout(r, 500))
    }

    setIsMigrating(false)
    setSelectedIds(new Set()) // Clear selection
    toast({
      title: "Migration Batch Complete",
      description: `Successfully processed ${successCount} of ${idsToProcess.length} images.`,
      variant: successCount === idsToProcess.length ? "default" : "destructive"
    })
  }

  if (!authCheck) return null;

  if (!isDev) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-red-100 p-4 rounded-full mb-4">
          <ShieldCheck className="w-12 h-12 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Restricted Access</h1>
        <p className="text-gray-500 max-w-md">
          This utility is only available in <strong>Development Mode</strong> (localhost) for safety reasons.
          It performs critical data migrations that should be tested carefully.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => window.location.href = '/'}>
          Return Home
        </Button>
      </div>
    )
  }

  const pendingCount = items.filter(i => i.status === 'pending').length
  const successCountVal = items.filter(i => i.status === 'success').length
  const errorCount = items.filter(i => i.status === 'error').length

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <div className="p-2 bg-yellow-100 rounded-full">
          <ShieldCheck className="w-6 h-6 text-yellow-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-yellow-900">⚠️ Developer Image Migration Tool</h1>
          <p className="text-sm text-yellow-700">Running in Development Mode. Use with caution.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={currentUser ? "success" : "destructive" as any} className={currentUser ? "bg-green-100 text-green-800" : ""}>
            {currentUser ? (currentUser.isAnonymous ? "Firebase: Anonymous" : "Firebase: Authenticated") : "Firebase: Disconnected"}
          </Badge>
          {currentUser && (
            <span className="text-[10px] font-mono text-yellow-600 bg-yellow-100/50 px-1 rounded">
              UID: {currentUser.uid}
            </span>
          )}
        </div>
      </div>

      {!currentUser && !isAuthLoading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Firebase Auth Required</AlertTitle>
          <AlertDescription className="flex justify-between items-center">
            <span>You need to be authenticated with Firebase to upload images. Storage rules usually block unauthenticated writes.</span>
            <Button size="sm" variant="outline" onClick={() => signInAnonymously(auth)} className="bg-white">
              Try Guest Login
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gray-50 border-gray-200">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-gray-500">Total Products</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-gray-700">{stats.total}</div></CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-green-600">Cloud Images (OK)</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-green-700">{stats.cloud}</div></CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-blue-600">Candidates (Local)</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-blue-700">{stats.local}</div></CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-gray-500">No Image</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-gray-700">{stats.noImage}</div></CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-orange-600">Orphaned/Error</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-2xl font-bold text-orange-700">{stats.orphaned}</div></CardContent>
        </Card>
      </div>

      {/* Session Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Migrated Now</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-600">{successCountVal}</div><div className="text-xs text-muted-foreground">Successfully converted in this session</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Errors</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-600">{errorCount}</div><div className="text-xs text-muted-foreground">Failed attempts</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Migration Queue</CardTitle>
              <CardDescription>Select images to upload to Firebase Storage.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectTestBatch} disabled={isMigrating || pendingCount === 0}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Test (Safe 5)
              </Button>
              <Button variant="outline" size="sm" onClick={selectAll} disabled={isMigrating || pendingCount === 0}>
                {selectedIds.size === items.length && items.length > 0 ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isMigrating && (
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Migrating...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <ScrollArea className="h-[400px] border rounded-md p-2">
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No Legacy Images Found</p>
                  <p className="text-xs">All products are using optimized URLs.</p>
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} className={`flex items-center p-3 rounded-lg border transition-colors ${selectedIds.has(item.id) ? 'bg-blue-50 border-blue-200' : 'bg-card hover:bg-muted/50'}`}>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      disabled={isMigrating || item.status === 'success'}
                    />
                    <div className="ml-4 flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {item.name}
                        <Badge variant="outline" className="text-xs font-mono">{item.code}</Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-4">
                        <span>Size: {(item.imageSize / 1024).toFixed(1)} KB</span>
                        {item.error && <span className="text-red-500 font-bold">Error: {item.error}</span>}
                      </div>
                    </div>
                    <div className="ml-2">
                      {item.status === 'pending' && <Badge variant="secondary" className="opacity-50">Pending</Badge>}
                      {item.status === 'uploading' && <span className="flex items-center text-blue-600 text-xs font-bold"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Uploading</span>}
                      {item.status === 'success' && <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</Badge>}
                      {item.status === 'error' && <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-4 border-t bg-gray-50/50 flex justify-end gap-3">
          <div className="flex-1 flex items-center text-xs text-muted-foreground">
            <ShieldCheck className="w-3 h-3 mr-1" /> Safe Mode: Updates Cloud & Local DB automatically.
          </div>
          <Button
            onClick={migrateSelected}
            disabled={selectedIds.size === 0 || isMigrating}
            className="w-full sm:w-auto"
          >
            {isMigrating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><UploadCloud className="w-4 h-4 mr-2" /> Convert Selected ({selectedIds.size})</>
            )}
          </Button>
        </div>
      </Card>

      {/* NEW: Orphaned Items List */}
      {orphanedItems.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="bg-orange-50/50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <CardTitle className="text-orange-900">Products with Missing/Broken Images ({orphanedItems.length})</CardTitle>
            </div>
            <CardDescription className="text-orange-700">
              These products have image tags but the actual image data is missing or corrupted. You may need to re-upload images for these.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {orphanedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 rounded border bg-white text-sm">
                    <div className="flex flex-col">
                      <span className="font-bold">{item.name}</span>
                      <span className="text-xs font-mono text-muted-foreground">{item.code}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                      {item.reason}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
