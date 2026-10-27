// Social autopilot: one themed, branded post a day for Facebook, Instagram and TikTok. Server-only.
import { CAPVTAL_KNOWLEDGE } from "../knowledge";
import { admin } from "./admin";
import * as api from "./apis";
import { seal } from "./crypto";
import { completeJson } from "./llm";
import { OWNER_TZ, link, notifyOwner, owner, ownerLinked } from "./owner";
import { pillarFor, themeFor, type Theme } from "./seasons";
import { noDashes } from "../style";

export type SocialPost = {
  id: string;
  day: string;
  theme: Theme;
  pillar: { key: string; label: string };
  headline: string;
  subline: string;
  captions: { facebook: string; instagram: string; tiktok: string };
  status: "draft" | "publishing" | "published" | "partial" | "failed" | "skipped";
  results: Record<string, string> | null;
  created_at: string;
};

export const platforms = () =>
  (process.env.SOCIAL_PLATFORMS || "facebook,instagram,tiktok")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const autopilotOn = () => process.env.SOCIAL_AUTOPILOT === "on";

/** Today's date in the owner's time zone as a local Date (for theme/pillar). */
export function localDay(tz = OWNER_TZ()) {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { iso: s, date: new Date(y, m - 1, d) };
}

export const imageUrl = (id: string) => link(`/api/social/image/${id}.jpg`);
export const approveUrl = (id: string) => link(`/approve/post/${id}?t=${encodeURIComponent(seal({ pid: id }, 3 * 86400))}`);

const WRITER = `You are the social media lead for Capvtal Innovations (South African tech and creative company, slogan "Next Generation Innovation", website capvtal.com).
Write one day's post for Facebook, Instagram and TikTok in a confident, warm, modern South African voice. It must feel human, never corporate.
Rules: use ONLY facts from the company knowledge; never invent prices, discounts, stats, clients or awards. Light, tasteful emoji are fine (max 3 per caption).
Hashtags: Instagram 5–8 relevant ones incl. #CapvtalInnovations #NextGenerationInnovation; TikTok 3–5; Facebook 0–3.
Never use hyphens or dashes anywhere.
Image text must be SHORT: headline max 7 words, subline max 14 words.

COMPANY KNOWLEDGE:
${CAPVTAL_KNOWLEDGE}`;

export async function draftPost(dayIso?: string): Promise<SocialPost> {
  const { iso, date } = dayIso ? { iso: dayIso, date: new Date(dayIso + "T12:00:00") } : localDay();
  const theme = themeFor(date);
  const pillar = pillarFor(date);
  const brief = [
    `Date: ${date.toDateString()}.`,
    theme.name ? `Theme: ${theme.name} (${theme.mood}).${theme.isDay ? " It's the day itself." : ""}` : `Season: ${theme.mood}.`,
    `Content pillar: ${pillar.label}: ${pillar.brief}.`,
    theme.name ? "Blend the theme and the pillar naturally; the theme leads." : "",
    `Return {"headline": "...", "subline": "...", "facebook": "...", "instagram": "...", "tiktok": "..."}`,
  ].join("\n");

  type Out = { headline: string; subline: string; facebook: string; instagram: string; tiktok: string };
  const raw = (await completeJson<Out>(WRITER, brief, 1500)) || null;
  const out = raw ? (Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? noDashes(v) : v])) as Out) : null;
  const fallback = theme.name || "Next Generation Innovation";
  const row = {
    day: iso,
    theme,
    pillar: { key: pillar.key, label: pillar.label },
    headline: (out?.headline || fallback).slice(0, 60),
    subline: (out?.subline || "Websites, apps, data and branding for businesses ready to grow.").slice(0, 120),
    captions: {
      facebook: out?.facebook || "Ready to take your business online? Let's build something great together. capvtal.com",
      instagram: out?.instagram || "Ready to take your business online? Link in bio. #CapvtalInnovations #NextGenerationInnovation",
      tiktok: out?.tiktok || "Your business deserves to be online. #CapvtalInnovations #SouthAfrica",
    },
    status: "draft",
  };
  const { data, error } = await admin().from("social_posts").insert(row).select("*").single();
  if (error) throw error;
  return data as SocialPost;
}

export async function getPost(id: string): Promise<SocialPost | null> {
  const { data } = await admin().from("social_posts").select("*").eq("id", id).maybeSingle();
  return (data as SocialPost) || null;
}

export async function listPosts(limit = 10): Promise<SocialPost[]> {
  const { data } = await admin().from("social_posts").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data as SocialPost[]) || [];
}

export async function skipPost(id: string) {
  await admin().from("social_posts").update({ status: "skipped" }).eq("id", id);
}

/** Publish a drafted post to every connected platform. */
export async function publishPost(id: string): Promise<SocialPost> {
  const post = await getPost(id);
  if (!post) throw new Error("Post not found");
  if (post.status === "published") return post;
  const o = await owner();
  if (!o) throw new Error("Owner account not found. Set OWNER_EMAIL and sign in to Taylor once.");
  await admin().from("social_posts").update({ status: "publishing" }).eq("id", id);

  const linked = await ownerLinked(o.id);
  const img = imageUrl(id);
  const results: Record<string, string> = {};
  for (const p of platforms()) {
    try {
      if (p === "facebook") {
        if (!linked.has("meta")) throw new Error("Facebook isn't connected");
        const pages = await api.metaPages(o.id);
        const page = pages[0];
        if (!page) throw new Error("No Facebook Page");
        // Photo post with caption.
        const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/${page.id}/photos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${page.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: img, caption: post.captions.facebook }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
        results.facebook = "posted";
      } else if (p === "instagram") {
        if (!linked.has("meta")) throw new Error("Instagram isn't connected");
        await api.igPost(o.id, { image_url: img, caption: post.captions.instagram });
        results.instagram = "posted";
      } else if (p === "tiktok") {
        if (!linked.has("tiktok")) throw new Error("TikTok isn't connected");
        const r = await api.tiktokPhotoPost(o.id, { image_urls: [img], title: post.headline, description: post.captions.tiktok });
        results.tiktok = r.privacy === "SELF_ONLY" ? "posted (private until TikTok audit)" : "posted";
      }
    } catch (err: any) {
      results[p] = `failed: ${String(err?.message || err).slice(0, 160)}`;
    }
  }
  const ok = Object.values(results).filter((v) => v.startsWith("posted")).length;
  const status = ok === 0 ? "failed" : ok === Object.keys(results).length ? "published" : "partial";
  const { data } = await admin().from("social_posts").update({ status, results }).eq("id", id).select("*").single();
  return data as SocialPost;
}

/** Daily job: draft today's post, then publish (autopilot) or send it to the owner for approval. */
export async function runDailySocial() {
  const { iso } = localDay();
  const { data: existing } = await admin().from("social_posts").select("id,status").eq("day", iso).limit(1);
  if (existing?.length) return { skipped: "already drafted today" };

  const post = await draftPost(iso);
  if (autopilotOn()) {
    const done = await publishPost(post.id);
    await notifyOwner({
      subject: `Posted today: ${done.headline}`,
      text: `Today's post is live.\n\n${Object.entries(done.results || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}\n\nCaption: ${done.captions.instagram}`,
      short: `Today's post "${done.headline}" is out: ${Object.entries(done.results || {})
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}`,
      cta: { label: "View", url: approveUrl(done.id) },
    });
    return { published: done.id, results: done.results };
  }
  await notifyOwner({
    subject: `Today's post is ready for approval: ${post.headline}`,
    text: `${post.theme.name ? `Theme: ${post.theme.name}. ` : ""}${post.pillar.label}\n\n${post.headline}\n${post.subline}\n\nInstagram caption:\n${post.captions.instagram}`,
    short: `Today's post is ready: "${post.headline}". Approve it here and I'll publish to ${platforms().join(", ")}.`,
    cta: { label: "Review & publish", url: approveUrl(post.id) },
  });
  return { drafted: post.id };
}
