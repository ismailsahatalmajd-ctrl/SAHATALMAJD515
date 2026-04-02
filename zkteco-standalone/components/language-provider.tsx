"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"

type I18nContextType = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, fallback?: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ar"
    const htmlLang = (document.documentElement.getAttribute("lang") as Lang | null) || "ar"
    return htmlLang
  })
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lang") as Lang | null
      if (saved && saved !== lang) {
        setLangState(saved)
        const dir = saved === "ar" ? "rtl" : "ltr"
        document.documentElement.setAttribute("lang", saved)
        document.documentElement.setAttribute("dir", dir)
        localStorage.setItem("lang", saved)
      }
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem("lang", l)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof document !== "undefined") {
      const dir = lang === "ar" ? "rtl" : "ltr"
      document.documentElement.setAttribute("lang", lang)
      document.documentElement.setAttribute("dir", dir)
    }
  }, [lang])

  const t = useCallback((key: string, fallback?: string) => translate(key, lang, fallback), [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider")
  return ctx
}