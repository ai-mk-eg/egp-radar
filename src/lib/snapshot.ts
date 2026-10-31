import { getDb, getSetting } from "./db";
import { BANKS } from "./sources/adapters/bank";
import { FRED_SERIES } from "./sources/adapters/reference";
import { marketStatus, cairoDate, addDays } from "./time";
import { nextSession, syntheticDxy, type DailyRow, type NextSessionForecast } from "./engine/daily";
import { currentRadar, buildEpisodes, leaderboard, type Change } from "./engine/radar";
import { intradayForecasts } from "./engine/intraday";
import { median } from "./engine/stats";

export type Settings = { thetaPct: number; sensitivity: "low" | "medium" | "high"; priceMoveAlertEgp: number; dispersionAlertEgp: number; channels: { telegram: boolean; email: boolean; browser: boolean }; minSeverity: "info" | "warning" | "critical"; cooldownMin: number; sessionReminderMin: number };
export const DEFAULT_SETTINGS: Settings = { thetaPct: 0.1, sensitivity: "medium", priceMoveAlertEgp: 0.25, dispersionAlertEgp: 0.3, channels: { telegram: true, email: false, browser: true }, minSeverity: "warning", cooldownMin: 60, sessionReminderMin: 30 };

/** Effective settings = defaults ← DB (settings page) ← config/settings.json (editable on GitHub for the static deployment). */
export async function loadSettings(): Promise<Settings> {
  const fromDb = await getSetting<Settings>("settings", DEFAULT_SETTINGS);
  try {
    const fs = await import("node:fs");
    const f = (await import("node:path")).resolve(process.cwd(), "config/settings.json");
    if (fs.existsSync(f)) { const o = JSON.parse(fs.readFileSync(f, "utf8")); delete o._note; return { ...fromDb, ...o, channels: { ...fromDb.channels, ...(o.channels || {}) } }; }
  } catch (e) { console.error("[settings] config/settings.json ignored:", (e as Error).message); }
  return fromDb;
}

let forecastCache: { key: string; value: ReturnType<typeof nextSession> } | null = null;

export async function loadDaily(): Promise<DailyRow[]> {
  const db = await getDb();
  return (await db.all("SELECT * FROM daily_fx ORDER BY date")) as DailyRow[];
}

export async function getNextSession(theta: number) {
  const rows = await loadDaily();
  const key = `${rows.at(-1)?.date}|${rows.length}|${theta}|${cairoDate()}`;
  if (forecastCache?.key !== key) forecastCache = { key, value: nextSession(rows, theta, cairoDate()) };
  return forecastCache.value;
}

export async function buildSnapshot() {
  const db = await getDb();
  const now = new Date();
  const settings = await loadSettings();
  const market = marketStatus(now);
  const sources = await db.all("SELECT * FROM sources ORDER BY kind, id");
  const srcById = Object.fromEntries(sources.map((s) => [s.id, s]));

  // ---- bank quotes ----
  const latest = await db.all(`SELECT q.* FROM quotes q JOIN (SELECT entity, MAX(first_seen_at) m FROM quotes WHERE source_id LIKE 'bank:%' GROUP BY entity) l
     ON q.entity = l.entity AND q.first_seen_at = l.m WHERE q.source_id LIKE 'bank:%'`);
  const todayStart = new Date(`${market.cairoDate}T00:00:00+02:00`).toISOString();
  const banks = await Promise.all(BANKS.map(async (b) => {
    const q = latest.find((x) => x.entity === b.id);
    const src = srcById[`bank:${b.id}`];
    const prevDay = q ? await db.get("SELECT buy, sell, mid FROM quotes WHERE entity=? AND first_seen_at < ? ORDER BY first_seen_at DESC LIMIT 1", [b.id, todayStart]) : null;
    const ageMin = q ? (now.getTime() - new Date(q.last_seen_at).getTime()) / 60000 : null;
    const pollMin = (src?.poll_seconds ?? 300) / 60;
    const fresh = ageMin !== null && ageMin <= Math.max(3 * pollMin, 20) && !src?.last_error;
    const dBuy = q && prevDay ? q.buy - prevDay.buy : null;
    const dSell = q && prevDay ? q.sell - prevDay.sell : null;
    return {
      id: b.id, name_ar: b.name_ar, name_en: b.name_en, official: Boolean((b as any).official),
      buy: q?.buy ?? null, sell: q?.sell ?? null, changedAt: q?.first_seen_at ?? null, lastSeenAt: q?.last_seen_at ?? null,
      fresh, ageMin, verified: Boolean(src?.verified), error: src?.last_error ?? null,
      vsPrevDay: dBuy === null ? null : { dBuy, dSell, direction: Math.sign(Math.round(dBuy * 100)) },
    };
  }));
  const freshBanks = banks.filter((b) => b.fresh && b.buy);

  // ---- reference & headline ----
  const daily = await loadDaily();
  const lastDaily = daily.at(-1), prevDaily = daily.at(-2);
  const erapi = await db.get("SELECT * FROM quotes WHERE entity='REF_ERAPI' ORDER BY first_seen_at DESC LIMIT 1");
  const cbe = banks.find((b) => b.id === "CBE" && b.fresh);
  let headline: { buy: number | null; sell: number | null; mid: number | null; source: string; dataClass: string; asOf: string | null };
  if (cbe) headline = { buy: cbe.buy, sell: cbe.sell, mid: (cbe.buy! + cbe.sell!) / 2, source: "CBE", dataClass: "polled", asOf: cbe.lastSeenAt };
  else if (freshBanks.length >= 2) {
    const b = median(freshBanks.map((x) => x.buy!)), s = median(freshBanks.map((x) => x.sell!));
    headline = { buy: b, sell: s, mid: (b + s) / 2, source: `median of ${freshBanks.length} banks`, dataClass: "polled", asOf: freshBanks.map((x) => x.lastSeenAt!).sort().at(-1)! };
  } else headline = { buy: null, sell: null, mid: lastDaily?.egp ?? null, source: "currency-api daily reference (not a bank price)", dataClass: "daily", asOf: lastDaily ? `${lastDaily.date}T00:00:00Z` : null };

  const dispersion = freshBanks.length >= 3 ? { sellRange: Math.max(...freshBanks.map((b) => b.sell!)) - Math.min(...freshBanks.map((b) => b.sell!)), n: freshBanks.length } : null;

  // ---- radar ----
  const since = new Date(now.getTime() - 90 * 86400000).toISOString();
  const changes = (await db.all("SELECT * FROM price_changes WHERE detected_at >= ? ORDER BY detected_at", [since])) as Change[];
  const radar = currentRadar(changes, freshBanks.map((b) => b.id), now);
  const episodes = buildEpisodes(changes);
  const leaders = leaderboard(episodes, BANKS.map((b) => b.id));
  const firstToday = changes.filter((c) => c.detected_at >= todayStart && c.direction !== 0)[0] ?? null;

  // ---- forecasts ----
  const ns = await getNextSession(settings.thetaPct);
  const anchorEntity = banks.find((b) => b.id === "CBE" && b.verified) ? "CBE" : "NBE";
  const anchorQ = await db.all("SELECT mid, first_seen_at FROM quotes WHERE entity=? ORDER BY first_seen_at", [anchorEntity]);
  const intraday = intradayForecasts(anchorQ.map((q) => ({ t: new Date(q.first_seen_at).getTime(), mid: q.mid })), now.getTime());

  // ---- indicators ----
  const ind: any[] = [];
  if (lastDaily && prevDaily && daily.length > 6) {
    const d5 = daily.at(-6)!;
    const pct = (a: number, b: number) => 100 * (a / b - 1);
    ind.push({ key: "dxy", ar: "مؤشر الدولار (محسوب من معادلة ICE)", en: "Synthetic DXY (ICE formula)", value: syntheticDxy(lastDaily), ch1: pct(syntheticDxy(lastDaily), syntheticDxy(prevDaily)), ch5: pct(syntheticDxy(lastDaily), syntheticDxy(d5)), date: lastDaily.date, cls: "daily" });
    ind.push({ key: "gold", ar: "الذهب (دولار/أوقية)", en: "Gold (USD/oz)", value: 1 / lastDaily.xau, ch1: pct(1 / lastDaily.xau, 1 / prevDaily.xau), ch5: pct(1 / lastDaily.xau, 1 / d5.xau), date: lastDaily.date, cls: "daily" });
    for (const [k, ar] of [["try_", "الليرة التركية"], ["zar", "الراند الجنوب أفريقي"], ["ngn", "النايرا النيجيرية"]] as const)
      ind.push({ key: k, ar: `دولار/${ar}`, en: `USD/${k.replace("_", "").toUpperCase()}`, value: (lastDaily as any)[k], ch1: pct((lastDaily as any)[k], (prevDaily as any)[k]), ch5: pct((lastDaily as any)[k], (d5 as any)[k]), date: lastDaily.date, cls: "daily" });
  }
  for (const [sid, names] of Object.entries(FRED_SERIES)) {
    const r = await db.all("SELECT date, value FROM macro WHERE series_id=? AND value IS NOT NULL ORDER BY date DESC LIMIT 6", [sid]);
    if (r.length) ind.push({ key: sid, ar: names.ar, en: names.en, value: r[0].value, ch1: r[1] ? r[0].value - r[1].value : null, ch5: r[5] ? r[0].value - r[5].value : null, date: r[0].date, cls: "delayed", chUnit: "abs" });
  }

  // ---- news ----
  const news = await db.all("SELECT * FROM news WHERE label IS NOT NULL ORDER BY published_at DESC LIMIT 25");
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const recentNews = news.filter((n) => (n.published_at ?? "") >= dayAgo && (n.relevance ?? 0) >= 0.4);
  const newsPressure = { up: recentNews.filter((n) => n.label === "usd_up_pressure").length, down: recentNews.filter((n) => n.label === "usd_down_pressure").length, n: recentNews.length };

  // ---- signal fusion: count INDEPENDENT signals and their agreement (no synthetic probability) ----
  const signals: { key: string; ar: string; en: string; direction: number; strength: string; detail: string }[] = [];
  if (radar.active) signals.push({ key: "radar", ar: "حركة بنوك فعلية جارية", en: "Live multi-bank move", direction: radar.active.direction, strength: radar.clusterStrength?.strength ?? "insufficient", detail: radar.movers.join(", ") });
  if (ns.status === "ok") { const f = ns as NextSessionForecast; if (f.showProbabilities && f.direction !== "flat") signals.push({ key: "model", ar: "النموذج الإحصائي للجلسة القادمة", en: "Next-session model", direction: f.direction === "up" ? 1 : -1, strength: f.evidence, detail: f.model }); }
  if (newsPressure.n >= 2 && newsPressure.up !== newsPressure.down) signals.push({ key: "news", ar: "ضغط الأخبار (24 ساعة)", en: "News pressure (24h)", direction: newsPressure.up > newsPressure.down ? 1 : -1, strength: "weak", detail: `${newsPressure.up}↑ / ${newsPressure.down}↓` });
  const em = ind.filter((i) => ["try_", "zar"].includes(i.key));
  if (em.length === 2 && Math.sign(em[0].ch1) === Math.sign(em[1].ch1) && Math.abs(em[0].ch1) + Math.abs(em[1].ch1) > 1)
    signals.push({ key: "em", ar: "حركة عملات ناشئة مماثلة", en: "EM FX moving together", direction: Math.sign(em[0].ch1), strength: "weak", detail: "TRY & ZAR" });
  const ups = signals.filter((s) => s.direction > 0).length, downs = signals.filter((s) => s.direction < 0).length;
  const fusion = { signals, agreeing: Math.max(ups, downs), conflicting: Math.min(ups, downs), direction: ups > downs ? 1 : downs > ups ? -1 : 0 };

  const alerts = await db.all("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 30");
  const tracker = await db.all("SELECT * FROM forecasts ORDER BY target_time DESC LIMIT 30");

  return {
    generatedAt: now.toISOString(), market, settings: { ...settings }, headline, banks, dispersion,
    reference: {
      daily: lastDaily ? { date: lastDaily.date, marketDay: addDays(lastDaily.date, -1), egp: lastDaily.egp, change: prevDaily ? lastDaily.egp - prevDaily.egp : null } : null,
      erapi: erapi ? { mid: erapi.mid, asOf: erapi.source_time } : null,
    },
    radar, leaders, episodesCount: episodes.length, firstMoverToday: firstToday,
    forecast: { nextSession: ns, intraday, anchorEntity },
    indicators: ind, news, newsPressure, fusion, alerts, tracker,
    health: sources.map((s): Record<string, any> => ({ ...s, ageMin: s.last_success_at ? (now.getTime() - new Date(s.last_success_at).getTime()) / 60000 : null })),
  };
}
export type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>;
