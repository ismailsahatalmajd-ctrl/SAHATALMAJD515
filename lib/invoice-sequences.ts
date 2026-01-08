import { getIssues, getReturns } from "./storage"
import { getBranchInvoices } from "./branch-invoice-storage"
import { db } from "./db"

type SeqType = "issue" | "return" | "branchOps"

const LS_KEY = "invoice_sequences_v1"
const SERVER_KEY = "invoice_sequences"

const PREFIX: Record<SeqType, string> = {
  issue: "SW",
  return: "R",
  branchOps: "OP",
}

type Sequences = { issue: number; return: number; branchOps: number; updatedAt?: string }

async function readLocal(): Promise<Sequences> {
  if (typeof window === "undefined") return { issue: 0, return: 0, branchOps: 0 }
  try {
    const setting = await db.settings.get(LS_KEY)
    if (!setting) {
        // Fallback to localStorage temporarily if Dexie is empty
        const raw = localStorage.getItem(LS_KEY)
        if (raw) {
            const obj = JSON.parse(raw)
            const seq = {
                issue: Number(obj.issue || 0),
                return: Number(obj.return || 0),
                branchOps: Number(obj.branchOps || 0),
                updatedAt: obj.updatedAt,
            }
            // Migrate to Dexie
            await writeLocal(seq)
            try { localStorage.removeItem(LS_KEY) } catch {}
            return seq
        }
        return { issue: 0, return: 0, branchOps: 0 }
    }
    const obj = setting.value
    return {
      issue: Number(obj.issue || 0),
      return: Number(obj.return || 0),
      branchOps: Number(obj.branchOps || 0),
      updatedAt: obj.updatedAt,
    }
  } catch {
    return { issue: 0, return: 0, branchOps: 0 }
  }
}

async function readServer(): Promise<Sequences | null> {
  try {
    const res = await fetch(`/api/settings?key=${SERVER_KEY}`, { cache: "no-store" })
    const json = await res.json()
    const val = json?.value || json?.data?.value
    if (!val) return null
    const obj = typeof val === "string" ? JSON.parse(val) : val
    return {
      issue: Number(obj.issue || 0),
      return: Number(obj.return || 0),
      branchOps: Number(obj.branchOps || 0),
      updatedAt: obj.updatedAt,
    }
  } catch {
    return null
  }
}

async function writeLocal(seq: Sequences): Promise<void> {
  if (typeof window === "undefined") return
  try { 
      await db.settings.put({ key: LS_KEY, value: { ...seq, updatedAt: new Date().toISOString() } })
  } catch {}
}

async function writeServer(seq: Sequences): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: SERVER_KEY, value: { ...seq, updatedAt: new Date().toISOString() } }),
    }).catch(() => {})
  } catch {}
}

function parseTailNumber(s: string, prefix: string): number | null {
  if (!s || typeof s !== 'string') return null
  if (!s.startsWith(prefix)) return null
  const tail = s.slice(prefix.length)
  if (!/^\d{4}$/.test(tail)) return null
  const n = parseInt(tail, 10)
  return Number.isFinite(n) ? n : null
}

function recoverFromData(): Sequences {
  // Scan existing records to find max per type
  const issues = getIssues()
  const returns = getReturns()
  const branchInvoices = getBranchInvoices()
  let issueMax = 0
  let returnMax = 0
  let branchMax = 0
  for (const iss of issues) {
    const n = parseTailNumber((iss as any).invoiceNumber, PREFIX.issue)
    if (n !== null) issueMax = Math.max(issueMax, n)
  }
  for (const r of returns) {
    const n = parseTailNumber((r as any).returnNumber, PREFIX.return)
    if (n !== null) returnMax = Math.max(returnMax, n)
  }
  for (const bi of branchInvoices) {
    const n = parseTailNumber((bi as any).invoiceNumber, PREFIX.branchOps)
    if (n !== null) branchMax = Math.max(branchMax, n)
  }
  return { issue: issueMax, return: returnMax, branchOps: branchMax, updatedAt: new Date().toISOString() }
}

export async function getSequences(): Promise<Sequences> {
  const local = await readLocal()
  const server = await readServer()
  if (server) {
    // choose the max of local/server to avoid regressions
    const merged: Sequences = {
      issue: Math.max(local.issue, server.issue),
      return: Math.max(local.return, server.return),
      branchOps: Math.max(local.branchOps, server.branchOps),
      updatedAt: server.updatedAt || local.updatedAt,
    }
    await writeLocal(merged)
    return merged
  }
  // if local empty, try recovery from data
  if (local.issue === 0 && local.return === 0 && local.branchOps === 0) {
    const recovered = recoverFromData()
    await writeLocal(recovered)
    await writeServer(recovered)
    return recovered
  }
  return local
}

function pad4(n: number): string { return String(n).padStart(4, '0') }

export async function nextInvoiceNumber(type: SeqType): Promise<string> {
  const seq = await getSequences()
  let next = 0
  if (type === 'issue') next = Math.min(9999, seq.issue + 1)
  else if (type === 'return') next = Math.min(9999, seq.return + 1)
  else next = Math.min(9999, seq.branchOps + 1)

  const prefix = PREFIX[type]
  const candidate = `${prefix}${pad4(next)}`

  // Avoid duplicates by checking current datasets
  const issues = getIssues()
  const returns = getReturns()
  const branchInvoices = getBranchInvoices()
  const exists = (
    type === 'issue' && issues.some(i => (i as any).invoiceNumber === candidate)
  ) || (
    type === 'return' && returns.some(r => (r as any).returnNumber === candidate)
  ) || (
    type === 'branchOps' && branchInvoices.some(bi => (bi as any).invoiceNumber === candidate)
  )
  // If exists, advance until free (bounded to 9999)
  let n = next
  while (exists && n < 9999) {
    n++
  }
  const final = `${prefix}${pad4(n)}`

  const updated: Sequences = {
    issue: type === 'issue' ? n : seq.issue,
    return: type === 'return' ? n : seq.return,
    branchOps: type === 'branchOps' ? n : seq.branchOps,
    updatedAt: new Date().toISOString(),
  }
  await writeLocal(updated)
  await writeServer(updated)
  return final
}

export async function repairSequences(): Promise<Sequences> {
  const recovered = recoverFromData()
  await writeLocal(recovered)
  await writeServer(recovered)
  return recovered
}

