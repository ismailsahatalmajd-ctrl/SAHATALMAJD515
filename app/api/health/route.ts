import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 0

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const status = {
    hasUrl: !!url && !url.includes('YOUR_PROJECT_ID'),
    hasAnonKey: !!anonKey && !anonKey.includes('YOUR_PUBLIC_ANON_KEY'),
    hasServiceKey: !!serviceKey && !serviceKey.includes('YOUR_SERVICE_ROLE_KEY'),
    env: process.env.NODE_ENV
  }

  return NextResponse.json(status, { 
    headers: { 'Cache-Control': 'no-store' } 
  })
}