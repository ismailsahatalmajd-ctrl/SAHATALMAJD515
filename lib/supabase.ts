import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSettings } from './settings-store'

let cachedClient: SupabaseClient | null = null
let cachedUrl: string | null = null
let cachedKey: string | null = null

export const getSupabase = (): SupabaseClient => {
    if (typeof window === 'undefined') {
        return createClient('https://placeholder.supabase.co', 'placeholder')
    }

    const settings = getSettings()
    const url = settings.supabaseUrl
    const key = settings.supabaseKey

    // If keys changed, re-init
    if (url !== cachedUrl || key !== cachedKey || !cachedClient) {
        if (!url || !key) {
            return createClient('https://placeholder.supabase.co', 'placeholder')
        }
        cachedUrl = url
        cachedKey = key
        cachedClient = createClient(url, key)
    }

    return cachedClient
}

// Export a proxy or just the getter. A proxy is more seamless for existing code.
export const supabase = new Proxy({} as SupabaseClient, {
    get: (target, prop: keyof SupabaseClient) => {
        const client = getSupabase()
        const val = client[prop]
        if (typeof val === 'function') {
            return val.bind(client)
        }
        return val
    }
})

