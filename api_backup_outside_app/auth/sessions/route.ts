import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { createServerClient } from "@supabase/ssr"

export const dynamic = 'force-dynamic'

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { get() { return undefined }, set() {}, remove() {} },
  })
}

export async function GET() {
    try {
        const session = await getSession()
        if (!session) return NextResponse.json({ sessions: [] })

        const supabase = getSupabaseService()
        // If Supabase is not configured, return empty or mock if needed
        if (!supabase) return NextResponse.json({ sessions: [] })

        const { data, error } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', session.userId)
            .order('last_active', { ascending: false })

        if (error) throw error

        return NextResponse.json({ sessions: data || [] })
    } catch (error) {
        console.error("Failed to fetch sessions:", error)
        return NextResponse.json({ sessions: [] }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getSession()
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        const all = searchParams.get('all')

        const supabase = getSupabaseService()
        if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })

        if (all === 'true') {
            // Delete all sessions for this user
            await supabase.from('user_sessions').delete().eq('user_id', session.userId)
        } else if (id) {
            // Delete specific session
            await supabase.from('user_sessions').delete().eq('id', id).eq('user_id', session.userId)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to delete session:", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
