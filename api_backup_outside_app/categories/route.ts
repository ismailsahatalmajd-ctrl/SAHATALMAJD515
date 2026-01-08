import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabaseAuth() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !key) return null as any
  if (url.includes('YOUR_PROJECT_ID') || key.includes('YOUR_PUBLIC_ANON_KEY')) return null as any
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

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null as any
  if (url.includes('YOUR_PROJECT_ID') || key.includes('YOUR_SERVICE_ROLE_KEY')) return null as any
  return createServerClient(url, key, {
    cookies: { get() { return undefined }, set() {}, remove() {} },
  })
}

export async function GET() {
  const supabase = getSupabaseService()
  if (!supabase) {
    return NextResponse.json(
      { data: [] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
    )
  }
  const { data, error } = await supabase.from('categories').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
  )
}

export async function POST(req: Request) {
  try {
    const rows = await req.json()
    const supabase = getSupabaseService()
    if (!supabase) return NextResponse.json({ ok: true })
    const { error } = await supabase.from('categories').upsert(Array.isArray(rows) ? rows : [rows], { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { ids } = await req.json() as { ids: string[] }
    const supabase = getSupabaseService()
    if (!supabase) return NextResponse.json({ ok: true })
    const { error } = await supabase.from('categories').delete().in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
