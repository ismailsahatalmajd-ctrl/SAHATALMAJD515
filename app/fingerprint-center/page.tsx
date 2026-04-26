"use client"

import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Header } from "@/components/header"
import { db } from "@/lib/db"
import { addAbsenceRecord } from "@/lib/storage"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, parse } from "date-fns"
import { generateZkAttendanceReportPDF } from "@/lib/attendance-pdf-generator"
import {
  Building2,
  Globe,
  RefreshCw,
  Activity,
  Play,
  Pause,
  RotateCcw,
  Wifi,
  WifiOff,
  Clock3,
  Printer,
  Plus,
  Trash2,
} from "lucide-react"

type ControlAction = "ping" | "pause" | "resume" | "restart"
type FilterMode = "current_month" | "month" | "day" | "range"
type SummaryViewMode = "detailed" | "grouped"

type DailySummaryRow = {
  employeeId: string | undefined
  employeeName: string
  deviceUserId: string
  date: string
  first: Date
  last: Date
  count: number
  branchId: string
  branchName: string
  expectedStart?: string
  expectedEnd?: string
  expectedMinutes: number
  actualMinutes: number
  deficitMinutes: number
  scheduleScope?: "global" | "branch" | "group" | "employee"
  daysCount?: number
}

type BranchBridgeConfig = {
  ip: string
  port: string
}

type SyncResult = {
  status: "idle" | "syncing" | "done" | "error"
  message?: string
  users?: number
  logs?: number
  at?: string
}

type BranchFetchedData = {
  users: any[]
  logs: any[]
  updatedAt: string
}

type WorkScheduleRule = {
  id: string
  name?: string
  scopeType: "global" | "branch" | "group" | "employee"
  branchId?: string
  employeeId?: string
  employeeIds?: string[]
  startTime: string
  endTime: string
  active: boolean
  createdAt: string
  updatedAt?: string
}

const LOCAL_CONFIG_KEY = "fingerprint_hub_branch_configs_v1"

const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const parseTimeToMinutes = (hhmm: string): number => {
  if (!hhmm || !hhmm.includes(":")) return 0
  const [h, m] = hhmm.split(":").map((x) => Number(x || 0))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return (h * 60) + m
}

const minutesBetweenTimes = (start: string, end: string): number => {
  const startMin = parseTimeToMinutes(start)
  const endMin = parseTimeToMinutes(end)
  if (endMin >= startMin) return endMin - startMin
  return (24 * 60) - startMin + endMin
}

const formatMinutes = (mins: number): string => {
  const safe = Math.max(0, Math.floor(mins || 0))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export default function FingerprintHubPage() {
  const { toast } = useToast()
  const branches = useLiveQuery(() => db.branches.toArray()) || []
  const employees = useLiveQuery(() => db.employees.toArray()) || []
  const absenceRecords = useLiveQuery(() => db.absenceRecords.toArray()) || []
  const workSchedules = (useLiveQuery(() => db.workSchedules.toArray()) || []) as WorkScheduleRule[]

  const [bridgeOnline, setBridgeOnline] = useState(false)
  const [bridgePaused, setBridgePaused] = useState(false)
  const [bridgeHost, setBridgeHost] = useState("")
  const [bridgeLastSeen, setBridgeLastSeen] = useState<string | null>(null)
  const [bridgeControlLoading, setBridgeControlLoading] = useState<ControlAction | null>(null)

  const [branchConfigs, setBranchConfigs] = useState<Record<string, BranchBridgeConfig>>({})
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingBranchId, setSyncingBranchId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, SyncResult>>({})
  const [branchData, setBranchData] = useState<Record<string, BranchFetchedData>>({})
  const [activeDataTab, setActiveDataTab] = useState<string>("all")
  const [savingTab, setSavingTab] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const [filterMode, setFilterMode] = useState<FilterMode>("current_month")
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>("detailed")
  const [filterMonthYear, setFilterMonthYear] = useState<string>(() => format(new Date(), "yyyy-MM"))
  const [filterDay, setFilterDay] = useState<string>(() => format(new Date(), "yyyy-MM-dd"))
  const [filterFrom, setFilterFrom] = useState<string>("")
  const [filterTo, setFilterTo] = useState<string>("")

  const [scheduleScope, setScheduleScope] = useState<"global" | "branch" | "group" | "employee">("global")
  const [scheduleBranchId, setScheduleBranchId] = useState<string>("")
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState<string>("")
  const [scheduleEmployeeIds, setScheduleEmployeeIds] = useState<string[]>([])
  const [scheduleStartTime, setScheduleStartTime] = useState<string>("08:00")
  const [scheduleEndTime, setScheduleEndTime] = useState<string>("16:00")

  const normalizedBranchNameMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const b of branches) {
      const key = String(b.name || "").trim().toLowerCase()
      if (!key) continue
      const existing = map.get(key) || []
      existing.push(b.id)
      map.set(key, existing)
    }
    return map
  }, [branches])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_CONFIG_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        setBranchConfigs(parsed)
      }
    } catch {
      // ignore local storage parsing errors
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | null = null

    const watchBridge = async () => {
      try {
        const { getApp } = await import("firebase/app")
        const { getFirestore, doc, onSnapshot } = await import("firebase/firestore")
        const firestoreDb = getFirestore(getApp())
        const bridgeRef = doc(firestoreDb, "zk-bridge", "status")

        unsubscribe = onSnapshot(bridgeRef, (snap) => {
          if (!mounted || !snap.exists()) return
          const data: any = snap.data() || {}

          setBridgePaused(Boolean(data.bridgePaused))
          setBridgeHost(data.bridgeHost ? String(data.bridgeHost) : "")

          const lastSeen = data.bridgeLastSeenAt ? String(data.bridgeLastSeenAt) : null
          if (!lastSeen) {
            setBridgeOnline(false)
            setBridgeLastSeen(null)
            return
          }

          const parsed = new Date(lastSeen)
          const isValid = !Number.isNaN(parsed.getTime())
          setBridgeLastSeen(isValid ? lastSeen : null)
          if (!isValid) {
            setBridgeOnline(false)
            return
          }

          const ageMs = Date.now() - parsed.getTime()
          setBridgeOnline(Boolean(data.bridgeOnline) && ageMs < 45000)
        }, () => {
          if (!mounted) return
          setBridgeOnline(false)
        })
      } catch {
        if (!mounted) return
        setBridgeOnline(false)
      }
    }

    watchBridge()
    return () => {
      mounted = false
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const saveConfig = (next: Record<string, BranchBridgeConfig>) => {
    setBranchConfigs(next)
    try {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next))
    } catch {
      // ignore local storage write errors
    }
  }

  const getBranchConfig = (branchId: string): BranchBridgeConfig => {
    return branchConfigs[branchId] || { ip: "192.168.10.121", port: "4370" }
  }

  const setBranchConfigField = (branchId: string, field: keyof BranchBridgeConfig, value: string) => {
    const current = getBranchConfig(branchId)
    const next = {
      ...branchConfigs,
      [branchId]: {
        ...current,
        [field]: value,
      },
    }
    saveConfig(next)
  }

  const waitForSyncResult = async (requestId: string, branchId: string) => {
    const { getApp } = await import("firebase/app")
    const { getFirestore, doc, onSnapshot } = await import("firebase/firestore")
    const firestoreDb = getFirestore(getApp())
    const bridgeRef = doc(firestoreDb, "zk-bridge", "status")

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error("انتهت المهلة / Timeout while waiting for sync result"))
      }, 300000)

      const unsubscribe = onSnapshot(bridgeRef, (snap) => {
        if (!snap.exists()) return
        const data: any = snap.data() || {}

        if (data.requestId !== requestId) return
        if (data.branchId && data.branchId !== branchId) return

        if (data.status === "processing") {
          setResults((prev) => ({
            ...prev,
            [branchId]: {
              status: "syncing",
              message: "جاري السحب من جهاز الفرع... / Fetching from branch device...",
            },
          }))
          return
        }

        if (data.status === "done") {
          clearTimeout(timeout)
          unsubscribe()
          const users = Array.isArray(data?.result?.users) ? data.result.users.length : 0
          const logs = Array.isArray(data?.result?.attendances) ? data.result.attendances.length : 0
          const rawUsers = Array.isArray(data?.result?.users) ? data.result.users : []
          const rawLogs = Array.isArray(data?.result?.attendances) ? data.result.attendances : []

          setBranchData((prev) => ({
            ...prev,
            [branchId]: {
              users: rawUsers,
              logs: rawLogs.map((item: any) => ({ ...item, __branchId: branchId })),
              updatedAt: new Date().toISOString(),
            },
          }))

          setResults((prev) => ({
            ...prev,
            [branchId]: {
              status: "done",
              message: "تم التحديث بنجاح / Updated successfully",
              users,
              logs,
              at: new Date().toISOString(),
            },
          }))
          resolve()
          return
        }

        if (data.status === "error") {
          clearTimeout(timeout)
          unsubscribe()
          setResults((prev) => ({
            ...prev,
            [branchId]: {
              status: "error",
              message: String(data.error || "فشل التحديث / Sync failed"),
              at: new Date().toISOString(),
            },
          }))
          reject(new Error(String(data.error || "Sync failed")))
        }
      }, (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  const parseRecordDate = (value: unknown): Date | null => {
    if (!value) return null
    const direct = new Date(String(value))
    if (!Number.isNaN(direct.getTime())) return direct
    const parsed = parse(String(value), "yyyy-MM-dd HH:mm:ss", new Date())
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const dedupeLogs = (logs: any[]) => {
    const seen = new Set<string>()
    const deduped: any[] = []

    const employeeByFingerprint = new Map(
      employees
        .filter((e) => e.fingerprintId)
        .map((e) => [String(e.fingerprintId), e.id])
    )

    for (const log of logs) {
      const parsed = parseRecordDate(log.recordTime)
      if (!parsed) continue

      const recordTime = format(parsed, "yyyy-MM-dd HH:mm:ss")
      const rawDeviceUserId = String(log.deviceUserId ?? log.userId ?? log.uid ?? "")
      const normalizedEmployeeId = String(
        log.employeeId ||
        employeeByFingerprint.get(rawDeviceUserId) ||
        rawDeviceUserId ||
        ""
      )

      // Important: do not include branch/source in dedupe key,
      // so the same swipe is not counted twice after save + refresh.
      const key = `${normalizedEmployeeId}|${recordTime}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(log)
    }
    return deduped
  }

  const toggleScheduleEmployee = (employeeId: string, checked: boolean | "indeterminate") => {
    if (checked !== true) {
      setScheduleEmployeeIds((prev) => prev.filter((id) => id !== employeeId))
      return
    }
    setScheduleEmployeeIds((prev) => (prev.includes(employeeId) ? prev : [...prev, employeeId]))
  }

  const addScheduleRule = async () => {
    if (!scheduleStartTime || !scheduleEndTime) {
      toast({ title: "حدد وقت الدوام", description: "أدخل بداية ونهاية الدوام.", variant: "destructive" })
      return
    }

    if (scheduleScope === "branch" && !scheduleBranchId) {
      toast({ title: "اختر الفرع", description: "يلزم اختيار فرع للقاعدة.", variant: "destructive" })
      return
    }

    if (scheduleScope === "employee" && !scheduleEmployeeId) {
      toast({ title: "اختر موظف", description: "يلزم اختيار موظف لقاعدة الموظف.", variant: "destructive" })
      return
    }

    if (scheduleScope === "group" && scheduleEmployeeIds.length === 0) {
      toast({ title: "اختر موظفين", description: "يلزم اختيار موظف واحد على الأقل للمجموعة.", variant: "destructive" })
      return
    }

    const payload: WorkScheduleRule = {
      id: generateId(),
      scopeType: scheduleScope,
      startTime: scheduleStartTime,
      endTime: scheduleEndTime,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchId: scheduleScope === "global" ? undefined : (scheduleBranchId || undefined),
      employeeId: scheduleScope === "employee" ? scheduleEmployeeId : undefined,
      employeeIds: scheduleScope === "group" ? [...scheduleEmployeeIds] : undefined,
      name: scheduleScope === "global"
        ? "الافتراضي العام / Global Default"
        : scheduleScope === "branch"
          ? `فرع ${branches.find((b) => b.id === scheduleBranchId)?.name || ""}`
          : scheduleScope === "employee"
            ? `موظف ${employees.find((e) => e.id === scheduleEmployeeId)?.name || ""}`
            : `مجموعة (${scheduleEmployeeIds.length})`,
    }

    await db.workSchedules.put(payload)
    toast({ title: "تم حفظ قاعدة الدوام", description: "سيتم تطبيقها مباشرة على خلاصة البصمة." })

    if (scheduleScope === "employee") setScheduleEmployeeId("")
    if (scheduleScope === "group") setScheduleEmployeeIds([])
  }

  const deleteScheduleRule = async (id: string) => {
    await db.workSchedules.delete(id)
  }

  const pickLatestRule = (rules: WorkScheduleRule[]) => {
    return [...rules].sort((a, b) => {
      const atA = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const atB = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return atB - atA
    })[0]
  }

  const resolveScheduleRule = (employeeId?: string, branchId?: string) => {
    const activeRules = workSchedules.filter((r) => r.active !== false)

    const exactEmployeeBranch = activeRules.filter((r) =>
      r.scopeType === "employee" &&
      r.employeeId === employeeId &&
      Boolean(branchId) &&
      r.branchId === branchId
    )
    if (exactEmployeeBranch.length) return pickLatestRule(exactEmployeeBranch)

    const anyEmployeeBranch = activeRules.filter((r) =>
      r.scopeType === "employee" &&
      r.employeeId === employeeId &&
      !r.branchId
    )
    if (anyEmployeeBranch.length) return pickLatestRule(anyEmployeeBranch)

    const exactGroupBranch = activeRules.filter((r) =>
      r.scopeType === "group" &&
      Array.isArray(r.employeeIds) &&
      r.employeeIds.includes(String(employeeId || "")) &&
      Boolean(branchId) &&
      r.branchId === branchId
    )
    if (exactGroupBranch.length) return pickLatestRule(exactGroupBranch)

    const anyGroupBranch = activeRules.filter((r) =>
      r.scopeType === "group" &&
      Array.isArray(r.employeeIds) &&
      r.employeeIds.includes(String(employeeId || "")) &&
      !r.branchId
    )
    if (anyGroupBranch.length) return pickLatestRule(anyGroupBranch)

    const branchRules = activeRules.filter((r) =>
      r.scopeType === "branch" &&
      Boolean(branchId) &&
      r.branchId === branchId
    )
    if (branchRules.length) return pickLatestRule(branchRules)

    const globalRules = activeRules.filter((r) => r.scopeType === "global")
    if (globalRules.length) return pickLatestRule(globalRules)

    return undefined
  }

  const getTabData = (tabBranchId: string) => {
    const employeeById = new Map(employees.map((e) => [e.id, e]))
    const savedFingerprintLogs = absenceRecords
      .filter((r) => {
        if (r.type !== "attendance" || !r.recordTime) return false
        if (r.category === "fingerprint") return true
        const notes = String(r.notes || "")
        return notes.includes("Fingerprint Hub") || notes.includes("بصمة")
      })
      .map((r) => {
        const emp = employeeById.get(r.employeeId)
        return {
          deviceUserId: String(emp?.fingerprintId || r.employeeId || ""),
          recordTime: r.recordTime,
          __branchId: r.branchId || "",
          __source: "saved",
          employeeId: r.employeeId,
          employeeName: r.employeeName,
        }
      })

    if (tabBranchId === "all") {
      const allUsers = Object.values(branchData).flatMap((x) => x.users || [])
      const fetchedLogs = Object.values(branchData).flatMap((x) => x.logs || [])
      const mergedLogs = dedupeLogs([...fetchedLogs, ...savedFingerprintLogs])
      return { users: allUsers, logs: mergedLogs, saveCandidates: fetchedLogs }
    }

    const one = branchData[tabBranchId]
    const selectedBranch = branches.find((b) => b.id === tabBranchId)
    const selectedBranchNameKey = String(selectedBranch?.name || "").trim().toLowerCase()
    const sameNameBranchIds = new Set(
      selectedBranchNameKey ? (normalizedBranchNameMap.get(selectedBranchNameKey) || [tabBranchId]) : [tabBranchId]
    )
    const fetchedLogs = one?.logs || []
    const savedByBranch = savedFingerprintLogs.filter((x) => sameNameBranchIds.has(String(x.__branchId || "")))
    return {
      users: one?.users || [],
      logs: dedupeLogs([...fetchedLogs, ...savedByBranch]),
      saveCandidates: fetchedLogs,
    }
  }

  const saveFingerprintLogs = async (tabBranchId: string, logsToSave: any[]) => {
    if (logsToSave.length === 0) {
      toast({
        title: "لا توجد سجلات للحفظ",
        description: "قم بسحب بيانات الفرع أولاً.",
        variant: "destructive",
      })
      return
    }

    setSavingTab(tabBranchId)
    try {
      let savedCount = 0
      let skippedCount = 0

      for (const log of logsToSave) {
        const deviceUserId = String(log.deviceUserId ?? log.userId ?? log.uid ?? "")
        if (!deviceUserId) {
          skippedCount++
          continue
        }

        const employee = employees.find((e) => String(e.fingerprintId || "") === deviceUserId)
        if (!employee) {
          skippedCount++
          continue
        }

        const parsed = parseRecordDate(log.recordTime)
        if (!parsed) {
          skippedCount++
          continue
        }

        const recordTimeStr = format(parsed, "yyyy-MM-dd HH:mm:ss")
        const existing = await db.absenceRecords
          .where({ employeeId: employee.id, recordTime: recordTimeStr })
          .first()

        if (existing) {
          skippedCount++
          continue
        }

        await addAbsenceRecord({
          employeeId: employee.id,
          employeeName: employee.name,
          date: format(parsed, "yyyy-MM-dd"),
          type: "attendance",
          category: "fingerprint",
          notes: `بصمة من مركز البصمات / Fingerprint Hub`,
          recordTime: recordTimeStr,
          branchId: tabBranchId === "all" ? (log.__branchId || undefined) : tabBranchId,
        })

        savedCount++
      }

      toast({
        title: "تم حفظ السجلات",
        description: `تمت إضافة ${savedCount} سجل جديد، وتخطي ${skippedCount}.`,
      })
    } catch (error: any) {
      toast({
        title: "فشل الحفظ",
        description: String(error?.message || error),
        variant: "destructive",
      })
    } finally {
      setSavingTab(null)
    }
  }

  const getFilteredLogs = (logs: any[]): any[] => {
    return logs.filter((log) => {
      if (!log.recordTime) return false
      const d = parseRecordDate(log.recordTime)
      if (!d) return false
      const dateStr = format(d, "yyyy-MM-dd")
      const monthStr = format(d, "yyyy-MM")
      switch (filterMode) {
        case "current_month":
          return monthStr === format(new Date(), "yyyy-MM")
        case "month":
          return filterMonthYear ? monthStr === filterMonthYear : true
        case "day":
          return filterDay ? dateStr === filterDay : true
        case "range": {
          if (filterFrom && filterTo) return dateStr >= filterFrom && dateStr <= filterTo
          if (filterFrom) return dateStr >= filterFrom
          if (filterTo) return dateStr <= filterTo
          return true
        }
        default:
          return true
      }
    })
  }

  const getDailySummary = (logs: any[]): DailySummaryRow[] => {
    const map = new Map<string, DailySummaryRow>()
    for (const log of logs) {
      const deviceUserId = String(log.deviceUserId ?? log.userId ?? log.uid ?? log.employeeId ?? "")
      if (!deviceUserId) continue
      const d = parseRecordDate(log.recordTime)
      if (!d) continue
      const dateStr = format(d, "yyyy-MM-dd")
      const key = `${deviceUserId}_${dateStr}`
      const employee = log.employeeId
        ? employees.find((e) => e.id === log.employeeId)
        : employees.find((e) => String(e.fingerprintId || "") === deviceUserId)
      const branchId = log.__branchId || (activeDataTab !== "all" ? activeDataTab : "")
      const branchName = branchId ? (branches.find((b) => b.id === branchId)?.name || branchId) : "-"
      if (!map.has(key)) {
        map.set(key, {
          employeeId: employee?.id,
          employeeName: employee?.name || String(log.employeeName || "غير مربوط / Unmapped"),
          deviceUserId,
          date: dateStr,
          first: d,
          last: d,
          count: 1,
          branchId,
          branchName,
          expectedMinutes: 0,
          actualMinutes: 0,
          deficitMinutes: 0,
        })
      } else {
        const row = map.get(key)!
        row.count++
        if (d < row.first) row.first = d
        if (d > row.last) row.last = d
      }
    }

    const rows = Array.from(map.values())
    for (const row of rows) {
      const actualMinutes = row.count < 2 ? 0 : Math.max(0, Math.floor((row.last.getTime() - row.first.getTime()) / 60000))
      const matchedRule = resolveScheduleRule(row.employeeId, row.branchId)
      const expectedMinutes = matchedRule ? minutesBetweenTimes(matchedRule.startTime, matchedRule.endTime) : 0
      const deficitMinutes = Math.max(0, expectedMinutes - actualMinutes)

      row.actualMinutes = actualMinutes
      row.expectedMinutes = expectedMinutes
      row.deficitMinutes = deficitMinutes
      row.expectedStart = matchedRule?.startTime
      row.expectedEnd = matchedRule?.endTime
      row.scheduleScope = matchedRule?.scopeType
    }

    return rows.sort(
      (a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName)
    )
  }

  const getGroupedSummary = (rows: DailySummaryRow[]): DailySummaryRow[] => {
    const grouped = new Map<string, DailySummaryRow>()

    for (const row of rows) {
      const key = row.employeeId || row.deviceUserId
      if (!grouped.has(key)) {
        grouped.set(key, {
          ...row,
          date: "مجمع / Grouped",
          count: row.count,
          actualMinutes: row.actualMinutes,
          expectedMinutes: row.expectedMinutes,
          deficitMinutes: row.deficitMinutes,
          branchName: row.branchName,
          daysCount: 1,
          first: row.first,
          last: row.last,
        })
        continue
      }

      const acc = grouped.get(key)!
      acc.count += row.count
      acc.actualMinutes += row.actualMinutes
      acc.expectedMinutes += row.expectedMinutes
      acc.deficitMinutes += row.deficitMinutes
      acc.daysCount = (acc.daysCount || 1) + 1
      if (row.first < acc.first) acc.first = row.first
      if (row.last > acc.last) acc.last = row.last

      const branchSet = new Set(
        `${acc.branchName || ""}|${row.branchName || ""}`
          .split("|")
          .map((x) => x.trim())
          .filter(Boolean)
      )
      acc.branchName = Array.from(branchSet).join("، ")
      if (!acc.branchName) acc.branchName = "-"
      if (acc.scheduleScope !== row.scheduleScope) acc.scheduleScope = undefined
      if ((acc.expectedStart !== row.expectedStart) || (acc.expectedEnd !== row.expectedEnd)) {
        acc.expectedStart = undefined
        acc.expectedEnd = undefined
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  }

  const formatDuration = (first: Date, last: Date, count: number): string => {
    if (count < 2) return "00:00"
    const diffMs = last.getTime() - first.getTime()
    const totalMins = Math.floor(diffMs / 60000)
    return formatMinutes(totalMins)
  }

  const getFilterLabel = () => {
    if (filterMode === "current_month") return `الشهر الحالي ${format(new Date(), "yyyy-MM")}`
    if (filterMode === "month") return `الشهر ${filterMonthYear || "-"}`
    if (filterMode === "day") return `اليوم ${filterDay || "-"}`
    return `من ${filterFrom || "-"} إلى ${filterTo || "-"}`
  }

  const exportSummaryPdf = async (rows: DailySummaryRow[], mode: SummaryViewMode) => {
    if (rows.length === 0) {
      toast({
        title: "لا توجد بيانات للتصدير",
        description: "غيّر الفلتر أو قم بتحديث السجلات أولاً.",
        variant: "destructive",
      })
      return
    }

    setExportingPdf(true)
    try {
      const branchLabel = activeDataTab === "all"
        ? "كل الفروع / All Branches"
        : (branches.find((b) => b.id === activeDataTab)?.name || activeDataTab)

      await generateZkAttendanceReportPDF(
        rows.map((row) => ({
          employeeName: row.employeeName,
          date: mode === "grouped" ? `مجمع (${row.daysCount || 1} يوم)` : row.date,
          firstSwipe: mode === "grouped" ? "-" : format(row.first, "HH:mm:ss"),
          lastSwipe: mode === "grouped" ? "-" : format(row.last, "HH:mm:ss"),
          count: row.count,
          duration: formatMinutes(row.actualMinutes),
          branchName: row.branchName,
        })),
        `${branchLabel} | ${getFilterLabel()} | ${mode === "grouped" ? "تجميع" : "تفريد"}`
      )
    } catch (error: any) {
      toast({
        title: "فشل التصدير",
        description: String(error?.message || error),
        variant: "destructive",
      })
    } finally {
      setExportingPdf(false)
    }
  }

  const syncBranch = async (branchId: string, branchName: string) => {
    if (!bridgeOnline) {
      toast({
        title: "Bridge غير متصل / Bridge offline",
        description: "شغّل الجسر على كمبيوتر الفرع أولاً.",
        variant: "destructive",
      })
      return
    }

    const cfg = getBranchConfig(branchId)
    const portNumber = Number(cfg.port)
    if (!cfg.ip || !Number.isFinite(portNumber) || portNumber <= 0) {
      toast({
        title: "إعدادات غير صحيحة / Invalid settings",
        description: `تحقق من IP/Port لفرع ${branchName}`,
        variant: "destructive",
      })
      return
    }

    setSyncingBranchId(branchId)
    setResults((prev) => ({
      ...prev,
      [branchId]: { status: "syncing", message: "جاري الإرسال... / Sending request..." },
    }))

    try {
      const { getApp } = await import("firebase/app")
      const { getFirestore, doc, setDoc } = await import("firebase/firestore")
      const firestoreDb = getFirestore(getApp())
      const bridgeRef = doc(firestoreDb, "zk-bridge", "status")
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      await setDoc(bridgeRef, {
        status: "pending",
        requestId,
        branchId,
        branchName,
        requestedAt: new Date().toISOString(),
        requestedBy: "fingerprint-hub",
        zkIp: cfg.ip,
        zkPort: portNumber,
      }, { merge: true })

      await waitForSyncResult(requestId, branchId)
      toast({ title: `تم تحديث ${branchName}`, description: "Sync completed successfully" })
    } catch (error: any) {
      toast({
        title: `فشل تحديث ${branchName}`,
        description: String(error?.message || error),
        variant: "destructive",
      })
    } finally {
      setSyncingBranchId((curr) => (curr === branchId ? null : curr))
    }
  }

  const syncAllBranches = async () => {
    if (branches.length === 0) {
      toast({ title: "لا توجد فروع", description: "أضف فروعًا أولاً ثم أعد المحاولة." })
      return
    }

    setSyncingAll(true)
    try {
      for (const branch of branches) {
        // Sequential sync avoids collisions because current bridge backend uses one status document.
        // This can be made parallel after migrating to per-branch request documents.
        // eslint-disable-next-line no-await-in-loop
        await syncBranch(branch.id, branch.name)
      }
      toast({
        title: "تم إنهاء تحديث كل الفروع / All branches synced",
        description: "راجع النتائج لكل فرع في القائمة أدناه.",
      })
    } finally {
      setSyncingAll(false)
      setSyncingBranchId(null)
    }
  }

  const handleBridgeControl = async (action: ControlAction) => {
    if (!bridgeOnline && action !== "ping") {
      toast({
        title: "Bridge غير متصل",
        description: "لا يمكن تنفيذ الأمر حالياً.",
        variant: "destructive",
      })
      return
    }

    setBridgeControlLoading(action)
    try {
      const { getApp } = await import("firebase/app")
      const { getFirestore, doc, setDoc, onSnapshot } = await import("firebase/firestore")
      const firestoreDb = getFirestore(getApp())
      const bridgeRef = doc(firestoreDb, "zk-bridge", "status")
      const controlId = `ctl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      await setDoc(bridgeRef, {
        control: {
          id: controlId,
          action,
          issuedAt: new Date().toISOString(),
          issuedBy: "fingerprint-hub",
        },
      }, { merge: true })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe()
          reject(new Error("Command timeout"))
        }, 30000)

        const unsubscribe = onSnapshot(bridgeRef, (snap) => {
          if (!snap.exists()) return
          const ack: any = snap.data()?.controlAck
          if (!ack || ack.id !== controlId) return

          clearTimeout(timeout)
          unsubscribe()

          if (ack.status === "ok") {
            resolve()
            return
          }
          reject(new Error(ack.message || "Command failed"))
        }, (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })

      toast({
        title: "تم تنفيذ الأمر / Command sent",
        description: action === "restart" ? "Bridge will reconnect in a few seconds." : "Bridge acknowledged command.",
      })
    } catch (error: any) {
      toast({
        title: "فشل أمر التحكم / Control failed",
        description: String(error?.message || error),
        variant: "destructive",
      })
    } finally {
      setBridgeControlLoading(null)
    }
  }

  const connectedCount = useMemo(() => (bridgeOnline ? 1 : 0), [bridgeOnline])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black">مركز البصمات / Fingerprint Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">
              إدارة السحب والمراقبة والتحكم بجسور الفروع من صفحة مركزية واحدة.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={syncAllBranches} disabled={syncingAll || syncingBranchId !== null} className="font-bold">
              <RefreshCw className="h-4 w-4 ml-2" />
              {syncingAll ? "جاري التحديث... / Syncing..." : "تحديث كل الفروع / Sync All"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">حالة الجسر / Bridge Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {bridgeOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
                <span className="font-bold">{bridgeOnline ? "متصل / Online" : "غير متصل / Offline"}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {bridgeHost ? `Host: ${bridgeHost}` : "Host: -"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">آخر نبضة / Last Heartbeat</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-blue-600" />
                <span className="font-bold">
                  {bridgeLastSeen && !Number.isNaN(new Date(bridgeLastSeen).getTime())
                    ? new Date(bridgeLastSeen).toLocaleString()
                    : "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">إحصائية الاتصال / Connectivity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{connectedCount} / 1</div>
              <div className="text-xs text-muted-foreground">MVP: single bridge backend document</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Activity className="h-5 w-5" />
              تحكم الجسر / Bridge Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button variant="secondary" disabled={bridgeControlLoading !== null} onClick={() => handleBridgeControl("ping")}> 
              <Activity className="h-4 w-4 ml-2" /> اختبار / Ping
            </Button>
            <Button variant="outline" disabled={bridgeControlLoading !== null || bridgePaused} onClick={() => handleBridgeControl("pause")}> 
              <Pause className="h-4 w-4 ml-2" /> إيقاف / Pause
            </Button>
            <Button variant="outline" disabled={bridgeControlLoading !== null || !bridgePaused} onClick={() => handleBridgeControl("resume")}> 
              <Play className="h-4 w-4 ml-2" /> استئناف / Resume
            </Button>
            <Button variant="destructive" disabled={bridgeControlLoading !== null} onClick={() => handleBridgeControl("restart")}> 
              <RotateCcw className="h-4 w-4 ml-2" /> إعادة تشغيل / Restart
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              الفروع / Branches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {branches.length === 0 && (
              <div className="text-sm text-muted-foreground">لا توجد فروع حالياً. أضف الفروع أولاً من صفحة الفروع.</div>
            )}

            {branches.map((branch) => {
              const cfg = getBranchConfig(branch.id)
              const result = results[branch.id] || { status: "idle" as const }
              const isSyncingThisBranch = syncingBranchId === branch.id

              return (
                <div key={branch.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="font-black">{branch.name}</div>
                      <div className="text-xs text-muted-foreground">{branch.location || "-"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={result.status === "done" ? "default" : result.status === "error" ? "destructive" : "secondary"}>
                        {result.status === "idle" && "جاهز / Ready"}
                        {result.status === "syncing" && "جاري التحديث / Syncing"}
                        {result.status === "done" && "تم / Done"}
                        {result.status === "error" && "فشل / Error"}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => syncBranch(branch.id, branch.name)}
                        disabled={isSyncingThisBranch || syncingAll}
                        className="font-bold"
                      >
                        <Globe className="h-4 w-4 ml-2" />
                        {isSyncingThisBranch ? "..." : "تحديث الفرع / Sync"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">IP</Label>
                      <Input
                        value={cfg.ip}
                        onChange={(e) => setBranchConfigField(branch.id, "ip", e.target.value)}
                        placeholder="192.168.10.121"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Port</Label>
                      <Input
                        value={cfg.port}
                        onChange={(e) => setBranchConfigField(branch.id, "port", e.target.value)}
                        placeholder="4370"
                        className="h-9"
                      />
                    </div>
                    <div className="md:col-span-2 p-2 bg-muted/50 rounded text-xs">
                      <div>{result.message || "لا توجد نتيجة بعد / No result yet"}</div>
                      {typeof result.users === "number" && typeof result.logs === "number" && (
                        <div className="mt-1 font-semibold">Users: {result.users} | Logs: {result.logs}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-black">قواعد أوقات العمل / Work Schedule Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 border rounded-lg p-3 bg-muted/30">
              <div className="space-y-1">
                <Label className="text-xs font-bold">النطاق / Scope</Label>
                <Select value={scheduleScope} onValueChange={(v) => setScheduleScope(v as "global" | "branch" | "group" | "employee")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">افتراضي عام / Global</SelectItem>
                    <SelectItem value="branch">حسب الفرع / Branch</SelectItem>
                    <SelectItem value="group">مجموعة موظفين / Group</SelectItem>
                    <SelectItem value="employee">موظف محدد / Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleScope !== "global" && (
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs font-bold">الفرع / Branch</Label>
                  <Select value={scheduleBranchId} onValueChange={setScheduleBranchId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="اختر فرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold">بداية الدوام</Label>
                <Input type="time" value={scheduleStartTime} onChange={(e) => setScheduleStartTime(e.target.value)} className="h-9" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">نهاية الدوام</Label>
                <Input type="time" value={scheduleEndTime} onChange={(e) => setScheduleEndTime(e.target.value)} className="h-9" />
              </div>

              <div className="md:col-span-6">
                {scheduleScope === "employee" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الموظف</Label>
                    <Select value={scheduleEmployeeId} onValueChange={setScheduleEmployeeId}>
                      <SelectTrigger className="h-9 md:max-w-md">
                        <SelectValue placeholder="اختر موظف" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scheduleScope === "group" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">الموظفون في المجموعة / Group Employees</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setScheduleEmployeeIds(employees.map((e) => e.id))}>تحديد الكل</Button>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setScheduleEmployeeIds([])}>إلغاء</Button>
                      </div>
                    </div>
                    <ScrollArea className="h-44 rounded border bg-white p-2">
                      <div className="space-y-2">
                        {employees.map((e) => (
                          <label key={e.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={scheduleEmployeeIds.includes(e.id)}
                              onCheckedChange={(checked) => toggleScheduleEmployee(e.id, checked)}
                            />
                            <span>{e.name}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              <div className="md:col-span-6 flex justify-end">
                <Button onClick={addScheduleRule} className="font-bold">
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة قاعدة الدوام
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-xs font-black border-b">القاعدة</th>
                    <th className="p-2 text-xs font-black border-b">النطاق</th>
                    <th className="p-2 text-xs font-black border-b">الدوام</th>
                    <th className="p-2 text-xs font-black border-b">الفرع</th>
                    <th className="p-2 text-xs font-black border-b">الموظفون</th>
                    <th className="p-2 text-xs font-black border-b">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {workSchedules
                    .slice()
                    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
                    .map((rule) => {
                      const branchName = rule.branchId ? (branches.find((b) => b.id === rule.branchId)?.name || rule.branchId) : "كل الفروع"
                      const employeeName = rule.employeeId ? (employees.find((e) => e.id === rule.employeeId)?.name || rule.employeeId) : "-"
                      const groupCount = Array.isArray(rule.employeeIds) ? rule.employeeIds.length : 0
                      return (
                        <tr key={rule.id}>
                          <td className="p-2 text-xs font-semibold">{rule.name || "-"}</td>
                          <td className="p-2 text-xs">
                            {rule.scopeType === "global" && "عام"}
                            {rule.scopeType === "branch" && "فرع"}
                            {rule.scopeType === "group" && "مجموعة"}
                            {rule.scopeType === "employee" && "موظف"}
                          </td>
                          <td className="p-2 text-xs font-bold">{rule.startTime} - {rule.endTime}</td>
                          <td className="p-2 text-xs">{branchName}</td>
                          <td className="p-2 text-xs">
                            {rule.scopeType === "employee" && employeeName}
                            {rule.scopeType === "group" && `${groupCount} موظف`}
                            {(rule.scopeType === "global" || rule.scopeType === "branch") && "-"}
                          </td>
                          <td className="p-2 text-xs">
                            <Button variant="destructive" size="sm" className="h-7" onClick={() => deleteScheduleRule(rule.id)}>
                              <Trash2 className="h-3 w-3 ml-1" /> حذف
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  {workSchedules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-sm text-muted-foreground">
                        لا توجد قواعد دوام بعد. أضف قاعدة عامة أولاً (مثال: 08:00 - 16:00).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-black">خلاصة الحضور والانصراف / Daily In-Out Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeDataTab} onValueChange={setActiveDataTab} className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
                <TabsTrigger value="all" className="border">الكل / All</TabsTrigger>
                {branches.map((branch) => (
                  <TabsTrigger key={branch.id} value={branch.id} className="border">
                    {(() => {
                      const key = String(branch.name || "").trim().toLowerCase()
                      const isDuplicateName = (normalizedBranchNameMap.get(key)?.length || 0) > 1
                      return isDuplicateName ? `${branch.name} (${branch.id.slice(0, 4)})` : branch.name
                    })()}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={activeDataTab} className="space-y-4">
                {/* ── Filter Bar ── */}
                <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-lg border">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">طريقة العرض / View</Label>
                    <Select value={summaryViewMode} onValueChange={(v) => setSummaryViewMode(v as SummaryViewMode)}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="detailed">تفريد / Detailed</SelectItem>
                        <SelectItem value="grouped">تجميع / Grouped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الفترة / Period</Label>
                    <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current_month">الشهر الحالي / This Month</SelectItem>
                        <SelectItem value="month">شهر محدد / Select Month</SelectItem>
                        <SelectItem value="day">يوم محدد / Select Day</SelectItem>
                        <SelectItem value="range">من - إلى / Date Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {filterMode === "month" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">الشهر / Month</Label>
                      <Input
                        type="month"
                        value={filterMonthYear}
                        onChange={(e) => setFilterMonthYear(e.target.value)}
                        className="h-9 w-44"
                      />
                    </div>
                  )}

                  {filterMode === "day" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">اليوم / Day</Label>
                      <Input
                        type="date"
                        value={filterDay}
                        onChange={(e) => setFilterDay(e.target.value)}
                        className="h-9 w-44"
                      />
                    </div>
                  )}

                  {filterMode === "range" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">من / From</Label>
                        <Input
                          type="date"
                          value={filterFrom}
                          onChange={(e) => setFilterFrom(e.target.value)}
                          className="h-9 w-44"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">إلى / To</Label>
                        <Input
                          type="date"
                          value={filterTo}
                          onChange={(e) => setFilterTo(e.target.value)}
                          className="h-9 w-44"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* ── Summary Table ── */}
                {(() => {
                  const { logs: allLogs, users, saveCandidates } = getTabData(activeDataTab)
                  const filteredLogs = getFilteredLogs(allLogs)
                  const filteredSaveCandidates = getFilteredLogs(saveCandidates)
                  const detailedSummary = getDailySummary(filteredLogs)
                  const summary = summaryViewMode === "grouped" ? getGroupedSummary(detailedSummary) : detailedSummary

                  return (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="text-sm text-muted-foreground">
                          موظفين / Users: {users.length} | بصمات ظاهرة / Visible Logs: {filteredLogs.length} | إجمالي / Total: {allLogs.length}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => exportSummaryPdf(summary, summaryViewMode)}
                            disabled={exportingPdf || summary.length === 0}
                            className="font-bold"
                          >
                            <Printer className="h-4 w-4 ml-2" />
                            {exportingPdf ? "جاري التصدير..." : "تصدير PDF / Export"}
                          </Button>
                          <Button
                            onClick={() => saveFingerprintLogs(activeDataTab, filteredSaveCandidates)}
                            disabled={savingTab !== null || filteredSaveCandidates.length === 0}
                            className="font-bold"
                          >
                            {savingTab === activeDataTab
                              ? "جاري الحفظ... / Saving..."
                              : `حفظ السجلات / Save Logs (${filteredSaveCandidates.length})`}
                          </Button>
                        </div>
                      </div>

                      <div className="border rounded-lg overflow-auto max-h-[500px]">
                        {summaryViewMode === "detailed" ? (
                          <table className="w-full text-right border-collapse text-sm">
                            <thead className="bg-muted/70 sticky top-0 z-10">
                              <tr>
                                <th className="p-2 text-xs font-black border-b">#</th>
                                <th className="p-2 text-xs font-black border-b">اسم الموظف / Employee</th>
                                <th className="p-2 text-xs font-black border-b">التاريخ / Date</th>
                                <th className="p-2 text-xs font-black border-b text-blue-700">أول بصمة (حضور) / In</th>
                                <th className="p-2 text-xs font-black border-b text-red-600">آخر بصمة (انصراف) / Out</th>
                                <th className="p-2 text-xs font-black border-b">الدوام المعتمد</th>
                                <th className="p-2 text-xs font-black border-b">البصمات</th>
                                <th className="p-2 text-xs font-black border-b">الساعات</th>
                                <th className="p-2 text-xs font-black border-b text-red-700">النقص</th>
                                {activeDataTab === "all" && (
                                  <th className="p-2 text-xs font-black border-b">الفرع / Branch</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {summary.map((row, idx) => {
                                const hasOut = row.count >= 2
                                const duration = formatMinutes(row.actualMinutes)
                                return (
                                  <tr key={`${row.deviceUserId}_${row.date}`} className="hover:bg-muted/30">
                                    <td className="p-2 text-xs text-muted-foreground">{idx + 1}</td>
                                    <td className="p-2 text-xs font-semibold">{row.employeeName}</td>
                                    <td className="p-2 text-xs">{row.date}</td>
                                    <td className="p-2 text-xs font-bold text-blue-700">{format(row.first, "HH:mm:ss")}</td>
                                    <td className="p-2 text-xs font-bold">
                                      {hasOut ? (
                                        <span className="text-red-600">{format(row.last, "HH:mm:ss")}</span>
                                      ) : (
                                        <span className="text-muted-foreground italic">لم يتم التسجيل</span>
                                      )}
                                    </td>
                                    <td className="p-2 text-xs text-center">
                                      {row.expectedStart && row.expectedEnd ? (
                                        <div className="font-bold">
                                          {row.expectedStart} - {row.expectedEnd}
                                          <div className="text-[10px] text-muted-foreground">
                                            {row.scheduleScope === "employee" && "حسب الموظف"}
                                            {row.scheduleScope === "group" && "حسب المجموعة"}
                                            {row.scheduleScope === "branch" && "حسب الفرع"}
                                            {row.scheduleScope === "global" && "افتراضي عام"}
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">غير محدد</span>
                                      )}
                                    </td>
                                    <td className="p-2 text-xs text-center">{row.count}</td>
                                    <td className={`p-2 text-xs font-bold text-center ${duration !== "00:00" ? "text-green-700" : "text-muted-foreground"}`}>
                                      {duration}
                                    </td>
                                    <td className={`p-2 text-xs font-bold text-center ${row.deficitMinutes > 0 ? "text-red-700" : "text-green-700"}`}>
                                      {formatMinutes(row.deficitMinutes)}
                                    </td>
                                    {activeDataTab === "all" && (
                                      <td className="p-2 text-xs">{row.branchName}</td>
                                    )}
                                  </tr>
                                )
                              })}
                              {summary.length === 0 && (
                                <tr>
                                  <td colSpan={activeDataTab === "all" ? 10 : 9} className="p-6 text-center text-sm text-muted-foreground">
                                    {allLogs.length === 0
                                      ? "لا توجد سجلات. قم بتحديث الفرع أولاً."
                                      : "لا توجد سجلات في الفترة المختارة. غيّر الفلتر."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full text-right border-collapse text-sm">
                            <thead className="bg-muted/70 sticky top-0 z-10">
                              <tr>
                                <th className="p-2 text-xs font-black border-b">#</th>
                                <th className="p-2 text-xs font-black border-b">اسم الموظف / Employee</th>
                                <th className="p-2 text-xs font-black border-b">عدد الأيام</th>
                                <th className="p-2 text-xs font-black border-b">البصمات</th>
                                <th className="p-2 text-xs font-black border-b">الساعات المجمعة</th>
                                <th className="p-2 text-xs font-black border-b text-red-700">النقص المجمع</th>
                                <th className="p-2 text-xs font-black border-b">الفرع / Branch</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {summary.map((row, idx) => (
                                <tr key={`${row.employeeId || row.deviceUserId}_${idx}`} className="hover:bg-muted/30">
                                  <td className="p-2 text-xs text-muted-foreground">{idx + 1}</td>
                                  <td className="p-2 text-xs font-semibold">{row.employeeName}</td>
                                  <td className="p-2 text-xs text-center">{row.daysCount || 1}</td>
                                  <td className="p-2 text-xs text-center">{row.count}</td>
                                  <td className={`p-2 text-xs font-bold text-center ${row.actualMinutes > 0 ? "text-green-700" : "text-muted-foreground"}`}>
                                    {formatMinutes(row.actualMinutes)}
                                  </td>
                                  <td className={`p-2 text-xs font-bold text-center ${row.deficitMinutes > 0 ? "text-red-700" : "text-green-700"}`}>
                                    {formatMinutes(row.deficitMinutes)}
                                  </td>
                                  <td className="p-2 text-xs">{row.branchName || "-"}</td>
                                </tr>
                              ))}
                              {summary.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                                    {allLogs.length === 0
                                      ? "لا توجد سجلات. قم بتحديث الفرع أولاً."
                                      : "لا توجد سجلات في الفترة المختارة. غيّر الفلتر."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  )
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
