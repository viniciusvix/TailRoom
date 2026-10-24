import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Lido antes do cliente limpar a URL: o link de "esqueci minha senha" chega com type=recovery.
export const isRecoveryRedirect = /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search)

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const isSupabaseConfigured = Boolean(supabase)
