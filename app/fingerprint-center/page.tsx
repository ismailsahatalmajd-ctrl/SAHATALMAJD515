"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useLiveQuery } from "dexie-react-hooks"
import { Header } from "@/components/header"
import { useAuth } from "@/components/auth-provider"
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
  bridgeId?: string
}

type BranchConfigSyncState = "synced" | "pending" | "error"

type BranchConfigSyncMeta = {
  syncState: BranchConfigSyncState
  updatedAt?: string
  lastSyncAt?: string
  error?: string
}

type FingerprintMapStatus = "mapped" | "unmapped" | "needs_review"

type FingerprintMappingRecord = {
  employeeId?: string
  employeeName?: string
  fingerprintLabel?: string
  status: FingerprintMapStatus
  updatedAt: string
}

type BranchFingerprintMappings = Record<string, Record<string, FingerprintMappingRecord>>

type BranchMappingSyncMeta = {
  syncState: BranchConfigSyncState
  updatedAt?: string
  lastSyncAt?: string
  error?: string
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

type AuditEvent = {
  id: string
  at: string
  action: string
  branchId?: string
  branchName?: string
  actor: string
  details?: string
}

type FingerprintHubPageProps = {
  forcedMode?: "auto" | "branch" | "admin"
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
const LOCAL_CONFIG_META_KEY = "fingerprint_hub_branch_configs_meta_v1"
const LOCAL_MAPPING_KEY = "fingerprint_hub_branch_mappings_v1"
const LOCAL_MAPPING_META_KEY = "fingerprint_hub_branch_mappings_meta_v1"
const LOCAL_AUDIT_KEY = "fingerprint_hub_audit_v1"
const AUTO_SYNC_ENABLED_KEY = "fingerprint_hub_auto_sync_enabled_v1"
const AUTO_SYNC_INTERVAL_KEY = "fingerprint_hub_auto_sync_interval_seconds_v1"
const DEFAULT_WORK_START = "08:00"
const DEFAULT_WORK_END = "16:00"

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

const normalizeText = (value: string) => String(value || "").trim().toLowerCase()

export default function FingerprintHubPage({ forcedMode = "auto" }: FingerprintHubPageProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const branches = useLiveQuery(() => db.branches.toArray()) || []
  const employees = useLiveQuery(() => db.employees.toArray()) || []
  const absenceRecords = useLiveQuery(() => db.absenceRecords.toArray()) || []
  const workSchedules = (useLiveQuery(() => db.workSchedules.toArray()) || []) as WorkScheduleRule[]
  const roleIsBranch = String(user?.role || "") === "branch"
  const isBranchUser = forcedMode === "branch" ? true : forcedMode === "admin" ? false : roleIsBranch
  const currentBranchId = String(user?.branchId || "")

  const [bridgeOnline, setBridgeOnline] = useState(false)
  const [bridgePaused, setBridgePaused] = useState(false)
  const [bridgeHost, setBridgeHost] = useState("")
  const [bridgeLastSeen, setBridgeLastSeen] = useState<string | null>(null)
  const [bridgeControlLoading, setBridgeControlLoading] = useState<ControlAction | null>(null)

  const [branchConfigs, setBranchConfigs] = useState<Record<string, BranchBridgeConfig>>({})
  const [branchConfigMeta, setBranchConfigMeta] = useState<Record<string, BranchConfigSyncMeta>>({})
  const [branchMappings, setBranchMappings] = useState<BranchFingerprintMappings>({})
  const [branchMappingMeta, setBranchMappingMeta] = useState<Record<string, BranchMappingSyncMeta>>({})
  const [mappingBranchId, setMappingBranchId] = useState<string>("")
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingBranchId, setSyncingBranchId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, SyncResult>>({})
  const [branchData, setBranchData] = useState<Record<string, BranchFetchedData>>({})
  const [activeDataTab, setActiveDataTab] = useState<string>("all")
  const [savingTab, setSavingTab] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [autoSyncIntervalSeconds, setAutoSyncIntervalSeconds] = useState(10)
  const [autoSyncLastRunAt, setAutoSyncLastRunAt] = useState<string | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const autoSyncInFlightRef = useRef(false)
  const configSyncTimersRef = useRef<Record<string, number>>({})
  const mappingSyncTimersRef = useRef<Record<string, number>>({})

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

  const visibleBranches = useMemo(() => {
    if (!isBranchUser) return branches
    if (!currentBranchId) return []
    return branches.filter((b) => b.id === currentBranchId)
  }, [branches, isBranchUser, currentBranchId])

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
      const rawMeta = localStorage.getItem(LOCAL_CONFIG_META_KEY)

      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          setBranchConfigs(parsed)
        }
      }

      if (rawMeta) {
        const parsedMeta = JSON.parse(rawMeta)
        if (parsedMeta && typeof parsedMeta === "object") {
          setBranchConfigMeta(parsedMeta)
        }
      }
    } catch {
      // ignore local storage parsing errors
    }
  }, [])

  const persistLocalBranchConfigState = (
    nextConfigs: Record<string, BranchBridgeConfig>,
    nextMeta: Record<string, BranchConfigSyncMeta>
  ) => {
    setBranchConfigs(nextConfigs)
    setBranchConfigMeta(nextMeta)
    try {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(nextConfigs))
      localStorage.setItem(LOCAL_CONFIG_META_KEY, JSON.stringify(nextMeta))
    } catch {
      // ignore local storage write errors
    }
  }

  const markBranchConfigMeta = (branchId: string, patch: Partial<BranchConfigSyncMeta>) => {
    setBranchConfigMeta((prev) => {
      const next: Record<string, BranchConfigSyncMeta> = {
        ...prev,
        [branchId]: {
          ...(prev[branchId] || {}),
          ...patch,
          syncState: (patch.syncState || "pending") as BranchConfigSyncState,
        },
      }

      try {
        localStorage.setItem(LOCAL_CONFIG_META_KEY, JSON.stringify(next))
      } catch {
        // ignore local storage write errors
      }

      return next
    })
  }

  const upsertBranchConfigToCloud = async (branchId: string, cfg: BranchBridgeConfig, updatedAt: string) => {
    const { getApp } = await import("firebase/app")
    const { getFirestore, doc, setDoc } = await import("firebase/firestore")
    const firestoreDb = getFirestore(getApp())
    const branchRef = doc(firestoreDb, "branches", branchId)

    await setDoc(branchRef, {
      fingerprintConfig: {
        ip: cfg.ip,
        port: cfg.port,
        bridgeId: cfg.bridgeId || "",
        updatedAt,
      },
    }, { merge: true })
  }

  const flushBranchConfigToCloud = async (branchId: string) => {
    const cfg = branchConfigs[branchId]
    if (!cfg) return
    const updatedAt = new Date().toISOString()

    markBranchConfigMeta(branchId, {
      syncState: "pending",
      updatedAt,
      error: undefined,
    })

    try {
      await upsertBranchConfigToCloud(branchId, cfg, updatedAt)
      markBranchConfigMeta(branchId, {
        syncState: "synced",
        updatedAt,
        lastSyncAt: new Date().toISOString(),
        error: undefined,
      })
      appendAuditEvent({
        action: "config_synced",
        branchId,
        branchName: branches.find((b) => b.id === branchId)?.name || branchId,
        details: `IP ${cfg.ip}:${cfg.port}`,
      })
    } catch (error: any) {
      markBranchConfigMeta(branchId, {
        syncState: "error",
        updatedAt,
        error: String(error?.message || error || "Cloud sync failed"),
      })
      appendAuditEvent({
        action: "config_sync_error",
        branchId,
        branchName: branches.find((b) => b.id === branchId)?.name || branchId,
        details: String(error?.message || error || "Cloud sync failed"),
      })
    }
  }

  const queueBranchConfigCloudSync = (branchId: string) => {
    const currentTimer = configSyncTimersRef.current[branchId]
    if (currentTimer) {
      clearTimeout(currentTimer)
    }

    const timer = window.setTimeout(() => {
      void flushBranchConfigToCloud(branchId)
    }, 900)

    configSyncTimersRef.current[branchId] = timer
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_MAPPING_KEY)
      const rawMeta = localStorage.getItem(LOCAL_MAPPING_META_KEY)
      const rawAudit = localStorage.getItem(LOCAL_AUDIT_KEY)

      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          setBranchMappings(parsed)
        }
      }

      if (rawMeta) {
        const parsedMeta = JSON.parse(rawMeta)
        if (parsedMeta && typeof parsedMeta === "object") {
          setBranchMappingMeta(parsedMeta)
        }
      }

      if (rawAudit) {
        const parsedAudit = JSON.parse(rawAudit)
        if (Array.isArray(parsedAudit)) {
          setAuditEvents(parsedAudit)
        }
      }
    } catch {
      // ignore local storage parsing errors
    }
  }, [])

  const appendAuditEvent = (event: Omit<AuditEvent, "id" | "at" | "actor">) => {
    setAuditEvents((prev) => {
      const next: AuditEvent[] = [
        {
          id: generateId(),
          at: new Date().toISOString(),
          actor: isBranchUser ? `branch:${currentBranchId || "unknown"}` : "admin",
          ...event,
        },
        ...prev,
      ].slice(0, 300)

      try {
        localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(next))
      } catch {
        // ignore local storage write errors
      }

      return next
    })
  }

  const persistLocalBranchMappingState = (
    nextMappings: BranchFingerprintMappings,
    nextMeta: Record<string, BranchMappingSyncMeta>
  ) => {
    setBranchMappings(nextMappings)
    setBranchMappingMeta(nextMeta)
    try {
      localStorage.setItem(LOCAL_MAPPING_KEY, JSON.stringify(nextMappings))
      localStorage.setItem(LOCAL_MAPPING_META_KEY, JSON.stringify(nextMeta))
    } catch {
      // ignore local storage write errors
    }
  }

  const markBranchMappingMeta = (branchId: string, patch: Partial<BranchMappingSyncMeta>) => {
    setBranchMappingMeta((prev) => {
      const next: Record<string, BranchMappingSyncMeta> = {
        ...prev,
        [branchId]: {
          ...(prev[branchId] || {}),
          ...patch,
          syncState: (patch.syncState || "pending") as BranchConfigSyncState,
        },
      }

      try {
        localStorage.setItem(LOCAL_MAPPING_META_KEY, JSON.stringify(next))
      } catch {
        // ignore local storage write errors
      }

      return next
    })
  }

  const upsertBranchMappingsToCloud = async (
    branchId: string,
    mappings: Record<string, FingerprintMappingRecord>,
    updatedAt: string
  ) => {
    const { getApp } = await import("firebase/app")
    const { getFirestore, doc, setDoc } = await import("firebase/firestore")
    const firestoreDb = getFirestore(getApp())
    const branchRef = doc(firestoreDb, "branches", branchId)

    await setDoc(branchRef, {
      fingerprintMappings: mappings,
      fingerprintMappingsUpdatedAt: updatedAt,
    }, { merge: true })
  }

  const flushBranchMappingsToCloud = async (branchId: string) => {
    const branchMapping = branchMappings[branchId] || {}
    const updatedAt = new Date().toISOString()

    markBranchMappingMeta(branchId, {
      syncState: "pending",
      updatedAt,
      error: undefined,
    })

    try {
      await upsertBranchMappingsToCloud(branchId, branchMapping, updatedAt)
      markBranchMappingMeta(branchId, {
        syncState: "synced",
        updatedAt,
        lastSyncAt: new Date().toISOString(),
        error: undefined,
      })
      appendAuditEvent({
        action: "mapping_synced",
        branchId,
        branchName: branches.find((b) => b.id === branchId)?.name || branchId,
        details: `Mapped IDs: ${Object.keys(branchMapping).length}`,
      })
    } catch (error: any) {
      markBranchMappingMeta(branchId, {
        syncState: "error",
        updatedAt,
        error: String(error?.message || error || "Mapping cloud sync failed"),
      })
      appendAuditEvent({
        action: "mapping_sync_error",
        branchId,
        branchName: branches.find((b) => b.id === branchId)?.name || branchId,
        details: String(error?.message || error || "Mapping cloud sync failed"),
      })
    }
  }

  const queueBranchMappingCloudSync = (branchId: string) => {
    const currentTimer = mappingSyncTimersRef.current[branchId]
    if (currentTimer) {
      clearTimeout(currentTimer)
    }

    const timer = window.setTimeout(() => {
      void flushBranchMappingsToCloud(branchId)
    }, 900)

    mappingSyncTimersRef.current[branchId] = timer
  }

  useEffect(() => {
    if (visibleBranches.length === 0) return

    let alive = true

    const loadCloudConfigs = async () => {
      try {
        const { getApp } = await import("firebase/app")
        const { getFirestore, doc, getDoc } = await import("firebase/firestore")
        const firestoreDb = getFirestore(getApp())

        const cloudUpdates: Record<string, BranchBridgeConfig> = {}
        const cloudMetaUpdates: Record<string, BranchConfigSyncMeta> = {}
        const cloudMappingUpdates: BranchFingerprintMappings = {}
        const cloudMappingMetaUpdates: Record<string, BranchMappingSyncMeta> = {}

        for (const branch of visibleBranches) {
          // eslint-disable-next-line no-await-in-loop
          const snap = await getDoc(doc(firestoreDb, "branches", branch.id))
          const docData: any = snap.data() || {}
          const fingerprintConfig: any = docData.fingerprintConfig
          if (!fingerprintConfig || typeof fingerprintConfig !== "object") continue

          const cloudUpdatedAt = String(fingerprintConfig.updatedAt || "")
          const localUpdatedAt = String(branchConfigMeta[branch.id]?.updatedAt || "")

          const cloudTs = new Date(cloudUpdatedAt).getTime()
          const localTs = new Date(localUpdatedAt).getTime()
          const cloudIsNewer = Number.isFinite(cloudTs) && (!Number.isFinite(localTs) || cloudTs >= localTs)

          if (cloudIsNewer) {
            cloudUpdates[branch.id] = {
              ip: String(fingerprintConfig.ip || ""),
              port: String(fingerprintConfig.port || "4370"),
              bridgeId: String(fingerprintConfig.bridgeId || ""),
            }
            cloudMetaUpdates[branch.id] = {
              syncState: "synced",
              updatedAt: cloudUpdatedAt || new Date().toISOString(),
              lastSyncAt: new Date().toISOString(),
            }
          }

          const cloudMappings = docData.fingerprintMappings
          if (cloudMappings && typeof cloudMappings === "object") {
            const cloudMapUpdatedAt = String(docData.fingerprintMappingsUpdatedAt || "")
            const localMapUpdatedAt = String(branchMappingMeta[branch.id]?.updatedAt || "")
            const cloudMapTs = new Date(cloudMapUpdatedAt).getTime()
            const localMapTs = new Date(localMapUpdatedAt).getTime()
            const cloudMapIsNewer = Number.isFinite(cloudMapTs) && (!Number.isFinite(localMapTs) || cloudMapTs >= localMapTs)

            if (cloudMapIsNewer) {
              cloudMappingUpdates[branch.id] = cloudMappings as Record<string, FingerprintMappingRecord>
              cloudMappingMetaUpdates[branch.id] = {
                syncState: "synced",
                updatedAt: cloudMapUpdatedAt || new Date().toISOString(),
                lastSyncAt: new Date().toISOString(),
              }
            }
          }
        }

        if (!alive) return

        if (Object.keys(cloudUpdates).length > 0) {
          const nextConfigs = { ...branchConfigs, ...cloudUpdates }
          const nextMeta = { ...branchConfigMeta, ...cloudMetaUpdates }
          persistLocalBranchConfigState(nextConfigs, nextMeta)
        }

        if (Object.keys(cloudMappingUpdates).length > 0) {
          const nextMappings = { ...branchMappings, ...cloudMappingUpdates }
          const nextMappingMeta = { ...branchMappingMeta, ...cloudMappingMetaUpdates }
          persistLocalBranchMappingState(nextMappings, nextMappingMeta)
        }
      } catch {
        // ignore cloud load errors to keep local fallback active
      }
    }

    void loadCloudConfigs()

    return () => {
      alive = false
    }
    // visible branches are the cloud source list for loading docs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBranches.length])

  useEffect(() => {
    if (visibleBranches.length === 0) return

    const firstBranchId = visibleBranches[0]?.id || ""

    if (isBranchUser && currentBranchId) {
      setActiveDataTab(currentBranchId)
      setMappingBranchId(currentBranchId)
      setScheduleBranchId(currentBranchId)
      if (scheduleScope === "global") {
        setScheduleScope("branch")
      }
      return
    }

    if (!mappingBranchId && firstBranchId) {
      setMappingBranchId(firstBranchId)
    }
  }, [visibleBranches, isBranchUser, currentBranchId, mappingBranchId, scheduleScope])

  useEffect(() => {
    const pendingBranchIds = Object.entries(branchConfigMeta)
      .filter(([, meta]) => meta?.syncState === "pending")
      .map(([branchId]) => branchId)

    if (pendingBranchIds.length === 0) return

    const timer = window.setInterval(() => {
      for (const branchId of pendingBranchIds) {
        void flushBranchConfigToCloud(branchId)
      }
    }, 12000)

    return () => clearInterval(timer)
    // re-run when pending set changes
  }, [branchConfigMeta])

  useEffect(() => {
    const pendingBranchIds = Object.entries(branchMappingMeta)
      .filter(([, meta]) => meta?.syncState === "pending")
      .map(([branchId]) => branchId)

    if (pendingBranchIds.length === 0) return

    const timer = window.setInterval(() => {
      for (const branchId of pendingBranchIds) {
        void flushBranchMappingsToCloud(branchId)
      }
    }, 12000)

    return () => clearInterval(timer)
  }, [branchMappingMeta])

  useEffect(() => {
    try {
      const rawEnabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY)
      const rawInterval = localStorage.getItem(AUTO_SYNC_INTERVAL_KEY)

      if (rawEnabled === "1") setAutoSyncEnabled(true)
      if (rawEnabled === "0") setAutoSyncEnabled(false)

      const parsedInterval = Number(rawInterval || "")
      if (Number.isFinite(parsedInterval) && parsedInterval >= 5) {
        setAutoSyncIntervalSeconds(parsedInterval)
      }
    } catch {
      // ignore local storage parsing errors
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_SYNC_ENABLED_KEY, autoSyncEnabled ? "1" : "0")
      localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, String(Math.max(5, Math.floor(autoSyncIntervalSeconds || 10))))
    } catch {
      // ignore local storage write errors
    }
  }, [autoSyncEnabled, autoSyncIntervalSeconds])

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

  const saveConfig = (next: Record<string, BranchBridgeConfig>, nextMeta?: Record<string, BranchConfigSyncMeta>) => {
    persistLocalBranchConfigState(next, nextMeta || branchConfigMeta)
  }

  const getBranchConfig = (branchId: string): BranchBridgeConfig => {
    return branchConfigs[branchId] || { ip: "192.168.10.121", port: "4370", bridgeId: "" }
  }

  const getMappedEmployee = (branchId: string, deviceUserId: string) => {
    const branchMap = branchMappings[branchId] || {}
    const record = branchMap[deviceUserId]
    if (!record?.employeeId) return undefined
    return employees.find((e) => e.id === record.employeeId)
  }

  const setMappingForDeviceUser = (branchId: string, deviceUserId: string, employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId)
    const updatedAt = new Date().toISOString()
    const nextBranchMap = {
      ...(branchMappings[branchId] || {}),
      [deviceUserId]: {
        employeeId,
        employeeName: employee?.name || "",
        fingerprintLabel: `#${deviceUserId}`,
        status: "mapped" as const,
        updatedAt,
      },
    }

    const nextMappings = {
      ...branchMappings,
      [branchId]: nextBranchMap,
    }

    const nextMeta = {
      ...branchMappingMeta,
      [branchId]: {
        ...(branchMappingMeta[branchId] || { syncState: "pending" as const }),
        syncState: "pending" as const,
        updatedAt,
        error: undefined,
      },
    }

    persistLocalBranchMappingState(nextMappings, nextMeta)
    queueBranchMappingCloudSync(branchId)
    appendAuditEvent({
      action: "mapping_updated",
      branchId,
      branchName: branches.find((b) => b.id === branchId)?.name || branchId,
      details: `deviceUserId ${deviceUserId} -> ${employee?.name || employeeId}`,
    })
  }

  const setBranchConfigField = (branchId: string, field: keyof BranchBridgeConfig, value: string) => {
    const current = getBranchConfig(branchId)
    const updatedAt = new Date().toISOString()
    const next = {
      ...branchConfigs,
      [branchId]: {
        ...current,
        [field]: value,
      },
    }

    const nextMeta = {
      ...branchConfigMeta,
      [branchId]: {
        ...(branchConfigMeta[branchId] || { syncState: "pending" as const }),
        syncState: "pending" as const,
        updatedAt,
        error: undefined,
      },
    }

    saveConfig(next, nextMeta)
    queueBranchConfigCloudSync(branchId)
  }

  const waitForSyncResult = async (requestId: string, branchId: string, expectedBridgeId?: string) => {
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
        if (expectedBridgeId) {
          const responseBridgeId = String(data.bridgeId || data.executedBridgeId || data.targetBridgeId || "")
          if (responseBridgeId && responseBridgeId !== expectedBridgeId) return
          if (data.targetBridgeId && String(data.targetBridgeId) !== expectedBridgeId) return
        }

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
      const branchId = String(log.__branchId || "")
      const normalizedEmployeeId = String(
        log.employeeId ||
        employeeByFingerprint.get(rawDeviceUserId) ||
        rawDeviceUserId ||
        ""
      )

      // Keep branch in key so identical device numbers across branches stay isolated.
      const key = `${branchId}|${normalizedEmployeeId}|${recordTime}`
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
    if (isBranchUser && !currentBranchId) {
      toast({ title: "تعذر تحديد الفرع", description: "تأكد من حساب الفرع ثم أعد المحاولة.", variant: "destructive" })
      return
    }

    if (isBranchUser && scheduleScope === "global") {
      toast({ title: "غير مسموح", description: "حساب الفرع لا يمكنه إنشاء قاعدة عامة.", variant: "destructive" })
      return
    }

    if (!scheduleStartTime || !scheduleEndTime) {
      toast({ title: "حدد وقت الدوام", description: "أدخل بداية ونهاية الدوام.", variant: "destructive" })
      return
    }

    const effectiveScheduleBranchId = isBranchUser ? currentBranchId : scheduleBranchId

    if (scheduleScope === "branch" && !effectiveScheduleBranchId) {
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
      branchId: scheduleScope === "global" ? undefined : (effectiveScheduleBranchId || undefined),
      employeeId: scheduleScope === "employee" ? scheduleEmployeeId : undefined,
      employeeIds: scheduleScope === "group" ? [...scheduleEmployeeIds] : undefined,
      name: scheduleScope === "global"
        ? "الافتراضي العام / Global Default"
        : scheduleScope === "branch"
          ? `فرع ${branches.find((b) => b.id === effectiveScheduleBranchId)?.name || ""}`
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

  const resolveScheduleRule = (
    employeeId?: string,
    branchId?: string,
    deviceUserId?: string,
    employeeName?: string
  ) => {
    const activeRules = workSchedules.filter((r) => r.active !== false)
    const resolvedEmployeeId = (() => {
      if (employeeId) return employeeId
      if (deviceUserId) {
        const byFingerprint = employees.find((e) => normalizeText(String(e.fingerprintId || "")) === normalizeText(deviceUserId))
        if (byFingerprint?.id) return byFingerprint.id
      }
      if (employeeName) {
        const normalizedName = normalizeText(employeeName)
        const byName = employees.find((e) => normalizeText(e.name || "") === normalizedName)
        if (byName?.id) return byName.id
      }
      return undefined
    })()

    const exactEmployeeBranch = activeRules.filter((r) =>
      r.scopeType === "employee" &&
      r.employeeId === resolvedEmployeeId &&
      Boolean(branchId) &&
      r.branchId === branchId
    )
    if (exactEmployeeBranch.length) return pickLatestRule(exactEmployeeBranch)

    const anyEmployeeBranch = activeRules.filter((r) =>
      r.scopeType === "employee" &&
      r.employeeId === resolvedEmployeeId &&
      !r.branchId
    )
    if (anyEmployeeBranch.length) return pickLatestRule(anyEmployeeBranch)

    const exactGroupBranch = activeRules.filter((r) =>
      r.scopeType === "group" &&
      Array.isArray(r.employeeIds) &&
      r.employeeIds.includes(String(resolvedEmployeeId || "")) &&
      Boolean(branchId) &&
      r.branchId === branchId
    )
    if (exactGroupBranch.length) return pickLatestRule(exactGroupBranch)

    const anyGroupBranch = activeRules.filter((r) =>
      r.scopeType === "group" &&
      Array.isArray(r.employeeIds) &&
      r.employeeIds.includes(String(resolvedEmployeeId || "")) &&
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

    // Fallback so deficit still calculates even before user defines rules.
    return {
      id: "__fallback_global__",
      scopeType: "global" as const,
      startTime: DEFAULT_WORK_START,
      endTime: DEFAULT_WORK_END,
      active: true,
      createdAt: new Date(0).toISOString(),
      name: "Fallback Global 08:00-16:00",
    }
  }

  const getTabData = (tabBranchId: string) => {
    if (isBranchUser && tabBranchId === "all" && currentBranchId) {
      return getTabData(currentBranchId)
    }

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

        const effectiveBranchId = tabBranchId === "all" ? String(log.__branchId || "") : tabBranchId
        if (!effectiveBranchId) {
          skippedCount++
          continue
        }

        const mappedEmployee = getMappedEmployee(effectiveBranchId, deviceUserId)
        const employee = mappedEmployee || employees.find((e) => String(e.fingerprintId || "") === deviceUserId)
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
        const existingForTime = await db.absenceRecords
          .where({ employeeId: employee.id, recordTime: recordTimeStr })
          .toArray()

        const existing = existingForTime.find((item) => String(item.branchId || "") === effectiveBranchId)

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
          branchId: effectiveBranchId,
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
      const branchId = log.__branchId || (activeDataTab !== "all" ? activeDataTab : "")
      const dateStr = format(d, "yyyy-MM-dd")
      const key = `${branchId}_${deviceUserId}_${dateStr}`
      const mappedEmployee = getMappedEmployee(branchId, deviceUserId)
      const employee = mappedEmployee || (log.employeeId
        ? employees.find((e) => e.id === log.employeeId)
        : employees.find((e) => normalizeText(String(e.fingerprintId || "")) === normalizeText(deviceUserId)) ||
          employees.find((e) => normalizeText(e.name || "") === normalizeText(String(log.employeeName || ""))))
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
      const matchedRule = resolveScheduleRule(row.employeeId, row.branchId, row.deviceUserId, row.employeeName)
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

  const syncBranch = async (branchId: string, branchName: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    if (!bridgeOnline) {
      if (!silent) {
        toast({
          title: "Bridge غير متصل / Bridge offline",
          description: "شغّل الجسر على كمبيوتر الفرع أولاً.",
          variant: "destructive",
        })
      }
      return
    }

    const cfg = getBranchConfig(branchId)
    const portNumber = Number(cfg.port)
    if (!cfg.ip || !cfg.bridgeId || !Number.isFinite(portNumber) || portNumber <= 0) {
      if (!silent) {
        toast({
          title: "إعدادات غير صحيحة / Invalid settings",
          description: `تحقق من IP/Port/Bridge ID لفرع ${branchName}`,
          variant: "destructive",
        })
      }
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
        targetBridgeId: cfg.bridgeId,
        requestedAt: new Date().toISOString(),
        requestedBy: isBranchUser ? `fingerprint-hub:branch:${branchId}` : "fingerprint-hub:admin",
        zkIp: cfg.ip,
        zkPort: portNumber,
      }, { merge: true })

      await waitForSyncResult(requestId, branchId, cfg.bridgeId)
      appendAuditEvent({
        action: "branch_sync_done",
        branchId,
        branchName,
        details: `Request ${requestId}`,
      })
      if (!silent) {
        toast({ title: `تم تحديث ${branchName}`, description: "Sync completed successfully" })
      }
    } catch (error: any) {
      appendAuditEvent({
        action: "branch_sync_error",
        branchId,
        branchName,
        details: String(error?.message || error || "Sync failed"),
      })
      if (!silent) {
        toast({
          title: `فشل تحديث ${branchName}`,
          description: String(error?.message || error),
          variant: "destructive",
        })
      }
    } finally {
      setSyncingBranchId((curr) => (curr === branchId ? null : curr))
    }
  }

  const syncAllBranches = async (options?: { silent?: boolean; origin?: "manual" | "auto" }) => {
    const silent = Boolean(options?.silent)
    if (visibleBranches.length === 0) {
      if (!silent) {
        toast({ title: "لا توجد فروع", description: "أضف فروعًا أولاً ثم أعد المحاولة." })
      }
      return
    }

    setSyncingAll(true)
    try {
      for (const branch of visibleBranches) {
        // Sequential sync avoids collisions because current bridge backend uses one status document.
        // This can be made parallel after migrating to per-branch request documents.
        // eslint-disable-next-line no-await-in-loop
        await syncBranch(branch.id, branch.name, { silent })
      }
      if (!silent) {
        toast({
          title: isBranchUser ? "تم تحديث الفرع / Branch synced" : "تم إنهاء تحديث كل الفروع / All branches synced",
          description: "راجع النتائج لكل فرع في القائمة أدناه.",
        })
      }
    } finally {
      setSyncingAll(false)
      setSyncingBranchId(null)
    }
  }

  useEffect(() => {
    if (!autoSyncEnabled) return

    const intervalSeconds = Math.max(5, Math.floor(autoSyncIntervalSeconds || 10))

    const runAutoSync = async () => {
      if (autoSyncInFlightRef.current) return
      if (!bridgeOnline || bridgePaused) return
      if (syncingAll || syncingBranchId !== null) return
      if (visibleBranches.length === 0) return

      autoSyncInFlightRef.current = true
      setAutoSyncLastRunAt(new Date().toISOString())
      try {
        await syncAllBranches({ silent: true, origin: "auto" })
      } finally {
        autoSyncInFlightRef.current = false
      }
    }

    const warmup = setTimeout(() => {
      void runAutoSync()
    }, 3000)

    const timer = setInterval(() => {
      void runAutoSync()
    }, intervalSeconds * 1000)

    return () => {
      clearTimeout(warmup)
      clearInterval(timer)
    }
  }, [
    autoSyncEnabled,
    autoSyncIntervalSeconds,
    bridgeOnline,
    bridgePaused,
    syncingAll,
    syncingBranchId,
    visibleBranches.length,
  ])

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

  const effectiveMappingBranchId = isBranchUser ? currentBranchId : mappingBranchId

  const mappingCandidates = useMemo(() => {
    if (!effectiveMappingBranchId) return [] as string[]
    const fromLogs = (branchData[effectiveMappingBranchId]?.logs || [])
      .map((log) => String(log.deviceUserId ?? log.userId ?? log.uid ?? "").trim())
      .filter(Boolean)

    const fromUsers = (branchData[effectiveMappingBranchId]?.users || [])
      .map((item) => String(item.deviceUserId ?? item.userId ?? item.uid ?? item.id ?? "").trim())
      .filter(Boolean)

    return Array.from(new Set([...fromLogs, ...fromUsers])).sort((a, b) => Number(a) - Number(b))
  }, [branchData, effectiveMappingBranchId])

  const mappingMetaForActiveBranch = effectiveMappingBranchId ? branchMappingMeta[effectiveMappingBranchId] : undefined

  const adminUnmappedQueue = useMemo(() => {
    if (isBranchUser) return [] as Array<{ branchId: string; branchName: string; deviceUserId: string }>

    const rows: Array<{ branchId: string; branchName: string; deviceUserId: string }> = []

    for (const branch of visibleBranches) {
      const branchId = branch.id
      const branchName = branch.name
      const ids = new Set<string>()

      for (const log of branchData[branchId]?.logs || []) {
        const id = String(log.deviceUserId ?? log.userId ?? log.uid ?? "").trim()
        if (id) ids.add(id)
      }

      for (const item of branchData[branchId]?.users || []) {
        const id = String(item.deviceUserId ?? item.userId ?? item.uid ?? item.id ?? "").trim()
        if (id) ids.add(id)
      }

      for (const deviceUserId of ids) {
        const mapped = branchMappings[branchId]?.[deviceUserId]
        if (mapped?.employeeId) continue
        rows.push({ branchId, branchName, deviceUserId })
      }
    }

    rows.sort((a, b) => a.branchName.localeCompare(b.branchName) || Number(a.deviceUserId) - Number(b.deviceUserId))
    return rows
  }, [isBranchUser, visibleBranches, branchData, branchMappings])

  const visibleWorkSchedules = useMemo(() => {
    if (!isBranchUser || !currentBranchId) return workSchedules
    return workSchedules.filter((rule) => !rule.branchId || rule.branchId === currentBranchId)
  }, [workSchedules, isBranchUser, currentBranchId])

  useEffect(() => {
    if (forcedMode !== "auto") return
    if (pathname !== "/fingerprint-center") return
    if (!user) return

    if (roleIsBranch) {
      router.replace("/fingerprint-center/branch")
      return
    }

    router.replace("/fingerprint-center/admin")
  }, [forcedMode, pathname, user, roleIsBranch, router])

  if (forcedMode === "auto" && pathname === "/fingerprint-center") {
    return null
  }

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
            <Button onClick={() => { void syncAllBranches() }} disabled={syncingAll || syncingBranchId !== null} className="font-bold">
              <RefreshCw className="h-4 w-4 ml-2" />
              {syncingAll ? "جاري التحديث... / Syncing..." : isBranchUser ? "تحديث الفرع / Sync Branch" : "تحديث كل الفروع / Sync All"}
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">السحب التلقائي / Auto Pull</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox checked={autoSyncEnabled} onCheckedChange={(v) => setAutoSyncEnabled(v === true)} />
                تفعيل السحب التلقائي
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  step={1}
                  value={autoSyncIntervalSeconds}
                  onChange={(e) => {
                    const n = Number(e.target.value || 10)
                    setAutoSyncIntervalSeconds(Number.isFinite(n) ? Math.max(5, Math.floor(n)) : 10)
                  }}
                  className="h-8"
                />
                <span className="text-xs text-muted-foreground">ثانية / sec</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {autoSyncLastRunAt ? `Last auto run: ${new Date(autoSyncLastRunAt).toLocaleString()}` : "لم يتم تشغيل السحب التلقائي بعد"}
              </div>
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
            <CardTitle className="text-lg font-black">ربط أرقام البصمة بالموظفين / Fingerprint Mapping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isBranchUser && (
              <div className="max-w-sm space-y-1">
                <Label className="text-xs font-bold">الفرع / Branch</Label>
                <Select value={mappingBranchId} onValueChange={setMappingBranchId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {(() => {
                if (!mappingMetaForActiveBranch) return "Mapping: local only"
                if (mappingMetaForActiveBranch.syncState === "synced") {
                  const at = mappingMetaForActiveBranch.lastSyncAt ? new Date(mappingMetaForActiveBranch.lastSyncAt).toLocaleString() : "-"
                  return `Mapping: synced at ${at}`
                }
                if (mappingMetaForActiveBranch.syncState === "pending") return "Mapping: pending cloud sync"
                return `Mapping: sync error ${mappingMetaForActiveBranch.error ? `(${mappingMetaForActiveBranch.error})` : ""}`
              })()}
            </div>

            {effectiveMappingBranchId && mappingCandidates.length > 0 ? (
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="p-2 text-xs font-black border-b">رقم الجهاز / Device User ID</th>
                      <th className="p-2 text-xs font-black border-b">الحالة</th>
                      <th className="p-2 text-xs font-black border-b">الموظف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mappingCandidates.map((deviceUserId) => {
                      const mapped = branchMappings[effectiveMappingBranchId]?.[deviceUserId]
                      return (
                        <tr key={`${effectiveMappingBranchId}_${deviceUserId}`}>
                          <td className="p-2 font-semibold">{deviceUserId}</td>
                          <td className="p-2 text-xs">
                            {mapped?.employeeId ? "mapped" : "unmapped"}
                          </td>
                          <td className="p-2">
                            <Select
                              value={mapped?.employeeId || ""}
                              onValueChange={(employeeId) => setMappingForDeviceUser(effectiveMappingBranchId, deviceUserId, employeeId)}
                            >
                              <SelectTrigger className="h-8 max-w-md">
                                <SelectValue placeholder="اختر موظف / Select employee" />
                              </SelectTrigger>
                              <SelectContent>
                                {employees.map((employee) => (
                                  <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                لا توجد أرقام بصمة ظاهرة حالياً لهذا الفرع. اسحب بيانات الفرع أولاً.
              </div>
            )}
          </CardContent>
        </Card>

        {!isBranchUser && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-black">مراجعة غير المعرّف / Unmapped Review Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                راجع الأرقام غير المعرفة واربطها بالموظفين من هنا.
              </div>

              <div className="border rounded-lg overflow-auto max-h-[320px]">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      <th className="p-2 text-xs font-black border-b">الفرع / Branch</th>
                      <th className="p-2 text-xs font-black border-b">رقم الجهاز / Device User ID</th>
                      <th className="p-2 text-xs font-black border-b">ربط سريع / Quick Map</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adminUnmappedQueue.map((item) => (
                      <tr key={`${item.branchId}_${item.deviceUserId}`}>
                        <td className="p-2 text-xs font-semibold">{item.branchName}</td>
                        <td className="p-2 text-xs font-bold">{item.deviceUserId}</td>
                        <td className="p-2">
                          <Select onValueChange={(employeeId) => setMappingForDeviceUser(item.branchId, item.deviceUserId, employeeId)}>
                            <SelectTrigger className="h-8 max-w-md">
                              <SelectValue placeholder="اختر موظف / Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                              {employees.map((employee) => (
                                <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                    {adminUnmappedQueue.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-sm text-muted-foreground">
                          لا توجد حالات غير معرفة حالياً.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {!isBranchUser && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-black">سجل التغييرات / Audit Visibility</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto max-h-[300px]">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      <th className="p-2 text-xs font-black border-b">الوقت / Time</th>
                      <th className="p-2 text-xs font-black border-b">الإجراء / Action</th>
                      <th className="p-2 text-xs font-black border-b">الفرع / Branch</th>
                      <th className="p-2 text-xs font-black border-b">المستخدم / Actor</th>
                      <th className="p-2 text-xs font-black border-b">تفاصيل / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {auditEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="p-2 text-xs">{new Date(event.at).toLocaleString()}</td>
                        <td className="p-2 text-xs font-semibold">{event.action}</td>
                        <td className="p-2 text-xs">{event.branchName || event.branchId || "-"}</td>
                        <td className="p-2 text-xs">{event.actor}</td>
                        <td className="p-2 text-xs">{event.details || "-"}</td>
                      </tr>
                    ))}
                    {auditEvents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                          لا توجد أحداث تدقيق حالياً.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              الفروع / Branches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleBranches.length === 0 && (
              <div className="text-sm text-muted-foreground">لا توجد فروع حالياً. أضف الفروع أولاً من صفحة الفروع.</div>
            )}

            {visibleBranches.map((branch) => {
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
                      <div className="space-y-1">
                        <Label className="text-xs">Bridge ID</Label>
                        <Input
                          value={cfg.bridgeId || ""}
                          onChange={(e) => setBranchConfigField(branch.id, "bridgeId", e.target.value)}
                          placeholder={`bridge_${branch.id.slice(0, 6)}`}
                          className="h-9"
                        />
                      </div>
                    <div className="md:col-span-2 p-2 bg-muted/50 rounded text-xs">
                      <div>{result.message || "لا توجد نتيجة بعد / No result yet"}</div>
                        <div className="mt-1">
                          {(() => {
                            const meta = branchConfigMeta[branch.id]
                            if (!meta) return "Config: local only"
                            if (meta.syncState === "synced") {
                              const at = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : "-"
                              return `Config: synced at ${at}`
                            }
                            if (meta.syncState === "pending") return "Config: pending cloud sync"
                            return `Config: sync error ${meta.error ? `(${meta.error})` : ""}`
                          })()}
                        </div>
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
                    {!isBranchUser && <SelectItem value="global">افتراضي عام / Global</SelectItem>}
                    <SelectItem value="branch">حسب الفرع / Branch</SelectItem>
                    <SelectItem value="group">مجموعة موظفين / Group</SelectItem>
                    <SelectItem value="employee">موظف محدد / Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isBranchUser && scheduleScope !== "global" && (
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs font-bold">الفرع / Branch</Label>
                  <Select value={scheduleBranchId} onValueChange={setScheduleBranchId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="اختر فرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleBranches.map((b) => (
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
                  {visibleWorkSchedules
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
                  {visibleWorkSchedules.length === 0 && (
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
                {!isBranchUser && <TabsTrigger value="all" className="border">الكل / All</TabsTrigger>}
                {visibleBranches.map((branch) => (
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
