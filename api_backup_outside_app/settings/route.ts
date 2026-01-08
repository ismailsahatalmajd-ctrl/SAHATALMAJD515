import { NextResponse } from 'next/server'
export const dynamic = 'force-static'
import { createServerClient } from '@supabase/ssr'

function getSupabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !key) return null as any
  if (url.includes('YOUR_PROJECT_ID') || key.includes('YOUR_PUBLIC_ANON_KEY')) return null as any
  return createServerClient(url, key, { cookies: { get() { return undefined }, set() {}, remove() {} } })
}


function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null as any
  if (url.includes('YOUR_PROJECT_ID') || key.includes('YOUR_SERVICE_ROLE_KEY')) return null as any
  return createServerClient(url, key, { cookies: { get() { return undefined }, set() {}, remove() {} } })
}

// GET /api/settings?key=app_settings
export async function GET(req: Request) {
  const supabase = getSupabaseAnon()
  const url = new URL(req.url)
  const key = url.searchParams.get('key') || 'app_settings'
  if (!supabase) {
    return NextResponse.json(
      { key, value: null },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=300' } }
    )
  }
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', key).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { key, value: data?.value ?? null },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=300' } }
  )
}

// POST body: { key: string, value: any }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body?.key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
    const supabase = getSupabaseService()
    if (!supabase) return NextResponse.json({ ok: true })
    const { error } = await supabase.from('app_settings').upsert({ key: body.key, value: body.value })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
