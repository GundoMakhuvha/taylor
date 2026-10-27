// Seasonal themes + daily content pillars for Capvtal's social posts (South African calendar + global moments).

export type Motif = "snow" | "pumpkin" | "hearts" | "confetti" | "rings" | "leaves" | "sun" | "stripes";
export type Theme = {
  key: string;
  name: string; // shown as the tag on the image
  mood: string; // guidance for the copywriter
  motif: Motif;
  palette: { bg1: string; bg2: string; accent: string; accent2: string };
  isDay: boolean; // true on the day itself
};

const md = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate(); // e.g. 31 Oct → 1031

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const nthWeekday = (y: number, month0: number, weekday: number, n: number) => {
  const d = new Date(y, month0, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (n - 1));
  return d;
};
const daysBetween = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);

const P = {
  christmas: { bg1: "#0b2a1c", bg2: "#05110c", accent: "#ff4d5a", accent2: "#ffd479" },
  halloween: { bg1: "#1a0d24", bg2: "#07040b", accent: "#ff8a1f", accent2: "#b48cff" },
  love: { bg1: "#2a0b18", bg2: "#0d0408", accent: "#ff5c8a", accent2: "#ffc2d4" },
  sa: { bg1: "#0b2a1c", bg2: "#06100b", accent: "#ffb81c", accent2: "#3a9bff" },
  newyear: { bg1: "#14112e", bg2: "#05040f", accent: "#ffd479", accent2: "#5fe3ff" },
  spring: { bg1: "#0e2a24", bg2: "#05100e", accent: "#7cffb2", accent2: "#ff9ad5" },
  women: { bg1: "#24102e", bg2: "#0b0510", accent: "#d68cff", accent2: "#ffd479" },
  blackfriday: { bg1: "#111111", bg2: "#000000", accent: "#ffd400", accent2: "#ffffff" },
  brand: { bg1: "#0e1a2e", bg2: "#05080f", accent: "#5fe3ff", accent2: "#b8f3ff" },
};

export function themeFor(date: Date): Theme {
  const y = date.getFullYear();
  const v = md(date);
  const t = (key: string, name: string, mood: string, motif: Motif, palette: Theme["palette"], isDay = false): Theme => ({ key, name, mood, motif, palette, isDay });

  const e = easter(y);
  const toEaster = daysBetween(date, e);
  if (toEaster >= -2 && toEaster <= 1) return t("easter", toEaster === -2 ? "Good Friday" : "Happy Easter", "Easter long weekend: rest, family, recharge; warm and respectful", "leaves", P.spring, true);

  const blackFriday = nthWeekday(y, 10, 4, 4);
  blackFriday.setDate(blackFriday.getDate() + 1);
  const toBF = daysBetween(date, blackFriday);
  if (toBF >= -4 && toBF <= 0) return t("blackfriday", "Black Friday", "Black Friday hype: bold, urgent energy; invite businesses to get online before the festive rush (no invented discounts)", "stripes", P.blackfriday, toBF === 0);

  const mothers = nthWeekday(y, 4, 0, 2);
  if (daysBetween(date, mothers) >= -2 && daysBetween(date, mothers) <= 0) return t("mothers", "Happy Mother's Day", "celebrate mothers and the women building businesses", "hearts", P.love, daysBetween(date, mothers) === 0);
  const fathers = nthWeekday(y, 5, 0, 3);
  if (daysBetween(date, fathers) >= -2 && daysBetween(date, fathers) <= 0) return t("fathers", "Happy Father's Day", "celebrate fathers, mentors and builders", "rings", P.brand, daysBetween(date, fathers) === 0);

  if (v >= 1226 || v <= 105) return t("newyear", v >= 1231 || v <= 101 ? "Happy New Year" : "New Year, New Goals", "fresh starts, goals for the year, 'new year, new website'", "confetti", P.newyear, v === 101);
  if (v >= 1215 && v <= 1216) return t("reconciliation", "Day of Reconciliation", "unity, building together", "rings", P.sa, v === 1216);
  if (v >= 1201 && v <= 1225) return t("christmas", v >= 1224 ? "Merry Christmas" : "Festive Season", "festive, warm, gratitude to clients; South African summer Christmas (braais, beach)", "snow", P.christmas, v === 1225);
  if (v >= 1024 && v <= 1031) return t("halloween", "Happy Halloween", "playful spooky fun: 'don't let a scary website haunt your business'", "pumpkin", P.halloween, v === 1031);
  if (v >= 920 && v <= 924) return t("heritage", "Happy Heritage Day", "Heritage Day / Braai Day: pride in South African culture and creativity", "sun", P.sa, v === 924);
  if (v >= 901 && v <= 907) return t("spring", "Spring Day", "SA spring: fresh starts, growth, refresh your brand", "leaves", P.spring, v === 901);
  if (v >= 801 && v <= 831) return t("women", v === 809 ? "Happy Women's Day" : "Women's Month", "Women's Month: celebrate South African women in business and tech", "hearts", P.women, v === 809);
  if (v >= 715 && v <= 718) return t("mandela", "Mandela Day", "67 minutes of service, giving back, ubuntu", "rings", P.sa, v === 718);
  if (v >= 601 && v <= 630) return t("youth", v === 616 ? "Youth Day" : "Youth Month", "Youth Month: young South African founders, skills, opportunity", "sun", P.sa, v === 616);
  if (v >= 428 && v <= 501) return t("workers", "Workers' Day", "honour the hustle and hard work behind every business", "stripes", P.brand, v === 501);
  if (v >= 424 && v <= 427) return t("freedom", "Freedom Day", "freedom, democracy, the freedom to build your own business", "sun", P.sa, v === 427);
  if (v >= 318 && v <= 321) return t("humanrights", "Human Rights Day", "dignity, equal access to opportunity and technology", "rings", P.sa, v === 321);
  if (v >= 207 && v <= 214) return t("valentines", "Valentine's Day", "love your brand / fall in love with your website; playful", "hearts", P.love, v === 214);

  // South African seasons as the default mood.
  const m = date.getMonth() + 1;
  const season = m === 12 || m <= 2 ? "summer" : m <= 5 ? "autumn" : m <= 8 ? "winter" : "spring";
  return t(`season-${season}`, "", `${season} in South Africa`, "rings", P.brand, false);
}

const SERVICES = [
  "custom software development",
  "website development",
  "mobile apps",
  "Power BI dashboards and data reporting",
  "domains, hosting and professional email",
  "logo design and branding",
  "content creation",
  "digital marketing and social media",
  "SEO",
];

/** Weekly content rhythm. */
export function pillarFor(date: Date): { key: string; label: string; brief: string } {
  const week = Math.floor(date.getTime() / (7 * 86400000));
  const service = SERVICES[week % SERVICES.length];
  switch (date.getDay()) {
    case 1:
      return { key: "motivation", label: "MONDAY MOTIVATION", brief: "an energising, practical motivation post for South African entrepreneurs and small businesses" };
    case 2:
      return { key: "service", label: "SERVICE SPOTLIGHT", brief: `spotlight on Capvtal's ${service}: the problem it solves and who it's for` };
    case 3:
      return { key: "tip", label: "TECH TIP", brief: "one genuinely useful, specific tech or digital tip a small business can apply today" };
    case 4:
      return { key: "online", label: "GET ONLINE", brief: "why a business without a website is losing customers, with one concrete stat-free argument and a soft invitation to chat to Capvtal" };
    case 5:
      return { key: "fun", label: "FRIDAY FEELS", brief: "a fun, light, shareable post (a relatable small-business moment or a witty observation)" };
    case 6:
      return { key: "brand", label: "BRAND TIP", brief: "a branding or design tip (logos, colours, consistency, content)" };
    default:
      return { key: "inspire", label: "NEXT GENERATION INNOVATION", brief: "an inspiring Sunday thought about innovation, technology and the week ahead" };
  }
}
