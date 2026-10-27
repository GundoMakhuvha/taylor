export type Weather = {
  location: string;
  timezone: string;
  current: { temp: number; feels: number; humidity: number; wind: number; code: number; isDay: boolean };
  hourly: { time: string; temp: number; code: number; rain: number }[];
  daily: { date: string; code: number; max: number; min: number; rain: number; sunrise: string; sunset: string }[];
};

export type WxIcon = "sun" | "moon" | "partly" | "partly-night" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "snow";

export function describe(code: number, isDay = true): { label: string; icon: WxIcon } {
  if (code === 0) return { label: isDay ? "Clear skies" : "Clear night", icon: isDay ? "sun" : "moon" };
  if (code === 1) return { label: "Mostly clear", icon: isDay ? "sun" : "moon" };
  if (code === 2) return { label: "Partly cloudy", icon: isDay ? "partly" : "partly-night" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? "Showers" : "Rain", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", icon: "snow" };
  if (code >= 95) return { label: "Thunderstorms", icon: "storm" };
  return { label: "Cloudy", icon: "cloud" };
}

export const hhmm = (iso: string) => iso.slice(11, 16);

/** One-line summary handed to Taylor as live context. */
export function summarise(w: Weather): string {
  const now = describe(w.current.code, w.current.isDay);
  const today = w.daily[0];
  const tomorrow = w.daily[1];
  const parts = [
    `${w.location}: ${now.label.toLowerCase()}, ${w.current.temp}°C (feels ${w.current.feels}°C), humidity ${w.current.humidity}%, wind ${w.current.wind} km/h`,
  ];
  if (today)
    parts.push(
      `today ${today.min}–${today.max}°C, ${today.rain}% chance of rain, sunrise ${hhmm(today.sunrise)}, sunset ${hhmm(today.sunset)}`,
    );
  if (w.hourly.length)
    parts.push(`next hours: ${w.hourly.slice(0, 6).map((h) => `${hhmm(h.time)} ${h.temp}°C ${h.rain}% rain`).join(", ")}`);
  if (tomorrow) parts.push(`tomorrow ${tomorrow.min}–${tomorrow.max}°C, ${describe(tomorrow.code).label.toLowerCase()}, ${tomorrow.rain}% rain`);
  return parts.join("; ");
}
