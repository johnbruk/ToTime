import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './app-utils.js';

export function createSupabaseClient(supabaseGlobal = globalThis.window?.supabase ?? globalThis.supabase) {
  if (!supabaseGlobal?.createClient) {
    throw new Error('Supabase client library is not available.');
  }

  return supabaseGlobal.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
