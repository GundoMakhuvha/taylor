export const runtime = "nodejs";

// Free, keyless weather (Open-Meteo) + place name (OpenStreetMap). Proxied so the browser only talks to Taylor.
const JHB = { lat: -26.2041, lon: 28.0473, name: "Johannesburg" };

type OM = {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_probability_max: number[];
  };
};

async function placeName(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": "Taylor/1.0 (+https://www.capvtal.com)" }, next: { revalidate: 86400 } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const a = j?.address || {};
    return a.city || a.town || a.village || a.suburb || a.municipality || a.county || a.state || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const latQ = Number(url.searchParams.get("lat"));
  const lonQ = Number(url.searchParams.get("lon"));
  const hasCoords =
    Number.isFinite(latQ) && Number.isFinite(lonQ) && Math.abs(latQ) <= 90 && Math.abs(lonQ) <= 180 && !(latQ === 0 && lonQ === 0);
  // Round to ~1km for privacy and better caching.
  const lat = hasCoords ? Math.round(latQ * 100) / 100 : JHB.lat;
  const lon = hasCoords ? Math.round(lonQ * 100) / 100 : JHB.lon;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "3",
  });

  try {
    const [res, name] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 600 } }),
      hasCoords ? placeName(lat, lon) : Promise.resolve(JHB.name),
    ]);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const d = (await res.json()) as OM;

    const nowHour = d.current.time.slice(0, 13);
    const start = Math.max(0, d.hourly.time.findIndex((t) => t.slice(0, 13) >= nowHour));
    const hourly = d.hourly.time.slice(start + 1, start + 9).map((t, i) => ({
      time: t,
      temp: Math.round(d.hourly.temperature_2m[start + 1 + i]),
      code: d.hourly.weather_code[start + 1 + i],
      rain: d.hourly.precipitation_probability[start + 1 + i] ?? 0,
    }));

    return Response.json(
      {
        location: name || "Your location",
        timezone: d.timezone,
        current: {
          temp: Math.round(d.current.temperature_2m),
          feels: Math.round(d.current.apparent_temperature),
          humidity: d.current.relative_humidity_2m,
          wind: Math.round(d.current.wind_speed_10m),
          code: d.current.weather_code,
          isDay: d.current.is_day === 1,
        },
        hourly,
        daily: d.daily.time.map((t, i) => ({
          date: t,
          code: d.daily.weather_code[i],
          max: Math.round(d.daily.temperature_2m_max[i]),
          min: Math.round(d.daily.temperature_2m_min[i]),
          rain: d.daily.precipitation_probability_max[i] ?? 0,
          sunrise: d.daily.sunrise[i],
          sunset: d.daily.sunset[i],
        })),
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error("[taylor] weather error", err);
    return Response.json({ error: "Weather is unavailable right now." }, { status: 502 });
  }
}
