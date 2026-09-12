import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn("VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi.");
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : // Belum dikonfigurasi: klien null-asli agar pemanggil yang salah tetap gagal jelas,
    // bukan menabrak API palsu. Dipakai hanya saat env belum di-set (dev tanpa .env).
    (null as unknown as SupabaseClient);
