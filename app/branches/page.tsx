"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Search, FileText, Calendar, Filter, Download, Printer, TrendingUp, Package, DollarSign, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getBranches, getIssues, getReturns, getCategories } from "@/lib/storage"
import { useBranchesRealtime, useCategoriesRealtime, useProductsRealtime } from "@/hooks/use-store"
import { useIssues, useReturns } from "@/hooks/use-firestore"
import type { Branch, Issue, Return, Product } from "@/lib/types"
import { generateBranchReportPDF } from "@/lib/branch-pdf-generator"
import { formatArabicGregorianDate, formatEnglishNumber, getNumericInvoiceNumber, formatCurrency } from "@/lib/utils"
import { MultiSelect } from "@/components/ui/multi-select"
import { toast } from "@/hooks/use-toast"

export type InvoiceItem = {
  id: string
  type: 'issue' | 'return'
  branchId: string
  branchName: string
  date: string
  totalValue: number
  productCount: number
  invoiceNumber: string
  products: any[] // items
  status: string // Derived status
}

export default function BranchesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()

  useEffect(() => {
    if (user?.role === 'branch') {
      router.replace('/branch-requests')
    }
  }, [user, router])

  const { data: branches } = useBranchesRealtime() as { data: Branch[] }

  // Use Cloud Data if available (Consistency with Issues Page)
  const { data: cloudIssues } = useIssues()
  const { data: cloudReturns } = useReturns()

  const [localIssues, setLocalIssues] = useState<Issue[]>([])
  const [localReturns, setLocalReturns] = useState<Return[]>([])

  useEffect(() => {
    if (!user) {
      setLocalIssues(getIssues())
      setLocalReturns(getReturns())
    }
  }, [user])

  const issues = user ? cloudIssues : localIssues
  const returns = user ? cloudReturns : localReturns

  // const { data: categoriesList } = useCategoriesRealtime() as { data: { name: string }[] }
  const { data: products } = useProductsRealtime() as { data: Product[] }

  // Derive Categories from Products directly (User Request)
  const categories = useMemo(() => {
    const unique = new Set<string>()
    products.forEach(p => {
      if (p.category) unique.add(p.category)
    })
    return Array.from(unique).sort()
  }, [products])

  // Get unique locations from products
  const locations = useMemo(() => {
    const locs = new Set<string>()
    products.forEach(p => {
      if (p.location) locs.add(p.location)
    })
    return Array.from(locs)
  }, [products])

  // Context State
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]) // New Status Filter
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]) // 'issue', 'return'
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]) // New Product Filter
  const [searchInvoice, setSearchInvoice] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Directory State
  const [dirSearch, setDirSearch] = useState<string>("")

  // Product Lookup Map for fast category/location check
  const productMap = useMemo(() => {
    const map = new Map<string, Product>()
    products.forEach(p => map.set(p.id, p))
    return map
  }, [products])

  // Combine and Filter Data
  const filteredData = useMemo(() => {
    let combined: InvoiceItem[] = []

    // 1. Process Issues (Show All)
    issues.forEach(issue => {
      // Logic to determine status if not set
      let status = 'pending'
      if (issue.delivered || issue.status === 'delivered') status = 'delivered'
      else if (issue.branchReceived) status = 'received'

      combined.push({
        id: issue.id,
        type: 'issue',
        branchId: issue.branchId,
        branchName: issue.branchName,
        date: issue.createdAt,
        totalValue: issue.totalValue,
        productCount: issue.products.length,
        invoiceNumber: getNumericInvoiceNumber(issue.id, new Date(issue.createdAt)),
        products: issue.products,
        status
      })
    })

    // 2. Process Returns (Show pending, approved, completed)
    returns.forEach(ret => {
      const status = ret.status || 'pending'
      if (['pending', 'approved', 'completed'].includes(status)) {
        combined.push({
          id: ret.id,
          type: 'return',
          branchId: ret.branchId,
          branchName: ret.branchName,
          date: ret.createdAt,
          totalValue: ret.totalValue,
          productCount: ret.products.length,
          invoiceNumber: getNumericInvoiceNumber(ret.id, new Date(ret.createdAt)),
          products: ret.products,
          status: status === 'completed' ? 'delivered' : status === 'approved' ? 'received' : 'pending' // Map return statuses
        })
      }
    })

    // 3. Apply Filters
    return combined.filter(item => {
      // Branch Filter
      if (selectedBranches.length > 0 && !selectedBranches.includes(item.branchId)) return false

      // Status Filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status)) return false

      // Type Filter
      if (selectedTypes.length > 0 && !selectedTypes.includes(item.type)) return false

      // Invoice Number Search
      if (searchInvoice && !item.invoiceNumber.includes(searchInvoice)) return false

      // Date Range
      if (startDate) {
        const itemDate = new Date(item.date)
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        if (itemDate < start) return false
      }
      if (endDate) {
        const itemDate = new Date(item.date)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (itemDate > end) return false
      }


      // Category Filter (Check if ANY product in invoice matches selected categories)
      if (selectedCategories.length > 0) {
        // We need to check if ANY of the products in this invoice belongs to one of the selected categories
        const hasCategory = item.products.some(p => {
          // Fallback to p.productId or p.id (sometimes snapshots differ)
          const prodId = p.productId || p.id
          const prod = productMap.get(prodId)
          // If product found in map, use its category. If not, use snapshot category if available.
          const cat = prod?.category || p.category
          return cat && selectedCategories.includes(cat)
        })
        if (!hasCategory) return false
      }

      // Location Filter
      if (selectedLocations.length > 0) {
        const hasLocation = item.products.some(p => {
          const prodId = p.productId || p.id
          const prod = productMap.get(prodId)
          const loc = prod?.location || p.location
          return loc && selectedLocations.includes(loc)
        })
        if (!hasLocation) return false
      }

      // Product Filter (New)
      if (selectedProducts.length > 0) {
        const hasProduct = item.products.some(p => {
          const prodId = p.productId || p.id
          return selectedProducts.includes(prodId)
        })
        if (!hasProduct) return false
      }

      return true
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Newest first

  }, [issues, returns, selectedBranches, selectedStatuses, selectedTypes, selectedCategories, selectedLocations, selectedProducts, searchInvoice, startDate, endDate, productMap])

  // Totals Calculation
  const totals = useMemo(() => {
    const issuesTotal = filteredData.filter(i => i.type === 'issue').reduce((sum, i) => sum + i.totalValue, 0)
    const returnsTotal = filteredData.filter(i => i.type === 'return').reduce((sum, i) => sum + i.totalValue, 0)
    return {
      issues: issuesTotal,
      returns: returnsTotal,
      net: issuesTotal - returnsTotal
    }
  }, [filteredData])


  const handleExportExcel = async (mode: 'summary' | 'detailed') => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      if (mode === 'summary') {
        // Sheet: Summary List
        const summaryRows = filteredData.map(item => ({
          "Invoice #": item.invoiceNumber,
          "Type": item.type === 'issue' ? 'صرف' : 'مرتجع',
          "Branch": item.branchName,
          "Date": formatArabicGregorianDate(new Date(item.date)),
          "Items Count": item.productCount,
          "Total Value": item.totalValue
        }))

        // Add Totals Row
        summaryRows.push({ "Invoice #": "", "Type": "", "Branch": "", "Date": "", "Items Count": 0, "Total Value": 0 })
        summaryRows.push({ "Invoice #": "TOTAL ISSUES (إجمالي الصرف)", "Type": "", "Branch": "", "Date": "", "Items Count": 0, "Total Value": totals.issues })
        summaryRows.push({ "Invoice #": "TOTAL RETURNS (إجمالي المرتجع)", "Type": "", "Branch": "", "Date": "", "Items Count": 0, "Total Value": totals.returns })
        summaryRows.push({ "Invoice #": "NET VALUE (الصافي)", "Type": "", "Branch": "", "Date": "", "Items Count": 0, "Total Value": totals.net })

        const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
        XLSX.utils.book_append_sheet(wb, wsSummary, "Invoices Summary")
      }
      else if (mode === 'detailed') {
        const detailRows: any[] = []
        filteredData.forEach(item => {
          // Apply Product Filter inside details if specific products selected
          const relevantProducts = selectedProducts.length > 0
            ? item.products.filter(p => selectedProducts.includes(p.productId || p.id))
            : item.products

          relevantProducts.forEach(p => {
            const prodId = p.productId || p.id
            const prod = productMap.get(prodId)

            detailRows.push({
              "Invoice #": item.invoiceNumber,
              "Type": item.type === 'issue' ? 'صرف' : 'مرتجع',
              "Branch": item.branchName,
              "Date": formatArabicGregorianDate(new Date(item.date)),
              "Product Code": prod?.productCode || p.productCode || '', // FORCE CURRENT CODE
              "Product Name": p.productName,
              "Category": prod?.category || p.category || '',
              "Location": prod?.location || p.location || '',
              "Quantity": p.quantity,
              "Unit Price": p.unitPrice,
              "Total Price": p.totalPrice
            })
          })
        })

        // Add Totals for Detailed View
        const totalDetailValue = detailRows.reduce((sum, row) => sum + (Number(row["Total Price"]) || 0), 0)
        detailRows.push({})
        detailRows.push({ "Invoice #": "TOTAL VALUE OF LISTED ITEMS", "Total Price": totalDetailValue })

        const wsDetails = XLSX.utils.json_to_sheet(detailRows)
        XLSX.utils.book_append_sheet(wb, wsDetails, "Detailed Items")
      }

      XLSX.writeFile(wb, `Branch_Report_${mode}_${new Date().toISOString().split('T')[0]}.xlsx`)

      toast({
        title: getDualString("toast.success"),
        description: "Exported successfully",
      })

    } catch (error) {
      console.error(error)
      toast({
        title: getDualString("common.error"),
        description: "Failed to export Excel",
        variant: "destructive"
      })
    }
  }

  const handlePrint = (mode: 'summary' | 'detailed') => {
    const enrichedData = filteredData.map(item => ({
      ...item,
      products: item.products.map(p => {
        const prodId = p.productId || p.id
        const prod = productMap.get(prodId)
        return {
          ...p,
          productCode: prod?.productCode || p.productCode, // Current Code
          category: prod?.category || p.category || '',
          location: prod?.location || p.location || ''
        }
      })
    }))

    generateBranchReportPDF(
      { name: "All Branches Report" } as any,
      enrichedData, // Use enriched data
      mode,
      {
        startDate,
        endDate,
        category: selectedCategories.join(', '),
        location: selectedLocations.join(', '),
        selectedBranches: selectedBranches.length > 0 ? selectedBranches.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'All Branches / كل الفروع'
      }
    )
  }

  const handlePrintOne = (item: InvoiceItem) => {
    // Print single invoice
    const enrichedData = [{
      ...item,
      products: item.products.map(p => {
        const prodId = p.productId || p.id
        const prod = productMap.get(prodId)
        return {
          ...p,
          productCode: prod?.productCode || p.productCode, // Current Code
          category: prod?.category || p.category || '',
          location: prod?.location || p.location || ''
        }
      })
    }]

    generateBranchReportPDF(
      { name: item.branchName } as any,
      enrichedData,
      'detailed',
      {
        startDate: item.date,
        endDate: item.date,
        selectedBranches: item.branchName
      }
    )
  }

  if (user?.role === 'branch') return null

  // Filtered branches for directory
  const filteredBranches = branches.filter(branch => {
    const matchesSearch = branch.name.toLowerCase().includes(dirSearch.toLowerCase()) ||
      (branch.manager && branch.manager.toLowerCase().includes(dirSearch.toLowerCase()));
    return matchesSearch;
  })

  // Prepare Product Options for Filter
  const productOptions = useMemo(() => {
    return products.map(p => ({
      label: p.productName + (p.productCode ? ` (${p.productCode})` : ''),
      value: p.id
    }))
  }, [products])

  return (
    <div className="space-y-6">
      <Header
        title={<DualText k="branches.reports.newTitle" fallback="Branch Reports / تقارير الفروع" />}
        description={<DualText k="branches.reports.newDesc" fallback="Advanced reporting, filtering and exports" />}
      />

      <Tabs defaultValue="reports" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reports">
            <FileText className="mr-2 h-4 w-4" />
            <DualText k="branches.tabs.reports" fallback="Reports / التقارير" />
          </TabsTrigger>
          <TabsTrigger value="directory">
            <TrendingUp className="mr-2 h-4 w-4" />
            <DualText k="branches.tabs.directory" fallback="Directory / الدليل" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <span>Filters / الفلاتر</span>
              </CardTitle>
              <CardDescription>
                <span>Filter by branch, Type, Date, Category. showing delivered/approved items only.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* 1. Branch Filter */}
                <div className="space-y-2">
                  <Label>Branch / الفرع</Label>
                  <MultiSelect
                    options={branches.map(b => ({ label: b.name, value: b.id }))}
                    selected={selectedBranches}
                    onChange={setSelectedBranches}
                    placeholder="Select Branches / اختر الفروع"
                  />
                </div>

                {/* 1.5 Status Filter */}
                <div className="space-y-2">
                  <Label>Status / الحالة</Label>
                  <MultiSelect
                    options={[
                      { label: "Pending / معلق", value: "pending" },
                      { label: "Branch Received / استلام فرع", value: "received" },
                      { label: "Delivered / تم التسليم", value: "delivered" }
                    ]}
                    selected={selectedStatuses}
                    onChange={setSelectedStatuses}
                    placeholder="Select Status / اختر الحالة"
                  />
                </div>

                {/* 2. Type Filter */}
                <div className="space-y-2">
                  <Label>Type / النوع</Label>
                  <MultiSelect
                    options={[
                      { label: "Issue / صرف", value: "issue" },
                      { label: "Return / مرتجع", value: "return" }
                    ]}
                    selected={selectedTypes}
                    onChange={setSelectedTypes}
                    placeholder="Select Type / اختر النوع"
                  />
                </div>

                {/* 3. Category Filter */}
                <div className="space-y-2">
                  <Label>Category / التصنيف</Label>
                  <MultiSelect
                    options={categories.map(c => ({ label: c, value: c }))}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    placeholder="Select Categories / اختر التصنيف"
                  />
                </div>

                {/* 4. Location Filter */}
                <div className="space-y-2">
                  <Label>Location / الموقع</Label>
                  <MultiSelect
                    options={locations.map(l => ({ label: l, value: l }))}
                    selected={selectedLocations}
                    onChange={setSelectedLocations}
                    placeholder="Select Locations / اختر الموقع"
                  />
                </div>

                {/* 5. Product Filter (New) */}
                <div className="space-y-2 lg:col-span-2">
                  <Label>Products / المنتجات (Optional)</Label>
                  <MultiSelect
                    options={productOptions}
                    selected={selectedProducts}
                    onChange={setSelectedProducts}
                    placeholder="Select specific products / اختر منتجات محددة"
                  />
                </div>

                {/* 5. Date Range */}
                <div className="space-y-2">
                  <Label>From Date / من تاريخ</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To Date / إلى تاريخ</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>

                {/* 6. Search Invoice */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Invoice Search / بحث رقم الفاتورة</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search invoice number..."
                      className="pl-8"
                      value={searchInvoice}
                      onChange={e => setSearchInvoice(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t p-4 bg-muted/20">
              <div className="text-sm text-muted-foreground">
                Found / العدد: {filteredData.length}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleExportExcel('summary')} disabled={filteredData.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Excel (Summary)
                </Button>
                <Button variant="outline" onClick={() => handleExportExcel('detailed')} disabled={filteredData.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Excel (Detailed)
                </Button>

                <Button variant="outline" onClick={() => handlePrint('summary')} disabled={filteredData.length === 0}>
                  <Printer className="mr-2 h-4 w-4" />
                  PDF (Summary)
                </Button>
                <Button onClick={() => handlePrint('detailed')} disabled={filteredData.length === 0}>
                  <Printer className="mr-2 h-4 w-4" />
                  PDF (Detailed)
                </Button>
              </div>
            </CardFooter>
          </Card>

          {/* Results Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Details / التفاصيل</TableHead>
                  <TableHead>Branch / الفرع</TableHead>
                  <TableHead>Date / التاريخ</TableHead>
                  <TableHead>Items / الأصناف</TableHead>
                  <TableHead className="text-right">Value / القيمة</TableHead>
                  <TableHead className="text-center">Action / إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                      No records found / لا توجد نتائج
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatEnglishNumber(idx + 1)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold">{item.invoiceNumber}</span>
                          <div className="flex gap-1 mt-1">
                            <Badge variant={item.type === 'issue' ? 'default' : 'destructive'} className="w-fit">
                              {item.type === 'issue' ? 'Issue / صرف' : 'Return / مرتجع'}
                            </Badge>
                            <Badge variant="outline" className={`w-fit ${item.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              item.status === 'received' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                              {item.status === 'delivered' ? 'Delivered' : item.status === 'received' ? 'Received' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.branchName}</TableCell>
                      <TableCell>{formatArabicGregorianDate(new Date(item.date))}</TableCell>
                      <TableCell>{formatEnglishNumber(item.productCount)}</TableCell>
                      <TableCell className="text-right font-bold w-[120px]">{formatCurrency(item.totalValue)}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => handlePrintOne(item)} title="Print Invoice / طباعة الفاتورة">
                          <Printer className="h-4 w-4 text-blue-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-slate-100 hover:bg-slate-100">
                  <TableCell colSpan={4} className="font-bold text-lg text-right">TOTALS / الإجماليات</TableCell>
                  <TableCell colSpan={3}>
                    <div className="flex flex-col gap-1 text-right p-2 bg-white rounded border">
                      <div className="flex justify-between text-green-700">
                        <span>Issues / صرف:</span>
                        <span>{formatCurrency(totals.issues)}</span>
                      </div>
                      <div className="flex justify-between text-red-700">
                        <span>Returns / مرتجع:</span>
                        <span>{formatCurrency(totals.returns)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1 font-bold text-blue-800 text-lg">
                        <span>Net / الصافي:</span>
                        <span>{formatCurrency(totals.net)}</span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="directory" className="space-y-4">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Directory Filters / فلاتر الدليل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full">
                  <Label>Search Branch / بحث عن فرع</Label>
                  <div className="relative mt-2">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={dirSearch} onChange={e => setDirSearch(e.target.value)} placeholder="Search by name, manager..." className="pl-8" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {filteredBranches.map(branch => (
                <Card key={branch.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle>{branch.name}</CardTitle>
                      <Badge variant={branch.type === 'main' ? 'default' : 'secondary'}>{branch.type === 'main' ? 'Main' : 'Branch'}</Badge>
                    </div>
                    <CardDescription>{branch.location}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    {branch.manager && <div className="flex items-center gap-2"><div className="w-4 h-4 bg-slate-200 rounded-full" /> {branch.manager}</div>}
                    {branch.phone && <div className="flex items-center gap-2">📞 {branch.phone}</div>}
                    {branch.workingHours && <div className="flex items-center gap-2">🕒 {branch.workingHours}</div>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {branch.services?.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
