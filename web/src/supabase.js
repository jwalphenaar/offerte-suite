import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://uwfzvnboueaxahhhmagh.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ewCLziwC6moczY7CkPNcQw_TE3ly65C'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
