
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { get() { return undefined }, set() {}, remove() {} },
  })
}

async function getSupabaseAuth() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !key) return null as any
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}

export async function GET() {
  const supabase = getSupabaseService()
  if (!supabase) return NextResponse.json({ data: [] })
  
  const { data, error } = await supabase.from('issues').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rows = Array.isArray(body) ? body : [body]
    
    const supabase = getSupabaseService()
    if (!supabase) {
        // Fallback: If Supabase is not configured, we return success to allow local-only mode
        return NextResponse.json({ ok: true })
    }
    
    const { error } = await supabase.from('issues').upsert(rows, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
    return POST(req)
}
