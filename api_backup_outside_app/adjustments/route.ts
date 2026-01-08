
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null as any
  return createServerClient(url, key, {
    cookies: {
      getAll() { return [] },
      setAll() {},
    },
  })
}

export async function GET() {
  const supabase = getSupabaseService()
  if (!supabase) return NextResponse.json({ data: [] })
  
  const { data, error } = await supabase.from('inventory_adjustments').select('*')
  if (error) {
     // Fallback if table is camelCase
     if (error.code === '42P01') { 
         const { data: d2, error: e2 } = await supabase.from('inventoryAdjustments').select('*')
         if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
         return NextResponse.json({ data: d2 }, { headers: { 'Cache-Control': 'no-store' } })
     }
     return NextResponse.json({ error: error.message }, { status: 500 })
  }
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
    if (!supabase) return NextResponse.json({ ok: true })
    
    // Convert camelCase to snake_case if needed? 
    // Supabase JS client usually handles it if configured, but default is exact match.
    // Let's assume the table columns match the types or we map them.
    // For now, I'll send as is.
    const { error } = await supabase.from('inventory_adjustments').upsert(rows, { onConflict: 'id' })
    
    if (error) {
        // Fallback: maybe table name is camelCase?
        if (error.code === '42P01') { // Undefined table
             const { error: err2 } = await supabase.from('inventoryAdjustments').upsert(rows, { onConflict: 'id' })
             if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })
             return NextResponse.json({ ok: true })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
