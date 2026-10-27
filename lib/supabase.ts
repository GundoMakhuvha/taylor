import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase keys are configured: accounts + cloud history are on. */
export const accountsOn = Boolean(url && key);

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient | null {
  if (!accountsOn) return null;
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "taylor.auth" },
    });
  }
  return client;
}

export async function accessToken(): Promise<string | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
}
