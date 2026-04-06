"use client"

import { dict, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"

interface DualTextProps {
  k: string
  className?: string
  fallback?: string
  enClassName?: string
  arClassName?: string
  params?: Record<string, string | number>
  forceArFirst?: boolean
}

export function DualText({ k, className, fallback, enClassName, arClassName, params, forceArFirst }: DualTextProps) {
  const { lang } = useI18n()
  const entry = dict[k]

  if (!entry) {
    return <span className={className}>{fallback || k}</span>
  }

  const format = (text: string) => {
    if (!params) return text
    let formatted = text
    Object.entries(params).forEach(([key, value]) => {
      formatted = formatted.replace(`{${key}}`, String(value))
    })
    return formatted
  }

  const isAr = lang === "ar"
  const showArFirst = isAr || forceArFirst

  if (showArFirst) {
    return (
      <span className={cn("block leading-tight", className)}>
        <span className={cn("ar-translation block font-medium", arClassName)}>
          {format(entry.ar)}
        </span>
        <span className={cn("block text-[0.85em] font-normal", enClassName)}>
          {format(entry.en)}
        </span>
      </span>
    )
  }

  return (
    <span className={cn("block leading-tight", className)}>
      <span className={cn("block font-medium", enClassName)}>
        {format(entry.en)}
      </span>
      <span className={cn("ar-translation block text-[0.85em] font-normal", arClassName)}>
        {format(entry.ar)}
      </span>
    </span>
  )
}

// Helper to get string format "English (Arabic)" for placeholders
export function getDualString(k: string, fallback?: string, lang?: Lang, params?: Record<string, string | number>): string {
  const entry = dict[k]
  if (!entry) return fallback || k

  const format = (text: string) => {
    if (!params) return text
    let formatted = text
    Object.entries(params).forEach(([key, value]) => {
      formatted = formatted.replace(`{${key}}`, String(value))
    })
    return formatted
  }

  const ar = format(entry.ar)
  const en = format(entry.en)

  if (lang === "ar") {
    return `${ar} (${en})`
  }
  return `${en} (${ar})`
}
