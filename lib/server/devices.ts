// Personal device keys for hands-free Taylor on your phone (Siri Shortcut) and laptop (companion app).
import { createHash, randomBytes } from "node:crypto";
import { admin } from "./admin";

export type DeviceKind = "phone" | "laptop";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createDevice(uid: string, name: string, kind: DeviceKind) {
  const token = `tdv_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await admin()
    .from("device_tokens")
    .insert({ user_id: uid, name: name.slice(0, 40) || (kind === "phone" ? "Phone" : "Laptop"), kind, token_hash: hash(token) })
    .select("id,name,kind,created_at")
    .single();
  if (error) throw error;
  return { ...data, token }; // the token is only ever shown once
}

export async function listDevices(uid: string) {
  const { data, error } = await admin().from("device_tokens").select("id,name,kind,created_at,last_used_at").eq("user_id", uid).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function deleteDevice(uid: string, id: string) {
  await admin().from("device_tokens").delete().eq("user_id", uid).eq("id", id);
}

/** Authenticate a device request: "Authorization: Bearer tdv_…" (or ?key=tdv_… for simple tools). */
export async function authDevice(req: Request) {
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = h?.startsWith("tdv_") ? h : new URL(req.url).searchParams.get("key") || "";
  if (!token.startsWith("tdv_")) return null;
  const { data } = await admin().from("device_tokens").select("id,user_id,name,kind").eq("token_hash", hash(token)).maybeSingle();
  if (!data) return null;
  admin().from("device_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  const { data: u } = await admin().auth.admin.getUserById(data.user_id);
  return {
    deviceId: data.id as string,
    userId: data.user_id as string,
    kind: (data.kind as DeviceKind) || "phone",
    email: (u?.user?.email || "").toLowerCase(),
    name: (u?.user?.user_metadata?.name as string) || "",
  };
}

/** URL schemes to open apps from an iPhone Shortcut / Android automation. */
export const PHONE_URL: Record<string, string> = {
  outlook: "ms-outlook://",
  gmail: "googlegmail://",
  calendar: "calshow://",
  whatsapp: "whatsapp://",
  teams: "msteams://",
  word: "ms-word://",
  excel: "ms-excel://",
  powerpoint: "ms-powerpoint://",
  chrome: "googlechrome://",
  edge: "microsoft-edge-https://www.capvtal.com",
  spotify: "spotify://",
  youtube: "youtube://",
  instagram: "instagram://app",
  facebook: "fb://",
  tiktok: "snssdk1233://",
  linkedin: "linkedin://",
  maps: "maps://",
  notes: "mobilenotes://",
  files: "shareddocuments://",
  settings: "App-prefs:",
  "power bi": "mspbi://",
  "capvtal.com": "https://www.capvtal.com",
  taylor: process.env.APP_URL || "https://taylor.capvtal.com",
};
