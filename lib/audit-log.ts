import { db } from "./db"
import { AuditLogEntry } from "./types"
import { syncAuditLog } from "./firebase-sync-engine"

export type { AuditLogEntry }

const MAX_LOG_ENTRIES = 1000

export const addAuditLog = async (
  userId: string,
  userName: string,
  action: AuditLogEntry["action"],
  entity: AuditLogEntry["entity"],
  entityId: string,
  entityName: string,
  changes?: AuditLogEntry["changes"],
  metadata?: Record<string, any>,
): Promise<void> => {
  const entry: AuditLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    userId,
    userName,
    action,
    entity,
    entityId,
    entityName,
    changes,
    metadata,
  }

  try {
    await db.auditLogs.add(entry)
    
    // Attempt to sync immediately
    syncAuditLog(entry).catch(console.error)
    
    // Maintain size limit (approximate)
    const count = await db.auditLogs.count()
    if (count > MAX_LOG_ENTRIES) {
      const keys = await db.auditLogs.orderBy('timestamp').keys()
      const toDelete = keys.slice(0, count - MAX_LOG_ENTRIES)
      await db.auditLogs.bulkDelete(toDelete as string[])
    }
  } catch (e) {
    console.error("Failed to add audit log", e)
  }
}

export const getAuditLogs = async (): Promise<AuditLogEntry[]> => {
  try {
    const logs = await db.auditLogs.orderBy('timestamp').reverse().toArray()
    return logs.map(log => ({
      ...log,
      timestamp: new Date(log.timestamp)
    }))
  } catch {
    return []
  }
}

export const getAuditLogsByEntity = async (entity: AuditLogEntry["entity"], entityId: string): Promise<AuditLogEntry[]> => {
  try {
    // Note: This is not indexed by entity+entityId efficiently without compound index, but good enough for now
    const logs = await db.auditLogs.where('entity').equals(entity).filter(l => l.entityId === entityId).toArray()
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map(log => ({ ...log, timestamp: new Date(log.timestamp) }))
  } catch {
    return []
  }
}

export const getAuditLogsByUser = async (userId: string): Promise<AuditLogEntry[]> => {
  try {
    const logs = await db.auditLogs.where('userId').equals(userId).toArray()
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map(log => ({ ...log, timestamp: new Date(log.timestamp) }))
  } catch {
    return []
  }
}

export const clearAuditLogs = async (): Promise<void> => {
  try {
    await db.auditLogs.clear()
  } catch {}
}

export const exportAuditLogs = async (): Promise<void> => {
  const logs = await getAuditLogs()
  const dataStr = JSON.stringify(logs, null, 2)
  const dataBlob = new Blob([dataStr], { type: "application/json" })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement("a")
  link.href = url
  link.download = `audit-log-${new Date().toISOString().split("T")[0]}.json`
  link.click()
  URL.revokeObjectURL(url)
}
