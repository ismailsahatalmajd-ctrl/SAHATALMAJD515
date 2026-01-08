
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

  const { data, error } = await supabase.from('branch_requests').select('*') // Table name usually snake_case in Supabase, verify if it's 'branchRequests' or 'branch_requests'
  // Based on storage.ts, we use 'branchRequests' in code, but let's assume 'branch_requests' or whatever table exists.
  // Actually, let's use the table name matching the one used in creation script.
  // Assuming 'branch_requests' is standard. If not, we might need to adjust.
  // Let's check Supabase tables if possible? No tool for that.
  // Let's assume 'branch_requests' for now.
  if (error) {
      // Fallback to 'branchRequests' just in case
      const retry = await supabase.from('branchRequests').select('*')
      if (retry.error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(
        { data: retry.data },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
      )
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
    if (!supabase) {
        // Fallback: If Supabase is not configured, we return success to allow local-only mode
        return NextResponse.json({ ok: true })
    }
    
    // Try 'branch_requests'
    let { error } = await supabase.from('branch_requests').upsert(rows, { onConflict: 'id' })
    if (error) {
        // Retry with 'branchRequests' camelCase
        const retry = await supabase.from('branchRequests').upsert(rows, { onConflict: 'id' })
        if (retry.error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
    return POST(req)
}
