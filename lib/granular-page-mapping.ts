import type { GranularPermissions } from "./granular-permissions"

type ShowPagesKey = keyof GranularPermissions["showPages"]

const ROUTE_TO_KEYS: Record<string, ShowPagesKey[]> = {
  "/": ["inventory"],
  "/inventory": ["inventory"],
  "/purchases": ["purchases"],
  "/issues": ["issues"],
  "/returns": ["returns"],
  "/reports": ["reports"],
  "/branches": ["branches"],
  "/history": ["history"],
  // Keep both keys for backward compatibility with old saved preferences.
  "/scanner": ["barcodes", "scanner"],
  "/label-designer": ["labelDesigner"],
  "/employees": ["employees"],
  "/fingerprint-center": ["employees"],
  "/dashboard": ["dashboard"],
}

export function getGranularKeysForRoute(path: string): ShowPagesKey[] {
  return ROUTE_TO_KEYS[path] || []
}

