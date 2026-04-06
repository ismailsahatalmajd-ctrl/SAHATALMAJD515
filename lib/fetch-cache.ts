export async function cachedGet<T>(url: string, ttlMs = 60000): Promise<T> {
  if (typeof window === 'undefined') {
    const res = await fetch(url, { cache: 'no-store' })
    return await res.json()
  }
  const key = `cache:${url}`
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const obj = JSON.parse(raw)
      if (obj && obj.ts && Date.now() - obj.ts < ttlMs && obj.data !== undefined) {
        return obj.data as T
      }
    }
  } catch {}
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
  return data as T
}
