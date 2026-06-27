// Custom auth middleware for the user's external Supabase (not Lovable Cloud).
import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
type Database = any;
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './client';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) throw new Error('Unauthorized: No request headers available');

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized: No Bearer token provided');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    const supabase = createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new Error('Unauthorized: Invalid token');

    return next({
      context: { supabase, userId: data.user.id, claims: { sub: data.user.id } },
    });
  },
);
