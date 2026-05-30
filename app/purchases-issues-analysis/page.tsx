"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar, Filter, Download, ChevronDown } from "lucide-react"
import { db } from "@/lib/db"
import { useI18n } from "@/components/language-provider"
import { useAuth } from "@/components/auth-provider"
import { formatNumberWithSeparators } from "@/lib/utils"

type ViewMode = "summary" | "detailed"
type Period = "all" | "day" | "week" | "month" | "custom"
type DataType = "both" | "purchases" | "issues"

export default function PurchasesIssuesAnalysisPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const isRTL = t("common.dir") === "rtl"

  const [viewMode, setViewMode] = useState<ViewMode>("summary")
  const [period, setPeriod] = useState<Period>("all")
  const [startDate, setStartDate] = useState<string>("2000-01-01")
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [dataType, setDataType] = useState<DataType>("both")
  const [productsPopoverOpen, setProductsPopoverOpen] = useState(false)
  const [branchesPopoverOpen, setBranchesPopoverOpen] = useState(false)
  const [locationsPopoverOpen, setLocationsPopoverOpen] = useState(false)
  const [productSearch, setProductSearch] = useState<string>("")
  const [branchSearch, setBranchSearch] = useState<string>("")
  const [locationSearch, setLocationSearch] = useState<string>("")

  const products = useLiveQuery(() => db.products.toArray())
  const issues = useLiveQuery(() => db.issues.toArray())
  const branches = useLiveQuery(() => db.branches.toArray())

  const uniqueLocations = useMemo(() => {
    if (!products) return []
    const locations = new Set<string>()
    products.forEach(p => {
      if (p.location) locations.add(p.location)
    })
    return Array.from(locations).sort()
  }, [products])

  const filteredData = useMemo(() => {
    if (!products || !issues) return null

    let deliveredIssues = issues.filter(i => i.delivered === true)
    let start: Date
    let end: Date
    
    if (period === "all") {
      const issueDates = deliveredIssues.map(i => new Date(i.createdAt))
      start = issueDates.length > 0 ? new Date(Math.min(...issueDates.map(d => d.getTime()))) : new Date("2000-01-01")
      end = new Date()
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else {
      start = new Date(startDate)
      end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      start.setHours(0, 0, 0, 0)
      
      deliveredIssues = deliveredIssues.filter(i => {
        const issueDate = new Date(i.createdAt)
        const issueDateOnly = new Date(issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate())
        const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate())
        
        return issueDateOnly >= startOnly && issueDateOnly <= endOnly
      })
    }

    if (selectedBranchIds.length > 0) {
      deliveredIssues = deliveredIssues.filter(i => selectedBranchIds.includes(i.branchId))
    }

    const productData: any[] = []

    products.forEach(product => {
      if (selectedProductIds.length > 0 && !selectedProductIds.includes(product.id)) return
      if (selectedLocations.length > 0 && !selectedLocations.includes(product.location)) return

      const productIssues = deliveredIssues.filter(i => i.products.some(ip => ip.productId === product.id))
      const totalIssuesQty = productIssues.reduce((sum, i) => {
        return sum + i.products.filter(ip => ip.productId === product.id).reduce((s, ip) => s + Number(ip.quantity || 0), 0)
      }, 0)

      const branchData: any[] = []
      if (branches) {
        branches.forEach(branch => {
          const branchIssues = productIssues.filter(i => i.branchId === branch.id)
          const branchIssuesQty = branchIssues.reduce((sum, i) => {
            return sum + i.products.filter(ip => ip.productId === product.id).reduce((s, ip) => s + Number(ip.quantity || 0), 0)
          }, 0)

          branchData.push({
            branch,
            issuesQty: branchIssuesQty,
            issues: branchIssues
          })
        })
      }

      const totalPurchasesQty = Number(product.purchases || 0)

      const daysInPeriod = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
      const weeksInPeriod = Math.ceil(daysInPeriod / 7)
      const monthsInPeriod = Math.ceil(daysInPeriod / 30)

      const dailyIssues = daysInPeriod > 0 ? totalIssuesQty / daysInPeriod : 0
      const weeklyIssues = weeksInPeriod > 0 ? totalIssuesQty / weeksInPeriod : 0
      const monthlyIssues = monthsInPeriod > 0 ? totalIssuesQty / monthsInPeriod : 0

      const dailyPurchases = daysInPeriod > 0 ? totalPurchasesQty / daysInPeriod : 0
      const weeklyPurchases = weeksInPeriod > 0 ? totalPurchasesQty / weeksInPeriod : 0
      const monthlyPurchases = monthsInPeriod > 0 ? totalPurchasesQty / monthsInPeriod : 0

      const deviationRate = dailyPurchases > 0 ? ((dailyIssues - dailyPurchases) / dailyPurchases) * 100 : 0

      productData.push({
        product,
        totalIssuesQty,
        totalPurchasesQty,
        dailyIssues,
        weeklyIssues,
        monthlyIssues,
        dailyPurchases,
        weeklyPurchases,
        monthlyPurchases,
        deviationRate,
        issues: productIssues,
        branchData
      })
    })

    return productData
  }, [products, issues, branches, startDate, endDate, selectedProductIds, selectedBranchIds, selectedLocations, period])

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    )
  }

  const toggleBranchSelection = (branchId: string) => {
    setSelectedBranchIds(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    )
  }

  const toggleLocationSelection = (location: string) => {
    const newLocations = selectedLocations.includes(location) 
      ? selectedLocations.filter(l => l !== location) 
      : [...selectedLocations, location]
    setSelectedLocations(newLocations)
    
    if (products) {
      const validProductIds = products
        .filter(p => newLocations.length === 0 || newLocations.includes(p.location))
        .map(p => p.id)
      setSelectedProductIds(prev => prev.filter(id => validProductIds.includes(id)))
    }
  }

  const selectAllProducts = () => {
    if (!products) return
    const filteredProducts = products.filter(p => 
      selectedLocations.length === 0 || selectedLocations.includes(p.location)
    )
    setSelectedProductIds(filteredProducts.map(p => p.id))
  }

  const clearProductSelection = () => {
    setSelectedProductIds([])
  }

  const selectAllBranches = () => {
    if (!branches) return
    setSelectedBranchIds(branches.map(b => b.id))
  }

  const clearBranchSelection = () => {
    setSelectedBranchIds([])
  }

  const selectAllLocations = () => {
    setSelectedLocations(uniqueLocations)
  }

  const clearLocationSelection = () => {
    setSelectedLocations([])
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">تحليل المشتريات والمصروفات<br/>purchases and issues analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">نوع العرض<br/>view mode</label>
              <Select value={viewMode} onValueChange={(v: ViewMode) => setViewMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">جدول مختصر<br/>summary</SelectItem>
                  <SelectItem value="detailed">جدول مفصل<br/>detailed table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الفترة الزمنية<br/>time period</label>
              <Select value={period} onValueChange={(v: Period) => {
                setPeriod(v)
                const now = new Date()
                if (v === "all") {
                  setStartDate("2000-01-01")
                  setEndDate(now.toISOString().split("T")[0])
                } else if (v === "day") {
                  const date = now.toISOString().split("T")[0]
                  setStartDate(date)
                  setEndDate(date)
                } else if (v === "week") {
                  const weekStart = new Date(now)
                  weekStart.setDate(now.getDate() - now.getDay())
                  weekStart.setHours(0,0,0,0)
                  setStartDate(weekStart.toISOString().split("T")[0])
                  setEndDate(now.toISOString().split("T")[0])
                } else if (v === "month") {
                  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
                  setStartDate(monthStart.toISOString().split("T")[0])
                  setEndDate(now.toISOString().split("T")[0])
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل<br/>All</SelectItem>
                  <SelectItem value="day">يوم<br/>Day</SelectItem>
                  <SelectItem value="week">أسبوع<br/>week</SelectItem>
                  <SelectItem value="month">شهر<br/>month</SelectItem>
                  <SelectItem value="custom">تحديد مخصص</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {period === "custom" && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">من تاريخ<br/>start date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">إلى تاريخ<br/>end date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">نوع البيانات<br/>data type</label>
              <Select value={dataType} onValueChange={(v: DataType) => setDataType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">الكل<br/>All</SelectItem>
                  <SelectItem value="purchases">المشتريات<br/>Purchases</SelectItem>
                  <SelectItem value="issues">المصروفات<br/>Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">المنتجات<br/>products</label>
                <Button size="sm" variant="outline" onClick={selectAllProducts}>تحديد الكل<br/>select all</Button>
                <Button size="sm" variant="outline" onClick={clearProductSelection}>مسح التحديد<br/>clear selection</Button>
                <Popover open={productsPopoverOpen} onOpenChange={setProductsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
                      <span>اختر المنتجات<br/>select product</span>
                      <ChevronDown className="w-4 h-4" />
                      {selectedProductIds.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{selectedProductIds.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[90vw] max-h-96 overflow-y-auto">
                    <div className="space-y-2 p-2">
                      <Input
                        placeholder="ابحث عن منتج/location..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {products
                          ?.filter(product => 
                            product.productName.toLowerCase().includes(productSearch.toLowerCase()) &&
                            (selectedLocations.length === 0 || selectedLocations.includes(product.location))
                          )
                          .map(product => (
                            <div
                              key={product.id}
                              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => toggleProductSelection(product.id)}
                            >
                              <Checkbox checked={selectedProductIds.includes(product.id)} />
                              <span className="text-sm truncate">{product.productName}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">الفروع<br/>Branches</label>
                <Button size="sm" variant="outline" onClick={selectAllBranches}>تحديد الكل<br/>Select All</Button>
                <Button size="sm" variant="outline" onClick={clearBranchSelection}>مسح التحديد<br/>Clear All</Button>
                <Popover open={branchesPopoverOpen} onOpenChange={setBranchesPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
                      <span>اختر الفروع<br/>Select Branch</span>
                      <ChevronDown className="w-4 h-4" />
                      {selectedBranchIds.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{selectedBranchIds.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[90vw] max-h-96 overflow-y-auto">
                    <div className="space-y-2 p-2">
                      <Input
                        placeholder="ابحث عن فرع/branchSearch"
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                      />
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {branches
                          ?.filter(branch => 
                            branch.name.toLowerCase().includes(branchSearch.toLowerCase())
                          )
                          .map(branch => (
                            <div
                              key={branch.id}
                              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => toggleBranchSelection(branch.id)}
                            >
                              <Checkbox checked={selectedBranchIds.includes(branch.id)} />
                              <span className="text-sm truncate">{branch.name}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">المواقع<br/>Locations</label>
                <Button size="sm" variant="outline" onClick={selectAllLocations}>تحديد الكل<br/>Select All</Button>
                <Button size="sm" variant="outline" onClick={clearLocationSelection}>مسح التحديد<br/>Clear All</Button>
                <Popover open={locationsPopoverOpen} onOpenChange={setLocationsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
                      <span>اختر المواقع<br/>select Locations</span>
                      <ChevronDown className="w-4 h-4" />
                      {selectedLocations.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{selectedLocations.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[90vw] max-h-96 overflow-y-auto">
                    <div className="space-y-2 p-2">
                      <Input
                        placeholder="ابحث عن موقع/location Search"
                        value={locationSearch}
                        onChange={(e) => setLocationSearch(e.target.value)}
                      />
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {uniqueLocations
                          ?.filter(location => 
                            location.toLowerCase().includes(locationSearch.toLowerCase())
                          )
                          .map(location => (
                            <div
                              key={location}
                              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => toggleLocationSelection(location)}
                            >
                              <Checkbox checked={selectedLocations.includes(location)} />
                              <span className="text-sm truncate">{location}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {viewMode === "summary" ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>جدول مختصر<br/>summary table</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-50 shadow-lg">
                <tr className="border-b-2 border-gray-300">
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white sticky left-0 z-40">اسم المنتج<br/>product name</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white sticky left-28 z-40">الموقع<br/>location</th>
                  {(dataType === "both" || dataType === "purchases") && (
                    <>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المشتريات الكلية<br/>all purchases</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المشتريات اليومية<br/>daily purchases</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المشتريات الأسبوعية<br/>weekly purchases</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المشتريات الشهرية<br/>monthly purchases</th>
                    </>
                  )}
                  {(dataType === "both" || dataType === "issues") && (
                    <>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المصروفات الكلية<br/>all issues</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المصروفات اليومية<br/>daily issues</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المصروفات الأسبوعية<br/>weekly issues</th>
                      <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">المصروفات الشهرية<br/>monthly issues</th>
                    </>
                  )}
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">معدل الانحراف<br/>turnover rate</th>
                  {selectedBranchIds.length > 0 ? (
                    <>
                      {branches?.filter(b => selectedBranchIds.includes(b.id)).map(branch => (
                        <th key={branch.id} className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white text-xs">{branch.name} - المصروفات</th>
                      ))}
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredData?.map((data, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 align-middle whitespace-nowrap font-medium text-center bg-white sticky left-0 z-10">{data.product.productName}</td>
                    <td className="p-2 align-middle whitespace-nowrap text-center bg-white sticky left-28 z-10">{data.product.location || "-"}</td>
                    {(dataType === "both" || dataType === "purchases") && (
                      <>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.totalPurchasesQty))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.dailyPurchases))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.weeklyPurchases))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.monthlyPurchases))}</td>
                      </>
                    )}
                    {(dataType === "both" || dataType === "issues") && (
                      <>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.totalIssuesQty))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.dailyIssues))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.weeklyIssues))}</td>
                        <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Math.round(data.monthlyIssues))}</td>
                      </>
                    )}
                    <td className="p-2 align-middle whitespace-nowrap text-center">
                      <span className={data.deviationRate > 0 ? "text-red-600" : data.deviationRate < 0 ? "text-green-600" : ""}>
                        {data.deviationRate.toFixed(2)}%
                      </span>
                    </td>
                    {data.branchData?.filter((bd: any) => 
                      selectedBranchIds.length === 0 || selectedBranchIds.includes(bd.branch.id)
                    ).map((bd: any) => (
                      <td key={bd.branch.id} className="p-2 align-middle whitespace-nowrap text-center text-xs">
                        {formatNumberWithSeparators(Math.round(bd.issuesQty))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>جدول مفصل - المصروفات</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-50 shadow-lg">
                <tr className="border-b-2 border-gray-300">
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">تاريخ<br/>date</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">الفرع<br/>branch</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white sticky left-0 z-40">الموقع<br/>location</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white sticky left-28 z-40">اسم المنتج<br/>product name</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">الكمية المصروف<br/>total issues</th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap bg-white">رقم الفاتورة<br/>invoice number</th>
                </tr>
              </thead>
              <tbody>
                {filteredData?.flatMap((data, dataIndex) =>
                  data.issues
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((issue: any, issueIndex: number) => {
                      const item = issue.products.find((ip: any) => ip.productId === data.product.id)
                      const branch = branches?.find(b => b.id === issue.branchId)
                      return (
                        <tr key={`${dataIndex}-${issueIndex}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-2 align-middle whitespace-nowrap text-center">{new Date(issue.createdAt).toLocaleDateString()}</td>
                          <td className="p-2 align-middle whitespace-nowrap text-center">{branch?.name || "-"}</td>
                          <td className="p-2 align-middle whitespace-nowrap text-center bg-white sticky left-0 z-10">{data.product.location || "-"}</td>
                          <td className="p-2 align-middle whitespace-nowrap text-center bg-white sticky left-28 z-10">{data.product.productName}</td>
                          <td className="p-2 align-middle whitespace-nowrap text-center">{formatNumberWithSeparators(Number(item?.quantity || 0))}</td>
                          <td className="p-2 align-middle whitespace-nowrap text-center">{issue.id}</td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
