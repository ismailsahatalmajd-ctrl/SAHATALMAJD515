"use client"

import { useState, useMemo, useEffect } from "react"
import { Users, Clock, Plus, Calendar, Save, Trash2, Printer, Calculator, ChevronRight, ChevronLeft, Check, X, Search, Building2 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/components/language-provider"
import { Header } from "@/components/header"
import { useToast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useAuth } from "@/components/auth-provider"
import { 
  addEmployee, 
  addOvertimeReason, 
  addOvertimeEntry, deleteOvertimeEntry
} from "@/lib/storage"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { convertNumbersToEnglish, cn } from "@/lib/utils"
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns"
import { generateOvertimePDF, generateOvertimeReportPDF } from "@/lib/overtime-pdf-generator"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function OvertimePage() {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()
  
  // Data fetching
  const employees = useLiveQuery(() => db.employees.toArray()) || []
  const reasons = useLiveQuery(() => db.overtimeReasons.toArray()) || []
  const entries = useLiveQuery(() => db.overtimeEntries.toArray()) || []
  const branches = useLiveQuery(() => db.branches.toArray()) || []

  // Seed Data
  useEffect(() => {
    const seed = async () => {
      const existingEmployees = await db.employees.toArray()
      if (!existingEmployees.some(e => e.name.includes("Sohel Rana"))) {
        const names = [
          { en: "Sohel Rana", ar: "سهيل رانا" },
          { en: "Qamar Ul Haq", ar: "قمر الحق" },
          { en: "Kashem", ar: "قاسم" },
          { en: "Forhad", ar: "فرهاد" },
          { en: "Ismail Khan", ar: "إسماعيل خان" },
          { en: "Shamrez", ar: "شامريز" },
          { en: "Litan", ar: "ليتان" },
          { en: "Makkaram", ar: "مكرم" },
          { en: "Bahador", ar: "بهادر" }
        ]
        for (const nameObj of names) {
          const name = lang === 'ar' ? `${nameObj.ar} (${nameObj.en})` : `${nameObj.en} (${nameObj.ar})`
          await addEmployee({ name, department: "Warehouse" })
        }
      }

      const existingReasons = await db.overtimeReasons.toArray()
      if (!existingReasons.some(r => r.name.includes("Late Finish Work"))) {
        const reasonNames = [
          { en: "Late Finish Work And Late Sugar Received", ar: "تأخر انتهاء العمل واستلام السكر" },
          { en: "Container Unloading and Late Factory", ar: "تفريغ الحاوية وتأخر المصنع" },
          { en: "Jeddah Tabok Anad factory Order Issue", ar: "مشكلة طلب مصنع جدة تبوك عناد" },
          { en: "Hanoverian 1 And Tobuk Order Issue", ar: "مشكلة طلب هانوفرين 1 وتبوك" },
          { en: "Friday Work", ar: "عمل يوم الجمعة" }
        ]
        for (const r of reasonNames) {
          const name = lang === 'ar' ? `${r.ar} / ${r.en}` : `${r.en} / ${r.ar}`
          await addOvertimeReason(name)
        }
      }
    }
    seed()
  }, [lang])

  // Form State
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [newEmployeeName, setNewEmployeeName] = useState("")
  const [showNewEmployeeInput, setShowNewEmployeeInput] = useState(false)

  const [selectedReasonIds, setSelectedReasonIds] = useState<string[]>([])
  const [newReasonName, setNewReasonName] = useState("")
  const [showNewReasonInput, setShowNewReasonInput] = useState(false)

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [fromTime, setFromTime] = useState("16:00")
  const [toTime, setToTime] = useState("22:00")
  const [notes, setNotes] = useState("")

  // Edit State
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)
  const [editEmployeeName, setEditEmployeeName] = useState("")
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null)
  const [editReasonName, setEditReasonName] = useState("")

  // Filter State
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"))
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])

  // Calculations
  const calculateHours = (from: string, to: string) => {
    const [h1, m1] = from.split(":").map(Number)
    const [h2, m2] = to.split(":").map(Number)
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1)
    if (diff < 0) diff += 24 * 60
    return Number((diff / 60).toFixed(2))
  }

  const hoursPerPerson = useMemo(() => calculateHours(fromTime, toTime), [fromTime, toTime])
  const grandTotalHours = hoursPerPerson * selectedEmployeeIds.length

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchMonth = entry.date?.startsWith(filterMonth) ?? false
      let matchEmployee = filterEmployeeId === "all"
      if (!matchEmployee) {
        matchEmployee = entry.employeeIds?.includes(filterEmployeeId) || (entry as any).employeeId === filterEmployeeId
      }
      
      const searchLower = searchTerm.toLowerCase()
      const matchSearch = searchTerm === "" || 
        entry.employeeNames?.some(name => name.toLowerCase().includes(searchLower)) ||
        entry.reasons?.some(r => r.toLowerCase().includes(searchLower)) ||
        entry.date?.includes(searchTerm)
        
      return matchEmployee && matchMonth && matchSearch
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [entries, filterEmployeeId, filterMonth, searchTerm])

  const reportEntries = useMemo(() => {
    return selectedRowIds.length > 0 
      ? filteredEntries.filter(e => selectedRowIds.includes(e.id))
      : filteredEntries
  }, [filteredEntries, selectedRowIds])

  const reportTotalHours = useMemo(() => {
    if (filterEmployeeId === "all") {
       return reportEntries.reduce((sum, entry) => {
         const count = entry.employeeIds?.length || 1
         return sum + (entry.grandTotalHours || (entry.totalHours || 0) * count)
       }, 0)
    } else {
       return reportEntries.reduce((sum, entry) => sum + (entry.totalHours || 0), 0)
    }
  }, [reportEntries, filterEmployeeId])

  // Handlers
  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }
  const toggleReason = (name: string) => {
    setSelectedReasonIds(prev => prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name])
  }

  const handleAddEmployee = async () => {
    if (!newEmployeeName.trim()) return
    const emp = await addEmployee({ name: newEmployeeName.trim(), department: "Warehouse" })
    setSelectedEmployeeIds(prev => [...prev, emp.id])
    setNewEmployeeName("")
    setShowNewEmployeeInput(false)
    toast({ title: t("hr.employee.success") })
  }

  const handleAddReason = async () => {
    if (!newReasonName.trim()) return
    const reason = await addOvertimeReason(newReasonName.trim())
    setSelectedReasonIds(prev => [...prev, reason.name])
    setNewReasonName("")
    setShowNewReasonInput(false)
    toast({ title: t("hr.overtime.reason.success") })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedEmployeeIds.length === 0) {
      toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
      return
    }
    const selectedEmployees = employees.filter(e => selectedEmployeeIds.includes(e.id))
    const employeeNames = selectedEmployees.map(e => e.name)
    await addOvertimeEntry({
      employeeIds: selectedEmployeeIds,
      employeeNames: employeeNames,
      department: "Warehouse",
      date, fromTime, toTime,
      totalHours: hoursPerPerson,
      grandTotalHours: grandTotalHours,
      reasons: selectedReasonIds,
      status: 'approved',
      branchId: (user as any)?.branchId || undefined
    })
    toast({ title: t("hr.overtime.success") })
    setSelectedEmployeeIds([])
    setSelectedReasonIds([])
  }

  const handleUpdateEmployee = async (id: string) => {
    if (!editEmployeeName.trim()) return
    await db.employees.update(id, { name: editEmployeeName.trim() })
    setEditingEmployeeId(null)
    toast({ title: "تم التحديث" })
  }
  const handleDeleteEmployee = async (id: string) => {
    if (confirm("حذف الموظف؟")) { await db.employees.delete(id); toast({ title: "تم الحذف" }); }
  }
  const handleUpdateReason = async (id: string) => {
    if (!editReasonName.trim()) return
    await db.overtimeReasons.update(id, { name: editReasonName.trim() })
    setEditingReasonId(null)
    toast({ title: "تم التحديث" })
  }
  const handleDeleteReason = async (id: string) => {
    if (confirm("حذف السبب؟")) { await db.overtimeReasons.delete(id); toast({ title: "تم الحذف" }); }
  }
  const handleDeleteEntry = async (id: string) => {
    if (confirm("هل أنت متأكد من الحذف؟")) { await deleteOvertimeEntry(id); toast({ title: "تم الحذف" }); }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <DualText k="hr.overtime.title" />
            </h1>
            <p className="text-muted-foreground text-base mt-1"><DualText k="hr.overtime.subtitle" /></p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* Top: Form */}
          <Card className="shadow-xl border-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/5 py-4 border-b">
              <CardTitle className="text-xl font-bold flex items-center gap-3">
                <Plus className="h-6 w-6 text-primary" /> تسجيل سجل جديد / Add New Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <Label className="font-black text-lg underline decoration-primary/30 underline-offset-4">الموظفون / Employees</Label>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0 rounded-full" onClick={() => setShowNewEmployeeInput(!showNewEmployeeInput)}>
                        {showNewEmployeeInput ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="h-10 text-sm font-bold px-4" onClick={() => setSelectedEmployeeIds(employees.map(e => e.id))}>تحديد الكل / Select All</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-10 text-sm font-bold px-4 text-destructive hover:bg-destructive/5" onClick={() => setSelectedEmployeeIds([])}>مسح / Clear</Button>
                    </div>
                  </div>
                  
                  {showNewEmployeeInput && (
                    <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <Input placeholder="اسم الموظف الجديد" value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} className="h-12 text-base shadow-inner"/>
                      <Button type="button" className="h-12 px-6 font-bold" onClick={handleAddEmployee}><Plus className="h-5 w-5 ml-2"/> إضافة</Button>
                    </div>
                  )}

                  <ScrollArea className="h-[400px] border-2 rounded-xl p-4 bg-slate-50/50 shadow-inner">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 hover:bg-white p-3 rounded-lg transition-all group border border-transparent hover:border-primary/20 hover:shadow-sm">
                          {editingEmployeeId === emp.id ? (
                            <div className="flex gap-2 w-full animate-in zoom-in-95 duration-200">
                              <Input size={1} value={editEmployeeName} onChange={e => setEditEmployeeName(e.target.value)} className="h-10 text-base font-medium flex-1"/>
                              <Button size="icon" className="h-10 w-10" onClick={() => handleUpdateEmployee(emp.id)}><Check className="h-5 w-5"/></Button>
                              <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setEditingEmployeeId(null)}><X className="h-5 w-5"/></Button>
                            </div>
                          ) : (
                            <>
                              <Checkbox id={`emp-${emp.id}`} className="h-6 w-6 border-2" checked={selectedEmployeeIds.includes(emp.id)} onCheckedChange={() => toggleEmployee(emp.id)}/>
                              <label htmlFor={`emp-${emp.id}`} className="text-base font-bold flex-1 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">{emp.name}</label>
                              <div className="hidden group-hover:flex gap-2">
                                <button type="button" onClick={() => { setEditingEmployeeId(emp.id); setEditEmployeeName(emp.name); }} className="p-2 hover:bg-primary/10 rounded-full text-primary transition-colors"><Clock className="h-5 w-5"/></button>
                                <button type="button" onClick={() => handleDeleteEmployee(emp.id)} className="p-2 hover:bg-destructive/10 rounded-full text-destructive transition-colors"><Trash2 className="h-5 w-5"/></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-100/50 border-2 rounded-2xl shadow-sm">
                  <div className="space-y-3">
                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4"/>التاريخ / Date</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-14 text-xl font-black bg-white shadow-sm border-2 focus:border-primary"/>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4"/>من / From</Label>
                    <Input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)} className="h-14 text-xl font-black bg-white shadow-sm border-2 focus:border-primary"/>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4"/>إلى / To</Label>
                    <Input type="time" value={toTime} onChange={e => setToTime(e.target.value)} className="h-14 text-xl font-black bg-white shadow-sm border-2 focus:border-primary"/>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <Label className="font-black text-lg underline decoration-primary/30 underline-offset-4">الأسباب / Reasons</Label>
                    <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0 rounded-full" onClick={() => setShowNewReasonInput(!showNewReasonInput)}>
                      {showNewReasonInput ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    </Button>
                  </div>
                  
                  {showNewReasonInput && (
                    <div className="flex gap-3 mb-4 animate-in fade-in duration-300">
                      <Input placeholder="سبب جديد" value={newReasonName} onChange={e => setNewReasonName(e.target.value)} className="h-12 text-base shadow-inner"/>
                      <Button type="button" className="h-12 px-6 font-bold" onClick={handleAddReason}><Plus className="h-5 w-5 ml-2"/> إضافة</Button>
                    </div>
                  )}

                  <ScrollArea className="h-[250px] border-2 rounded-xl p-4 bg-slate-50/50 shadow-inner">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {reasons.map(r => (
                        <div key={r.id} className="flex items-center gap-3 group transition-all hover:bg-white p-3 rounded-lg border border-transparent hover:border-primary/20 hover:shadow-sm">
                          {editingReasonId === r.id ? (
                             <div className="flex gap-2 w-full animate-in zoom-in-95 duration-200">
                               <Input value={editReasonName} onChange={e => setEditReasonName(e.target.value)} className="h-10 text-base font-medium flex-1"/>
                               <Button size="icon" className="h-10 w-10" onClick={() => handleUpdateReason(r.id)}><Check className="h-5 w-5"/></Button>
                               <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setEditingReasonId(null)}><X className="h-5 w-5"/></Button>
                             </div>
                          ) : (
                            <>
                              <Checkbox id={`r-${r.id}`} className="h-6 w-6 border-2" checked={selectedReasonIds.includes(r.name)} onCheckedChange={() => toggleReason(r.name)}/>
                              <label htmlFor={`r-${r.id}`} className="text-base font-bold flex-1 cursor-pointer leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{r.name}</label>
                              <div className="hidden group-hover:flex gap-2">
                                <button type="button" onClick={() => { setEditingReasonId(r.id); setEditReasonName(r.name); }} className="p-2 hover:bg-primary/10 rounded-full text-primary transition-colors"><Clock className="h-5 w-5"/></button>
                                <button type="button" onClick={() => handleDeleteReason(r.id)} className="p-2 hover:bg-destructive/10 rounded-full text-destructive transition-colors"><Trash2 className="h-5 w-5"/></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-stretch">
                  <div className="flex-1">
                    <Card className="bg-slate-900 text-white border-0 shadow-lg h-full flex flex-col justify-center">
                      <CardContent className="p-6 space-y-2 text-center">
                        <div className="text-sm opacity-70 font-black uppercase tracking-widest">إجمالي الموظفين المختارين / Total Selected Employees</div>
                        <div className="text-2xl font-black text-white">{selectedEmployeeIds.length}</div>
                        <div className="h-px bg-white/20 my-2 mx-auto w-1/2"></div>
                        <div className="text-5xl font-black text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{convertNumbersToEnglish(grandTotalHours)} Hr</div>
                      </CardContent>
                    </Card>
                  </div>
                  <Button type="submit" className="flex-[2] h-auto p-8 text-2xl font-black shadow-xl hover:scale-[1.01] transition-transform active:scale-[0.99]">
                    <Save className="h-8 w-8 ml-4"/> حفظ السجل / Save Records
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Bottom: History & Reports */}
          <div className="space-y-6">
            <Card className="shadow-xl border-slate-200">
              <CardHeader className="bg-slate-900 text-white flex flex-row items-center justify-between py-6 px-8">
                <div>
                  <CardTitle className="text-2xl font-black flex items-center gap-3">
                    <Clock className="h-8 w-8 text-primary" /> سجل وتقارير الساعات / Overtime Log & Reports
                  </CardTitle>
                </div>
                <div className="flex gap-4">
                   <Button variant="outline" size="lg" onClick={() => generateOvertimeReportPDF(reportEntries, filterMonth, "تقرير", "detailed")} className="h-12 gap-2 bg-white text-slate-900 border-0 font-black hover:bg-primary hover:text-white transition-all"><Printer className="h-5 w-5"/> تقرير مفصل / Detailed Report</Button>
                   <Button variant="outline" size="lg" onClick={() => generateOvertimeReportPDF(reportEntries, filterMonth, "تقرير", "merged")} className="h-12 gap-2 bg-white text-slate-900 border-0 font-black hover:bg-primary hover:text-white transition-all"><Printer className="h-5 w-5"/> تقرير مدمج / Merged Report</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-white">
                {/* Search & Filters */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 border-b">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input placeholder="بحث عن اسم أو سبب..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-12 h-14 text-base font-medium shadow-sm border-2 rounded-xl" />
                  </div>
                  <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                    <SelectTrigger className="h-14 bg-white text-base font-bold border-2 rounded-xl shadow-sm"><div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary"/><SelectValue placeholder="الموظف"/></div></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="font-bold">كل الموظفين / All Employees</SelectItem>
                      {employees.map(e => <SelectItem key={e.id} value={e.id} className="font-medium">{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="h-14 bg-white text-base font-bold shadow-sm border-2 rounded-xl" />
                </div>

                {/* Summary Band */}
                <div className="px-8 py-6 flex flex-wrap gap-12 items-center border-b-4 border-slate-50 shadow-sm bg-white">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20"><Calculator className="h-8 w-8"/></div>
                    <div>
                      <div className="text-sm text-muted-foreground font-black uppercase tracking-widest mb-1">إجمالي الساعات / Total Hours</div>
                      <div className="text-4xl font-black text-primary drop-shadow-sm">{convertNumbersToEnglish(reportTotalHours)} Hr</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-900 font-black text-2xl shadow-sm border border-slate-200">{filteredEntries.length}</div>
                    <div>
                      <div className="text-sm text-muted-foreground font-black uppercase tracking-widest mb-1">عدد السجلات / Records Count</div>
                      <div className="text-xl font-black text-slate-900 flex items-center gap-2">
                        {selectedRowIds.length > 0 ? (
                          <>
                            <span className="text-primary">{selectedRowIds.length}</span>
                            <span className="text-slate-400">/</span>
                            <span>مختار / Selected</span>
                          </>
                        ) : "الكل / All"}
                      </div>
                    </div>
                  </div>
                  {selectedRowIds.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={() => setSelectedRowIds([])} className="h-10 px-6 font-bold rounded-full animate-in fade-in slide-in-from-left-2 duration-300">
                      إلغاء التحديد / Deselect (X)
                    </Button>
                  )}
                </div>

                {/* Main History Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-50 text-slate-900 border-b-2">
                      <tr>
                        <th className="p-6 w-16 text-center">
                          <Checkbox checked={filteredEntries.length > 0 && selectedRowIds.length === filteredEntries.length} onCheckedChange={(val) => val ? setSelectedRowIds(filteredEntries.map(e => e.id)) : setSelectedRowIds([])} className="h-6 w-6 border-2"/>
                        </th>
                        <th className="p-6 text-lg font-black uppercase tracking-wide">الموظفون / Employees</th>
                        <th className="p-6 text-center text-lg font-black uppercase tracking-wide">تاريخ / وقت / Date/Time</th>
                        <th className="p-6 text-center text-lg font-black uppercase tracking-wide">الساعات / Hours</th>
                        <th className="p-6 text-lg font-black uppercase tracking-wide">الأسباب / Reasons</th>
                        <th className="p-6 text-center w-40 text-lg font-black uppercase tracking-wide">إجراءات / Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y relative">
                      {filteredEntries.length === 0 ? (
                        <tr><td colSpan={6} className="p-32 text-center text-2xl text-muted-foreground italic font-medium">لا توجد نتائج مطابقة للبحث</td></tr>
                      ) : (
                        filteredEntries.map(entry => {
                           const eNames = entry.employeeNames || []
                           const eIds = entry.employeeIds || []
                           const isSelected = selectedRowIds.includes(entry.id)
                           return (
                             <tr key={entry.id} className={cn("transition-all duration-200", isSelected ? "bg-primary/5" : "hover:bg-slate-50/80")}>
                               <td className="p-6 text-center">
                                 <Checkbox checked={isSelected} onCheckedChange={() => setSelectedRowIds(prev => prev.includes(entry.id) ? prev.filter(i => i !== entry.id) : [...prev, entry.id])} className="h-6 w-6 border-2"/>
                               </td>
                               <td className="p-6">
                                 <div className="flex flex-wrap gap-2 max-w-[500px]">
                                   {eNames.map((name, i) => <Badge key={i} variant="outline" className="text-sm px-3 py-1.5 bg-white font-black text-slate-800 border-2 shadow-sm rounded-lg">{name}</Badge>)}
                                 </div>
                               </td>
                               <td className="p-6 text-center">
                                 <div className="font-black text-xl text-slate-900 mb-1">{convertNumbersToEnglish(entry.date)}</div>
                                 <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-sm font-bold text-muted-foreground border shadow-inner">
                                   <Clock className="h-3.5 w-3.5"/>
                                   {entry.fromTime} - {entry.toTime}
                                 </div>
                               </td>
                               <td className="p-6 text-center">
                                 <div className="text-primary text-3xl font-black drop-shadow-sm mb-1">{convertNumbersToEnglish(entry.totalHours)} Hr</div>
                                 <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest border-t pt-1 border-primary/10">× {eIds.length} = {convertNumbersToEnglish(entry.grandTotalHours || 0)}</div>
                               </td>
                               <td className="p-6">
                                 <div className="flex flex-wrap gap-2">
                                   {entry.reasons?.map((r, i) => (
                                      <span key={i} className="text-sm font-bold bg-white text-slate-700 px-4 py-2 border-2 rounded-xl shadow-sm inline-block leading-tight max-w-[300px] hover:scale-105 transition-transform">
                                        {r}
                                      </span>
                                   ))}
                                 </div>
                               </td>
                               <td className="p-6 text-center">
                                 <div className="flex justify-center gap-3">
                                   <Button variant="outline" size="icon" onClick={() => generateOvertimePDF(entry)} className="h-12 w-12 text-primary border-2 hover:bg-primary hover:text-white transition-all shadow-sm rounded-xl"><Printer className="h-6 w-6"/></Button>
                                   <Button variant="outline" size="icon" onClick={() => handleDeleteEntry(entry.id)} className="h-12 w-12 text-destructive border-2 hover:bg-destructive hover:text-white transition-all shadow-sm rounded-xl"><Trash2 className="h-6 w-6"/></Button>
                                 </div>
                               </td>
                             </tr>
                           )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()
  } catch(e) { return dateStr }
}
