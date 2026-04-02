import { db } from './db'
import type { VerificationLog } from './types'

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9)

export async function addVerificationLog(log: Omit<VerificationLog, 'id'>): Promise<VerificationLog> {
  const newLog: VerificationLog = {
    ...log,
    id: generateId()
  }
  await db.verificationLogs.add(newLog)
  return newLog
}

export async function getVerificationLogs(): Promise<VerificationLog[]> {
  return await db.verificationLogs.toArray()
}

export async function getVerificationLogsByIssueId(issueId: string): Promise<VerificationLog[]> {
  return await db.verificationLogs.where('issueId').equals(issueId).toArray()
}
