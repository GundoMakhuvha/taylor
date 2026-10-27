// Calls to connected services. Server-only. Every function returns plain data for Taylor to read.
import { GRAPH, getSecret } from "./connections";

const UA = { "User-Agent": "Taylor/1.0" };

async function call(url: string, init: RequestInit & { token: string }) {
  const { token, headers, ...rest } = init;
  const r = await fetch(url, { ...rest, headers: { Authorization: `Bearer ${token}`, ...UA, ...(headers || {}) } });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!r.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200);
    throw new Error(`${r.status}: ${msg}`);
  }
  return json;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ---------------- Time helpers ---------------- */
function tzOffset(tz: string, at: Date) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] || "00"}` : "+00:00";
  } catch {
    return "+02:00";
  }
}
/** "2026-10-24T15:00" (local) → "2026-10-24T15:00:00+02:00". Leaves values that already have an offset alone. */
export function withOffset(v: string, tz: string) {
  const s = v.trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const full = /T\d{2}:\d{2}$/.test(s) ? `${s}:00` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  return `${full}${tzOffset(tz, new Date(full + "Z"))}`;
}
const localNoOffset = (v: string) => v.replace(/(Z|[+-]\d{2}:?\d{2})$/, "").replace(/(T\d{2}:\d{2})$/, "$1:00");

/* ================= Google ================= */
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function header(h: any[], name: string) {
  return h?.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value || "";
}
function decodeB64(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function plainBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64(payload.body.data);
  for (const p of payload.parts || []) {
    const t = plainBody(p);
    if (t) return t;
  }
  if (payload.mimeType === "text/html" && payload.body?.data)
    return decodeB64(payload.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return "";
}

export async function gmailSearch(uid: string, query: string, max: number) {
  const s = await getSecret(uid, "google");
  if (!s) throw new Error("Google isn't connected");
  const list = await call(`${GMAIL}/messages?` + new URLSearchParams({ q: query || "in:inbox", maxResults: String(max) }), { token: s.access_token });
  const ids: string[] = (list?.messages || []).map((m: any) => m.id);
  const items = await Promise.all(
    ids.map((id) =>
      call(`${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
        token: s.access_token,
      }),
    ),
  );
  return items.map((m: any) => ({
    id: m.id,
    from: header(m.payload?.headers, "From"),
    subject: header(m.payload?.headers, "Subject"),
    date: header(m.payload?.headers, "Date"),
    unread: (m.labelIds || []).includes("UNREAD"),
    snippet: clip(m.snippet || "", 200),
  }));
}

export async function gmailRead(uid: string, id: string) {
  const s = await getSecret(uid, "google");
  if (!s) throw new Error("Google isn't connected");
  const m = await call(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, { token: s.access_token });
  const h = m.payload?.headers;
  return {
    from: header(h, "From"),
    to: header(h, "To"),
    subject: header(h, "Subject"),
    date: header(h, "Date"),
    body: clip(plainBody(m.payload).trim(), 6000),
  };
}

const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

export async function gmailSend(uid: string, a: { to: string[]; cc?: string[]; subject: string; body: string }) {
  const s = await getSecret(uid, "google");
  if (!s) throw new Error("Google isn't connected");
  const lines = [
    `To: ${a.to.join(", ")}`,
    ...(a.cc?.length ? [`Cc: ${a.cc.join(", ")}`] : []),
    `Subject: ${mimeWord(a.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(a.body).toString("base64"),
  ];
  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
  await call(`${GMAIL}/messages/send`, {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
}

const GCAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function gcalList(uid: string, start: string, end: string, tz: string) {
  const s = await getSecret(uid, "google");
  if (!s) throw new Error("Google isn't connected");
  const r = await call(
    `${GCAL}?` +
      new URLSearchParams({
        timeMin: withOffset(start, tz),
        timeMax: withOffset(end, tz),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
        timeZone: tz,
      }),
    { token: s.access_token },
  );
  return (r.items || []).map((e: any) => ({
    title: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || undefined,
    attendees: (e.attendees || []).map((x: any) => x.email).slice(0, 10),
  }));
}

export async function gcalCreate(
  uid: string,
  a: { title: string; start: string; end: string; location?: string; attendees?: string[]; description?: string },
  tz: string,
) {
  const s = await getSecret(uid, "google");
  if (!s) throw new Error("Google isn't connected");
  const r = await call(`${GCAL}?sendUpdates=all`, {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: a.title,
      location: a.location,
      description: a.description,
      start: { dateTime: localNoOffset(a.start), timeZone: tz },
      end: { dateTime: localNoOffset(a.end), timeZone: tz },
      attendees: (a.attendees || []).map((email) => ({ email })),
    }),
  });
  return r.htmlLink as string | undefined;
}

/* ================= Microsoft ================= */
const MSG = "https://graph.microsoft.com/v1.0/me";

export async function outlookSearch(uid: string, query: string, max: number) {
  const s = await getSecret(uid, "microsoft");
  if (!s) throw new Error("Microsoft isn't connected");
  const params = new URLSearchParams({ $top: String(max), $select: "id,subject,from,receivedDateTime,bodyPreview,isRead" });
  if (query) params.set("$search", `"${query.replace(/"/g, "")}"`);
  else params.set("$orderby", "receivedDateTime desc");
  const r = await call(`${MSG}/messages?${params}`, { token: s.access_token });
  return (r.value || []).map((m: any) => ({
    id: m.id,
    from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : "",
    subject: m.subject,
    date: m.receivedDateTime,
    unread: !m.isRead,
    snippet: clip(m.bodyPreview || "", 200),
  }));
}

export async function outlookRead(uid: string, id: string) {
  const s = await getSecret(uid, "microsoft");
  if (!s) throw new Error("Microsoft isn't connected");
  const m = await call(`${MSG}/messages/${encodeURIComponent(id)}?$select=subject,from,toRecipients,receivedDateTime,body`, {
    token: s.access_token,
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  return {
    from: m.from?.emailAddress?.address,
    to: (m.toRecipients || []).map((x: any) => x.emailAddress?.address).join(", "),
    subject: m.subject,
    date: m.receivedDateTime,
    body: clip((m.body?.content || "").trim(), 6000),
  };
}

export async function outlookSend(uid: string, a: { to: string[]; cc?: string[]; subject: string; body: string }) {
  const s = await getSecret(uid, "microsoft");
  if (!s) throw new Error("Microsoft isn't connected");
  const rcpt = (xs: string[] = []) => xs.map((address) => ({ emailAddress: { address } }));
  await call(`${MSG}/sendMail`, {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject: a.subject, body: { contentType: "Text", content: a.body }, toRecipients: rcpt(a.to), ccRecipients: rcpt(a.cc) },
      saveToSentItems: true,
    }),
  });
}

export async function mscalList(uid: string, start: string, end: string, tz: string) {
  const s = await getSecret(uid, "microsoft");
  if (!s) throw new Error("Microsoft isn't connected");
  const r = await call(
    `${MSG}/calendarView?` +
      new URLSearchParams({
        startDateTime: withOffset(start, tz),
        endDateTime: withOffset(end, tz),
        $orderby: "start/dateTime",
        $top: "50",
        $select: "subject,start,end,location,attendees",
      }),
    { token: s.access_token, headers: { Prefer: `outlook.timezone="${tz}"` } },
  );
  return (r.value || []).map((e: any) => ({
    title: e.subject || "(no title)",
    start: e.start?.dateTime,
    end: e.end?.dateTime,
    location: e.location?.displayName || undefined,
    attendees: (e.attendees || []).map((x: any) => x.emailAddress?.address).slice(0, 10),
  }));
}

export async function mscalCreate(
  uid: string,
  a: { title: string; start: string; end: string; location?: string; attendees?: string[]; description?: string },
  tz: string,
) {
  const s = await getSecret(uid, "microsoft");
  if (!s) throw new Error("Microsoft isn't connected");
  const r = await call(`${MSG}/events`, {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: a.title,
      body: a.description ? { contentType: "Text", content: a.description } : undefined,
      start: { dateTime: localNoOffset(a.start), timeZone: tz },
      end: { dateTime: localNoOffset(a.end), timeZone: tz },
      location: a.location ? { displayName: a.location } : undefined,
      attendees: (a.attendees || []).map((address) => ({ emailAddress: { address }, type: "required" })),
    }),
  });
  return r.webLink as string | undefined;
}

/* ================= Meta: Facebook Page + Instagram ================= */
type Page = { id: string; name: string; token: string; ig: { id: string; username: string } | null };

export async function metaPages(uid: string): Promise<Page[]> {
  const s = await getSecret(uid, "meta");
  if (!s) throw new Error("Facebook/Instagram isn't connected");
  return s.pages || [];
}
const pick = (pages: Page[], name?: string) =>
  (name && pages.find((p) => p.name.toLowerCase().includes(name.toLowerCase()) || p.ig?.username?.toLowerCase() === name.toLowerCase().replace(/^@/, ""))) ||
  pages[0];

export async function fbPost(uid: string, a: { message: string; link?: string; page?: string }) {
  const page = pick(await metaPages(uid), a.page);
  if (!page) throw new Error("No Facebook Page found on this account");
  const r = await call(`${GRAPH()}/${page.id}/feed`, {
    token: page.token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: a.message, ...(a.link ? { link: a.link } : {}) }),
  });
  return { page: page.name, id: r.id };
}

export async function igPost(uid: string, a: { image_url: string; caption: string; account?: string }) {
  const pages = (await metaPages(uid)).filter((p) => p.ig);
  const page = pick(pages, a.account);
  if (!page?.ig) throw new Error("No Instagram business account is linked to your Facebook Page");
  const media = await call(`${GRAPH()}/${page.ig.id}/media`, {
    token: page.token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: a.image_url, caption: a.caption }),
  });
  // Instagram processes the image first; wait until it's ready.
  for (let i = 0; i < 10; i++) {
    const st = await call(`${GRAPH()}/${media.id}?fields=status_code`, { token: page.token });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error("Instagram couldn't process that image");
    await new Promise((r) => setTimeout(r, 1500));
  }
  const pub = await call(`${GRAPH()}/${page.ig.id}/media_publish`, {
    token: page.token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: media.id }),
  });
  return { account: `@${page.ig.username}`, id: pub.id };
}

export async function metaActivity(uid: string, platform: "facebook" | "instagram", limit: number) {
  const pages = await metaPages(uid);
  if (platform === "instagram") {
    const page = pages.find((p) => p.ig);
    if (!page?.ig) throw new Error("No Instagram business account linked");
    const r = await call(
      `${GRAPH()}/${page.ig.id}/media?fields=caption,timestamp,like_count,comments_count,permalink,comments.limit(5){text,username,timestamp}&limit=${limit}`,
      { token: page.token },
    );
    return (r.data || []).map((m: any) => ({
      caption: clip(m.caption || "", 160),
      posted: m.timestamp,
      likes: m.like_count,
      comments: m.comments_count,
      latest_comments: (m.comments?.data || []).map((c: any) => ({ from: c.username, text: clip(c.text, 200), at: c.timestamp })),
      link: m.permalink,
    }));
  }
  const page = pages[0];
  if (!page) throw new Error("No Facebook Page found");
  const r = await call(
    `${GRAPH()}/${page.id}/posts?fields=message,created_time,permalink_url,comments.limit(5){message,from,created_time}&limit=${limit}`,
    { token: page.token },
  );
  return (r.data || []).map((p: any) => ({
    message: clip(p.message || "", 160),
    posted: p.created_time,
    latest_comments: (p.comments?.data || []).map((c: any) => ({ from: c.from?.name, text: clip(c.message, 200), at: c.created_time })),
    link: p.permalink_url,
  }));
}

/* ================= LinkedIn ================= */
const liVersion = () => {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 2); // LinkedIn supports roughly the last year of monthly versions
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function linkedinPost(uid: string, text: string) {
  const s = await getSecret(uid, "linkedin");
  if (!s) throw new Error("LinkedIn isn't connected");
  const r = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": liVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${s.person_id}`,
      commentary: text.replace(/([\\(){}\[\]<>@|~_*#])/g, "\\$1"),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.headers.get("x-restli-id") || "posted";
}

/* ================= TikTok ================= */
async function tiktokPrivacy(token: string) {
  const info = await call("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
  const options: string[] = info?.data?.privacy_level_options || ["SELF_ONLY"];
  return options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0];
}

/** Photo post (image URL must be on a domain verified in the TikTok developer portal). */
export async function tiktokPhotoPost(uid: string, a: { image_urls: string[]; title: string; description: string }) {
  const s = await getSecret(uid, "tiktok");
  if (!s) throw new Error("TikTok isn't connected");
  const privacy = await tiktokPrivacy(s.access_token);
  const r = await call("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
      post_info: { title: a.title.slice(0, 85), description: a.description.slice(0, 3900), privacy_level: privacy, disable_comment: false, auto_add_music: true },
      source_info: { source: "PULL_FROM_URL", photo_images: a.image_urls, photo_cover_index: 0 },
    }),
  });
  return { publish_id: r?.data?.publish_id, privacy };
}

export async function tiktokPost(uid: string, a: { video_url: string; caption: string }) {
  const s = await getSecret(uid, "tiktok");
  if (!s) throw new Error("TikTok isn't connected");
  const info = await call("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
  const options: string[] = info?.data?.privacy_level_options || ["SELF_ONLY"];
  const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0];
  const r = await call("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    token: s.access_token,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: a.caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: a.video_url },
    }),
  });
  return { publish_id: r?.data?.publish_id, privacy };
}
