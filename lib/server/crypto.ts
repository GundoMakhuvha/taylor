// Encryption for stored tokens + signed, expiring tokens (OAuth state, pending actions). Server-only.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): Buffer {
  const s = process.env.CONNECTIONS_SECRET;
  if (!s || s.length < 16) throw new Error("CONNECTIONS_SECRET is missing or too short (use 32+ random characters)");
  return createHash("sha256").update(s).digest();
}

const b64u = (b: Buffer) => b.toString("base64url");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [b64u(iv), b64u(c.getAuthTag()), b64u(enc)].join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split(".");
  const d = createDecipheriv("aes-256-gcm", secret(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** Signed + encrypted payload with expiry. Tamper-proof and unreadable by the browser. */
export function seal(payload: object, ttlSeconds: number): string {
  const body = JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return encrypt(body);
}

export function unseal<T = any>(token: string): T | null {
  try {
    const obj = JSON.parse(decrypt(token));
    if (!obj?.exp || obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj as T;
  } catch {
    return null;
  }
}

export function hmacHex(key: string, data: string | Buffer) {
  return createHmac("sha256", key).update(data).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
