import { createBrowserClient } from '@supabase/ssr'

// Lazy client to avoid build-time errors when env vars aren't available
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  // Return cached client if exists
  if (_client) return _client

  // During build, env vars may not be available - return a dummy that will be replaced at runtime
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return a placeholder during build - will be properly initialized at runtime
    if (typeof window === 'undefined') {
      return null as any
    }
    throw new Error('Supabase environment variables are not configured')
  }

  _client = createBrowserClient(url, key)
  return _client
}