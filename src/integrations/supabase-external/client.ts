// Custom external Supabase client - points to user's own Supabase project
// (not Lovable Cloud). Credentials read from environment variables.
import { createClient } from '@supabase/supabase-js';
// Untyped: external Supabase schema differs from auto-generated Database types.
type Database = any;

export const EXTERNAL_SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
export const EXTERNAL_SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function createSupabaseClient() {
  return createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
