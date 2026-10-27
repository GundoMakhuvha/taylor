// Lead finder: local businesses with no website (Google Places API, New). Server-only.
// Google's terms only allow storing the Place ID long-term, so Taylor stores the ID plus YOUR
// notes/status/email, and looks up names/phones live when you ask.
import { admin } from "./admin";

const PLACES = "https://places.googleapis.com/v1";
export const placesConfigured = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

const FIELDS = "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,primaryTypeDisplayName,businessStatus";

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text: string };
  businessStatus?: string;
};

const view = (p: Place) => ({
  place_id: p.id,
  name: p.displayName?.text,
  category: p.primaryTypeDisplayName?.text,
  address: p.formattedAddress,
  phone: p.nationalPhoneNumber || p.internationalPhoneNumber,
  rating: p.rating,
  reviews: p.userRatingCount,
  maps: p.googleMapsUri,
});

export const DEFAULT_CATEGORIES = [
  "plumbers", "electricians", "hair salons", "barbershops", "car wash", "mechanics", "panel beaters", "bakeries",
  "catering", "cleaning services", "tutors", "photographers", "tailors", "guest houses", "gyms", "beauty salons",
  "landscaping", "construction companies", "funeral parlours", "driving schools",
];
export const DEFAULT_AREAS = ["Johannesburg", "Soweto", "Sandton", "Randburg", "Midrand", "Roodepoort", "Pretoria", "Centurion"];

const list = (v: string | undefined, d: string[]) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

/** Search Google Places and save businesses with no website as new leads. */
export async function findLeads(query: string, max = 20) {
  if (!placesConfigured()) throw new Error("Lead finding isn't set up (GOOGLE_PLACES_API_KEY)");
  const r = await fetch(`${PLACES}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELDS.split(",").map((f) => `places.${f}`).join(","),
    },
    body: JSON.stringify({ textQuery: query, regionCode: "ZA", pageSize: Math.min(20, max) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Places ${r.status}`);
  const noSite: Place[] = (j.places || []).filter((p: Place) => !p.websiteUri && (p.businessStatus || "OPERATIONAL") === "OPERATIONAL");

  const fresh: ReturnType<typeof view>[] = [];
  for (const p of noSite) {
    const { error } = await admin().from("leads").insert({ place_id: p.id, query, status: "new" });
    if (!error) fresh.push(view(p)); // duplicate place_id = already known
  }
  return { searched: query, found_without_website: noSite.length, new_leads: fresh };
}

/** The daily rotation of category × area. */
export function todaysQueries(n = 2) {
  const cats = list(process.env.LEAD_CATEGORIES, DEFAULT_CATEGORIES);
  const areas = list(process.env.LEAD_AREAS, DEFAULT_AREAS);
  const day = Math.floor(Date.now() / 86400000);
  return Array.from({ length: n }, (_, i) => `${cats[(day * n + i) % cats.length]} in ${areas[(day + i) % areas.length]}`);
}

async function details(placeId: string) {
  const r = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": FIELDS },
  });
  if (!r.ok) return null;
  return view((await r.json()) as Place);
}

export type LeadRow = { id: string; place_id: string; status: string; email: string | null; notes: string | null; query: string; contacted_at: string | null; created_at: string };

/** Leads with live details (name, phone, address). */
export async function listLeads(status?: string, limit = 8) {
  let q = admin().from("leads").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 15));
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as LeadRow[];
  const out = [];
  for (const l of rows) {
    const d = placesConfigured() ? await details(l.place_id).catch(() => null) : null;
    out.push({ lead_id: l.id, status: l.status, email: l.email, notes: l.notes, contacted_at: l.contacted_at, ...(d || {}) });
  }
  return out;
}

export async function leadStats() {
  const { data } = await admin().from("leads").select("status");
  const counts: Record<string, number> = {};
  for (const r of data || []) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

export const LEAD_STATUSES = ["new", "contacted", "replied", "interested", "won", "lost", "not_interested"];

export async function updateLead(id: string, patch: { status?: string; email?: string; notes?: string }) {
  const upd: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.status && LEAD_STATUSES.includes(patch.status)) {
    upd.status = patch.status;
    if (patch.status === "contacted") upd.contacted_at = new Date().toISOString();
  }
  if (patch.email !== undefined) upd.email = patch.email.trim().toLowerCase() || null;
  if (patch.notes !== undefined) upd.notes = patch.notes.slice(0, 2000);
  const { data, error } = await admin().from("leads").update(upd).eq("id", id).select("*").single();
  if (error) throw error;
  if (upd.status === "not_interested" && data.email) await optOut(data.email);
  return data;
}

/* ---------------- Opt-outs (POPIA s69: never contact again) ---------------- */
export async function optOut(email: string) {
  await admin().from("outreach_optout").upsert({ email: email.trim().toLowerCase() });
}
export async function optedOut(emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const { data } = await admin().from("outreach_optout").select("email").in("email", emails.map((e) => e.trim().toLowerCase()));
  return new Set((data || []).map((r: any) => r.email));
}
/** Was this email already approached once? (POPIA allows one approach to ask for consent.) */
export async function alreadyContacted(email: string) {
  const { data } = await admin().from("leads").select("id").eq("email", email.trim().toLowerCase()).not("contacted_at", "is", null).limit(1);
  return Boolean(data?.length);
}
