
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// File path for local branches storage
const LOCAL_BRANCHES_FILE = path.join(process.cwd(), 'data', 'branches.json')

// Helper to ensure directory exists
function ensureDataDir() {
  const dir = path.dirname(LOCAL_BRANCHES_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Helper to read local branches
function getLocalBranches() {
  if (!fs.existsSync(LOCAL_BRANCHES_FILE)) return []
  try {
    const data = fs.readFileSync(LOCAL_BRANCHES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

// Helper to save local branches
function saveLocalBranches(branches: any[]) {
  ensureDataDir()
  fs.writeFileSync(LOCAL_BRANCHES_FILE, JSON.stringify(branches, null, 2))
}

async function getSupabaseAuth() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !key) return null
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
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: { get() { return undefined }, set() {}, remove() {} },
  })
}

export async function GET() {
  // Try Supabase first
  const supabase = getSupabaseService()
  if (supabase) {
    const { data, error } = await supabase.from('branches').select('*')
    if (!error && data) {
       return NextResponse.json(
        { data },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
      )
    }
  }
  
  // Fallback to local file
  const data = getLocalBranches()
  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    let rows: any[] = []
    if (Array.isArray(body)) {
      rows = body
    } else if (body && typeof body === 'object') {
       if (Array.isArray(body.data)) {
         rows = body.data
       } else {
         rows = [body]
       }
    }
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    let savedToSupabase = false
    const supabase = getSupabaseService()
    if (supabase) {
      const { error } = await supabase.from('branches').upsert(rows, { onConflict: 'id' })
      if (!error) savedToSupabase = true
    }

    // Always save to local file as backup/primary if offline (try-catch to ignore Vercel read-only error)
    try {
        const localBranches = getLocalBranches()
        
        // Check for duplicate usernames
        for (const row of rows) {
          if (row.username) {
            const duplicate = localBranches.find((b: any) => b.username === row.username && b.id !== row.id)
            if (duplicate) {
              const idx = localBranches.findIndex((b: any) => b.username === row.username && b.id !== row.id)
              if (idx !== -1) {
                 localBranches[idx].username = `${localBranches[idx].username}_OLD_${Date.now()}`
              }
            }
          }
        }

        const byId = new Map(localBranches.map((b: any) => [b.id, b]))
        rows.forEach((row: any) => byId.set(row.id, row))
        saveLocalBranches(Array.from(byId.values()))
    } catch (localError) {
        console.warn("Could not save to local file (expected on Vercel):", localError)
    }

    return NextResponse.json({ ok: true, savedToSupabase })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const row = await req.json()
    if (!row || !row.id) {
      return NextResponse.json({ error: 'row with id is required' }, { status: 400 })
    }

    let savedToSupabase = false
    const supabase = getSupabaseService()
    if (supabase) {
      const { error } = await supabase.from('branches').upsert([row], { onConflict: 'id' })
      if (!error) savedToSupabase = true
    }

    // Always save to local file
    const localBranches = getLocalBranches()
    const byId = new Map(localBranches.map((b: any) => [b.id, b]))
    byId.set(row.id, row)
    saveLocalBranches(Array.from(byId.values()))

    return NextResponse.json({ ok: true, savedToSupabase })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { ids } = await req.json() as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }

    let deletedFromSupabase = false
    const supabase = getSupabaseService()
    if (supabase) {
      const { error } = await supabase.from('branches').delete().in('id', ids)
      if (!error) deletedFromSupabase = true
    }

    // Delete from local file
    const localBranches = getLocalBranches()
    const filtered = localBranches.filter((b: any) => !ids.includes(b.id))
    saveLocalBranches(filtered)

    return NextResponse.json({ ok: true, deletedFromSupabase })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
