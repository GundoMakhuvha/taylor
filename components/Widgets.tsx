"use client";

import { useEffect, useState } from "react";
import { describe, hhmm, type Weather } from "@/lib/weather";
import { I, WeatherIcon } from "./Icons";

const pad = (n: number) => String(n).padStart(2, "0");

export function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const offset = now ? -now.getTimezoneOffset() : 0;
  const utc = `UTC${offset >= 0 ? "+" : "−"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  const dayPct = now ? ((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) * 100 : 0;

  return (
    <section className="widget" aria-label="Time">
      <header className="w-head">
        <span>CHRONO</span>
        <span className="w-code">SYS.01</span>
      </header>
      <div className="clock" aria-live="off">
        <span className="clock-hm">{now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--"}</span>
        <span className="clock-s">{now ? pad(now.getSeconds()) : "--"}</span>
      </div>
      <p className="w-sub">
        {now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : " "}
      </p>
      <div className="w-meter" aria-label={`Day ${Math.round(dayPct)} percent complete`}>
        <span style={{ width: `${dayPct}%` }} />
      </div>
      <p className="w-foot">
        <span>{tz.replace(/_/g, " ") || "Local time"}</span>
        <span>{utc}</span>
      </p>
    </section>
  );
}

export function WeatherWidget({
  weather,
  status,
  precise,
  onLocate,
}: {
  weather: Weather | null;
  status: "loading" | "ready" | "error";
  precise: boolean;
  onLocate: () => void;
}) {
  const now = weather ? describe(weather.current.code, weather.current.isDay) : null;
  const today = weather?.daily[0];
  return (
    <section className="widget" aria-label="Weather">
      <header className="w-head">
        <span className="w-loc">
          <I.pin />
          {weather?.location ?? "Locating…"}
        </span>
        {!precise && (
          <button type="button" className="w-mini-btn" onClick={onLocate} aria-label="Use my precise location">
            <I.locate />
          </button>
        )}
      </header>

      {status === "error" && <p className="w-sub">Weather feed offline. I&rsquo;ll retry shortly.</p>}
      {status === "loading" && !weather && <div className="w-skeleton" />}

      {weather && now && (
        <>
          <div className="wx-now">
            <span className="wx-icon">
              <WeatherIcon icon={now.icon} size={44} />
            </span>
            <span className="wx-temp">
              {weather.current.temp}
              <sup>°C</sup>
            </span>
            <span className="wx-meta">
              <strong>{now.label}</strong>
              <span>
                Feels {weather.current.feels}° · H {today?.max}° L {today?.min}°
              </span>
            </span>
          </div>
          <div className="wx-stats">
            <span>
              <I.drop /> {weather.current.humidity}%
            </span>
            <span>
              <I.wind /> {weather.current.wind} km/h
            </span>
            {today && (
              <>
                <span>
                  <I.sunrise /> {hhmm(today.sunrise)}
                </span>
                <span>
                  <I.sunset /> {hhmm(today.sunset)}
                </span>
              </>
            )}
          </div>
          <ol className="wx-hours" aria-label="Next hours">
            {weather.hourly.slice(0, 6).map((h) => (
              <li key={h.time}>
                <span>{hhmm(h.time)}</span>
                <WeatherIcon icon={describe(h.code, Number(h.time.slice(11, 13)) >= 6 && Number(h.time.slice(11, 13)) < 19).icon} size={18} />
                <strong>{h.temp}°</strong>
                {h.rain >= 20 && <em>{h.rain}%</em>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export type Sys = {
  core: boolean | null;
  voice: "premium" | "standard" | null;
  memory: "cloud" | "device" | null;
  search: boolean | null;
  latency: number | null;
};

export function SystemsWidget({ sys, wake, wakeSupported }: { sys: Sys; wake: boolean; wakeSupported: boolean }) {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    let bat: any;
    const update = () => bat && setBattery({ level: Math.round(bat.level * 100), charging: bat.charging });
    (navigator as any).getBattery?.()
      .then((b: any) => {
        bat = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const rows: { label: string; value: string; ok: boolean | null }[] = [
    { label: "Core", value: sys.core === null ? "Checking" : sys.core ? "Online" : "Offline", ok: sys.core },
    { label: "Uplink", value: !online ? "No signal" : sys.latency != null ? `${sys.latency} ms` : "Checking", ok: online },
    {
      label: "Voice",
      value: sys.voice === "premium" ? "Neural · en-GB" : sys.voice === "standard" ? "Standard · en-GB" : "Checking",
      ok: sys.voice !== null,
    },
    { label: "Wake word", value: !wakeSupported ? "Unsupported" : wake ? "Armed" : "Standby", ok: wakeSupported ? wake : false },
    { label: "Memory", value: sys.memory === "cloud" ? "Cloud sync" : sys.memory === "device" ? "This device" : "Checking", ok: sys.memory !== null },
    { label: "Web search", value: sys.search ? "Enabled" : sys.search === false ? "Off" : "Checking", ok: sys.search },
  ];
  if (battery) rows.push({ label: "Power", value: `${battery.level}%${battery.charging ? " · charging" : ""}`, ok: battery.level > 15 || battery.charging });

  return (
    <section className="widget" aria-label="System status">
      <header className="w-head">
        <span>DIAGNOSTICS</span>
        <span className="w-code">SYS.03</span>
      </header>
      <ul className="sys">
        {rows.map((r) => (
          <li key={r.label}>
            <span className={`dot ${r.ok === null ? "pending" : r.ok ? "ok" : "warn"}`} aria-hidden="true" />
            <span className="sys-l">{r.label}</span>
            <span className="sys-v">{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
