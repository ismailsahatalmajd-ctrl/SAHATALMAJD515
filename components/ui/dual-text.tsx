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
}

export function DualText({ k, className, fallback, enClassName, arClassName }: DualTextProps) {
  const { lang } = useI18n()
  const entry = dict[k]
  
  if (!entry) {
    return <span className={className}>{fallback || k}</span>
  }

  const isAr = lang === "ar"

  if (isAr) {
    return (
      <span className={cn("block leading-tight", className)}>
        <span className={cn("ar-translation block text-[0.85em]", arClassName)}>
          {entry.ar}
        </span>
        <span className={cn("block text-[1em]", enClassName)}>
          {entry.en}
        </span>
      </span>
    )
  }

  return (
    <span className={cn("block leading-tight", className)}>
      <span className={cn("block text-[1em]", enClassName)}>
        {entry.en}
      </span>
      <span className={cn("ar-translation block text-[0.85em]", arClassName)}>
        {entry.ar}
      </span>
    </span>
  )
}

// Helper to get string format "English (Arabic)" for placeholders
export function getDualString(k: string, fallback?: string, lang?: Lang): string {
  const entry = dict[k]
  if (!entry) return fallback || k
  if (lang === "ar") {
    return `${entry.ar} (${entry.en})`
  }
  return `${entry.en} (${entry.ar})`
}
