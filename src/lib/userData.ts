import { supabase } from './supabase'

export type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

export type UserSettings = {
  level: 'ALL' | Level
  case_sensitive: boolean
  show_line_numbers: boolean
  wrap_lines: boolean
  follow: boolean
  search_terms: string[]
}

export type SavedSource = { id: string; name: string; url: string; last_opened_at: string }

export const defaultSettings: UserSettings = {
  level: 'ALL',
  case_sensitive: false,
  show_line_numbers: true,
  wrap_lines: false,
  follow: true,
  search_terms: [],
}

const settingsColumns = 'level, case_sensitive, show_line_numbers, wrap_lines, follow, search_terms'

export async function loadSettings(): Promise<UserSettings> {
  if (!supabase) return defaultSettings
  const { data, error } = await supabase.from('user_settings').select(settingsColumns).maybeSingle()
  if (error) throw error
  return data ? { ...defaultSettings, ...(data as UserSettings) } : defaultSettings
}

export async function saveSettings(userId: string, settings: UserSettings) {
  if (!supabase) return
  const { error } = await supabase.from('user_settings').upsert({ user_id: userId, ...settings }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function loadSources(limit = 20): Promise<SavedSource[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('log_sources')
    .select('id, name, url, last_opened_at')
    .order('last_opened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function saveSource(userId: string, name: string, url: string): Promise<string | undefined> {
  if (!supabase) return undefined
  const { data, error } = await supabase
    .from('log_sources')
    .upsert({ user_id: userId, name, url, last_opened_at: new Date().toISOString() }, { onConflict: 'user_id,url' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function deleteSource(id: string) {
  if (!supabase) return
  const { error } = await supabase.from('log_sources').delete().eq('id', id)
  if (error) throw error
}
