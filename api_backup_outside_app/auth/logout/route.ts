import { NextResponse } from "next/server"
import { clearSession, getSession } from "@/lib/auth"
import { createServerClient } from "@supabase/ssr"

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { get() { return undefined }, set() {}, remove() {} },
  })
}

export async function POST() {
  try {
    const session = await getSession()
    
    if (session && session.sessionId) {
        const supabase = getSupabaseService()
        if (supabase) {
            await supabase.from('user_sessions').delete().eq('id', session.sessionId)
        }
    }
  } catch (e) {
    console.error("Logout error:", e)
  }

  await clearSession()
  return NextResponse.json({ success: true })
}
