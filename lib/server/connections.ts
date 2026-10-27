// Connected accounts: OAuth for Google, Microsoft, Meta (Facebook/Instagram), LinkedIn and TikTok.
// Tokens are encrypted and stored in Supabase (server-only table). Server-only module.
import { admin, adminConfigured, appUrl } from "./admin";
import { decrypt, encrypt } from "./crypto";

export type ProviderId = "google" | "microsoft" | "meta" | "linkedin" | "tiktok";
export const PROVIDER_IDS: ProviderId[] = ["google", "microsoft", "meta", "linkedin", "tiktok"];

export const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

type Exchanged = { account: string; secret: Record<string, any> };

type Provider = {
  label: string;
  covers: string;
  configured: () => boolean;
  authUrl: (state: string, redirect: string) => string;
  exchange: (code: string, redirect: string) => Promise<Exchanged>;
  refresh?: (secret: Record<string, any>) => Promise<Record<string, any>>;
};

const now = () => Math.floor(Date.now() / 1000);

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`token exchange failed: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function getJson(url: string, token?: string) {
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url.split("?")[0]} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

/* ---------------- Google: Gmail + Calendar ---------------- */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const google: Provider = {
  label: "Google",
  covers: "Gmail + Google Calendar",
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  authUrl: (state, redirect) =>
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirect,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }),
  async exchange(code, redirect) {
    const t = await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    const me = await getJson("https://openidconnect.googleapis.com/v1/userinfo", t.access_token);
    return {
      account: me.email,
      secret: { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: now() + (t.expires_in || 3600), email: me.email },
    };
  },
  async refresh(s) {
    const t = await postForm("https://oauth2.googleapis.com/token", {
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: s.refresh_token,
      grant_type: "refresh_token",
    });
    return { ...s, access_token: t.access_token, expires_at: now() + (t.expires_in || 3600) };
  },
};

/* ---------------- Microsoft: Outlook mail + calendar ---------------- */
const MS_SCOPES = "offline_access openid email User.Read Mail.Read Mail.Send Calendars.ReadWrite";
const MS = "https://login.microsoftonline.com/common/oauth2/v2.0";

const microsoft: Provider = {
  label: "Microsoft",
  covers: "Outlook mail + calendar",
  configured: () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  authUrl: (state, redirect) =>
    `${MS}/authorize?` +
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirect,
      response_mode: "query",
      scope: MS_SCOPES,
      prompt: "select_account",
      state,
    }),
  async exchange(code, redirect) {
    const t = await postForm(`${MS}/token`, {
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      scope: MS_SCOPES,
    });
    const me = await getJson("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", t.access_token);
    const email = me.mail || me.userPrincipalName;
    return {
      account: email,
      secret: { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: now() + (t.expires_in || 3600), email },
    };
  },
  async refresh(s) {
    const t = await postForm(`${MS}/token`, {
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: s.refresh_token,
      grant_type: "refresh_token",
      scope: MS_SCOPES,
    });
    return { ...s, access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, expires_at: now() + (t.expires_in || 3600) };
  },
};

/* ---------------- Meta: Facebook Pages + Instagram ---------------- */
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "business_management",
].join(",");

const meta: Provider = {
  label: "Facebook + Instagram",
  covers: "Post to your Page and Instagram, read comments",
  configured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  authUrl: (state, redirect) =>
    `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth?` +
    new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirect, state, scope: META_SCOPES, response_type: "code" }),
  async exchange(code, redirect) {
    const short = await getJson(
      `${GRAPH()}/oauth/access_token?` +
        new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirect, code }),
    );
    const long = await getJson(
      `${GRAPH()}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: short.access_token,
        }),
    );
    const me = await getJson(`${GRAPH()}/me?fields=name`, long.access_token);
    const pages = await getJson(
      `${GRAPH()}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50`,
      long.access_token,
    );
    const list = (pages.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      token: p.access_token, // page tokens from a long-lived user token don't expire
      ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null,
    }));
    const label = list.length ? list.map((p: any) => p.name + (p.ig ? ` + @${p.ig.username}` : "")).join(", ") : me.name;
    return {
      account: label,
      secret: { user_token: long.access_token, expires_at: now() + (long.expires_in || 60 * 86400), pages: list },
    };
  },
};

/* ---------------- LinkedIn ---------------- */
const linkedin: Provider = {
  label: "LinkedIn",
  covers: "Post to your LinkedIn profile",
  configured: () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  authUrl: (state, redirect) =>
    "https://www.linkedin.com/oauth/v2/authorization?" +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: redirect,
      state,
      scope: "openid profile email w_member_social",
    }),
  async exchange(code, redirect) {
    const t = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    });
    const me = await getJson("https://api.linkedin.com/v2/userinfo", t.access_token);
    return {
      account: me.name || me.email,
      secret: { access_token: t.access_token, expires_at: now() + (t.expires_in || 60 * 86400), person_id: me.sub, name: me.name },
    };
  },
};

/* ---------------- TikTok ---------------- */
const tiktok: Provider = {
  label: "TikTok",
  covers: "Post videos to TikTok",
  configured: () => Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
  authUrl: (state, redirect) =>
    "https://www.tiktok.com/v2/auth/authorize/?" +
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      response_type: "code",
      scope: "user.info.basic,video.publish",
      redirect_uri: redirect,
      state,
    }),
  async exchange(code, redirect) {
    const t = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    });
    let name = "TikTok account";
    try {
      const me = await getJson("https://open.tiktokapis.com/v2/user/info/?fields=display_name", t.access_token);
      name = me?.data?.user?.display_name || name;
    } catch {}
    return {
      account: name,
      secret: { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: now() + (t.expires_in || 86400), open_id: t.open_id },
    };
  },
  async refresh(s) {
    const t = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: s.refresh_token,
    });
    return { ...s, access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, expires_at: now() + (t.expires_in || 86400) };
  },
};

export const PROVIDERS: Record<ProviderId, Provider> = { google, microsoft, meta, linkedin, tiktok };

export const isProvider = (p: string): p is ProviderId => (PROVIDER_IDS as string[]).includes(p);
export const redirectUri = (p: ProviderId) => `${appUrl()}/api/connect/${p}/callback`;
export const connectorsReady = () => adminConfigured() && Boolean(process.env.CONNECTIONS_SECRET);

/* ---------------- Storage ---------------- */
export async function saveConnection(userId: string, provider: ProviderId, account: string, secret: Record<string, any>) {
  const { error } = await admin()
    .from("connections")
    .upsert({ user_id: userId, provider, account, secret: encrypt(JSON.stringify(secret)), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteConnection(userId: string, provider: ProviderId) {
  const { error } = await admin().from("connections").delete().eq("user_id", userId).eq("provider", provider);
  if (error) throw error;
}

export async function listConnections(userId: string): Promise<{ provider: ProviderId; account: string }[]> {
  if (!connectorsReady()) return [];
  const { data, error } = await admin().from("connections").select("provider,account").eq("user_id", userId);
  if (error) throw error;
  return (data || []) as any;
}

/** Returns a usable (refreshed if needed) secret for a provider, or null if not connected. */
export async function getSecret(userId: string, provider: ProviderId): Promise<Record<string, any> | null> {
  const { data, error } = await admin()
    .from("connections")
    .select("account,secret")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let s = JSON.parse(decrypt(data.secret));
  const p = PROVIDERS[provider];
  if (p.refresh && s.expires_at && s.expires_at - 120 < now()) {
    s = await p.refresh(s);
    await saveConnection(userId, provider, data.account, s);
  }
  return s;
}
