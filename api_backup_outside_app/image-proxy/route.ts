import { NextRequest } from 'next/server'

// في وضع التصدير الثابت، نجبر هذا المسار أن يكون ثابتاً ولا يعمل كبروكسي
export const dynamic = 'force-static'

// تخزين مؤقت بسيط في الذاكرة + حدّ الطلبات لحماية الخدمة عند وجود عدد كبير من الروابط
type CacheEntry = { data: ArrayBuffer; contentType: string; expiresAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 دقائق
const MAX_CACHE_ENTRIES = 200
const cache = new Map<string, CacheEntry>()

type RateState = { tokens: number; lastRefill: number }
const RATE_INTERVAL_MS = 10 * 1000 // 10 ثوانٍ
const RATE_REFILL = 10 // تعبئة 10 توكنات كل فترة
const RATE_CAPACITY = 20 // السعة القصوى
const rate = new Map<string, RateState>()

function getClientId(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for') || ''
  const ip = xf.split(',')[0].trim() || 'unknown'
  return ip
}

function takeToken(clientId: string): boolean {
  const now = Date.now()
  const state = rate.get(clientId) || { tokens: RATE_CAPACITY, lastRefill: now }
  if (now - state.lastRefill >= RATE_INTERVAL_MS) {
    const periods = Math.floor((now - state.lastRefill) / RATE_INTERVAL_MS)
    state.tokens = Math.min(RATE_CAPACITY, state.tokens + periods * RATE_REFILL)
    state.lastRefill = now
  }
  if (state.tokens <= 0) {
    rate.set(clientId, state)
    return false
  }
  state.tokens -= 1
  rate.set(clientId, state)
  return true
}

function setCache(key: string, entry: CacheEntry) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // إزالة أقدم عنصر تقريبياً
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, entry)
}

export async function GET(req: NextRequest) {
  try {
    // تعطيل الخدمة في نسخة التصدير الثابت لتجنب أخطاء البناء
    if (process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true') {
      return new Response('Image proxy disabled in static export', { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const url = searchParams.get('url')
    if (!url) {
      return new Response('Missing url parameter', { status: 400 })
    }

    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) {
      return new Response('Invalid protocol', { status: 400 })
    }

    const clientId = getClientId(req)
    if (!takeToken(clientId)) {
      return new Response('Rate limit exceeded', { status: 429 })
    }

    const cacheKey = url
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return new Response(cached.data, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const upstream = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Accept': 'image/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const body = await upstream.arrayBuffer()

    setCache(cacheKey, { data: body, contentType, expiresAt: Date.now() + CACHE_TTL_MS })

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    return new Response('Proxy error', { status: 500 })
  }
}