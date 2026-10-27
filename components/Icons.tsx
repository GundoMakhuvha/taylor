import type { WxIcon } from "@/lib/weather";

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  viewBox: "0 0 24 24",
};

export const I = {
  home: () => (
    <svg {...base}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  history: () => (
    <svg {...base}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </svg>
  ),
  plus: () => (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  ear: () => (
    <svg {...base}>
      <path d="M6 9a6 6 0 1 1 12 0c0 3-2 4-3 5.5S14 18 12.5 19.5 8 20 8 17" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3" />
    </svg>
  ),
  earOff: () => (
    <svg {...base}>
      <path d="M6 9a6 6 0 0 1 10.3-4.2M18 9c0 3-2 4-3 5.5S14 18 12.5 19.5 8 20 8 17" />
      <path d="m3 3 18 18" />
    </svg>
  ),
  speaker: () => (
    <svg {...base}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  mute: () => (
    <svg {...base}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </svg>
  ),
  user: () => (
    <svg {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  mic: () => (
    <svg {...base}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  send: () => (
    <svg {...base} strokeWidth={2}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  stop: () => (
    <svg {...base}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  close: () => (
    <svg {...base}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  trash: () => (
    <svg {...base}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  pin: () => (
    <svg {...base}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  locate: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  sunrise: () => (
    <svg {...base}>
      <path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M9.5 6.5 12 4l2.5 2.5M4.9 12.9l1.4 1.4M19.1 12.9l-1.4 1.4" />
    </svg>
  ),
  sunset: () => (
    <svg {...base}>
      <path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M9.5 5.5 12 8l2.5-2.5M4.9 12.9l1.4 1.4M19.1 12.9l-1.4 1.4" />
    </svg>
  ),
  drop: () => (
    <svg {...base}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  ),
  wind: () => (
    <svg {...base}>
      <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3" />
    </svg>
  ),
  bolt: () => (
    <svg {...base}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  out: () => (
    <svg {...base}>
      <path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
};

export function WeatherIcon({ icon, size = 24 }: { icon: WxIcon; size?: number }) {
  const s = { ...base, width: size, height: size };
  const cloud = <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18Z" />;
  switch (icon) {
    case "sun":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg {...s}>
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      );
    case "partly":
      return (
        <svg {...s}>
          <path d="M8 3v1.5M3.5 8H2M4.4 4.4l1 1M12.5 5.5a4 4 0 0 0-7 3" />
          <path d="M9 20h8a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 9 20Z" />
        </svg>
      );
    case "partly-night":
      return (
        <svg {...s}>
          <path d="M12 6.5A4.5 4.5 0 0 1 6 11a4.5 4.5 0 0 0 4-8 4.5 4.5 0 0 0 2 3.5Z" />
          <path d="M9 20h8a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 9 20Z" />
        </svg>
      );
    case "fog":
      return (
        <svg {...s}>
          <path d="M4 10h16M3 14h18M5 18h14" />
        </svg>
      );
    case "drizzle":
      return (
        <svg {...s}>
          {cloud}
          <path d="M9 21v.5M13 21v.5" transform="translate(0 -1)" />
        </svg>
      );
    case "rain":
      return (
        <svg {...s}>
          <path d="M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15Z" />
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
        </svg>
      );
    case "storm":
      return (
        <svg {...s}>
          <path d="M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15Z" />
          <path d="m12 16-2 3h3l-2 3" />
        </svg>
      );
    case "snow":
      return (
        <svg {...s}>
          <path d="M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15Z" />
          <path d="M8 19h.01M12 20h.01M16 19h.01" />
        </svg>
      );
    default:
      return <svg {...s}>{cloud}</svg>;
  }
}
