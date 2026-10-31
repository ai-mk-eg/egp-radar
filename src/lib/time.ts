import holidaysFile from "../../config/holidays-eg.json";

export const TZ = "Africa/Cairo";

/** Parts of a Date in Cairo local time (DST-aware via ICU). */
export function cairoParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: wd };
}

export function cairoDate(d: Date = new Date()) { return cairoParts(d).date; }

export function formatCairo(iso: string | null | undefined, lang: "ar" | "en" = "ar") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
    timeZone: TZ, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));
}

type Holiday = { date: string; name_ar: string; name_en: string; verified: boolean };
const holidays: Holiday[] = holidaysFile.holidays;
const weekend = new Set<number>(holidaysFile.weekend);
const [openH, openM] = holidaysFile.session.open.split(":").map(Number);
const [closeH, closeM] = holidaysFile.session.close.split(":").map(Number);

export function holidayOn(date: string) { return holidays.find((h) => h.date === date) || null; }

/** Weekday index (0=Sun) for a YYYY-MM-DD calendar date. */
export function weekdayOf(date: string) { return new Date(date + "T12:00:00Z").getUTCDay(); }

export function isBusinessDay(date: string) { return !weekend.has(weekdayOf(date)) && !holidayOn(date); }

export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export function nextBusinessDay(date: string) { let d = addDays(date, 1); while (!isBusinessDay(d)) d = addDays(d, 1); return d; }

export type MarketStatus = {
  state: "open" | "pre_open" | "closed_after" | "weekend" | "holiday";
  cairoDate: string; holiday: Holiday | null; nextSessionDate: string; minutesToOpen: number | null;
};

/** Egyptian bank session status. Cairo-local; holidays from config/holidays-eg.json. */
export function marketStatus(now: Date = new Date()): MarketStatus {
  const p = cairoParts(now);
  const mins = p.hour * 60 + p.minute;
  const open = openH * 60 + openM, close = closeH * 60 + closeM;
  const hol = holidayOn(p.date);
  const biz = isBusinessDay(p.date);
  let state: MarketStatus["state"];
  if (hol) state = "holiday";
  else if (!biz) state = "weekend";
  else if (mins < open) state = "pre_open";
  else if (mins < close) state = "open";
  else state = "closed_after";
  const nextSessionDate = state === "open" || state === "pre_open" ? p.date : nextBusinessDay(p.date);
  let minutesToOpen: number | null = null;
  if (state === "pre_open") minutesToOpen = open - mins;
  else if (state !== "open") {
    let days = 0; let d = p.date; while (d !== nextSessionDate) { d = addDays(d, 1); days++; }
    minutesToOpen = days * 1440 - mins + open;
  }
  return { state, cairoDate: p.date, holiday: hol, nextSessionDate, minutesToOpen };
}

export function isWithinSession(d: Date) {
  const p = cairoParts(d);
  if (!isBusinessDay(p.date)) return false;
  const m = p.hour * 60 + p.minute;
  return m >= openH * 60 + openM && m < closeH * 60 + closeM;
}
