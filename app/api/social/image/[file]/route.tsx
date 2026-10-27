import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { getPost } from "@/lib/server/social";
import type { Motif } from "@/lib/server/seasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unguessable URL (post UUID) so Instagram/Facebook/TikTok can fetch the image. JPEG, 1080×1350.
const W = 1080;
const H = 1350;

let assets: Promise<{ chakra: Buffer; plex: Buffer; plexBold: Buffer; logo: string }> | null = null;
function loadAssets() {
  if (!assets) {
    const dir = join(process.cwd(), "assets");
    assets = Promise.all([
      readFile(join(dir, "fonts/chakra-petch-latin-600-normal.woff")),
      readFile(join(dir, "fonts/ibm-plex-sans-latin-400-normal.woff")),
      readFile(join(dir, "fonts/ibm-plex-sans-latin-600-normal.woff")),
      readFile(join(dir, "taylor-mark.png")),
    ]).then(([chakra, plex, plexBold, logo]) => ({ chakra, plex, plexBold, logo: `data:image/png;base64,${logo.toString("base64")}` }));
  }
  return assets;
}

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function motifLayer(motif: Motif, accent: string, accent2: string, seed: string) {
  const r = rng(seed);
  const items: any[] = [];
  const abs = (style: Record<string, any>, k: number) => <div key={k} style={{ position: "absolute", display: "flex", ...style }} />;
  const n = motif === "rings" ? 0 : motif === "stripes" ? 0 : 26;
  for (let i = 0; i < n; i++) {
    const x = Math.round(r() * W);
    const y = Math.round(r() * H * 0.55);
    const s = 8 + Math.round(r() * 26);
    const c = r() > 0.5 ? accent : accent2;
    const o = 0.25 + r() * 0.5;
    if (motif === "snow") items.push(abs({ left: x, top: y, width: s * 0.6, height: s * 0.6, borderRadius: 999, background: "#ffffff", opacity: o }, i));
    else if (motif === "confetti")
      items.push(abs({ left: x, top: y, width: s, height: s * 0.4, background: c, opacity: o + 0.2, transform: `rotate(${Math.round(r() * 180)}deg)` }, i));
    else if (motif === "hearts" || motif === "pumpkin" || motif === "sun" || motif === "leaves")
      items.push(
        abs(
          {
            left: x,
            top: y,
            width: s * 1.4,
            height: s * 1.4,
            borderRadius: motif === "leaves" ? "0 999px 0 999px" : 999,
            background: motif === "pumpkin" ? accent : c,
            opacity: o * 0.6,
          },
          i,
        ),
      );
  }
  if (motif === "rings" || motif === "sun") {
    [520, 760, 1000].forEach((d, i) =>
      items.push(abs({ left: W - d * 0.62, top: -d * 0.38, width: d, height: d, borderRadius: 999, border: `2px solid ${i === 0 ? accent : accent2}`, opacity: 0.22 - i * 0.05 }, 100 + i)),
    );
  }
  if (motif === "stripes") {
    for (let i = 0; i < 9; i++) items.push(abs({ left: -200 + i * 170, top: -100, width: 60, height: 900, background: i % 2 ? accent : accent2, opacity: 0.08, transform: "rotate(28deg)" }, 200 + i));
  }
  return items;
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.(jpe?g|png)$/i, "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const post = await getPost(id).catch(() => null);
  if (!post) return new Response("Not found", { status: 404 });

  const { chakra, plex, plexBold, logo } = await loadAssets();
  const { bg1, bg2, accent, accent2 } = post.theme.palette;
  const tag = post.theme.name || post.pillar.label;
  const headSize = post.headline.length > 34 ? 84 : post.headline.length > 22 ? 100 : 118;

  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", position: "relative", background: `linear-gradient(165deg, ${bg1} 0%, ${bg2} 70%)`, color: "#f3fbff", fontFamily: "Plex" }}>
        {motifLayer(post.theme.motif, accent, accent2, post.id)}
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "64px 72px 0" }}>
          <img src={logo} width={56} height={64} style={{ filter: `drop-shadow(0 0 12px ${accent})` }} />
          <div style={{ display: "flex", fontFamily: "Chakra", fontSize: 30, letterSpacing: 8 }}>CAPVTAL INNOVATIONS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "flex-end", padding: "0 72px 0" }}>
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "12px 26px", borderRadius: 999, border: `2px solid ${accent}`, color: accent, fontFamily: "Chakra", fontSize: 28, letterSpacing: 6 }}>
            {tag.toUpperCase()}
          </div>
          <div style={{ display: "flex", marginTop: 34, fontFamily: "Chakra", fontSize: headSize, lineHeight: 1.02, letterSpacing: 1 }}>{post.headline}</div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 40, lineHeight: 1.35, color: "#d6e7f0", maxWidth: 900 }}>{post.subline}</div>
          <div style={{ display: "flex", marginTop: 54, width: 220, height: 6, borderRadius: 6, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "56px 72px 64px", fontSize: 30 }}>
          <div style={{ display: "flex", fontWeight: 600 }}>capvtal.com</div>
          <div style={{ display: "flex", fontFamily: "Chakra", fontSize: 24, letterSpacing: 5, color: accent }}>NEXT GENERATION INNOVATION</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Chakra", data: chakra, weight: 600, style: "normal" },
        { name: "Plex", data: plex, weight: 400, style: "normal" },
        { name: "Plex", data: plexBold, weight: 600, style: "normal" },
      ],
    },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
