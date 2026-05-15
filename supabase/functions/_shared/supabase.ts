import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

export function getSupabaseUrl() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) {
    throw new Error("SUPABASE_URL belum tersedia.");
  }
  return url;
}

export function getAnonKey() {
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? firstKeyFromJson("SUPABASE_PUBLISHABLE_KEYS");
  if (!key) {
    throw new Error("SUPABASE_ANON_KEY belum tersedia.");
  }
  return key;
}

export function getServiceRoleKey() {
  const key = Deno.env.get("SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? firstKeyFromJson("SUPABASE_SECRET_KEYS");
  if (!key) {
    throw new Error("SERVICE_ROLE_KEY belum tersedia.");
  }
  return key;
}

export function createUserClient(request: Request) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: {
      headers: {
        Authorization: request.headers.get("Authorization") ?? "",
      },
    },
  });
}

export function createAdminClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function firstKeyFromJson(envName: string) {
  const raw = Deno.env.get(envName);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}
