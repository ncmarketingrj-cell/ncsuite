// Custom external Supabase client - points to user's own Supabase project
// (not Lovable Cloud). Anon/publishable key is safe to hardcode (public by design).
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

export const EXTERNAL_SUPABASE_URL = 'https://uqhilsnrrmlepdjzpubq.supabase.co';
export const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGlsc25ycm1sZXBkanpwdWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxOTIsImV4cCI6MjA5ODExNTE5Mn0.BQOqIlmadGj07UUE2u_EWqD3rr4iv_XGF5QuiR5j_Bc';

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
