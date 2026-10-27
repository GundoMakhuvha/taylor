// Text-to-speech providers, shared by the app (/api/speak) and devices (phone/laptop). Server-only.

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const premiumVoiceConfigured = () =>
  Boolean(
    (process.env.FISH_API_KEY && process.env.FISH_VOICE_ID) ||
      (process.env.SPEECH_KEY && process.env.SPEECH_REGION) ||
      (process.env.VOICE_API_KEY && process.env.VOICE_ID),
  );

async function fish(text: string): Promise<Response | null> {
  if (!process.env.FISH_API_KEY || !process.env.FISH_VOICE_ID) return null;
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FISH_API_KEY}`,
      "Content-Type": "application/json",
      model: process.env.FISH_MODEL || "s2.1-pro",
    },
    body: JSON.stringify({
      text,
      reference_id: process.env.FISH_VOICE_ID,
      format: "mp3",
      mp3_bitrate: 128,
      latency: process.env.FISH_LATENCY || "balanced",
      normalize: true,
    }),
  });
  if (!res.ok || !res.body) {
    console.error("[taylor] voice error (fish)", res.status, await res.text().catch(() => ""));
    return null;
  }
  return res;
}

async function azure(text: string): Promise<Response | null> {
  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  if (!key || !region) return null;
  const voice = process.env.SPEECH_VOICE || "en-GB-SoniaNeural";
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="${xmlEscape(voice)}"><prosody rate="2%">${xmlEscape(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "taylor",
    },
    body: ssml,
  });
  if (!res.ok || !res.body) {
    console.error("[taylor] voice error (azure)", res.status, await res.text().catch(() => ""));
    return null;
  }
  return res;
}

async function eleven(text: string): Promise<Response | null> {
  if (!process.env.VOICE_API_KEY || !process.env.VOICE_ID) return null;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.VOICE_ID)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": process.env.VOICE_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: process.env.VOICE_MODEL || "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3 },
      }),
    },
  );
  if (!res.ok || !res.body) {
    console.error("[taylor] voice error (elevenlabs)", res.status, await res.text().catch(() => ""));
    return null;
  }
  return res;
}

/** Returns an MP3 Response from the first provider that works, or null (browser voice fallback). */
export async function synthesize(text: string): Promise<Response | null> {
  const all: Record<string, (t: string) => Promise<Response | null>> = { fish, azure, elevenlabs: eleven };
  const preferred = all[(process.env.VOICE_PROVIDER || "").toLowerCase()];
  for (const fn of new Set([preferred, fish, azure, eleven].filter(Boolean))) {
    try {
      const r = await fn(text);
      if (r) return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("[taylor] voice error", err);
    }
  }
  return null;
}

/** Strip markdown etc. so it reads naturally. */
export function speakable(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[*_#>~|]+/g, "")
    .replace(/[✓✕⚠]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
