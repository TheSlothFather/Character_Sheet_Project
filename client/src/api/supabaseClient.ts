import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function readEnv(): Record<string, string | undefined> {
  const viteEnv = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
  const override = ((globalThis as any).__SUPABASE_ENV__ ?? {}) as Record<string, string | undefined>;
  return { ...viteEnv, ...override };
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
  }

  client = createClient(url, anonKey);
  return client;
}

export function setSupabaseClient(mock: SupabaseClient | null): void {
  client = mock;
}
