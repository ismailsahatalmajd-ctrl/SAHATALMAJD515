export function isDesktopMode(): boolean {
  // Detect desktop mode via injected flags or environment variable
  try {
    if (typeof window !== 'undefined') {
      const w = window as any
      // Electron sets process.versions.electron; Tauri may have __TAURI__ flag; custom __DESKTOP__ allowed
      if (w.__DESKTOP__ || (w.process && w.process.versions && w.process.versions.electron) || w.__TAURI__) {
        return true
      }
    }
  } catch {}
  return (process.env.NEXT_PUBLIC_DESKTOP_MODE === '1')
}

export function hasIndexedDB(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window as any).indexedDB
  } catch {
    return false
  }
}