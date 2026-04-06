export type PerfSnapshot = {
  ts: string
  nav: {
    domContentLoaded: number
    load: number
  }
  memory?: {
    jsHeapSizeLimit: number
    totalJSHeapSize: number
    usedJSHeapSize: number
  }
  net?: {
    effectiveType?: string
    downlink?: number
    rtt?: number
  }
  resources: {
    count: number
    transferSize?: number
  }
}

export function collectPerf(): PerfSnapshot {
  const t = performance.timing as any
  const dcl = t.domContentLoadedEventEnd && t.navigationStart ? t.domContentLoadedEventEnd - t.navigationStart : 0
  const load = t.loadEventEnd && t.navigationStart ? t.loadEventEnd - t.navigationStart : 0
  const mem = (performance as any).memory
  const conn = (navigator as any).connection
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  let transfer = 0
  for (const e of entries) {
    if (typeof (e as any).transferSize === 'number') transfer += (e as any).transferSize as number
  }
  return {
    ts: new Date().toISOString(),
    nav: { domContentLoaded: dcl, load },
    memory: mem ? { jsHeapSizeLimit: mem.jsHeapSizeLimit, totalJSHeapSize: mem.totalJSHeapSize, usedJSHeapSize: mem.usedJSHeapSize } : undefined,
    net: conn ? { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt } : undefined,
    resources: { count: entries.length, transferSize: transfer || undefined },
  }
}

export function savePerf(snapshot: PerfSnapshot) {
  if (typeof window === 'undefined') return
  try {
    const key = 'perf_logs_v1'
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    arr.push(snapshot)
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {}
}
