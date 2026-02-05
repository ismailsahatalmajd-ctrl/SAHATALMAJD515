"use client"

import { addAuditLog } from "@/lib/audit-log"

export interface InvoiceSettings {
  type: string
  customType: string
  columns: string[]
  showPrice: boolean
  showQuantity: boolean
  showUnit: boolean
  showTotal: boolean
  headerText: string
  footerText: string
  logoUrl?: string
  template: 'classic' | 'modern' | 'thermal' // New field
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  type: "فاتورة صرف",
  customType: "",
  columns: ["itemNumber", "productName", "productCode", "price", "quantity", "unit", "total"],
  showPrice: false,
  showQuantity: true,
  showUnit: true,
  showTotal: false,
  headerText: "",
  footerText: "",
  template: 'classic', // Default
}

import { db } from "./db"
import { getApiUrl } from "./utils"

const SETTINGS_KEY = "app_settings"
const EVENT_KEY = "invoice_settings_changed"

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  if (typeof window === "undefined") return DEFAULT_INVOICE_SETTINGS
  try {
    const setting = await db.settings.get(SETTINGS_KEY)
    if (!setting) {
      // Fallback/Migration
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (!raw) return DEFAULT_INVOICE_SETTINGS
      const data = JSON.parse(raw)
      const settings = { ...DEFAULT_INVOICE_SETTINGS, ...(data.invoiceSettings || {}) }
      // Migrate to Dexie
      await saveInvoiceSettings(settings)
      return settings
    }
    const data = setting.value
    return { ...DEFAULT_INVOICE_SETTINGS, ...(data.invoiceSettings || {}) }
  } catch (e) {
    return DEFAULT_INVOICE_SETTINGS
  }
}

export async function saveInvoiceSettings(settings: Partial<InvoiceSettings>, username: string = "system") {
  if (typeof window === "undefined") return

  try {
    const current = await getInvoiceSettings()
    const updated = { ...current, ...settings }

    // Get full app settings to preserve other keys
    let appSettings: any = {}
    try {
      const setting = await db.settings.get(SETTINGS_KEY)
      if (setting) appSettings = setting.value
    } catch { }

    // Also check localStorage for any keys we might have missed if we didn't fully migrate yet
    if (Object.keys(appSettings).length === 0) {
      const rawApp = localStorage.getItem(SETTINGS_KEY)
      if (rawApp) appSettings = JSON.parse(rawApp)
    }

    const newAppSettings = {
      ...appSettings,
      invoiceSettings: updated
    }

    await db.settings.put({ key: SETTINGS_KEY, value: newAppSettings })

    // Dispatch event for same-tab updates
    window.dispatchEvent(new Event(EVENT_KEY))

    // Audit log
    const changes = Object.entries(settings).map(([key, value]) => ({
      field: key,
      oldValue: current[key as keyof InvoiceSettings],
      newValue: value
    }))

    await addAuditLog(
      "system",
      username,
      "update",
      "settings",
      "global_settings",
      "إعدادات الفواتير",
      changes
    )

    // Sync to server (fire and forget)
    fetch(getApiUrl('/api/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: SETTINGS_KEY, value: newAppSettings }),
    }).catch(err => console.error("Failed to sync settings", err))

    return updated
  } catch (e) {
    console.error("Error saving invoice settings:", e)
    throw e
  }
}

import { useState, useEffect } from "react"

export function useInvoiceSettings() {
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS)

  useEffect(() => {
    // Initial load
    getInvoiceSettings().then(setSettings)

    const handleUpdate = () => {
      getInvoiceSettings().then(setSettings)
    }

    // Listen for local events (same tab)
    window.addEventListener(EVENT_KEY, handleUpdate)

    // Listen for storage events (other tabs)
    window.addEventListener("storage", (e) => {
      if (e.key === SETTINGS_KEY) {
        handleUpdate()
      }
    })

    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate)
      window.removeEventListener("storage", handleUpdate)
    }
  }, [])

  return settings
}
