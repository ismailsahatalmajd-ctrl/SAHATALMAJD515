"use client"

import { useI18n } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { DualText } from "./ui/dual-text"

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  const isAr = lang === "ar"
  return (
    <div className="flex items-center gap-2">
      <Button variant={isAr ? "default" : "secondary"} size="sm" onClick={() => setLang("ar")}>
        <DualText k="lang.ar" />
      </Button>
      <Button variant={!isAr ? "default" : "secondary"} size="sm" onClick={() => setLang("en")}>
        <DualText k="lang.en" />
      </Button>
    </div>
  )
}