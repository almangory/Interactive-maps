import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'من فضلك قم بإعداد VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في إعدادات البيئة لربط الموقع بسوبابيس بقاعدة بياناتك.'
  );
}

let supabaseInstance: SupabaseClient | null = null;

export function getSharedSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const url = supabaseUrl || (typeof localStorage !== 'undefined' && localStorage.getItem('VITE_SUPABASE_URL')) || 'https://placeholder-project.supabase.co';
    const key = supabaseAnonKey || (typeof localStorage !== 'undefined' && localStorage.getItem('VITE_SUPABASE_ANON_KEY')) || 'placeholder-anon-key';
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }
  return supabaseInstance;
}

export const supabase = getSharedSupabaseClient();

