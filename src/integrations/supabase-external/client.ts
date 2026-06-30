// Custom external Supabase client - points to user's own Supabase project.
// Credentials read from environment variables (never hardcoded).
import { createClient } from '@supabase/supabase-js';
type Database = any;

// Vite replaces import.meta.env.VITE_* at build time — must use direct property access.
export const EXTERNAL_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL as string || '';

export const EXTERNAL_SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string || '';

function createSupabaseClient() {
  if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY) {
    throw new Error(
      'Variáveis de ambiente Supabase não encontradas: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY'
    );
  }
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
