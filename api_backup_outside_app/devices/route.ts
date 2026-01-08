
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
    const supabase = getSupabaseService()
    if (!supabase) return NextResponse.json({ data: [] })

    // Try to fetch from 'user_sessions' first
    let { data, error } = await supabase.from('user_sessions').select('*')
    
    if (error) {
       // If table doesn't exist or error, try 'devices'
       const retry = await supabase.from('devices').select('*')
       if (retry.error) {
           // If both fail, return empty list (local mode)
           return NextResponse.json({ data: [] })
       }
       data = retry.data
    }

    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const row = {
        id: body.id,
        deviceId: body.deviceId,
        userId: body.userId,
        lastActive: body.lastActive || new Date().toISOString(),
        name: body.name,
        type: body.type,
        browser: body.browser,
        os: body.os
    }
    
    const supabase = getSupabaseService()
    if (!supabase) return NextResponse.json({ ok: true })

    // Try 'user_sessions'
    let { error } = await supabase.from('user_sessions').upsert(row, { onConflict: 'id' })
    
    if (error) {
        // Retry with 'devices'
        const retry = await supabase.from('devices').upsert(row, { onConflict: 'id' })
        if (retry.error) {
             console.error("Failed to sync device:", error.message, retry.error.message)
             // Don't fail the request, just log it. 
             // This ensures local app continues to work even if server table is missing.
             return NextResponse.json({ ok: true, warning: "Server sync failed" })
        }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
    try {
        const { ids } = await req.json()
        const supabase = getSupabaseService()
        if (!supabase) return NextResponse.json({ ok: true })

        if (!ids || !Array.isArray(ids)) {
             // If no IDs provided, maybe delete all?
             // But for safety, let's require IDs or special flag
             return NextResponse.json({ ok: false, error: "IDs required" })
        }

        // Try 'user_sessions'
        let { error } = await supabase.from('user_sessions').delete().in('id', ids)
        if (error) {
            await supabase.from('devices').delete().in('id', ids)
        }
        
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message }, { status: 500 })
    }
}
