"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { describe, hhmm, type Weather } from "@/lib/weather";
import { I, WeatherIcon } from "./Icons";
import type { Sys } from "./Widgets";

const pad = (n: number) => String(n).padStart(2, "0");

/* ---------------- Sparkline ---------------- */
export function Sparkline({ values, height = 54 }: { values: number[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  const W = 300;
  const pts = values.length > 1 ? values : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, height - 6 - ((v - min) / span) * (height - 14)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={`url(#sg${id})`} />
      <path d={line} fill="none" stroke="var(--glow)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3.5" fill="#fff" />
    </svg>
  );
}

/* ---------------- Glass module card ---------------- */
export function GlassModule({
  code,
  side,
  status = "ONLINE",
  chip,
  children,
  label,
}: {
  code: string;
  side: "left" | "center" | "right";
  status?: string;
  chip?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className={`gm gm-${side}`} aria-label={label}>
      <span className="gm-pane" aria-hidden="true" />
      {side === "center" && (
        <span className="gm-brackets" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <div className="gm-card">
        <header className="gm-head">
          <span className="gm-code">{code}</span>
          <span className="gm-status">
            <span className="gm-dot" aria-hidden="true" />
            {status}
          </span>
        </header>
        {chip && <span className="gm-chip">{chip}</span>}
        {children}
      </div>
    </section>
  );
}

/* ---------------- M-01 Weather ---------------- */
export function WeatherModule({ weather, status, precise, onLocate }: { weather: Weather | null; status: string; precise: boolean; onLocate: () => void }) {
  const now = weather ? describe(weather.current.code, weather.current.isDay) : null;
  const today = weather?.daily[0];
  const temps = weather ? [weather.current.temp, ...weather.hourly.map((h) => h.temp)] : [];
  return (
    <GlassModule code="M-01" side="left" label="Weather" status={weather ? "LIVE" : status === "error" ? "OFFLINE" : "SYNCING"} chip={weather?.location?.toUpperCase() || "LOCATING"}>
      <div className="gm-icon">{now ? <WeatherIcon icon={now.icon} size={58} /> : <I.locate />}</div>
      <h2 className="gm-title">WEATHER</h2>
      <p className="gm-sub">
        {weather && now
          ? `${weather.current.temp}°C · ${now.label} · feels ${weather.current.feels}° · wind ${weather.current.wind} km/h`
          : status === "error"
            ? "Weather feed offline. Retrying shortly."
            : "Acquiring local conditions…"}
      </p>
      <p className="gm-label">TELEMETRY · NEXT HOURS</p>
      <Sparkline values={temps} />
      <div className="gm-stats">
        <div>
          <span>HIGH</span>
          <strong>{today ? `${today.max}°` : "--"}</strong>
        </div>
        <div>
          <span>LOW</span>
          <strong>{today ? `${today.min}°` : "--"}</strong>
        </div>
        <div>
          <span>RAIN</span>
          <strong className="hot">{today ? `${today.rain}%` : "--"}</strong>
        </div>
      </div>
      <footer className="gm-foot">
        <span>{today ? `SUN ${hhmm(today.sunrise)} / ${hhmm(today.sunset)}` : "WEATHER FEED"}</span>
        {!precise && (
          <button type="button" className="gm-link" onClick={onLocate}>
            LOCATE ME
          </button>
        )}
      </footer>
    </GlassModule>
  );
}

/* ---------------- M-03 Systems ---------------- */
export function SystemsModule({ sys, latencies, wake, wakeSupported }: { sys: Sys; latencies: number[]; wake: boolean; wakeSupported: boolean }) {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    (navigator as any).getBattery?.()
      .then((b: any) => {
        const u = () => setBattery({ level: Math.round(b.level * 100), charging: b.charging });
        u();
        b.addEventListener("levelchange", u);
        b.addEventListener("chargingchange", u);
      })
      .catch(() => {});
  }, []);
  const checks = [sys.core, sys.voice !== null, sys.memory !== null, sys.search, wakeSupported];
  const up = checks.filter(Boolean).length;
  return (
    <GlassModule code="M-03" side="right" label="Systems" status={sys.core === false ? "DEGRADED" : "ONLINE"} chip={wake ? "WAKE WORD ARMED" : "STANDBY"}>
      <div className="gm-icon">
        <svg viewBox="0 0 24 24" width="58" height="58" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <rect x="4" y="3" width="16" height="5" rx="1.5" />
          <rect x="4" y="9.5" width="16" height="5" rx="1.5" />
          <rect x="4" y="16" width="16" height="5" rx="1.5" />
        </svg>
      </div>
      <h2 className="gm-title">SYSTEMS</h2>
      <p className="gm-sub">
        Voice {sys.voice === "premium" ? "neural" : "standard"} · memory {sys.memory === "cloud" ? "cloud sync" : "on device"} · web search {sys.search ? "on" : "off"}
        {battery ? ` · power ${battery.level}%${battery.charging ? " charging" : ""}` : ""}
      </p>
      <p className="gm-label">TELEMETRY · UPLINK LATENCY</p>
      <Sparkline values={latencies.length ? latencies : [0, 0]} />
      <div className="gm-stats">
        <div>
          <span>MODULES</span>
          <strong>
            {up}/{checks.length}
          </strong>
        </div>
        <div>
          <span>LATENCY</span>
          <strong className="hot">{sys.latency != null ? `${sys.latency}ms` : "--"}</strong>
        </div>
      </div>
      <footer className="gm-foot">
        <span>CORE {sys.core === null ? "CHECKING" : sys.core ? "NOMINAL" : "OFFLINE"} · LIVE</span>
      </footer>
    </GlassModule>
  );
}

/* ---------------- HUD panels (desktop corners) ---------------- */
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function HudClock() {
  const now = useNow();
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <aside className="hud hud-tr" aria-label="Clock">
      <span className="hud-time">{now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--"}</span>
      <span className="hud-row">
        <span>DATE</span>
        <span>{now ? now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase() : "--"}</span>
      </span>
      <span className="hud-row">
        <span>ZONE</span>
        <span>{tz.split("/").pop()?.replace(/_/g, " ").toUpperCase()}</span>
      </span>
      <span className="hud-row">
        <span>SEC</span>
        <span>{now ? pad(now.getSeconds()) : "--"}</span>
      </span>
    </aside>
  );
}

export function HudStatus({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <aside className="hud hud-tl" aria-label="Status">
      {rows.map(([k, v, warn]) => (
        <span key={k} className="hud-row">
          <span>{k}</span>
          <span className={warn ? "warn" : ""}>{v}</span>
        </span>
      ))}
    </aside>
  );
}

export type LogLine = { t: string; m: string };
export function HudLog({ lines }: { lines: LogLine[] }) {
  return (
    <aside className="hud hud-bl" aria-label="System log">
      <span className="hud-title">SYSTEM LOG</span>
      <ol>
        {lines.slice(-6).map((l, i) => (
          <li key={i}>
            <span>{l.t}</span> {l.m}
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function HudMeter() {
  return (
    <aside className="hud hud-br" aria-label="Voice level">
      <span className="hud-title">VOICE</span>
      <span className="meter" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i % 6) * 0.08}s` }} />
        ))}
      </span>
    </aside>
  );
}
