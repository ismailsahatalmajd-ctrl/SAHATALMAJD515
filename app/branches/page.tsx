"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Search, FileText, Calendar, TrendingUp, Package, DollarSign, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { DualText } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getBranches, getIssues, getReturns, getCategories } from "@/lib/storage"
import { useBranchesRealtime, useIssuesRealtime, useReturnsRealtime, useCategoriesRealtime } from "@/hooks/use-store"
import type { Branch, Issue, Return } from "@/lib/types"
import { generateBranchReportPDF } from "@/lib/branch-pdf-generator"
import { formatArabicGregorianDate, formatEnglishNumber, getNumericInvoiceNumber } from "@/lib/utils"

export default function BranchesPage() {
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (user?.role === 'branch') {
        router.replace('/branch-requests')
    }
  }, [user, router])

  if (user?.role === 'branch') return null

  const { t } = useI18n()
  const { data: branches } = useBranchesRealtime() as { data: Branch[] }
  const { data: issues } = useIssuesRealtime() as { data: Issue[] }
  const { data: returns } = useReturnsRealtime() as { data: Return[] }
  const { data: categoriesList } = useCategoriesRealtime() as { data: { name: string }[] }
  const categories = categoriesList.map((c) => c.name)

  const [selectedBranchId, setSelectedBranchId] = useState<string>("")
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([])

  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState<string>("")

  // Branch Directory UI state
  const [dirSearch, setDirSearch] = useState<string>("")
  const [dirLocation, setDirLocation] = useState<string>("all")
  const [dirService, setDirService] = useState<string>("all")
  const [dirSort, setDirSort] = useState<string>("name")

  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id)
    }
  }, [branches, selectedBranchId])
  
  // Existing useEffect for filtering
  useEffect(() => {
    if (!selectedBranchId) {
      setFilteredIssues([])
      return
    }

    let filtered = issues.filter((issue) => issue.branchId === selectedBranchId)

    // Filter by date range
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      filtered = filtered.filter((issue) => {
        const issueDate = new Date(issue.createdAt)
        return issueDate >= start && issueDate <= end
      })
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((issue) =>
        issue.products.some((p) => {
          // We need to check product category - for now we'll filter by product name
          return true // This would need product category lookup
        }),
      )
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter((issue) =>
        issue.products.some(
          (p) =>
            p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.productCode.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      )
    }

    setFilteredIssues(filtered)
  }, [selectedBranchId, issues, startDate, endDate, selectedCategory, searchTerm])

  const selectedBranch = branches.find((b) => b.id === selectedBranchId)
  const branchReturns = returns.filter((r) => r.branchId === selectedBranchId)

  const totalIssuesValue = filteredIssues.reduce((sum, issue) => sum + issue.totalValue, 0)
  const totalReturnsValue = branchReturns.reduce((sum, ret) => sum + ret.totalValue, 0)
  const netValue = totalIssuesValue - totalReturnsValue
  const totalProducts = filteredIssues.reduce((sum, issue) => sum + issue.products.length, 0)

  const handlePrintReport = async () => {
    if (!selectedBranch) return
    await generateBranchReportPDF(selectedBranch, filteredIssues, branchReturns, {
      startDate,
      endDate,
      category: selectedCategory,
    })
  }

  // Derived data for Branch Directory
  const locations = Array.from(new Set(branches.map((b) => b.location).filter(Boolean)))
  const servicesAll = Array.from(new Set(branches.flatMap((b) => b.services || [])))

  const filteredBranchesDir = branches
    .filter((b) => {
      const matchesLocation = dirLocation === "all" || b.location === dirLocation
      const matchesService =
        dirService === "all" || (b.services || []).map((s) => s.toLowerCase()).includes(dirService.toLowerCase())
      const search = dirSearch.trim().toLowerCase()
      const matchesSearch =
        !search ||
        [b.name, b.address || "", b.manager || "", b.phone || "", b.contactEmail || ""].some((field) =>
          field.toLowerCase().includes(search),
        )
      return matchesLocation && matchesService && matchesSearch
    })
    .sort((a, b) => {
      if (dirSort === "location") return a.location.localeCompare(b.location)
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="directory" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="directory"><DualText k="branches.tabs.directory" /></TabsTrigger>
              <TabsTrigger value="report"><DualText k="branches.tabs.report" /></TabsTrigger>
            </TabsList>
          </div>

          {/* Branch Directory Tab */}
          <TabsContent value="directory" className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold"><DualText k="branches.directory.title" /></h1>
              <p className="text-muted-foreground"><DualText k="branches.directory.subtitle" /></p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle><DualText k="branches.directory.title" /></CardTitle>
                <CardDescription><DualText k="branches.directory.subtitle" /></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2 lg:col-span-2">
                    <Label><DualText k="branches.directory.search" /></Label>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t("common.search.general")}
                        value={dirSearch}
                        onChange={(e) => setDirSearch(e.target.value)}
                        className="pr-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label><DualText k="branches.directory.filters.location" /></Label>
                    <Select value={dirLocation} onValueChange={setDirLocation}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"><DualText k="reports.filters.allLocations" /></SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label><DualText k="branches.directory.filters.service" /></Label>
                    <Select value={dirService} onValueChange={setDirService}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"><DualText k="branches.directory.filters.allServices" /></SelectItem>
                        {servicesAll.map((srv) => (
                          <SelectItem key={srv} value={srv}>{srv}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label><DualText k="branches.directory.sort.label" /></Label>
                    <Select value={dirSort} onValueChange={setDirSort}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name"><DualText k="branches.directory.sort.name" /></SelectItem>
                        <SelectItem value="location"><DualText k="branches.directory.sort.location" /></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredBranchesDir.length === 0 ? (
                <div className="col-span-full text-center text-muted-foreground">
                  <DualText k="branches.directory.empty" />
                </div>
              ) : (
                filteredBranchesDir.map((b) => (
                  <Card key={b.id} className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{b.name}</span>
                        <Badge variant="outline">{b.location}</Badge>
                      </CardTitle>
                      <CardDescription>
                        <DualText k="branches.directory.card.address" />: {b.address || <DualText k="common.unknown" />}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <span className="font-medium"><DualText k="branches.directory.card.workingHours" />: </span>
                        <span>{b.workingHours || <DualText k="common.unknown" />}</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium"><DualText k="branches.directory.card.contact" />: </span>
                        <span>
                          {[b.phone, b.contactEmail].filter(Boolean).join(" · ") || <DualText k="common.unknown" />}
                        </span>
                      </div>
                      {(b.services && b.services.length > 0) && (
                        <div className="space-y-1">
                          <div className="text-sm font-medium"><DualText k="branches.directory.card.services" /></div>
                          <div className="flex flex-wrap gap-2">
                            {b.services!.map((srv) => (
                              <Badge key={srv} variant="secondary">{srv}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(b.events && b.events.length > 0) && (
                        <div className="space-y-1">
                          <div className="text-sm font-medium"><DualText k="branches.directory.card.events" /></div>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            {b.events!.map((ev, idx) => (
                              <li key={idx}>
                                <span className="font-medium">{ev.title}</span>
                                {ev.date ? ` — ${new Date(ev.date).toLocaleDateString()}` : ""}
                                {ev.description ? `: ${ev.description}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" onClick={() => router.push(`/branch/${b.id}`)}>
                        <LogIn className="w-4 h-4 ml-2" />
                        <DualText k="branches.directory.card.enter" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Branch Reports Tab */}
          <TabsContent value="report">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold"><DualText k="branches.report.title" /></h1>
                  <p className="text-muted-foreground"><DualText k="branches.report.subtitle" /></p>
                </div>
                <Button onClick={handlePrintReport} disabled={!selectedBranchId}>
                  <FileText className="ml-2 h-4 w-4" />
                  <DualText k="branches.report.printPdf" />
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle><DualText k="branches.report.filters.title" /></CardTitle>
                  <CardDescription><DualText k="branches.report.filters.desc" /></CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-2">
                      <Label><DualText k="branches.report.filters.branch" /></Label>
                      <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("branches.report.filters.selectBranch")} />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label><DualText k="branches.report.filters.from" /></Label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label><DualText k="branches.report.filters.to" /></Label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label><DualText k="branches.report.filters.category" /></Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all"><DualText k="branches.report.filters.allCategories" /></SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label><DualText k="branches.report.filters.search" /></Label>
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={t("branches.search.products")}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pr-10"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedBranch && (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium"><DualText k="branches.totalIssues" /></CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalIssuesValue.toFixed(2)} <DualText k="common.currency" /></div>
                        <p className="text-xs text-muted-foreground">{filteredIssues.length} <DualText k="issues.metrics.operationsLabel" /></p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium"><DualText k="branches.returns" /></CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalReturnsValue.toFixed(2)} <DualText k="common.currency" /></div>
                        <p className="text-xs text-muted-foreground">{branchReturns.length} <DualText k="issues.metrics.returnOperationsLabel" /></p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium"><DualText k="branches.report.metrics.net" /></CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-primary">{formatEnglishNumber(netValue.toFixed(2))} <DualText k="common.currency" /></div>
                        <p className="text-xs text-muted-foreground"><DualText k="branches.report.metrics.afterReturns" /></p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium"><DualText k="branches.report.metrics.products" /></CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalProducts}</div>
                        <p className="text-xs text-muted-foreground"><DualText k="branches.report.metrics.issuedProduct" /></p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle><DualText k="branches.report.table.issues" /></CardTitle>
                      <CardDescription><DualText k="branches.report.filters.desc" /></CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead><DualText k="branches.report.table.columns.operation" /></TableHead>
                              <TableHead><DualText k="branches.report.table.columns.date" /></TableHead>
                              <TableHead><DualText k="branches.report.table.columns.productsCount" /></TableHead>
                              <TableHead><DualText k="branches.report.table.columns.value" /></TableHead>
                              <TableHead><DualText k="branches.report.table.columns.notes" /></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredIssues.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  <DualText k="branches.report.table.empty.issues" />
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredIssues.map((issue) => (
                                <TableRow key={issue.id}>
                                  <TableCell className="font-medium">#{issue.id.slice(-6)}</TableCell>
                                  <TableCell>{formatArabicGregorianDate(new Date(issue.createdAt))}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{issue.products.length} <DualText k="common.product" /></Badge>
                                  </TableCell>
                                  <TableCell className="font-semibold">{formatEnglishNumber(issue.totalValue.toFixed(2))} <DualText k="common.currency" /></TableCell>
                                  <TableCell className="text-muted-foreground">{issue.notes || "-"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {branchReturns.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle><DualText k="branches.report.table.returns" /></CardTitle>
                        <CardDescription><DualText k="branches.report.filters.desc" /></CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead><DualText k="issues.table.returns.columns.id" /></TableHead>
                                <TableHead><DualText k="issues.table.returns.columns.date" /></TableHead>
                                <TableHead><DualText k="issues.table.returns.columns.productsCount" /></TableHead>
                                <TableHead><DualText k="issues.table.returns.columns.value" /></TableHead>
                                <TableHead><DualText k="issues.table.returns.columns.reason" /></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {branchReturns.map((returnItem) => (
                                <TableRow key={returnItem.id}>
                                  <TableCell className="font-medium">#{returnItem.id.slice(-6)}</TableCell>
                                  <TableCell>{formatArabicGregorianDate(new Date(returnItem.createdAt))}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{returnItem.products.length} <DualText k="common.product" /></Badge>
                                  </TableCell>
                                  <TableCell className="font-semibold">{formatEnglishNumber(returnItem.totalValue.toFixed(2))} <DualText k="common.currency" /></TableCell>
                                  <TableCell className="text-muted-foreground">{returnItem.reason}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
