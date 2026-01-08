export async function hashAccessCode(code: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(code)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = Array.from(new Uint8Array(digest))
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function verifyAccessCode(code: string, hash?: string): Promise<boolean> {
  if (!hash) return false
  const calc = await hashAccessCode(code)
  return calc === hash
}

// جهاز بسيط: يعتمد على userAgent ودقة الشاشة لتقريب هوية الجهاز
export function getDeviceId(): string {
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "node"
    const plat = typeof navigator !== "undefined" ? (navigator.platform || "") : ""
    const w = typeof window !== "undefined" ? (window.screen?.width || 0) : 0
    const h = typeof window !== "undefined" ? (window.screen?.height || 0) : 0
    const raw = `${ua}|${plat}|${w}x${h}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
    return `dev-${hash.toString(16)}`
  } catch {
    return "dev-unknown"
  }
}

export type BranchSession = {
  branchId: string
  branchName: string
  deviceId: string
  createdAt: string
}

const SESSION_KEY = "branch_session"

export function setBranchSession(branchId: string, branchName: string): void {
  const session: BranchSession = {
    branchId,
    branchName,
    deviceId: getDeviceId(),
    createdAt: new Date().toISOString(),
  }
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
}

export function getBranchSession(): BranchSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) as BranchSession : null
  } catch {
    return null
  }
}

export function clearBranchSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

export function isSessionValid(): boolean {
  const s = getBranchSession()
  if (!s) return false
  return s.deviceId === getDeviceId()
}
