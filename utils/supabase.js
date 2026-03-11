// utils/supabase.js - Lazy Supabase client (never initialized at module top-level)
import { createClient } from '@supabase/supabase-js';

let _supabase = null;
let _supabaseAdmin = null;

/**
 * Returns a lazy-initialized Supabase client (anon key)
 */
export function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  }

  _supabase = createClient(url, anonKey);
  return _supabase;
}

/**
 * Returns a lazy-initialized Supabase admin client (service role key)
 * NEVER expose this to frontend
 */
export function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }

  _supabaseAdmin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _supabaseAdmin;
}

/**
 * Reset clients (useful in tests)
 */
export function resetSupabaseClients() {
  _supabase = null;
  _supabaseAdmin = null;
}