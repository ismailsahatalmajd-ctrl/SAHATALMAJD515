"use client"

import { useState, useMemo, useEffect } from "react"
import { 
  Users, Clock, Plus, Calendar, Save, Trash2, Printer, 
  Calculator, ChevronRight, ChevronLeft, Check, X, Search, 
  Building2, CalendarDays, UserCheck, UserMinus, Filter, 
  AlertCircle, CheckCircle2, Info, FileText, Languages
} from 'lucide-react'
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
  addEmployee, updateEmployee, deleteEmployee,
  addOvertimeReason, updateOvertimeReason, deleteOvertimeReason,
  addOvertimeEntry, deleteOvertimeEntry,
  addAbsenceRecord, deleteAbsenceRecord,
  addPlannedLeave, updatePlannedLeave, deletePlannedLeave
} from "@/lib/storage"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { convertNumbersToEnglish, cn } from "@/lib/utils"
import { format, differenceInMinutes, parse } from "date-fns"
import { formatDateWithDay } from "@/utils/dateFormatter"
import type { OvertimeEntry, EmployeeOvertimeDetail } from "@/lib/types"
import { generateOvertimePDF, generateOvertimeReportPDF } from "@/lib/overtime-pdf-generator"
import { generateSingleEmployeeOvertimeReportPDF } from "@/lib/single-employee-overtime-pdf"
import { generateMultiEmployeeOvertimeReportPDF } from "@/lib/multi-employee-overtime-pdf"
import { 
  generateAttendancePDF, 
  generateAttendanceReportPDF, 
  generateZkAttendanceReportPDF,
  generatePerformanceSummaryPDF
} from "@/lib/attendance-pdf-generator"
import { generateLeavePreReportPDF } from "@/lib/leave-pre-report-pdf"
import { generateCombinedReportsPDF, CombinedEmployeeData } from "@/lib/combined-hr-pdf"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Helper function to generate unique IDs
const generateId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

const deduplicateData = async () => {
  console.log("Starting deduplication...")
  // Deduplicate Employees
  const emps = await db.employees.toArray()
  const empMap = new Map<string, string>() // normalized name -> primary id
  
  for (const e of emps) {
    const normalized = e.name.trim().toLowerCase()
    if (empMap.has(normalized)) {
      const primaryId = empMap.get(normalized)!
      console.log(`Duplicate employee found: ${e.name} (${e.id}). Merging into ${primaryId}`)
      
      // Update overtime entries
      const otEntries = await db.overtimeEntries.toArray()
      for (const entry of otEntries) {
        let updated = false
        let newIds = entry.employeeIds ? [...entry.employeeIds] : []
        if (newIds.includes(e.id)) {
          newIds = newIds.map(id => id === e.id ? primaryId : id)
          updated = true
        }
        
        let newDetails = entry.employeeDetails ? [...entry.employeeDetails] : []
        if (newDetails.some(d => d.employeeId === e.id)) {
          newDetails = newDetails.map(d => d.employeeId === e.id ? { ...d, employeeId: primaryId } : d)
          updated = true
        }

        if (updated) {
          await db.overtimeEntries.update(entry.id, { 
            employeeIds: Array.from(new Set(newIds)),
            employeeDetails: newDetails
          })
        }
      }
      
      // Update absence records
      const abRecords = await db.absenceRecords.where('employeeId').equals(e.id).toArray()
      for (const record of abRecords) {
        await db.absenceRecords.update(record.id, { employeeId: primaryId })
      }
      
      await deleteEmployee(e.id)
    } else {
      empMap.set(normalized, e.id)
    }
  }

  // Deduplicate Reasons
  const reasons = await db.overtimeReasons.toArray()
  const reasonMap = new Map<string, string>() // normalized name -> primary id
  
  for (const r of reasons) {
    const normalized = r.name.trim().toLowerCase()
    if (reasonMap.has(normalized)) {
      const primaryId = reasonMap.get(normalized)!
      const primaryReason = reasons.find(res => res.id === primaryId)!
      console.log(`Duplicate reason found: ${r.name}. Merging into ${primaryReason.name}`)
      
      // Update overtime entries that use this reason
      const otEntries = await db.overtimeEntries.toArray()
      
      for (const entry of otEntries) {
        let updated = false
        let newReasons = entry.reasons ? [...entry.reasons] : []
        if (newReasons.includes(r.name)) {
          newReasons = newReasons.map(res => res === r.name ? primaryReason.name : res)
          updated = true
        }
        
        let newDetails = entry.employeeDetails ? [...entry.employeeDetails] : []
        if (newDetails.some(d => d.reasons.includes(r.name))) {
          newDetails = newDetails.map(d => ({
            ...d,
            reasons: d.reasons.map(res => res === r.name ? primaryReason.name : res)
          }))
          updated = true
        }

        if (updated) {
          await db.overtimeEntries.update(entry.id, { 
            reasons: Array.from(new Set(newReasons)),
            employeeDetails: newDetails
          })
        }
      }
      
      await deleteOvertimeReason(r.id)
    } else {
      reasonMap.set(normalized, r.id)
    }
  }
  console.log("Deduplication complete.")
}

let isSeeding = false

export default function EmployeesHREPage() {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()
  
  // Data fetching (Shared)
  const employees = useLiveQuery(() => db.employees.toArray()) || []
  const overtimeReasons = useLiveQuery(() => db.overtimeReasons.toArray()) || []
  const overtimeEntries = useLiveQuery(() => db.overtimeEntries.toArray()) || []
  const absenceRecords = useLiveQuery(() => db.absenceRecords.toArray()) || []
  const plannedLeaves = useLiveQuery(() => db.plannedLeaves.toArray()) || []

  // Seed Data (Same as before)
  useEffect(() => {
    if (isSeeding) return
    isSeeding = true

    const seed = async () => {
      await deduplicateData()

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
          const exists = await db.employees.where('name').equals(name).count()
          if (exists === 0) {
            await addEmployee({ name, department: "Warehouse" })
          }
        }
      }
      const existingReasons = await db.overtimeReasons.toArray()
      if (!existingReasons.some(r => r.name.includes("Late Finish Work"))) {
        const reasonNames = [
          { en: "Late Finish Work And Late Sugar Received", ar: "تأخر انتهاء العمل واستلام السكر" },
          { en: "Container Unloading and Late Factory", ar: "تفريغ الحاوية وتأخر المصنع" },
          { en: "Jeddah Tabok Anad factory Order Issue", ar: "مشكلة طلب مصنع جدة تبوك عناد" },
          { en: "Hanoverian 1 And Tobuk Order Issue", ar: "مشكلة طلب هانوفرين 1 وتبوك" },
          { en: "Friday Work", ar: "عمل يوم الجمعة" },
          { en: "Excel Data Update", ar: "تحديث كميات الاكسل" }
        ]
        for (const r of reasonNames) {
          const name = lang === 'ar' ? `${r.ar} / ${r.en}` : `${r.en} / ${r.ar}`
          const exists = await db.overtimeReasons.where('name').equals(name).count()
          if (exists === 0) {
            await addOvertimeReason(name)
          }
        }
      }
      isSeeding = false
    }
    seed()
  }, [])

  // --- OVERTIME STATE & LOGIC ---
  const [ot_selectedEmployeeIds, setOtSelectedEmployeeIds] = useState<string[]>([])
  const [ot_newEmployeeName, setOtNewEmployeeName] = useState("")
  const [ot_showNewEmployeeInput, setOtShowNewEmployeeInput] = useState(false)
  const [ot_selectedReasonIds, setOtSelectedReasonIds] = useState<string[]>([])
  const [ot_newReasonName, setOtNewReasonName] = useState("")
  const [ot_showNewReasonInput, setOtShowNewReasonInput] = useState(false)
  const [ot_date, setOtDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [ot_fromTime, setOtFromTime] = useState("16:00")
  const [ot_toTime, setOtToTime] = useState("22:00")
  const [ot_filterEmployeeId, setOtFilterEmployeeId] = useState<string>("all")
  const [ot_filterMonth, setOtFilterMonth] = useState(format(new Date(), "yyyy-MM"))
  const [ot_filterStartDate, setOtFilterStartDate] = useState("")
  const [ot_filterEndDate, setOtFilterEndDate] = useState("")
  const [ot_dateFilterType, setOtDateFilterType] = useState<"month" | "range">("month")
  const [ot_searchTerm, setOtSearchTerm] = useState("")
  const [ot_selectedRowIds, setOtSelectedRowIds] = useState<string[]>([])
  
  // New state for per-employee overtime details
  const [ot_employeeDetails, setOtEmployeeDetails] = useState<Record<string, {
    fromTime: string
    toTime: string
    reasons: string[]
  }>>({})

  // Management State
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)
  const [editEmployeeName, setEditEmployeeName] = useState("")
  const [showNewEmployeeInput, setShowNewEmployeeInput] = useState(false)
  const [newEmployeeName, setNewEmployeeName] = useState("")
  const [singleEmployeeFilterId, setSingleEmployeeFilterId] = useState<string>("all")
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])

  const [editingReasonId, setEditingReasonId] = useState<string | null>(null)
  const [editReasonName, setEditReasonName] = useState("")
  const [showNewReasonInput, setShowNewReasonInput] = useState(false)
  const [newReasonName, setNewReasonName] = useState("")
  const [isTranslatingReason, setIsTranslatingReason] = useState(false)

  const handleTranslateReason = async () => {
    if (!newReasonName.trim()) return
    setIsTranslatingReason(true)
    try {
      const text = newReasonName.trim()
      const isArabic = /[\u0600-\u06FF]/.test(text)
      const targetLang = isArabic ? 'en' : 'ar'
      const langPair = isArabic ? 'ar|en' : 'en|ar'
      
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`)
      const data = await response.json()
      const translated = data.responseData.translatedText
      
      if (translated) {
        const bilingual = isArabic ? `${text} / ${translated}` : `${translated} / ${text}`
        setNewReasonName(bilingual)
      }
    } catch (error) {
      console.error("Translation error:", error)
      toast({ title: "خطأ في الترجمة", variant: "destructive" })
    } finally {
      setIsTranslatingReason(false)
    }
  }

  const ot_calculateHours = (from: string, to: string) => {
    const [h1, m1] = from.split(":").map(Number)
    const [h2, m2] = to.split(":").map(Number)
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1)
    if (diff < 0) diff += 24 * 60
    return Number((diff / 60).toFixed(2))
  }
  const ot_hoursPerPerson = useMemo(() => ot_calculateHours(ot_fromTime, ot_toTime), [ot_fromTime, ot_toTime])
  const ot_grandTotalHours = useMemo(() => {
    return ot_selectedEmployeeIds.reduce((total, empId) => {
      const detail = ot_employeeDetails[empId]
      if (detail) {
        return total + ot_calculateHours(detail.fromTime, detail.toTime)
      }
      return total + ot_hoursPerPerson
    }, 0)
  }, [ot_selectedEmployeeIds, ot_employeeDetails, ot_hoursPerPerson])

  const ot_filteredEntries = useMemo(() => {
    return overtimeEntries.filter(entry => {
      let matchDate = false
      if (ot_dateFilterType === "month") {
        matchDate = entry.date?.startsWith(ot_filterMonth) ?? false
      } else {
        const entryDate = entry.date || ""
        matchDate = (!ot_filterStartDate || entryDate >= ot_filterStartDate) &&
                    (!ot_filterEndDate || entryDate <= ot_filterEndDate)
      }
      
      let matchEmployee = ot_filterEmployeeId === "all"
      if (!matchEmployee) {
        matchEmployee = entry.employeeIds?.includes(ot_filterEmployeeId) || (entry as any).employeeId === ot_filterEmployeeId
      }
      const searchLower = ot_searchTerm.toLowerCase()
      const matchSearch = ot_searchTerm === "" || 
        entry.employeeNames?.some(name => name.toLowerCase().includes(searchLower)) ||
        entry.reasons?.some(r => r.toLowerCase().includes(searchLower)) ||
        entry.date?.includes(ot_searchTerm)
      return matchEmployee && matchDate && matchSearch
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [overtimeEntries, ot_filterEmployeeId, ot_filterMonth, ot_filterStartDate, ot_filterEndDate, ot_dateFilterType, ot_searchTerm])

  const ot_reportTotalHours = useMemo(() => {
    const entriesToSum = ot_selectedRowIds.length > 0 ? ot_filteredEntries.filter(e => ot_selectedRowIds.includes(e.id)) : ot_filteredEntries
    if (ot_filterEmployeeId === "all") {
       return entriesToSum.reduce((sum, entry) => sum + (entry.grandTotalHours || 0), 0)
    } else {
       return entriesToSum.reduce((sum, entry) => sum + (entry.totalHours || 0), 0)
    }
  }, [ot_filteredEntries, ot_selectedRowIds, ot_filterEmployeeId])

  // Helper functions for per-employee overtime details
  const updateEmployeeDetail = (employeeId: string, field: 'fromTime' | 'toTime', value: string) => {
    setOtEmployeeDetails(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        fromTime: prev[employeeId]?.fromTime || ot_fromTime,
        toTime: prev[employeeId]?.toTime || ot_toTime,
        reasons: prev[employeeId]?.reasons || [],
        [field]: value
      }
    }))
  }

  const updateEmployeeReasons = (employeeId: string, reasons: string[]) => {
    setOtEmployeeDetails(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        fromTime: prev[employeeId]?.fromTime || ot_fromTime,
        toTime: prev[employeeId]?.toTime || ot_toTime,
        reasons
      }
    }))
  }

  const handleOtSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ot_selectedEmployeeIds.length === 0) {
      toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
      return
    }
    const selectedEmployees = employees.filter(e => ot_selectedEmployeeIds.includes(e.id))
    
    // Create employee details array
    const employeeDetails = selectedEmployees.map(emp => {
      const detail = ot_employeeDetails[emp.id]
      return {
        employeeId: emp.id,
        employeeName: emp.name,
        fromTime: detail?.fromTime || ot_fromTime,
        toTime: detail?.toTime || ot_toTime,
        totalHours: ot_calculateHours(detail?.fromTime || ot_fromTime, detail?.toTime || ot_toTime),
        reasons: detail?.reasons.length ? detail.reasons : ot_selectedReasonIds
      }
    })
    
    await addOvertimeEntry({
      employeeIds: ot_selectedEmployeeIds,
      employeeNames: selectedEmployees.map(e => e.name),
      department: "Warehouse",
      date: ot_date, 
      fromTime: ot_fromTime, 
      toTime: ot_toTime,
      totalHours: ot_hoursPerPerson,
      grandTotalHours: ot_grandTotalHours,
      reasons: ot_selectedReasonIds,
      employeeDetails, // Add the new per-employee details
      status: 'approved',
      branchId: (user as any)?.branchId || undefined
    })
    toast({ title: t("hr.overtime.success") })
    setOtSelectedEmployeeIds([])
    setOtSelectedReasonIds([])
    setOtEmployeeDetails({})
  }

  // --- COMBINED REPORT ---
  const [cr_selectedEmployeeIds, setCrSelectedEmployeeIds] = useState<string[]>([])
  const [cr_month, setCrMonth] = useState(format(new Date(), "yyyy-MM"))
  const [cr_startDate, setCrStartDate] = useState("")
  const [cr_endDate, setCrEndDate] = useState("")
  const [cr_dateFilterType, setCrDateFilterType] = useState<"month" | "range">("month")
  
  const handleGenerateCombinedReport = async (reportType: 'detailed' | 'merged' | 'summary') => {
    console.log("=== Combined Report Generation Start ===")
    console.log("Report Type:", reportType)
    console.log("Selected IDs:", cr_selectedEmployeeIds)
    console.log("Filter Type:", cr_dateFilterType)
    console.log("Month:", cr_month)
    console.log("Start Date:", cr_startDate)
    console.log("End Date:", cr_endDate)

    if (cr_selectedEmployeeIds.length === 0) {
       toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
       return
    }

    const selectedEmps = employees.filter(e => cr_selectedEmployeeIds.includes(e.id))
    console.log("Selected Employee Objects:", selectedEmps.map(e => ({ id: e.id, name: e.name })))
    
    const employeesData: CombinedEmployeeData[] = selectedEmps.map(emp => {
      const normalizedSearchName = emp.name.trim().toLowerCase()
      console.log(`Processing Employee: ${emp.name} (Normalized: ${normalizedSearchName}, ID: ${emp.id})`)

      const empOvertime = overtimeEntries.filter(e => {
         let matchDate = false
         if (cr_dateFilterType === "month") {
           matchDate = e.date?.startsWith(cr_month) ?? false
         } else {
           const entryDate = e.date || ""
           matchDate = (!cr_startDate || entryDate >= cr_startDate) &&
                       (!cr_endDate || entryDate <= cr_endDate)
         }
         if (!matchDate) return false

         const matchId = e.employeeIds?.includes(emp.id) || (e as any).employeeId === emp.id
         const matchName = e.employeeNames?.some(name => name.trim().toLowerCase() === normalizedSearchName)
         const finalMatch = matchId || matchName
         
         if (finalMatch) {
           console.log(`  [OT Match] Date: ${e.date}, IDs: ${e.employeeIds?.join(',')}, Names: ${e.employeeNames?.join(',')}`)
         }
         return finalMatch
      }).sort((a,b) => (a.date || '').localeCompare(b.date || ''))

      const empAbsences = absenceRecords.filter(r => {
         let matchDate = false
         if (cr_dateFilterType === "month") {
           matchDate = r.date?.startsWith(cr_month) ?? false
         } else {
           const recordDate = r.date || ""
           matchDate = (!cr_startDate || recordDate >= cr_startDate) &&
                       (!cr_endDate || recordDate <= cr_endDate)
         }
         if (!matchDate) return false
         
         const matchId = r.employeeId === emp.id
         const matchName = r.employeeName?.trim().toLowerCase() === normalizedSearchName
         const finalMatch = matchId || matchName

         if (finalMatch) {
           console.log(`  [Absence Match] Date: ${r.date}, ID: ${r.employeeId}, Name: ${r.employeeName}`)
         }
         return finalMatch
      }).sort((a,b) => (a.date || '').localeCompare(b.date || ''))

      console.log(`  Summary for ${emp.name}: Found ${empOvertime.length} OT entries and ${empAbsences.length} absences.`)

      const totalOvertimeHours = empOvertime.reduce((sum, e) => sum + (e.totalHours || 0), 0)
      const totalAbsences = empAbsences.filter(r => r.type === 'absence').length
      const totalLeaves = empAbsences.filter(r => r.type === 'leave' || r.type === 'official_event').length

      const abs_unexcused = empAbsences.filter(r => r.type === 'absence' && r.category === 'unexcused').length
      const abs_excused = empAbsences.filter(r => r.type === 'absence' && r.category === 'excused').length
      const abs_sick = empAbsences.filter(r => r.type === 'absence' && r.category === 'sick').length

      return {
        id: emp.id,
        name: emp.name,
        overtimeEntries: empOvertime,
        absenceRecords: empAbsences,
        totalOvertimeHours,
        totalAbsences,
        totalLeaves,
        abs_unexcused,
        abs_excused,
        abs_sick
      }
    })

    const reportTitle = cr_dateFilterType === 'month' ? cr_month : `${cr_startDate} - ${cr_endDate}`
    console.log("Final Report Data:", employeesData)
    console.log("=== Combined Report Generation End ===")
    await generateCombinedReportsPDF(employeesData, reportTitle, reportType)
  }

  const handleAddEmployee = async () => {
    if (!newEmployeeName.trim()) return
    const normalized = newEmployeeName.trim().toLowerCase()
    const exists = employees.some(e => e.name.trim().toLowerCase() === normalized)
    if (exists) {
      toast({ title: "هذا الموظف موجود بالفعل", variant: "destructive" })
      return
    }
    const emp = await addEmployee({ name: newEmployeeName.trim(), department: "Warehouse" })
    setNewEmployeeName("")
    setShowNewEmployeeInput(false)
    toast({ title: t("hr.employee.success") })
  }

  const handleUpdateEmployee = async (id: string) => {
    if (!editEmployeeName.trim()) return
    await updateEmployee(id, { name: editEmployeeName.trim() })
    setEditingEmployeeId(null)
    toast({ title: "تم التحديث" })
  }

  const handleDeleteEmployee = async (id: string) => {
    if (confirm("حذف الموظف؟")) { 
      const employee = employees.find(e => e.id === id)
      if (employee) {
        const overtimeEntriesForEmployee = overtimeEntries.filter(e => e.employeeIds?.includes(id) || (e as any).employeeId === id)
        const absenceRecordsForEmployee = absenceRecords.filter(r => r.employeeId === id)

        await Promise.all([
          ...overtimeEntriesForEmployee.map(entry => deleteOvertimeEntry(entry.id)),
          ...absenceRecordsForEmployee.map(record => deleteAbsenceRecord(record.id)),
        ])

        await deleteEmployee(id)
      }
      toast({ title: "تم الحذف" }); 
    }
  }

  const handleAddReason = async () => {
    if (!newReasonName.trim()) return
    const normalized = newReasonName.trim().toLowerCase()
    const exists = overtimeReasons.some(r => r.name.trim().toLowerCase() === normalized)
    if (exists) {
      toast({ title: "هذا السبب موجود بالفعل", variant: "destructive" })
      return
    }
    await addOvertimeReason(newReasonName.trim())
    setNewReasonName("")
    setShowNewReasonInput(false)
    toast({ title: t("hr.overtime.reason.success") })
  }

  const handleUpdateReason = async (id: string) => {
    if (!editReasonName.trim()) return
    await updateOvertimeReason(id, { name: editReasonName.trim() })
    setEditingReasonId(null)
    toast({ title: "تم التحديث" })
  }

  const handleDeleteReason = async (id: string) => {
    if (confirm("حذف السبب؟")) { await deleteOvertimeReason(id); toast({ title: "تم الحذف" }); }
  }

  const handleSingleEmployeePDF = async () => {
    console.log("=== Single Employee PDF Debug Start ===")
    console.log("Selected Employee ID:", singleEmployeeFilterId)
    console.log("Available Employees:", employees)
    console.log("Overtime Entries:", overtimeEntries)
    console.log("Filter Month:", ot_filterMonth)
    
    if (singleEmployeeFilterId === "all") {
      toast({ title: "يرجى اختيار موظف واحد", variant: "destructive" })
      return
    }
    
    const employee = employees.find(e => e.id === singleEmployeeFilterId)
    console.log("Found Employee:", employee)
    if (!employee) {
      console.log("Employee not found!")
      return
    }
    
    // Get ALL overtime entries for the employee in the selected month
    const allEmployeeEntries = overtimeEntries.filter(entry => {
      const matchMonth = entry.date?.startsWith(ot_filterMonth) ?? false
      // Check if employee is in the employeeIds array OR if employee name matches
      const matchEmployee = entry.employeeIds?.includes(singleEmployeeFilterId) || 
                           entry.employeeNames?.some(name => name.includes(employee.name))
      
      console.log(`Entry ${entry.id}:`, {
        date: entry.date,
        matchMonth,
        employeeIds: entry.employeeIds,
        employeeNames: entry.employeeNames,
        matchEmployee,
        reasons: entry.reasons
      })
      return matchMonth && matchEmployee
    })
    
    console.log("Final Employee Entries:", allEmployeeEntries)
    console.log("=== Single Employee PDF Debug End ===")
    
    await generateSingleEmployeeOvertimeReportPDF(employee.name, allEmployeeEntries, ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`)
  }

  const handleMergedEmployeePDF = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
      return
    }
    
    const employeesData = selectedEmployeeIds.map(empId => {
      const employee = employees.find(e => e.id === empId)
      if (!employee) return null
      
      const employeeEntries = overtimeEntries.filter(entry => {
        const matchMonth = entry.date?.startsWith(ot_filterMonth) ?? false
        const matchEmployee = entry.employeeIds?.includes(empId) || 
                             entry.employeeNames?.some(name => name.includes(employee.name))
        return matchMonth && matchEmployee
      })
      
      return {
        employeeName: employee.name,
        entries: employeeEntries
      }
    }).filter((item): item is { employeeName: string; entries: OvertimeEntry[] } => item !== null)
    
    await generateMultiEmployeeOvertimeReportPDF(employeesData, ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`)
  }

  // --- ATTENDANCE STATE & LOGIC ---
  const [at_selectedEmployeeIds, setAtSelectedEmployeeIds] = useState<string[]>([])
  const [at_date, setAtDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [at_recordType, setAtRecordType] = useState<'attendance' | 'absence' | 'leave' | 'official_event'>('attendance')
  const [at_category, setAtCategory] = useState("fingerprint")
  const [at_notes, setAtNotes] = useState("")
  const [at_filterEmployeeId, setAtFilterEmployeeId] = useState<string>("all")
  const [at_filterMonth, setAtFilterMonth] = useState(format(new Date(), "yyyy-MM"))
  const [at_searchTerm, setAtSearchTerm] = useState("")
  const [at_excuse, setAtExcuse] = useState("")
  const [at_attachment, setAtAttachment] = useState<string | null>(null)
  const [isTranslatingAtNotes, setIsTranslatingAtNotes] = useState(false)
  const [isTranslatingAtExcuse, setIsTranslatingAtExcuse] = useState(false)

  const handleTranslateAtField = async (field: 'notes' | 'excuse') => {
    const text = field === 'notes' ? at_notes.trim() : at_excuse.trim()
    if (!text) return

    const setTranslating = field === 'notes' ? setIsTranslatingAtNotes : setIsTranslatingAtExcuse
    const setValue = field === 'notes' ? setAtNotes : setAtExcuse

    setTranslating(true)
    try {
      const isArabic = /[\u0600-\u06FF]/.test(text)
      const langPair = isArabic ? 'ar|en' : 'en|ar'
      
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`)
      const data = await response.json()
      const translated = data.responseData.translatedText
      
      if (translated) {
        const bilingual = isArabic ? `${text} / ${translated}` : `${translated} / ${text}`
        setValue(bilingual)
      }
    } catch (error) {
      console.error("Translation error:", error)
      toast({ title: "خطأ في الترجمة", variant: "destructive" })
    } finally {
      setTranslating(false)
    }
  }

  // --- ZKTECO STATE & LOGIC ---
  const [zk_ip, setZkIp] = useState("192.168.8.200")
  const [zk_port, setZkPort] = useState("4370")
  const [zk_status, setZkStatus] = useState<"idle" | "connecting" | "syncing" | "success" | "error">("idle")
  const [zk_logs, setZkLogs] = useState<any[]>([])
  const [zk_users, setZkUsers] = useState<any[]>([])

  const handleZkSync = async () => {
    setZkStatus("syncing")
    try {
      toast({ 
        title: "جاري الاتصال بجهاز البصمة...", 
        description: `IP: ${zk_ip}:${zk_port}`,
      })
      
      // Check if we are in Electron
      const isElectron = typeof window !== 'undefined' && (window as any).electron?.zkSync
      
      if (!isElectron) {
        setZkStatus("error")
        toast({ 
          title: "حدث خطأ", 
          description: "يجب تشغيل التطبيق من خلال برنامج الكمبيوتر (Electron) للاتصال المباشر بجهاز البصمة.",
          variant: "destructive"
        })
        return
      }

      // Call the actual sync logic via bridge
      const response = await (window as any).electron.zkSync({ ip: zk_ip, port: Number(zk_port) })
      
      if (response.success) {
        setZkStatus("success")
        const fetchedLogs = response.data.attendances || []
        const fetchedUsers = response.data.users || []
        
        setZkLogs(fetchedLogs)
        setZkUsers(fetchedUsers)
        
        toast({ 
          title: "تم مزامنة البيانات بنجاح",
          description: `تم جلب ${fetchedUsers.length} مستخدم و ${fetchedLogs.length} حركة سجل من جهاز البصمة.`
        })
      } else {
        setZkStatus("error")
        toast({ 
          title: "فشل المزامنة", 
          description: response.error,
          variant: "destructive"
        })
      }
    } catch (error: any) {
      setZkStatus("error")
      toast({ 
        title: "خطأ غير متوقع", 
        description: error.message,
        variant: "destructive" 
      })
    }
  }

  const handleUpdateFingerprintId = async (empId: string, fId: string) => {
    await updateEmployee(empId, { fingerprintId: fId })
    toast({ title: "تم تحديث رقم البصمة" })
  }

  const handleApplyUserMappings = async () => {
    const mappings: Record<string, string> = {
      "3": "Sohel Rana",
      "4": "ILYAS",
      "5": "Forhad",
      "6": "Bahador",
      "8": "Qamar Ul Haq",
      "9": "Litan",
      "10": "Kashem",
      "11": "Shamrez",
      "12": "Makkaram"
    }
    
    let appliedCount = 0
    for (const [id, name] of Object.entries(mappings)) {
      const employee = employees.find(e => 
        e.name.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(e.name.toLowerCase())
      )
      if (employee) {
        await updateEmployee(employee.id, { fingerprintId: id })
        appliedCount++
      }
    }
    
    toast({ 
      title: "تم تطبيق الربط المخصص", 
      description: `تم ربط ${appliedCount} موظف من أصل ${Object.keys(mappings).length} بنجاح.`
    })
  }

  const handleSaveZkLogs = async () => {
    if (zk_logs.length === 0) {
      toast({ title: "لا توجد سجلات لحفظها", variant: "destructive" })
      return
    }

    setZkStatus("syncing")
    try {
      let savedCount = 0
      for (const log of zk_logs) {
        const employee = employees.find(e => e.fingerprintId === String(log.deviceUserId))
        
        if (employee) {
          const recordTimeStr = format(new Date(log.recordTime), "yyyy-MM-dd HH:mm:ss")
          const existing = await db.absenceRecords
            .where({ employeeId: employee.id, recordTime: recordTimeStr })
            .first()

          if (!existing) {
            await addAbsenceRecord({
              employeeId: employee.id,
              employeeName: employee.name,
              date: format(new Date(log.recordTime), "yyyy-MM-dd"),
              type: "attendance", 
              category: "fingerprint", 
              notes: `بصمة من جهاز: ${zk_ip}`,
              recordTime: recordTimeStr,
              branchId: (user as any)?.branchId || undefined
            })
            savedCount++
          }
        }
      }

      toast({ 
        title: "اكتمل الحفظ", 
        description: `تمت إضافة ${savedCount} حركات حضور جديدة لجدول الموظفين.` 
      })
      setZkStatus("success")
    } catch (error: any) {
      console.error("Save error:", error)
      toast({ title: "خطأ أثناء الحفظ", description: error.message, variant: "destructive" })
      setZkStatus("error")
    }
  }

  const zk_dailySummary = useMemo(() => {
    if (zk_logs.length === 0) return []
    
    const summaryMap = new Map<string, { employeeName: string, date: string, firstSwipe: string, lastSwipe: string, count: number }>()

    zk_logs.forEach(log => {
      const dateKey = format(new Date(log.recordTime), "yyyy-MM-dd")
      const employee = employees.find(e => 
        String(e.fingerprintId) === String(log.deviceUserId)
      )
      
      const empName = employee?.name || `مستخدم ${log.deviceUserId}`
      const key = `${dateKey}_${log.deviceUserId}`
      
      const timeStr = format(new Date(log.recordTime), "HH:mm:ss")
      const existing = summaryMap.get(key)
      
      if (!existing) {
        summaryMap.set(key, {
          employeeName: empName,
          date: dateKey,
          firstSwipe: timeStr,
          lastSwipe: timeStr,
          count: 1
        })
      } else {
        if (timeStr < existing.firstSwipe) existing.firstSwipe = timeStr
        if (timeStr > existing.lastSwipe) existing.lastSwipe = timeStr
        existing.count += 1
      }
    })

    return Array.from(summaryMap.values())
      .map(s => {
        let duration = "00:00"
        if (s.count > 1) {
          const start = parse(`${s.date} ${s.firstSwipe}`, "yyyy-MM-dd HH:mm:ss", new Date())
          const end = parse(`${s.date} ${s.lastSwipe}`, "yyyy-MM-dd HH:mm:ss", new Date())
          const diffMins = differenceInMinutes(end, start)
          const hrs = Math.floor(diffMins / 60)
          const mins = diffMins % 60
          duration = `${hrs}:${mins.toString().padStart(2, '0')}`
        }
        return { ...s, duration }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [zk_logs, employees])

  const [zk_perfStartDate, setZkPerfStartDate] = useState(format(new Date(), "yyyy-MM-01"))
  const [zk_perfEndDate, setZkPerfEndDate] = useState(format(new Date(), "yyyy-MM-dd"))

  const handleGeneratePerformanceReport = async () => {
    const start = new Date(zk_perfStartDate)
    const end = new Date(zk_perfEndDate)
    
    // 1. Filter logs in range
    const logsInRange = zk_logs.filter(log => {
      const d = new Date(log.recordTime)
      return d >= start && d <= end
    })

    // 2. Fetch all absence records in range (using Dexie)
    const allAbsences = await db.absenceRecords.toArray()
    const absencesInRange = allAbsences.filter(r => {
      const d = new Date(r.date)
      return d >= start && d <= end
    })

    const reportData = employees.map(emp => {
      const empLogs = logsInRange.filter(l => String(l.deviceUserId) === String(emp.fingerprintId))
      
      // Group by date
      const daysMap = new Map<string, { first: string, last: string, count: number }>()
      empLogs.forEach(log => {
        const dKey = format(new Date(log.recordTime), "yyyy-MM-dd")
        const tStr = format(new Date(log.recordTime), "HH:mm:ss")
        const existing = daysMap.get(dKey)
        if (!existing) {
          daysMap.set(dKey, { first: tStr, last: tStr, count: 1 })
        } else {
          if (tStr < existing.first) existing.first = tStr
          if (tStr > existing.last) existing.last = tStr
          existing.count += 1
        }
      })

      let totalMinutes = 0
      let missingSwipes = 0
      daysMap.forEach((val, dKey) => {
        if (val.count > 1) {
          const s = parse(`${dKey} ${val.first}`, "yyyy-MM-dd HH:mm:ss", new Date())
          const e = parse(`${dKey} ${val.last}`, "yyyy-MM-dd HH:mm:ss", new Date())
          totalMinutes += differenceInMinutes(e, s)
        } else {
          missingSwipes += 1
        }
      })

      const hrs = Math.floor(totalMinutes / 60)
      const mins = totalMinutes % 60
      
      // Absence count
      const empAbsences = absencesInRange.filter(r => 
        r.employeeName === emp.name && (r.type === "absence" || r.type === "leave")
      )

      return {
        name: emp.name,
        workingDays: daysMap.size,
        totalHours: `${hrs}:${mins.toString().padStart(2, '0')}`,
        absenceDays: empAbsences.length,
        missingSwipes
      }
    })

    generatePerformanceSummaryPDF(reportData, zk_perfStartDate, zk_perfEndDate)
  }

  // Planned Leave State
  const [pl_showPreReportModal, setPlShowPreReportModal] = useState(false)
  const [pl_selectedEmployeeIds, setPlSelectedEmployeeIds] = useState<string[]>([])
  const [pl_employeeDetails, setPlEmployeeDetails] = useState<Record<string, {
    leavePeriods: Array<{
      id: string
      dates?: string[]
      startDate: string
      endDate: string
      totalDays: number
      leaveType: string
      reason: string
    }>
    totalDays: number
  }>>({})
  const [pl_globalDates, setPlGlobalDates] = useState<Date[]>([])
  const [pl_globalLeaveType, setPlGlobalLeaveType] = useState("official")
  const [pl_globalReason, setPlGlobalReason] = useState("")
  
  const [pl_showLogModal, setPlShowLogModal] = useState(false)
  const [pl_editingLeaveId, setPlEditingLeaveId] = useState<string | null>(null)
  const [pl_editLeaveData, setPlEditLeaveData] = useState<any>(null)

  // New Leave-First Mode State
  const [pl_mode, setPlMode] = useState<'employee-first' | 'leave-first'>('employee-first')
  const [pl_logSelectedIds, setPlLogSelectedIds] = useState<string[]>([])
  const [pl_leaveTemplates, setPlLeaveTemplates] = useState<Array<{
    id: string
    name: string
    dates?: string[]
    startDate: string
    endDate: string
    totalDays: number
    leaveType: string
    reason: string
    assignedEmployees: string[]
  }>>([])
  const [pl_selectedLeaveTemplateIds, setPlSelectedLeaveTemplateIds] = useState<string[]>([])
  const [pl_showAddLeaveTemplate, setPlShowAddLeaveTemplate] = useState(false)
  const [pl_newLeaveTemplate, setPlNewLeaveTemplate] = useState({
    name: '',
    dates: [] as string[],
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    leaveType: "official",
    reason: ''
  })

  const pl_leaveTypes = [
    { id: "official", labelAr: "رسمية / Official", labelEn: "Official" },
    { id: "sick", labelAr: "مرضية / Sick", labelEn: "Sick" },
    { id: "personal", labelAr: "شخصية / Personal", labelEn: "Personal" },
    { id: "eid", labelAr: "عيد / Eid", labelEn: "Eid" },
    { id: "national", labelAr: "يوم وطني / National Day", labelEn: "National Day" },
    { id: "maternity", labelAr: " maternité / Maternity", labelEn: "Maternity" },
    { id: "emergency", labelAr: "طارئة / Emergency", labelEn: "Emergency" },
  ]

  const pl_calculateDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
  }

  const pl_addLeavePeriod = (employeeId: string) => {
    setPlEmployeeDetails(prev => {
      const current = prev[employeeId] || { leavePeriods: [], totalDays: 0 }
      const newPeriod = {
        id: generateId(),
        dates: pl_globalDates.map(d => format(d, "yyyy-MM-dd")),
        startDate: pl_globalDates.length > 0 ? format([...pl_globalDates].sort((a,b)=>a.getTime()-b.getTime())[0], "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        endDate: pl_globalDates.length > 0 ? format([...pl_globalDates].sort((a,b)=>a.getTime()-b.getTime())[pl_globalDates.length-1], "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        totalDays: pl_globalDates.length,
        leaveType: pl_globalLeaveType,
        reason: pl_globalReason
      }
      
      const updatedPeriods = [...current.leavePeriods, newPeriod]
      const newTotalDays = updatedPeriods.reduce((sum, period) => sum + period.totalDays, 0)
      
      return {
        ...prev,
        [employeeId]: {
          leavePeriods: updatedPeriods,
          totalDays: newTotalDays
        }
      }
    })
  }

  const pl_removeLeavePeriod = (employeeId: string, periodId: string) => {
    setPlEmployeeDetails(prev => {
      const current = prev[employeeId] || { leavePeriods: [], totalDays: 0 }
      const updatedPeriods = current.leavePeriods.filter(p => p.id !== periodId)
      const newTotalDays = updatedPeriods.reduce((sum, period) => sum + period.totalDays, 0)
      
      return {
        ...prev,
        [employeeId]: {
          leavePeriods: updatedPeriods,
          totalDays: newTotalDays
        }
      }
    })
  }

  const pl_updateLeavePeriod = (employeeId: string, periodId: string, field: string, value: any) => {
    setPlEmployeeDetails(prev => {
      const current = prev[employeeId] || { leavePeriods: [], totalDays: 0 }
      const updatedPeriods = current.leavePeriods.map(period => {
        if (period.id === periodId) {
          const updated = { ...period, [field]: value }
          
          if (field === 'startDate' || field === 'endDate') {
            updated.totalDays = pl_calculateDays(updated.startDate, updated.endDate)
          } else if (field === 'dates') {
            const dateArr = value as string[];
            updated.totalDays = dateArr.length;
            if (dateArr.length > 0) {
              const sorted = [...dateArr].sort();
              updated.startDate = sorted[0];
              updated.endDate = sorted[sorted.length - 1];
            } else {
              updated.startDate = ""; 
              updated.endDate = "";
            }
          }
          
          return updated
        }
        return period
      })
      
      const newTotalDays = updatedPeriods.reduce((sum, period) => sum + period.totalDays, 0)
      
      return {
        ...prev,
        [employeeId]: {
          leavePeriods: updatedPeriods,
          totalDays: newTotalDays
        }
      }
    })
  }

  const pl_addLeaveTemplate = () => {
    if (!pl_newLeaveTemplate.name.trim()) {
      toast({ title: "يرجى إدخال اسم الإجازة", variant: "destructive" })
      return
    }
    
    const newTemplate = {
      id: generateId(),
      name: pl_newLeaveTemplate.name,
      startDate: pl_newLeaveTemplate.startDate,
      endDate: pl_newLeaveTemplate.endDate,
      totalDays: pl_calculateDays(pl_newLeaveTemplate.startDate, pl_newLeaveTemplate.endDate),
      leaveType: pl_newLeaveTemplate.leaveType,
      reason: pl_newLeaveTemplate.reason,
      assignedEmployees: []
    }
    
    setPlLeaveTemplates(prev => [...prev, newTemplate])
    setPlNewLeaveTemplate({
      name: '',
      dates: [],
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
      leaveType: "official",
      reason: ''
    })
    setPlShowAddLeaveTemplate(false)
    toast({ title: "تمت إضافة قالب الإجازة بنجاح" })
  }

  const pl_removeLeaveTemplate = (templateId: string) => {
    setPlLeaveTemplates(prev => prev.filter(t => t.id !== templateId))
    setPlSelectedLeaveTemplateIds(prev => prev.filter(id => id !== templateId))
  }

  const pl_assignEmployeesToLeave = (templateId: string, employeeIds: string[]) => {
    setPlLeaveTemplates(prev => prev.map(template => 
      template.id === templateId 
        ? { ...template, assignedEmployees: employeeIds }
        : template
    ))
  }

  const pl_handleGeneratePreReport = async () => {
    if (pl_mode === 'employee-first') {
      // Original employee-first logic
      if (pl_selectedEmployeeIds.length === 0) {
        toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
        return
      }

      const selectedEmployees = employees.filter(e => pl_selectedEmployeeIds.includes(e.id))
      const plannedLeavesData: any[] = []

      for (const emp of selectedEmployees) {
        const detail = pl_employeeDetails[emp.id]
        if (detail && detail.leavePeriods.length > 0) {
          // Create separate records for each leave period
          for (const period of detail.leavePeriods) {
            plannedLeavesData.push({
              employeeId: emp.id,
              employeeName: emp.name,
              startDate: period.startDate,
              endDate: period.endDate,
              totalDays: period.totalDays,
              leaveType: period.leaveType,
              reason: period.reason
            })
          }
        } else {
          // Use global settings if no individual periods
          if (pl_globalDates.length === 0) {
            toast({ title: `يرجى تحديد تواريخ للموظف ${emp.name}`, variant: "destructive" })
            return
          }
          const sorted = [...pl_globalDates].sort((a,b)=>a.getTime()-b.getTime());
          plannedLeavesData.push({
            employeeId: emp.id,
            employeeName: emp.name,
            dates: sorted.map(d => format(d, "yyyy-MM-dd")),
            startDate: format(sorted[0], "yyyy-MM-dd"),
            endDate: format(sorted[sorted.length-1], "yyyy-MM-dd"),
            totalDays: sorted.length,
            leaveType: pl_globalLeaveType,
            reason: pl_globalReason
          })
        }
      }

      await generateLeavePreReportPDF(plannedLeavesData)
      
      for (const leaveData of plannedLeavesData) {
        await addPlannedLeave({
          employeeId: leaveData.employeeId,
          employeeName: leaveData.employeeName,
          startDate: leaveData.startDate,
          endDate: leaveData.endDate,
          totalDays: leaveData.totalDays,
          leaveType: leaveData.leaveType as any,
          reason: leaveData.reason,
          branchId: (user as any)?.branchId || undefined
        })
      }
    } else {
      // New leave-first logic
      const selectedTemplates = pl_leaveTemplates.filter(t => pl_selectedLeaveTemplateIds.includes(t.id))
      const plannedLeavesData: any[] = []

      for (const template of selectedTemplates) {
        for (const empId of template.assignedEmployees) {
          const emp = employees.find(e => e.id === empId)
          if (emp) {
            plannedLeavesData.push({
              employeeId: emp.id,
              employeeName: emp.name,
              startDate: template.startDate,
              endDate: template.endDate,
              totalDays: template.totalDays,
              leaveType: template.leaveType,
              reason: template.reason
            })
          }
        }
      }

      if (plannedLeavesData.length === 0) {
        toast({ title: "يرجى تعيين موظفين للقوالب المحددة", variant: "destructive" })
        return
      }

      await generateLeavePreReportPDF(plannedLeavesData)
      
      for (const leaveData of plannedLeavesData) {
        await addPlannedLeave({
          employeeId: leaveData.employeeId,
          employeeName: leaveData.employeeName,
          startDate: leaveData.startDate,
          endDate: leaveData.endDate,
          totalDays: leaveData.totalDays,
          leaveType: leaveData.leaveType as any,
          reason: leaveData.reason,
          branchId: (user as any)?.branchId || undefined
        })
      }
    }

    toast({ title: "تم إنشاء تقرير الإجازة المسبق بنجاح" })
    setPlShowPreReportModal(false)
    setPlSelectedEmployeeIds([])
    setPlEmployeeDetails({})
    setPlSelectedLeaveTemplateIds([])
  }

  const at_categories = {
    absence: [
      { id: "unexcused", labelAr: "بدون عذر / Unexcused", labelEn: "Unexcused" },
      { id: "excused", labelAr: "بعذر / Excused", labelEn: "Excused" },
      { id: "sick", labelAr: "مرضي / Sick", labelEn: "Sick" },
    ],
    leave: [
      { id: "official", labelAr: "رسمية / Official", labelEn: "Official" },
      { id: "eid", labelAr: "عيد / Eid", labelEn: "Eid" },
      { id: "national", labelAr: "يوم وطني / National Day", labelEn: "National Day" },
    ],
    official_event: [
      { id: "work_visit", labelAr: "زيارة عمل / Work Visit", labelEn: "Work Visit" },
      { id: "training", labelAr: "تدريب / Training", labelEn: "Training" },
    ],
    attendance: [
      { id: "fingerprint", labelAr: "بصمة جهاز / Fingerprint", labelEn: "Fingerprint" },
      { id: "manual", labelAr: "تسجيل يدوي / Manual", labelEn: "Manual" },
    ]
  }

  const at_filteredRecords = useMemo(() => {
    return absenceRecords.filter(record => {
      const matchMonth = record.date?.startsWith(at_filterMonth) ?? false
      let matchEmployee = at_filterEmployeeId === "all"
      if (!matchEmployee) matchEmployee = record.employeeId === at_filterEmployeeId
      const searchLower = at_searchTerm.toLowerCase()
      const matchSearch = at_searchTerm === "" || 
        record.employeeName?.toLowerCase().includes(searchLower) ||
        record.notes?.toLowerCase()?.includes(searchLower) ||
        record.date?.includes(at_searchTerm)
      return matchEmployee && matchMonth && matchSearch
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [absenceRecords, at_filterEmployeeId, at_filterMonth, at_searchTerm])

  const handleAtSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (at_selectedEmployeeIds.length === 0) {
      toast({ title: "يرجى اختيار موظف واحد على الأقل", variant: "destructive" })
      return
    }
    const selectedEmps = employees.filter(e => at_selectedEmployeeIds.includes(e.id))
    for (const emp of selectedEmps) {
      await addAbsenceRecord({
        employeeId: emp.id,
        employeeName: emp.name,
        date: at_date,
        type: at_recordType,
        category: at_category,
        excuse: at_excuse,
        attachmentUrl: at_attachment || undefined,
        notes: at_notes,
        branchId: (user as any)?.branchId || undefined
      })
    }
    toast({ title: t("hr.attendance.success") })
    setAtSelectedEmployeeIds([])
    setAtNotes("")
    setAtExcuse("")
    setAtAttachment(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <DualText k="hr.title" />
            </h1>
            <p className="text-muted-foreground text-base mt-1">إدارة شؤون الموظفين - الإضافي والغياب / Employee Management</p>
          </div>
        </div>

        <Tabs defaultValue="overtime" className="w-full">
          <TabsList className="h-14 bg-white shadow-sm mb-6 border-2 w-full md:w-auto overflow-x-auto justify-start">
            <TabsTrigger value="overtime" className="h-10 text-lg font-black px-8 data-[state=active]:bg-primary data-[state=active]:text-white">
              <Clock className="h-5 w-5 ml-2" /> <DualText k="hr.overtime.title" />
            </TabsTrigger>
            <TabsTrigger value="attendance" className="h-10 text-lg font-black px-8 data-[state=active]:bg-primary data-[state=active]:text-white">
              <CalendarDays className="h-5 w-5 ml-2" /> <DualText k="hr.attendance.title" />
            </TabsTrigger>
            <TabsTrigger value="reports" className="h-10 text-lg font-black px-8 data-[state=active]:bg-primary data-[state=active]:text-white">
              <Calculator className="h-5 w-5 ml-2" /> التقارير الشاملة / Combined Reports
            </TabsTrigger>
            <TabsTrigger value="zkteco" className="h-10 text-lg font-black px-8 data-[state=active]:bg-primary data-[state=active]:text-white">
              <Users className="h-5 w-5 ml-2" /> جهاز البصمة / Fingerprint
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overtime" className="animate-in fade-in slide-in-from-top-4 duration-300">
             {/* OVERTIME UI BLOCKS */}
             <div className="flex flex-col gap-8">
               <Card className="shadow-xl border-primary/10 overflow-hidden">
                 <CardHeader className="bg-primary/5 py-4 border-b">
                   <CardTitle className="text-xl font-bold flex items-center gap-3">
                     <Plus className="h-6 w-6 text-primary" /> تسجيل سجل جديد / Add New Overtime
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="p-8 space-y-8">
                   <form onSubmit={handleOtSubmit} className="space-y-8">
                     <div className="space-y-4">
                       <div className="flex justify-between items-center border-b pb-2">
                         <Label className="font-black text-lg underline decoration-primary/30">الموظفون / Employees</Label>
                         <div className="flex gap-3">
                           <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0 rounded-full" onClick={() => setShowNewEmployeeInput(!showNewEmployeeInput)}>
                             {showNewEmployeeInput ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                           </Button>
                           <Button type="button" variant="secondary" size="sm" className="h-10 font-bold" onClick={() => setOtSelectedEmployeeIds(employees.map(e => e.id))}>تحديد الكل / Select All</Button>
                           <Button type="button" variant="ghost" size="sm" className="h-10 font-bold text-destructive" onClick={() => setOtSelectedEmployeeIds([])}>مسح / Clear</Button>
                         </div>
                       </div>

                       {showNewEmployeeInput && (
                         <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                           <Input placeholder="اسم الموظف الجديد" value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} className="h-12 text-base shadow-inner"/>
                           <Button type="button" className="h-12 px-6 font-bold" onClick={handleAddEmployee}><Plus className="h-5 w-5 ml-2"/> إضافة</Button>
                         </div>
                       )}

                       <div className="border-2 rounded-xl p-4 bg-slate-50/50 shadow-inner">
                         <div className="grid grid-cols-1 gap-3">
                           {employees.map(emp => (
                             <div key={emp.id} className={`border rounded-lg p-4 transition-all ${ot_selectedEmployeeIds.includes(emp.id) ? 'bg-white border-primary/30 shadow-md' : 'bg-slate-50/50 border-transparent'}`}>
                               {editingEmployeeId === emp.id ? (
                                 <div className="flex gap-2 w-full animate-in zoom-in-95 duration-200">
                                   <Input size={1} value={editEmployeeName} onChange={e => setEditEmployeeName(e.target.value)} className="h-10 text-base font-medium flex-1"/>
                                   <Button size="icon" className="h-10 w-10" onClick={() => handleUpdateEmployee(emp.id)}><Check className="h-5 w-5"/></Button>
                                   <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setEditingEmployeeId(null)}><X className="h-5 w-5"/></Button>
                                 </div>
                               ) : (
                                 <div className="space-y-3">
                                   <div className="flex items-center gap-3">
                                     <Checkbox 
                                       id={`ot-emp-${emp.id}`} 
                                       className="h-6 w-6 border-2" 
                                       checked={ot_selectedEmployeeIds.includes(emp.id)} 
                                       onCheckedChange={() => setOtSelectedEmployeeIds(prev => {
                                                 const newIds = prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id]
                                                 // Initialize employee details when selecting
                                                 if (!prev.includes(emp.id) && !ot_employeeDetails[emp.id]) {
                                                   setOtEmployeeDetails(details => ({
                                                     ...details,
                                                     [emp.id]: {
                                                       fromTime: ot_fromTime,
                                                       toTime: ot_toTime,
                                                       reasons: ot_selectedReasonIds
                                                     }
                                                   }))
                                                 }
                                                 return newIds
                                               })} 
                                     />
                                     <label htmlFor={`ot-emp-${emp.id}`} className="text-base font-bold flex-1 cursor-pointer">{emp.name}</label>
                                     <div className="flex gap-1">
                                       <button type="button" onClick={() => { setEditingEmployeeId(emp.id); setEditEmployeeName(emp.name); }} className="p-1.5 hover:bg-primary/10 rounded-full text-primary"><Clock className="h-4 w-4"/></button>
                                       <button type="button" onClick={() => handleDeleteEmployee(emp.id)} className="p-1.5 hover:bg-destructive/10 rounded-full text-destructive"><Trash2 className="h-4 w-4"/></button>
                                     </div>
                                   </div>
                                   
                                   {/* Individual employee overtime details - show only if selected */}
                                   {ot_selectedEmployeeIds.includes(emp.id) && (
                                     <div className="ml-9 space-y-2 animate-in slide-in-from-top-2 duration-300">
                                       <div className="flex items-center gap-2 text-sm">
                                         <span className="font-medium">وقت إضافي خاص:</span>
                                         <Input 
                                           type="time" 
                                           value={ot_employeeDetails[emp.id]?.fromTime || ot_fromTime}
                                           onChange={(e) => updateEmployeeDetail(emp.id, 'fromTime', e.target.value)}
                                           className="h-8 w-24 text-sm"
                                         />
                                         <span>إلى</span>
                                         <Input 
                                           type="time" 
                                           value={ot_employeeDetails[emp.id]?.toTime || ot_toTime}
                                           onChange={(e) => updateEmployeeDetail(emp.id, 'toTime', e.target.value)}
                                           className="h-8 w-24 text-sm"
                                         />
                                         <span className="text-xs text-muted-foreground">
                                           ({ot_calculateHours(ot_employeeDetails[emp.id]?.fromTime || ot_fromTime, ot_employeeDetails[emp.id]?.toTime || ot_toTime)} ساعة)
                                         </span>
                                       </div>
                                       
                                       <div className="flex items-start gap-2">
                                         <span className="font-medium text-sm mt-1">أسباب خاصة:</span>
                                         <div className="flex-1">
                                           <div className="grid grid-cols-1 gap-1">
                                             {overtimeReasons.map(reason => (
                                               <div key={reason.id} className="flex items-center gap-2">
                                                 <Checkbox 
                                                   id={`emp-${emp.id}-reason-${reason.id}`}
                                                   className="h-4 w-4"
                                                   checked={ot_employeeDetails[emp.id]?.reasons.includes(reason.name) || false}
                                                   onCheckedChange={(checked) => {
                                                     const currentReasons = ot_employeeDetails[emp.id]?.reasons || []
                                                     const newReasons = checked 
                                                       ? [...currentReasons, reason.name]
                                                       : currentReasons.filter(r => r !== reason.name)
                                                     updateEmployeeReasons(emp.id, newReasons)
                                                   }}
                                                 />
                                                 <label htmlFor={`emp-${emp.id}-reason-${reason.id}`} className="text-xs cursor-pointer">{reason.name}</label>
                                               </div>
                                             ))}
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-100/50 border-2 rounded-2xl">
                       <div className="space-y-2"><Label className="font-black">التاريخ / Date</Label><Input type="date" value={ot_date} onChange={e => setOtDate(e.target.value)} className="h-12 font-bold" /></div>
                       <div className="space-y-2"><Label className="font-black">من / From</Label><Input type="time" value={ot_fromTime} onChange={e => setOtFromTime(e.target.value)} className="h-12 font-bold" /></div>
                       <div className="space-y-2"><Label className="font-black">إلى / To</Label><Input type="time" value={ot_toTime} onChange={e => setOtToTime(e.target.value)} className="h-12 font-bold" /></div>
                     </div>

                     <div className="space-y-4">
                       <div className="flex justify-between items-center border-b pb-2">
                         <Label className="font-black text-lg underline decoration-primary/30">الأسباب / Reasons</Label>
                         <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0 rounded-full" onClick={() => setShowNewReasonInput(!showNewReasonInput)}>
                           {showNewReasonInput ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                         </Button>
                       </div>

                       {showNewReasonInput && (
                         <div className="flex gap-3 mb-4 animate-in fade-in duration-300">
                                                       <div className="relative flex-1">
                              <Input 
                                placeholder="سبب جديد / New Reason" 
                                value={newReasonName} 
                                onChange={e => setNewReasonName(e.target.value)} 
                                className="h-12 text-base shadow-inner pr-12"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1 h-10 w-10 text-primary hover:text-primary/80"
                                onClick={handleTranslateReason}
                                disabled={isTranslatingReason || !newReasonName.trim()}
                                title="ترجمة مدمجة / Integrated Translation"
                              >
                                {isTranslatingReason ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                ) : (
                                  <Languages className="h-5 w-5" />
                                )}
                              </Button>
                            </div>

                           <Button type="button" className="h-12 px-6 font-bold" onClick={handleAddReason}><Plus className="h-5 w-5 ml-2"/> إضافة</Button>
                         </div>
                       )}

                       <div className="border-2 rounded-xl p-4 bg-slate-50/50">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                           {overtimeReasons.map(r => (
                             <div key={r.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg group">
                               {editingReasonId === r.id ? (
                                  <div className="flex gap-2 w-full animate-in zoom-in-95 duration-200">
                                    <Input value={editReasonName} onChange={e => setEditReasonName(e.target.value)} className="h-10 text-base font-medium flex-1"/>
                                    <Button size="icon" className="h-10 w-10" onClick={() => handleUpdateReason(r.id)}><Check className="h-5 w-5"/></Button>
                                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setEditingReasonId(null)}><X className="h-5 w-5"/></Button>
                                  </div>
                               ) : (
                                 <>
                                   <Checkbox id={`r-${r.id}`} className="h-6 w-6" checked={ot_selectedReasonIds.includes(r.name)} onCheckedChange={(checked) => setOtSelectedReasonIds(prev => checked ? [...prev, r.name] : prev.filter(n => n !== r.name))} />
                                   <label htmlFor={`r-${r.id}`} className="text-base font-bold cursor-pointer line-clamp-1 flex-1">{r.name}</label>
                                   <div className="hidden group-hover:flex gap-1">
                                     <button type="button" onClick={() => { setEditingReasonId(r.id); setEditReasonName(r.name); }} className="p-1.5 hover:bg-primary/10 rounded-full text-primary"><Clock className="h-4 w-4"/></button>
                                     <button type="button" onClick={() => handleDeleteReason(r.id)} className="p-1.5 hover:bg-destructive/10 rounded-full text-destructive"><Trash2 className="h-4 w-4"/></button>
                                   </div>
                                 </>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                     </div>

                     <div className="flex flex-col md:flex-row gap-6 items-stretch">
                       <Card className="bg-slate-900 text-white border-0 shadow-lg flex-1">
                         <CardContent className="p-6 text-center">
                           <div className="text-sm opacity-70 font-black uppercase">إجمالي الساعات / Total Hours</div>
                           <div className="text-5xl font-black text-primary">{convertNumbersToEnglish(ot_grandTotalHours)} Hr</div>
                         </CardContent>
                       </Card>
                       <Button type="submit" className="flex-[2] h-auto p-8 text-2xl font-black shadow-xl">
                         <Save className="h-8 w-8 ml-4"/> حفظ الإضافي / Save Overtime
                       </Button>
                     </div>
                   </form>
                 </CardContent>
               </Card>

               <Card className="shadow-xl border-slate-200 overflow-hidden">
                 <CardHeader className="bg-slate-900 text-white flex flex-row items-center justify-between py-6 px-8">
                   <CardTitle className="text-2xl font-black flex items-center gap-3"><Clock className="h-8 w-8 text-primary" /> سجل وتقارير الساعات / Overtime History</CardTitle>
                   <div className="flex gap-4">
                         <Button variant="outline" onClick={() => generateOvertimeReportPDF(ot_selectedRowIds.length > 0 ? ot_filteredEntries.filter(e => ot_selectedRowIds.includes(e.id)) : ot_filteredEntries, ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`, "تقرير", "detailed")} className="bg-white text-slate-900 font-black flex-col h-auto py-3"><Printer className="ml-2 h-4 w-4"/> <span>تقرير مفصل</span><span className="text-xs">Detailed Report</span></Button>
                         <Button variant="outline" onClick={() => generateOvertimeReportPDF(ot_selectedRowIds.length > 0 ? ot_filteredEntries.filter(e => ot_selectedRowIds.includes(e.id)) : ot_filteredEntries, ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`, "تقرير", "merged")} className="bg-white text-slate-900 font-black flex-col h-auto py-3"><Printer className="ml-2 h-4 w-4"/> <span>تقرير مدمج (خلاصة)</span><span className="text-xs">Merged Report (Summary)</span></Button>
                   </div>
                 </CardHeader>
                 <CardContent className="p-0">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 border-b">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">بحث / Search</Label>
                        <Input placeholder="بحث / Search..." value={ot_searchTerm} onChange={e => setOtSearchTerm(e.target.value)} className="h-12" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">الموظف / Employee</Label>
                        <Select value={ot_filterEmployeeId} onValueChange={setOtFilterEmployeeId}>
                          <SelectTrigger className="h-12"><SelectValue placeholder="Employee"/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">الكل / All</SelectItem>
                            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <div className="flex items-center gap-4 mb-1">
                          <Label className="text-xs font-bold">تصفية التاريخ / Date Filter</Label>
                          <RadioGroup 
                            value={ot_dateFilterType} 
                            onValueChange={(v: "month" | "range") => setOtDateFilterType(v)} 
                            className="flex items-center gap-4"
                          >
                            <div className="flex items-center gap-1">
                              <RadioGroupItem value="month" id="ot-month" />
                              <Label htmlFor="ot-month" className="text-xs cursor-pointer">بالشهر / Month</Label>
                            </div>
                            <div className="flex items-center gap-1">
                              <RadioGroupItem value="range" id="ot-range" />
                              <Label htmlFor="ot-range" className="text-xs cursor-pointer">نطاق تاريخ / Range</Label>
                            </div>
                          </RadioGroup>
                        </div>
                        {ot_dateFilterType === "month" ? (
                          <Input type="month" value={ot_filterMonth} onChange={e => setOtFilterMonth(e.target.value)} className="h-12" />
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black uppercase text-primary/70">من تاريخ / From Date</Label>
                              <Input type="date" value={ot_filterStartDate} onChange={e => setOtFilterStartDate(e.target.value)} className="h-12 font-bold" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black uppercase text-primary/70">إلى تاريخ / To Date</Label>
                              <Input type="date" value={ot_filterEndDate} onChange={e => setOtFilterEndDate(e.target.value)} className="h-12 font-bold" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 border-b">
                      <div className="flex flex-col gap-4">
                        <Label className="font-black text-blue-900">تقارير الموظفين / Employee Reports:</Label>
                        
                        {/* Single Employee Section */}
                        <div className="flex flex-col md:flex-row gap-3 items-center p-3 bg-white rounded-lg border">
                          <Label className="font-black text-blue-800">موظف واحد / Single Employee:</Label>
                          <div className="flex gap-3 items-center flex-1">
                            <Select value={singleEmployeeFilterId} onValueChange={setSingleEmployeeFilterId}>
                              <SelectTrigger className="h-10 w-full md:w-48"><SelectValue placeholder="اختر موظف"/></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">اختر موظف / Select Employee</SelectItem>
                                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button 
                              onClick={async () => {
                                const emp = employees.find(e => e.id === singleEmployeeFilterId)
                                if (emp) {
                                  // Find entries where this employee is present (using normalized name for better matching)
                                  const normalizedSearchName = emp.name.trim().toLowerCase()
                                  const empEntries = overtimeEntries.filter(entry => {
                                    // Match Date/Month
                                    let matchDate = false
                                    if (ot_dateFilterType === "month") {
                                      matchDate = entry.date?.startsWith(ot_filterMonth) ?? false
                                    } else {
                                      const entryDate = entry.date || ""
                                      matchDate = (!ot_filterStartDate || entryDate >= ot_filterStartDate) &&
                                                  (!ot_filterEndDate || entryDate <= ot_filterEndDate)
                                    }
                                    if (!matchDate) return false

                                    // Match Employee (ID or Name)
                                    const matchId = entry.employeeIds?.includes(emp.id) || (entry as any).employeeId === emp.id
                                    const matchName = entry.employeeNames?.some(name => name.trim().toLowerCase() === normalizedSearchName)
                                    
                                    return matchId || matchName
                                  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""))

                                  await generateSingleEmployeeOvertimeReportPDF(
                                    emp.name, 
                                    empEntries,
                                    ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`
                                  )
                                }
                              }} 
                              disabled={singleEmployeeFilterId === "all"}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-black"
                            >
                              <Printer className="h-4 w-4 ml-2" />
                              <span>طباعة تقرير الموظف</span>
                              <span className="text-xs">Print Employee Report</span>
                            </Button>
                          </div>
                        </div>

                        {/* Multiple Employees Section */}
                        <div className="flex flex-col gap-3 p-3 bg-green-50 rounded-lg border">
                          <div className="flex justify-between items-center">
                            <Label className="font-black text-green-800">عدة موظفين / Multiple Employees:</Label>
                            <div className="flex gap-2">
                              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedEmployeeIds(employees.map(e => e.id))}>
                                تحديد الكل / Select All
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setSelectedEmployeeIds([])}>
                                مسح / Clear
                              </Button>
                            </div>
                          </div>
                          <div className="border-2 rounded-xl p-3 bg-white max-h-40 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {employees.map(emp => (
                                <div key={emp.id} className="flex items-center gap-2 p-1 hover:bg-green-50 rounded">
                                  <Checkbox 
                                    id={`multi-emp-${emp.id}`} 
                                    className="h-5 w-5" 
                                    checked={selectedEmployeeIds.includes(emp.id)} 
                                    onCheckedChange={() => setSelectedEmployeeIds(prev => 
                                      prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id]
                                    )} 
                                  />
                                  <label htmlFor={`multi-emp-${emp.id}`} className="text-sm font-medium cursor-pointer">{emp.name}</label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <Button 
                            onClick={async () => {
                              const selectedEmps = employees.filter(e => selectedEmployeeIds.includes(e.id))
                              const employeesData = selectedEmps.map(emp => {
                                const normalizedSearchName = emp.name.trim().toLowerCase()
                                const empEntries = overtimeEntries.filter(entry => {
                                  // Match Date/Month
                                  let matchDate = false
                                  if (ot_dateFilterType === "month") {
                                    matchDate = entry.date?.startsWith(ot_filterMonth) ?? false
                                  } else {
                                    const entryDate = entry.date || ""
                                    matchDate = (!ot_filterStartDate || entryDate >= ot_filterStartDate) &&
                                                (!ot_filterEndDate || entryDate <= ot_filterEndDate)
                                  }
                                  if (!matchDate) return false

                                  // Match Employee (ID or Name)
                                  const matchId = entry.employeeIds?.includes(emp.id) || (entry as any).employeeId === emp.id
                                  const matchName = entry.employeeNames?.some(name => name.trim().toLowerCase() === normalizedSearchName)
                                  
                                  return matchId || matchName
                                }).sort((a, b) => (b.date || "").localeCompare(a.date || ""))

                                return {
                                  employeeName: emp.name,
                                  entries: empEntries
                                }
                              })
                              await generateMultiEmployeeOvertimeReportPDF(
                                employeesData,
                                ot_dateFilterType === 'month' ? ot_filterMonth : `${ot_filterStartDate} - ${ot_filterEndDate}`
                              )
                            }} 
                            disabled={selectedEmployeeIds.length === 0}
                            className="bg-green-600 hover:bg-green-700 text-white font-black w-full"
                          >
                            <Printer className="h-4 w-4 ml-2" />
                            <span>طباعة تقرير مجمع ({selectedEmployeeIds.length} موظف)</span>
                            <span className="text-xs">Print Merged Report ({selectedEmployeeIds.length} employees)</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="p-6 w-16 text-center"><Checkbox checked={ot_filteredEntries.length > 0 && ot_selectedRowIds.length === ot_filteredEntries.length} onCheckedChange={(val) => val ? setOtSelectedRowIds(ot_filteredEntries.map(e => e.id)) : setOtSelectedRowIds([])} /></th>
                            <th className="p-6 font-black">الموظفون / Employees</th>
                            <th className="p-6 text-center font-black">التاريخ / Date</th>
                            <th className="p-6 text-center font-black">الساعات / Hours</th>
                            <th className="p-6 text-center font-black">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {ot_filteredEntries.map(entry => (
                            <tr key={entry.id} className={cn(ot_selectedRowIds.includes(entry.id) && "bg-primary/5")}>
                              <td className="p-6 text-center"><Checkbox checked={ot_selectedRowIds.includes(entry.id)} onCheckedChange={() => setOtSelectedRowIds(prev => prev.includes(entry.id) ? prev.filter(i => i !== entry.id) : [...prev, entry.id])} /></td>
                              <td className="p-6"><div className="flex flex-wrap gap-1">{(entry.employeeNames || []).map((n, i) => <Badge key={i} variant="outline" className="font-bold">{n}</Badge>)}</div></td>
                              <td className="p-6 text-center font-black">{convertNumbersToEnglish(entry.date)} <br/><span className="text-xs text-muted-foreground">{entry.fromTime} - {entry.toTime}</span></td>
                              <td className="p-6 text-center text-primary font-black text-xl">{convertNumbersToEnglish(entry.totalHours)} Hr</td>
                              <td className="p-6 text-center">
                                <div className="flex justify-center gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => generateOvertimePDF(entry)}><Printer className="h-5 w-5"/></Button>
                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("حذف؟")) deleteOvertimeEntry(entry.id) }}><Trash2 className="h-5 w-5"/></Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </CardContent>
               </Card>
             </div>
          </TabsContent>

          <TabsContent value="attendance" className="animate-in fade-in slide-in-from-top-4 duration-300">
             {/* ATTENDANCE UI BLOCKS */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Card className="shadow-xl border-primary/10">
                    <CardHeader className="bg-primary/5 py-4 border-b">
                      <CardTitle className="text-xl font-bold flex items-center gap-3"><UserCheck className="h-6 w-6 text-primary" /> تسجيل غياب أو إجازة / Register Absence or Leave</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      <form onSubmit={handleAtSubmit} className="space-y-6">
                        <div className="space-y-3">
                          <Label className="font-black text-lg underline decoration-primary/30">الموظفون / Employees</Label>
                          <div className="border-2 rounded-xl p-4 bg-slate-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {employees.map(emp => (
                                <div key={emp.id} className="flex items-center gap-3 p-1 hover:bg-white rounded">
                                  <Checkbox id={`at-emp-${emp.id}`} className="h-6 w-6" checked={at_selectedEmployeeIds.includes(emp.id)} onCheckedChange={() => setAtSelectedEmployeeIds(prev => prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id])} />
                                  <label htmlFor={`at-emp-${emp.id}`} className="font-bold flex-1 cursor-pointer">{emp.name}</label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2"><Label className="font-black">التاريخ / Date</Label><Input type="date" value={at_date} onChange={e => setAtDate(e.target.value)} className="h-12 font-bold" /></div>
                           <div className="space-y-2"><Label className="font-black">النوع / Type</Label>
                             <Select value={at_recordType} onValueChange={(v:any) => { setAtRecordType(v); setAtCategory(at_categories[v as keyof typeof at_categories][0].id) }}>
                               <SelectTrigger className="h-12 text-lg font-bold"><SelectValue/></SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="attendance">حضور / Attendance</SelectItem>
                                 <SelectItem value="absence">غياب / Absence</SelectItem>
                                 <SelectItem value="leave">إجازة / Leave</SelectItem>
                                 <SelectItem value="official_event">مناسبة رسمية / Official</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="font-black">الفئة / Category</Label>
                          <RadioGroup value={at_category} onValueChange={setAtCategory} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                             {at_categories[at_recordType].map(cat => (
                               <Label key={cat.id} className={cn("p-4 border-2 rounded-xl text-center cursor-pointer", at_category === cat.id ? "border-primary bg-primary/5" : "border-slate-200")}>
                                 <RadioGroupItem value={cat.id} className="sr-only" />
                                 <div className="font-black">{cat.labelAr}</div>
                               </Label>
                             ))}
                          </RadioGroup>
                        </div>
                        <div className="space-y-3">
                          <Label className="font-black">ملاحظات / Notes</Label>
                          <div className="relative">
                            <Input 
                              value={at_notes} 
                              onChange={e => setAtNotes(e.target.value)} 
                              placeholder="ملاحظات إضافية / Additional Notes" 
                              className="h-12 pr-12" 
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-1 top-1 h-10 w-10 text-primary hover:text-primary/80"
                              onClick={() => handleTranslateAtField('notes')}
                              disabled={isTranslatingAtNotes || !at_notes.trim()}
                              title="ترجمة مدمجة / Integrated Translation"
                            >
                              {isTranslatingAtNotes ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              ) : (
                                <Languages className="h-5 w-5" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {(at_category === 'excused' || at_category === 'sick') && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                            <div className="space-y-3">
                              <Label className="font-black">سبب الغياب (العذر) / Excuse Reason</Label>
                              <div className="relative">
                                <Input 
                                  value={at_excuse} 
                                  onChange={e => setAtExcuse(e.target.value)} 
                                  placeholder="اكتب العذر هنا / Type excuse here..." 
                                  className="h-12 pr-12" 
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-1 top-1 h-10 w-10 text-primary hover:text-primary/80"
                                  onClick={() => handleTranslateAtField('excuse')}
                                  disabled={isTranslatingAtExcuse || !at_excuse.trim()}
                                  title="ترجمة مدمجة / Integrated Translation"
                                >
                                  {isTranslatingAtExcuse ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  ) : (
                                    <Languages className="h-5 w-5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <Label className="font-black">إرفاق صورة (تقرير طبي/عذر) / Attachment</Label>
                              <div className="flex gap-2">
                                <Input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setAtAttachment(reader.result as string);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="h-12 flex-1 pt-2" 
                                />
                                {at_attachment && (
                                  <div className="relative h-12 w-12 border rounded overflow-hidden">
                                    <img src={at_attachment} alt="Attachment" className="object-cover h-full w-full" />
                                    <button 
                                      type="button" 
                                      onClick={() => setAtAttachment(null)}
                                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <Button type="submit" className="w-full h-16 text-xl font-black shadow-xl"><Save className="h-6 w-6 ml-3" /> حفظ سجل الحضور / Save Attendance</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                   <Card className="shadow-lg border-primary/10">
                     <CardHeader className="bg-slate-900 text-white py-4"><CardTitle className="text-lg font-black flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> إحصائيات الشهر / Monthly Stats</CardTitle></CardHeader>
                     <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between p-4 bg-red-50 rounded-xl border border-red-100"><div className="font-black text-red-700">غياب / Absence</div><div className="text-3xl font-black text-red-900">{convertNumbersToEnglish(at_filteredRecords.filter(r => r.type==='absence').length)}</div></div>
                        <div className="flex justify-between p-4 bg-orange-50 rounded-xl border border-orange-100"><div className="font-black text-orange-700">إجازة / Leave</div><div className="text-3xl font-black text-orange-900">{convertNumbersToEnglish(at_filteredRecords.filter(r => r.type==='leave').length)}</div></div>
                        <Button className="w-full h-12 mt-4 font-black gap-2" variant="outline" onClick={() => generateAttendanceReportPDF(at_filteredRecords, at_filterMonth)}><Printer className="h-4 w-4"/> تصدير تقرير PDF / Export Report</Button>
                        <Button className="w-full h-12 mt-2 font-black gap-2" variant="default" onClick={() => setPlShowPreReportModal(true)}><FileText className="h-4 w-4"/> تقرير إجازة مسبق / Leave Pre-Report</Button>
                        <Button className="w-full h-12 mt-2 font-black gap-2" variant="secondary" onClick={() => setPlShowLogModal(true)}><CalendarDays className="h-4 w-4"/> سجل الإجازات المسبقة / Leaves Log</Button>
                     </CardContent>
                   </Card>
                   <Card className="shadow-lg p-4 space-y-4">
                      <Label className="font-black px-1">تصفية السجل / Filter Log</Label>
                      <Select value={at_filterEmployeeId} onValueChange={setAtFilterEmployeeId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل / All</SelectItem>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select>
                      <Input type="month" value={at_filterMonth} onChange={e => setAtFilterMonth(e.target.value)} />
                      <Input placeholder="بحث / Search..." value={at_searchTerm} onChange={e => setAtSearchTerm(e.target.value)} />
                   </Card>
                </div>

                <div className="lg:col-span-3">
                   <Card className="shadow-xl overflow-hidden border-slate-200">
                     <CardHeader className="bg-slate-900 text-white py-4 px-6 flex justify-between items-center"><CardTitle className="font-black">سجل الغياب والحضور / Attendance Log</CardTitle></CardHeader>
                     <CardContent className="p-0">
                       <table className="w-full text-right border-collapse">
                         <thead className="bg-slate-50 border-b"><tr><th className="p-4">الموظف / Employee</th><th className="p-4 text-center">التاريخ / Date</th><th className="p-4 text-center">النوع / Type</th><th className="p-4 text-center">الفئة / Category</th><th className="p-4 text-center">إجراءات / Actions</th></tr></thead>
                         <tbody className="divide-y">
                           {at_filteredRecords.map(r => (
                             <tr key={r.id} className="hover:bg-slate-50">
                               <td className="p-4 font-bold">{r.employeeName}</td>
                               <td className="p-4 text-center font-black">{convertNumbersToEnglish(r.date)}</td>
                               <td className="p-4 text-center"><Badge variant="outline" className="font-bold">{r.type}</Badge></td>
                               <td className="p-4 text-center"><Badge className="bg-slate-100 text-slate-800 border-0 font-bold">{r.category}</Badge></td>
                               <td className="p-4 text-center">
                                 <div className="flex justify-center gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => generateAttendancePDF(r)}><Printer className="h-5 w-5"/></Button>
                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("حذف؟")) deleteAbsenceRecord(r.id) }}><Trash2 className="h-5 w-5"/></Button>
                                 </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </CardContent>
                   </Card>
                </div>
             </div>
          </TabsContent>

          <TabsContent value="reports" className="animate-in fade-in slide-in-from-top-4 duration-300">
             <Card className="shadow-xl max-w-2xl mx-auto border-primary/10">
               <CardHeader className="bg-slate-900 text-white rounded-t-xl py-6">
                 <CardTitle className="text-2xl font-black flex items-center justify-center gap-3">
                   <Printer className="h-8 w-8 text-primary" /> تقرير الموظف الشهري الشامل / Combined Monthly Report
                 </CardTitle>
               </CardHeader>
               <CardContent className="p-8 space-y-6 flex flex-col items-center">
                  <div className="w-full text-center text-muted-foreground mb-4 font-bold">
                    سيقوم هذا النظام بتجميع كافة الساعات الإضافية وحالات الغياب والإجازات لموظف معين خلال شهر محدد في تقرير PDF واحد.
                  </div>
                  <div className="w-full space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <Label className="font-black text-lg">الموظفون / Employees</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setCrSelectedEmployeeIds(employees.map(e => e.id))}>تحديد الكل</Button>
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setCrSelectedEmployeeIds([])}>مسح</Button>
                      </div>
                    </div>
                    <div className="border-2 rounded-xl p-4 bg-slate-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                        {employees.map(emp => (
                          <div key={emp.id} className="flex items-center gap-3 p-1 hover:bg-white rounded">
                            <Checkbox id={`cr-emp-${emp.id}`} className="h-6 w-6" checked={cr_selectedEmployeeIds.includes(emp.id)} onCheckedChange={() => setCrSelectedEmployeeIds(prev => prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id])} />
                            <label htmlFor={`cr-emp-${emp.id}`} className="font-bold flex-1 cursor-pointer">{emp.name}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-center gap-8 p-3 bg-slate-100 rounded-lg">
                      <RadioGroup 
                        value={cr_dateFilterType} 
                        onValueChange={(v: "month" | "range") => setCrDateFilterType(v)} 
                        className="flex items-center gap-6"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="month" id="cr-month" />
                          <Label htmlFor="cr-month" className="font-bold cursor-pointer">بالشهر / By Month</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="range" id="cr-range" />
                          <Label htmlFor="cr-range" className="font-bold cursor-pointer">نطاق تاريخ / Date Range</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {cr_dateFilterType === "month" ? (
                      <div className="space-y-3">
                        <Label className="font-black text-lg">اختر الشهر / Select Month</Label>
                        <Input type="month" value={cr_month} onChange={e => setCrMonth(e.target.value)} className="h-14 text-lg font-bold text-center" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label className="font-black">من تاريخ / From Date</Label>
                          <Input type="date" value={cr_startDate} onChange={e => setCrStartDate(e.target.value)} className="h-14 text-lg font-bold" />
                        </div>
                        <div className="space-y-2 text-right">
                          <Label className="font-black">إلى تاريخ / To Date</Label>
                          <Input type="date" value={cr_endDate} onChange={e => setCrEndDate(e.target.value)} className="h-14 text-lg font-bold" />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-4">
                    <Button 
                      onClick={() => handleGenerateCombinedReport('detailed')} 
                      className="h-20 text-lg font-black shadow-xl bg-primary hover:bg-primary/90 flex-col"
                      disabled={cr_selectedEmployeeIds.length === 0}
                    >
                      <Printer className="h-6 w-6 mb-1" /> <span>تقرير مفصل</span><span className="text-sm">Detailed Report</span>
                    </Button>
                    <Button 
                      onClick={() => handleGenerateCombinedReport('merged')} 
                      className="h-20 text-lg font-black shadow-xl border-primary text-primary hover:bg-primary/10 flex-col"
                      variant="outline"
                      disabled={cr_selectedEmployeeIds.length === 0}
                    >
                      <Printer className="h-6 w-6 mb-1" /> <span>تقرير مدمج (خلاصة)</span><span className="text-sm">Merged Report (Summary)</span>
                    </Button>
                    <Button 
                      onClick={() => handleGenerateCombinedReport('summary')} 
                      className="h-20 text-lg font-black shadow-xl border-orange-500 text-orange-600 hover:bg-orange-50 flex-col"
                      variant="outline"
                      disabled={cr_selectedEmployeeIds.length === 0}
                    >
                      <Printer className="h-6 w-6 mb-1" /> <span>تقرير مختصر</span><span className="text-sm">Brief Report</span>
                    </Button>
                  </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="zkteco" className="animate-in fade-in slide-in-from-top-4 duration-300">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-1 space-y-6">
                 <Card className="shadow-xl border-primary/10">
                   <CardHeader className="bg-primary/5 py-4 border-b">
                     <CardTitle className="text-xl font-bold flex items-center gap-3">
                        <Plus className="h-6 w-6 text-primary" /> 
                        <span>إعدادات الجهاز / Device Settings</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleApplyUserMappings}
                          className="mr-auto h-7 text-[10px] text-primary hover:bg-primary/10 border border-primary/20"
                        >
                          📦 تطبيق الربط المطلوب
                        </Button>
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-6 space-y-4">
                     <div className="space-y-2">
                       <Label className="font-black">عنوان الـ IP / IP Address</Label>
                       <Input value={zk_ip} onChange={e => setZkIp(e.target.value)} placeholder="192.168.8.186" className="h-12 font-bold" />
                     </div>
                     <div className="space-y-2">
                       <Label className="font-black">المنفذ / Port</Label>
                       <Input value={zk_port} onChange={e => setZkPort(e.target.value)} placeholder="4370" className="h-12 font-bold" />
                     </div>
                     <Button 
                       onClick={handleZkSync} 
                       disabled={zk_status === "syncing"}
                       className="w-full h-14 text-lg font-black"
                     >
                       {zk_status === "syncing" ? "جاري المزامنة..." : "بدء المزامنة / Start Sync"}
                     </Button>
                     <p className="text-xs text-muted-foreground text-center">
                       يجب أن يكون جهاز البصمة والكمبيوتر على نفس الشبكة المحلية.
                     </p>
                   </CardContent>
                 </Card>

                 {/* Performance Summary Card */}
                 <Card className="shadow-xl border-blue-200 bg-blue-50/20">
                   <CardHeader className="bg-blue-600 text-white py-4 border-b">
                     <CardTitle className="text-xl font-bold flex items-center gap-3">
                       <FileText className="h-6 w-6" /> 
                       <span>تقارير الأداء والشهرية / Performance</span>
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-6 space-y-4 text-right">
                     <div className="grid grid-cols-2 gap-2">
                       <div className="space-y-1">
                         <Label className="text-xs font-bold">من تاريخ / From</Label>
                         <Input type="date" value={zk_perfStartDate} onChange={e => setZkPerfStartDate(e.target.value)} className="h-10 text-sm font-bold" />
                       </div>
                       <div className="space-y-1">
                         <Label className="text-xs font-bold">إلى تاريخ / To</Label>
                         <Input type="date" value={zk_perfEndDate} onChange={e => setZkPerfEndDate(e.target.value)} className="h-10 text-sm font-bold" />
                       </div>
                     </div>
                     <Button 
                       onClick={handleGeneratePerformanceReport} 
                       className="w-full h-12 bg-blue-700 hover:bg-blue-800 font-black flex items-center justify-center gap-2 shadow-lg"
                     >
                       <Printer className="h-5 w-5" />
                       <span>تصدير خلاصة الأداء والتبصيم</span>
                     </Button>
                     <p className="text-[10px] text-muted-foreground text-center">
                       يحسب هذا التقرير إجمالي الساعات، أيام الدوام، وأيام الغياب خلال الفترة المحددة.
                     </p>
                   </CardContent>
                 </Card>

                 <Card className="shadow-lg border-blue-100 bg-blue-50/30">
                   <CardHeader className="py-4 border-b">
                     <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-800">
                       <Info className="h-5 w-5" /> كيف يعمل الربط التلقائي؟
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-4 text-sm space-y-3 text-blue-900 text-right">
                     <p>1. قم بتوصيل جهاز البصمة (ZKTeco MB20-VL) بالشبكة عبر كيبل LAN.</p>
                     <p>2. تأكد من ثبات الـ IP الخاص بالجهاز ({zk_ip}).</p>
                     <p>3. اربط كل موظف برقم البصمة الخاص به في الجدول الجانبي.</p>
                     <p>4. عند الضغط على "بدء المزامنة"، سيقوم النظام بسحب سجلات الحضور وترجمتها تلقائياً إلى غياب أو إضافي.</p>
                   </CardContent>
                 </Card>
               </div>

               <div className="lg:col-span-2 space-y-8">
                 <Card className="shadow-xl border-slate-200 overflow-hidden">
                   <CardHeader className="bg-slate-900 text-white py-4 px-6 flex justify-between items-center">
                     <CardTitle className="font-black">ربط الموظفين بالبصمة / Employee Mapping</CardTitle>
                     {zk_users.length > 0 && (
                       <Badge variant="outline" className="text-white border-white/30">
                         {zk_users.length} مستخدم في الجهاز
                       </Badge>
                     )}
                   </CardHeader>
                   <CardContent className="p-0">
                     <div className="p-4 bg-slate-50 border-b flex gap-4">
                       <Input placeholder="بحث عن موظف..." className="h-10 flex-1" />
                       {zk_logs.length > 0 && (
                         <Button 
                           onClick={handleSaveZkLogs} 
                           variant="default" 
                           className="bg-green-600 hover:bg-green-700"
                           disabled={zk_status === "syncing"}
                         >
                           <Save className="h-4 w-4 ml-2" />
                           اعتماد وحفظ السجلات ({zk_logs.length})
                         </Button>
                       )}
                     </div>
                     <div className="max-h-[400px] overflow-y-auto">
                       <table className="w-full text-right border-collapse">
                         <thead className="bg-slate-50 border-b sticky top-0 z-10">
                           <tr>
                             <th className="p-4 font-black">اسم الموظف / Employee</th>
                             <th className="p-4 text-center font-black">رقم البصمة (Device ID)</th>
                             <th className="p-4 text-center font-black">رقم الجهاز المتوفر</th>
                             <th className="p-4 text-center font-black">الحالة</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y">
                           {employees.map(emp => {
                              const deviceUser = zk_users.find(u => 
                                String(u.userId) === String(emp.fingerprintId) || 
                                String(u.uid) === String(emp.fingerprintId)
                              );

                             return (
                               <tr key={emp.id} className="hover:bg-slate-50">
                                 <td className="p-4">
                                   <div className="font-bold">{emp.name}</div>
                                   <div className="text-[10px] text-muted-foreground">{emp.department || "بدون قسم"}</div>
                                 </td>
                                 <td className="p-4 text-center">
                                   <Input 
                                     placeholder="ID" 
                                     value={emp.fingerprintId || ""} 
                                     onChange={(e) => handleUpdateFingerprintId(emp.id, e.target.value)}
                                     className="h-10 w-24 mx-auto text-center font-bold"
                                   />
                                 </td>
                                 <td className="p-4 text-center">
                                   {deviceUser ? (
                                     <span className="text-green-600 font-black">{deviceUser.name}</span>
                                   ) : (
                                     <span className="text-muted-foreground text-xs italic">غير مفحوص</span>
                                   )}
                                 </td>
                                 <td className="p-4 text-center text-xs">
                                   {emp.fingerprintId ? (
                                     <Badge className="bg-green-100 text-green-700 border-0">مرتبط / Linked</Badge>
                                   ) : (
                                     <Badge variant="outline" className="text-muted-foreground">غير مرتبط</Badge>
                                   )}
                                 </td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                   </CardContent>
                 </Card>

                 {/* Daily Summary Table */}
                 {zk_dailySummary.length > 0 && (
                   <Card className="shadow-xl border-green-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
                     <CardHeader className="bg-green-800 text-white py-4 px-6 flex flex-row items-center justify-between">
                       <CardTitle className="font-black flex items-center gap-2">
                         <Calculator className="h-5 w-5" />
                         خلاصة الحضور والانصراف اليومي / Daily In-Out Summary
                       </CardTitle>
                       <Button 
                          size="sm" 
                          variant="outline" 
                          className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-2 h-9"
                          onClick={() => generateZkAttendanceReportPDF(zk_dailySummary)}
                        >
                          <Printer className="h-4 w-4" />
                          <span>تصدير PDF / Export</span>
                        </Button>
                     </CardHeader>
                     <CardContent className="p-0 text-right">
                       <div className="max-h-[400px] overflow-y-auto">
                         <table className="w-full text-right border-collapse">
                           <thead className="bg-green-50 border-b sticky top-0 z-10">
                             <tr>
                               <th className="p-4 font-black">اسم الموظف / Employee</th>
                               <th className="p-4 text-center font-black">التاريخ / Date</th>
                               <th className="p-4 text-center font-black text-blue-700">أول بصمة (حضور)</th>
                               <th className="p-4 text-center font-black text-orange-600">آخر بصمة (انصراف)</th>
                               <th className="p-4 text-center font-black">البصمات</th>
                               <th className="p-4 text-center font-black text-green-700">الساعات / Duration</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y">
                             {zk_dailySummary.map((sum, i) => (
                               <tr key={i} className="hover:bg-green-50/50">
                                 <td className="p-4 font-bold">{sum.employeeName}</td>
                                 <td className="p-4 text-center">{sum.date}</td>
                                 <td className="p-4 text-center font-black text-blue-700 bg-blue-50/30">{sum.firstSwipe}</td>
                                 <td className="p-4 text-center font-black text-orange-600 bg-orange-50/30">
                                   {sum.count > 1 ? sum.lastSwipe : <span className="text-[10px] text-red-500 font-normal italic">لم يتم التبصيم</span>}
                                 </td>
                                 <td className="p-4 text-center">
                                   <Badge variant="outline">{sum.count}</Badge>
                                 </td>
                                 <td className="p-4 text-center font-bold text-green-700">{sum.duration}</td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     </CardContent>
                   </Card>
                 )}

                 {/* Recently Synced Logs */}
                 {zk_logs.length > 0 && (
                   <Card className="shadow-xl border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
                     <CardHeader className="bg-blue-900 text-white py-4 px-6">
                       <CardTitle className="font-black flex items-center gap-2">
                         <Clock className="h-5 w-5" />
                         حركات البصمة المسحوبة حديثاً / Recently Synced Logs
                       </CardTitle>
                     </CardHeader>
                     <CardContent className="p-0">
                       <div className="max-h-[300px] overflow-y-auto">
                         <table className="w-full text-right border-collapse text-sm">
                           <thead className="bg-slate-50 border-b sticky top-0 z-10">
                             <tr>
                               <th className="p-3 font-black">رقم المستخدم / User ID</th>
                               <th className="p-3 font-black">الاسم بالجهاز</th>
                               <th className="p-3 text-center font-black">التاريخ والوقت</th>
                               <th className="p-3 text-center font-black">الحالة</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y">
                             {zk_logs.slice(0, 100).map((log, i) => {
                                                               const deviceUser = zk_users.find(u => 
                                  String(u.userId) === String(log.deviceUserId) || 
                                  String(u.uid) === String(log.deviceUserId)
                                );
                                                               const employee = employees.find(e => 
                                  String(e.fingerprintId) === String(log.deviceUserId)
                                );
                               return (
                                 <tr key={i} className="hover:bg-blue-50/30">
                                   <td className="p-3 font-bold">{log.deviceUserId}</td>
                                                                       <td className="p-3 font-black text-blue-700">{deviceUser?.name || "مجهول"}</td>
                                   <td className="p-3 text-center">{format(new Date(log.recordTime), "yyyy/MM/dd HH:mm:ss")}</td>
                                   <td className="p-3 text-center">
                                     {employee ? (
                                       <Badge className="bg-blue-100 text-blue-700 border-0">موظف معروف: {employee.name}</Badge>
                                     ) : (
                                       <Badge variant="outline" className="text-red-500 border-red-200">غير مرتبط بنظامنا</Badge>
                                     )}
                                   </td>
                                 </tr>
                               );
                             })}
                             {zk_logs.length > 100 && (
                               <tr>
                                 <td colSpan={4} className="p-4 text-center text-muted-foreground italic">
                                   تم عرض أول 100 حركة فقط من أصل {zk_logs.length}...
                                 </td>
                               </tr>
                             )}
                           </tbody>
                         </table>
                       </div>
                     </CardContent>
                   </Card>
                 )}
               </div>
             </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Leave Pre-Report Modal */}
      <Dialog open={pl_showPreReportModal} onOpenChange={setPlShowPreReportModal}>
        <DialogContent className="max-w-[1400px] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <FileText className="h-6 w-6" />
              تقرير الإجازة المسبق / Leave Pre-Report
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Mode Selection */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg border p-1 bg-muted">
                <Button
                  type="button"
                  variant={pl_mode === 'employee-first' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPlMode('employee-first')}
                  className="px-4"
                >
                  الموظف أولاً
                </Button>
                <Button
                  type="button"
                  variant={pl_mode === 'leave-first' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPlMode('leave-first')}
                  className="px-4"
                >
                  الإجازة أولاً
                </Button>
              </div>
            </div>

            {pl_mode === 'employee-first' ? (
              <>
                {/* Employee Selection */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <Label className="font-black text-lg">الموظفون / Employees</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setPlSelectedEmployeeIds(employees.map(e => e.id))}>تحديد الكل</Button>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setPlSelectedEmployeeIds([])}>مسح</Button>
                    </div>
                  </div>
                  
                  <div className="border-2 rounded-xl p-4 bg-slate-50/50 max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 p-2 hover:bg-white rounded">
                          <Checkbox 
                            id={`pl-emp-${emp.id}`} 
                            checked={pl_selectedEmployeeIds.includes(emp.id)} 
                            onCheckedChange={() => setPlSelectedEmployeeIds(prev => 
                              prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id]
                            )} 
                          />
                          <label htmlFor={`pl-emp-${emp.id}`} className="font-bold flex-1 cursor-pointer">{emp.name}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Global Settings */}
                <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                  <div className="space-y-4 border rounded-xl p-4 bg-white shadow-sm">
                    <Label className="font-black text-lg block text-center">اختر أيام الإجازة / Select Leave Days</Label>
                    <div className="flex justify-center">
                      <CalendarPicker
                        mode="multiple"
                        selected={pl_globalDates}
                        onSelect={(dates) => setPlGlobalDates(dates || [])}
                        className="rounded-md border shadow"
                      />
                    </div>
                    {pl_globalDates.length > 0 && (
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {pl_globalDates.sort((a, b) => a.getTime() - b.getTime()).map(date => (
                          <div key={date.toISOString()} className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-700 shadow-sm">
                            {formatDateWithDay(date)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-black">نوع الإجازة / Leave Type</Label>
                    <Select value={pl_globalLeaveType} onValueChange={setPlGlobalLeaveType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pl_leaveTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>{type.labelAr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black">السبب / Reason</Label>
                    <Input 
                      placeholder="اكتب سبب الإجازة..." 
                      value={pl_globalReason} 
                      onChange={e => setPlGlobalReason(e.target.value)} 
                    />
                  </div>
                </div>

                {/* Individual Employee Details */}
                {pl_selectedEmployeeIds.length > 0 && (
                  <div className="space-y-4">
                    <Label className="font-black text-lg">تفاصيل فردية / Individual Details</Label>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {pl_selectedEmployeeIds.map(empId => {
                        const emp = employees.find(e => e.id === empId)
                        const detail = pl_employeeDetails[empId] || { leavePeriods: [], totalDays: 0 }
                        return (
                          <Card key={empId} className="p-4">
                            <div className="flex justify-between items-center mb-3">
                              <div className="font-bold">{emp?.name}</div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-primary">
                                  إجمالي الأيام: {convertNumbersToEnglish(detail.totalDays)}
                                </div>
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  onClick={() => pl_addLeavePeriod(empId)}
                                  className="h-8 px-3"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  إضافة فترة
                                </Button>
                              </div>
                            </div>
                            
                            {detail.leavePeriods.length === 0 ? (
                              <div className="text-center text-muted-foreground py-4 border-2 border-dashed rounded-lg">
                                لا توجد فترات إجازة مضافة. اضغط "إضافة فترة" للبدء.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {detail.leavePeriods.map((period, index) => (
                                  <Card key={period.id} className="p-3 bg-slate-50">
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="font-bold text-sm">فترة {index + 1}</div>
                                      <Button 
                                        type="button" 
                                        size="sm" 
                                        variant="destructive"
                                        onClick={() => pl_removeLeavePeriod(empId, period.id)}
                                        className="h-6 w-6 p-0"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs">اختر التواريخ / Select Dates</Label>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="w-full h-8 justify-start font-normal">
                                              <CalendarDays className="mr-2 h-4 w-4" />
                                              {period.dates && period.dates.length > 0 
                                                ? `${convertNumbersToEnglish(period.dates.length)} أيام مختارة`
                                                : "اختر الأيام"}
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarPicker
                                              mode="multiple"
                                              selected={period.dates?.map(d => new Date(d))}
                                              onSelect={(dates) => pl_updateLeavePeriod(empId, period.id, 'dates', dates?.map(d => format(d, "yyyy-MM-dd")) || [])}
                                              className="rounded-md border"
                                            />
                                          </PopoverContent>
                                        </Popover>
                                        
                                        {period.dates && period.dates.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white rounded border border-slate-100">
                                            {period.dates.sort().map(d => (
                                              <div key={d} className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-600">
                                                {formatDateWithDay(d)}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">نوع الإجازة</Label>
                                        <Select 
                                          value={period.leaveType} 
                                          onValueChange={value => pl_updateLeavePeriod(empId, period.id, 'leaveType', value)}
                                        >
                                          <SelectTrigger className="h-8 text-sm">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {pl_leaveTypes.map(type => (
                                              <SelectItem key={type.id} value={type.id}>{type.labelAr}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">السبب</Label>
                                        <Input 
                                          value={period.reason}
                                          onChange={e => pl_updateLeavePeriod(empId, period.id, 'reason', e.target.value)}
                                          className="h-8 text-sm"
                                          placeholder="سبب الإجازة..."
                                        />
                                      </div>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Leave Templates Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <Label className="font-black text-lg">قوالب الإجازات / Leave Templates</Label>
                    <Button 
                      type="button" 
                      size="sm" 
                      onClick={() => setPlShowAddLeaveTemplate(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      إضافة قالب
                    </Button>
                  </div>
                  
                  <div className="border-2 rounded-xl p-4 bg-slate-50/50 max-h-60 overflow-y-auto">
                    {pl_leaveTemplates.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        لا توجد قوالب إجازة. اضغط "إضافة قالب" للبدء.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pl_leaveTemplates.map(template => (
                          <Card key={template.id} className="p-3">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Checkbox 
                                    checked={pl_selectedLeaveTemplateIds.includes(template.id)} 
                                    onCheckedChange={() => setPlSelectedLeaveTemplateIds(prev => 
                                      prev.includes(template.id) ? prev.filter(i => i !== template.id) : [...prev, template.id]
                                    )} 
                                  />
                                  <div className="font-bold">{template.name}</div>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {template.startDate} إلى {template.endDate} ({template.totalDays} أيام)
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  النوع: {pl_leaveTypes.find(t => t.id === template.leaveType)?.labelAr}
                                </div>
                                {template.reason && (
                                  <div className="text-sm text-muted-foreground">
                                    السبب: {template.reason}
                                  </div>
                                )}
                                <div className="text-sm text-primary mt-1">
                                  الموظفون المعينون: {template.assignedEmployees.length}
                                </div>
                              </div>
                              <Button 
                                type="button" 
                                size="sm" 
                                variant="destructive"
                                onClick={() => pl_removeLeaveTemplate(template.id)}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Employee Assignment for Selected Templates */}
                {pl_selectedLeaveTemplateIds.length > 0 && (
                  <div className="space-y-4">
                    <Label className="font-black text-lg">تعيين الموظفين / Assign Employees</Label>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {pl_selectedLeaveTemplateIds.map(templateId => {
                        const template = pl_leaveTemplates.find(t => t.id === templateId)
                        if (!template) return null
                        
                        return (
                          <Card key={templateId} className="p-4">
                            <div className="font-bold mb-3">{template.name}</div>
                            <div className="border-2 rounded-xl p-3 bg-slate-50/50 max-h-40 overflow-y-auto">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {employees.map(emp => (
                                  <div key={emp.id} className="flex items-center gap-2 p-1">
                                    <Checkbox 
                                      checked={template.assignedEmployees.includes(emp.id)} 
                                      onCheckedChange={() => {
                                        const currentAssigned = template.assignedEmployees
                                        const newAssigned = currentAssigned.includes(emp.id)
                                          ? currentAssigned.filter(id => id !== emp.id)
                                          : [...currentAssigned, emp.id]
                                        pl_assignEmployeesToLeave(templateId, newAssigned)
                                      }} 
                                    />
                                    <label className="text-sm cursor-pointer">{emp.name}</label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t">
              <Button 
                onClick={pl_handleGeneratePreReport} 
                disabled={
                  (pl_mode === 'employee-first' && pl_selectedEmployeeIds.length === 0) ||
                  (pl_mode === 'leave-first' && pl_selectedLeaveTemplateIds.length === 0)
                }
                className="flex-1 h-12 font-black"
              >
                <FileText className="h-4 w-4 ml-2" />
                إنشاء التقرير / Generate Report
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setPlShowPreReportModal(false)}
                className="h-12 font-black"
              >
                إلغاء / Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-Planned Leaves Log Modal */}
      <Dialog open={pl_showLogModal} onOpenChange={setPlShowLogModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              سجل الإجازات المسبقة / Pre-Planned Leaves Log
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setPlLogSelectedIds(plannedLeaves.map(l => l.id))}>تحديد الكل</Button>
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setPlLogSelectedIds([])}>مسح</Button>
              </div>
              <Button 
                onClick={() => {
                   if (pl_logSelectedIds.length === 0) {
                     toast({ title: "يرجى تحديد سجل واحد على الأقل", variant: "destructive" })
                     return
                   }
                   const selectedData = plannedLeaves.filter(l => pl_logSelectedIds.includes(l.id))
                   generateLeavePreReportPDF(selectedData as any)
                }} 
                disabled={pl_logSelectedIds.length === 0}
                className="font-black"
              >
                <Printer className="h-4 w-4 ml-2" />
                طباعة المحدد / Print Selected
              </Button>
            </div>
            
            <div className="border-2 rounded-xl bg-slate-50/50 max-h-[60vh] overflow-y-auto w-full overflow-x-auto">
              <table className="w-full text-sm text-center">
                <thead className="bg-[#1e293b] text-white border-b-2 font-black sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10"></th>
                    <th className="p-3">الموظف</th>
                    <th className="p-3">من تاريخ</th>
                    <th className="p-3">إلى تاريخ</th>
                    <th className="p-3">الأيام</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">السبب</th>
                    <th className="p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {plannedLeaves.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-muted-foreground font-bold">لا توجد سجلات / No records found</td></tr>
                  ) : (
                    plannedLeaves.slice().reverse().map(leave => (
                      <tr key={leave.id} className="border-b hover:bg-slate-100 transition-colors">
                        {pl_editingLeaveId === leave.id ? (
                          <>
                            <td className="p-2"></td>
                            <td className="p-2 font-bold">{leave.employeeName}</td>
                            <td className="p-2"><Input type="date" value={pl_editLeaveData.startDate} onChange={e => setPlEditLeaveData({...pl_editLeaveData, startDate: e.target.value, totalDays: pl_calculateDays(e.target.value, pl_editLeaveData.endDate)})} className="h-8 text-sm" /></td>
                            <td className="p-2"><Input type="date" value={pl_editLeaveData.endDate} onChange={e => setPlEditLeaveData({...pl_editLeaveData, endDate: e.target.value, totalDays: pl_calculateDays(pl_editLeaveData.startDate, e.target.value)})} className="h-8 text-sm" /></td>
                            <td className="p-2"><div className="bg-slate-200 rounded px-2 py-1 inline-block font-bold">{pl_editLeaveData.totalDays}</div></td>
                            <td className="p-2">
                              <Select value={pl_editLeaveData.leaveType} onValueChange={v => setPlEditLeaveData({...pl_editLeaveData, leaveType: v})}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>{pl_leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.labelAr}</SelectItem>)}</SelectContent>
                              </Select>
                            </td>
                            <td className="p-2"><Input value={pl_editLeaveData.reason} onChange={e => setPlEditLeaveData({...pl_editLeaveData, reason: e.target.value})} className="h-8 text-sm" /></td>
                            <td className="p-2 flex justify-center gap-1">
                               <Button variant="ghost" size="icon" className="text-green-600 hover:text-white hover:bg-green-600" onClick={async () => {
                                 await updatePlannedLeave(leave.id, pl_editLeaveData)
                                 setPlEditingLeaveId(null)
                                 toast({ title: "تم تحديث السجل بنجاح" })
                               }}>
                                 <Check className="h-4 w-4" />
                               </Button>
                               <Button variant="ghost" size="icon" className="text-destructive hover:text-white hover:bg-destructive" onClick={() => setPlEditingLeaveId(null)}>
                                 <X className="h-4 w-4" />
                               </Button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">
                              <Checkbox 
                                checked={pl_logSelectedIds.includes(leave.id)}
                                onCheckedChange={() => setPlLogSelectedIds(prev => 
                                  prev.includes(leave.id) ? prev.filter(id => id !== leave.id) : [...prev, leave.id]
                                )}
                              />
                            </td>
                            <td className="p-2 font-bold">{leave.employeeName}</td>
                            <td className="p-2">{leave.startDate}</td>
                            <td className="p-2">{leave.endDate}</td>
                            <td className="p-2"><div className="bg-slate-200 rounded px-2 py-1 inline-block font-bold">{leave.totalDays}</div></td>
                            <td className="p-2">{pl_leaveTypes.find(t => t.id === leave.leaveType)?.labelAr || leave.leaveType}</td>
                            <td className="p-2 truncate max-w-[150px]">{leave.reason || "-"}</td>
                            <td className="p-2 flex justify-center gap-1">
                               <Button variant="ghost" size="icon" className="hover:text-blue-600 hover:bg-blue-100" onClick={() => generateLeavePreReportPDF([leave as any])}>
                                 <Printer className="h-4 w-4" />
                               </Button>
                               <Button variant="ghost" size="icon" className="hover:text-amber-600 hover:bg-amber-100" onClick={() => {
                                 setPlEditingLeaveId(leave.id)
                                 setPlEditLeaveData({...leave})
                               }}>
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                               </Button>
                               <Button variant="ghost" size="icon" className="text-destructive hover:text-white hover:bg-destructive" onClick={() => {
                                 if (confirm("حذف هذا السجل؟")) {
                                   deletePlannedLeave(leave.id)
                                   setPlLogSelectedIds(prev => prev.filter(id => id !== leave.id))
                                 }
                               }}>
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="flex gap-4 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setPlShowLogModal(false)}
                className="w-full h-12 font-black"
              >
                إغلاق / Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Leave Template Modal */}
      <Dialog open={pl_showAddLeaveTemplate} onOpenChange={setPlShowAddLeaveTemplate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">إضافة قالب إجازة / Add Leave Template</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-black">اسم القالب / Template Name</Label>
              <Input 
                placeholder="مثال: إجازة عيد الفطر..." 
                value={pl_newLeaveTemplate.name}
                onChange={e => setPlNewLeaveTemplate(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-4 border rounded-xl p-4 bg-white shadow-sm">
              <Label className="font-black text-lg block text-center">اختر أيام الإجازة للقالب / Select Template Dates</Label>
              <div className="flex justify-center">
                <CalendarPicker
                  mode="multiple"
                  selected={pl_newLeaveTemplate.dates.map(d => new Date(d))}
                  onSelect={(dates) => setPlNewLeaveTemplate(prev => ({ 
                    ...prev, 
                    dates: dates?.map(d => format(d, "yyyy-MM-dd")) || [] 
                  }))}
                  className="rounded-md border shadow"
                />
              </div>
              {pl_newLeaveTemplate.dates.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg">
                  {pl_newLeaveTemplate.dates.sort().map(d => (
                    <div key={d} className="px-3 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 shadow-sm">
                      {formatDateWithDay(d)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-black">نوع الإجازة / Leave Type</Label>
                <Select 
                  value={pl_newLeaveTemplate.leaveType} 
                  onValueChange={value => setPlNewLeaveTemplate(prev => ({ ...prev, leaveType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pl_leaveTypes.map(type => (
                      <SelectItem key={type.id} value={type.id}>{type.labelAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-black">السبب / Reason</Label>
                <Input 
                  placeholder="اكتب سبب الإجازة..." 
                  value={pl_newLeaveTemplate.reason}
                  onChange={e => setPlNewLeaveTemplate(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button 
                onClick={pl_addLeaveTemplate} 
                disabled={!pl_newLeaveTemplate.name.trim()}
                className="flex-1 h-12 font-black"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة القالب / Add Template
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setPlShowAddLeaveTemplate(false)}
                className="h-12 font-black"
              >
                إلغاء / Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
