/**
 * Smart alerts. Every alert stores: time, triggering data, sources, strength, severity and data freshness.
 * Anti-spam: dedupe_key (UNIQUE) + per-rule cooldown + sensitivity scaling + min severity per external channel.
 */
import { getDb } from "../db";
import type { Snapshot, Settings } from "../snapshot";
import { sendEmail, sendTelegram } from "./dispatch";
import { bankName } from "../sources/adapters/bank";

type Sev = "info" | "warning" | "critical";
type Candidate = { rule: string; severity: Sev; strength?: string; title_ar: string; title_en: string; body_ar: string; body_en: string; data: unknown; sources: string[]; freshness: unknown; dedupe: string };

const SENS = { low: 1.5, medium: 1, high: 0.6 } as const;
const sevRank = { info: 0, warning: 1, critical: 2 } as const;
const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d));

export function evaluateRules(s: Snapshot, st: Settings): Candidate[] {
  const out: Candidate[] = [];
  const k = SENS[st.sensitivity];
  const freshness = { headlineAsOf: s.headline.asOf, headlineClass: s.headline.dataClass, freshBanks: s.banks.filter((b) => b.fresh).length };
  const hour = s.generatedAt.slice(0, 13);

  // 1) Price move vs previous day (per bank, polled data only)
  for (const b of s.banks) {
    if (!b.fresh || !b.vsPrevDay) continue;
    if (Math.abs(b.vsPrevDay.dBuy) >= st.priceMoveAlertEgp * k) {
      const up = b.vsPrevDay.dBuy > 0;
      out.push({ rule: "price_move", severity: Math.abs(b.vsPrevDay.dBuy) >= 2 * st.priceMoveAlertEgp ? "critical" : "warning",
        title_ar: `${b.name_ar}: الدولار ${up ? "ارتفع" : "انخفض"} ${fmt(Math.abs(b.vsPrevDay.dBuy))} جنيه (حركة فعلية)`,
        title_en: `${b.name_en}: USD ${up ? "up" : "down"} ${fmt(Math.abs(b.vsPrevDay.dBuy))} EGP (actual move)`,
        body_ar: `شراء ${fmt(b.buy)} / بيع ${fmt(b.sell)} — مقارنة بآخر سعر في اليوم السابق. وقت الرصد: ${b.changedAt}`,
        body_en: `Buy ${fmt(b.buy)} / Sell ${fmt(b.sell)} vs previous day's last quote. Detected: ${b.changedAt}`,
        data: b, sources: [`bank:${b.id}`], freshness, dedupe: `price_move|${b.id}|${b.changedAt}` });
    }
  }
  // 2) Synchronized multi-bank move (radar)
  if (s.radar.active && s.radar.movers.length >= (st.sensitivity === "high" ? 2 : 3)) {
    const up = s.radar.active.direction > 0;
    const lag = s.radar.laggards.filter((l) => l.strength.strength !== "insufficient").slice(0, 3);
    out.push({ rule: "multi_bank", severity: s.radar.movers.length >= 4 ? "critical" : "warning", strength: s.radar.clusterStrength?.strength,
      title_ar: `${s.radar.movers.length} بنوك ${up ? "رفعت" : "خفضت"} سعر الدولار خلال ${s.radar.windowMin} دقيقة`,
      title_en: `${s.radar.movers.length} banks ${up ? "raised" : "cut"} USD price within ${s.radar.windowMin} min`,
      body_ar: `البنوك: ${s.radar.movers.map((m) => bankName(m, "ar")).join("، ")}. لم تتحرك بعد: ${lag.map((l) => `${bankName(l.entity, "ar")} (تاريخيًا تتبع ${Math.round(l.strength.p * 100)}% من ${l.strength.n} حالة)`).join("، ") || "—"}`,
      body_en: `Banks: ${s.radar.movers.join(", ")}. Not yet moved: ${lag.map((l) => `${l.entity} (historically followed ${Math.round(l.strength.p * 100)}% of ${l.strength.n})`).join(", ") || "—"}`,
      data: { movers: s.radar.movers, laggards: s.radar.laggards }, sources: s.radar.movers.map((m) => `bank:${m}`), freshness,
      dedupe: `multi_bank|${s.radar.active.start}|${s.radar.movers.length}` });
  }
  // 3) Unusual dispersion between banks
  if (s.dispersion && s.dispersion.sellRange >= st.dispersionAlertEgp * k)
    out.push({ rule: "dispersion", severity: "warning",
      title_ar: `فرق غير معتاد بين البنوك: ${fmt(s.dispersion.sellRange)} جنيه في سعر البيع`, title_en: `Unusual cross-bank gap: ${fmt(s.dispersion.sellRange)} EGP (sell)`,
      body_ar: `على ${s.dispersion.n} بنوك محدثة. الفروق لا تعني ربحًا مضمونًا (رسوم، حدود، توافر العملة).`, body_en: `Across ${s.dispersion.n} fresh banks. Gaps are not guaranteed profit (fees, limits, availability).`,
      data: s.dispersion, sources: s.banks.filter((b) => b.fresh).map((b) => `bank:${b.id}`), freshness, dedupe: `dispersion|${hour}` });
  // 4) Strong fused signal (≥ 2 independent agreeing signals, none conflicting)
  if (s.fusion.agreeing >= 2 && s.fusion.conflicting === 0)
    out.push({ rule: "fused", severity: "warning", strength: s.fusion.agreeing >= 3 ? "moderate" : "weak",
      title_ar: `${s.fusion.agreeing} مؤشرات مستقلة تتفق على ${s.fusion.direction > 0 ? "صعود" : "هبوط"} الدولار`, title_en: `${s.fusion.agreeing} independent signals agree: USD ${s.fusion.direction > 0 ? "up" : "down"}`,
      body_ar: s.fusion.signals.map((x) => `• ${x.ar} (${x.strength})`).join("\n"), body_en: s.fusion.signals.map((x) => `• ${x.en} (${x.strength})`).join("\n"),
      data: s.fusion, sources: s.fusion.signals.map((x) => x.key), freshness, dedupe: `fused|${s.fusion.direction}|${hour}` });
  // 5) Forecast change for next session
  const ns: any = s.forecast.nextSession;
  if (ns.status === "ok" && ns.showProbabilities)
    out.push({ rule: "forecast", severity: "info", strength: ns.evidence,
      title_ar: `توقع الجلسة القادمة: ${ns.direction === "up" ? "صعود الدولار" : ns.direction === "down" ? "هبوط الدولار" : "استقرار"}`,
      title_en: `Next-session outlook: ${ns.direction}`, body_ar: `نموذج ${ns.model} — قوة الأدلة: ${ns.evidence}`, body_en: `Model ${ns.model} — evidence: ${ns.evidence}`,
      data: { probs: ns.probs, direction: ns.direction }, sources: ["ref:currency-api"], freshness, dedupe: `forecast|${ns.asOfSnapshot}|${ns.direction}` });
  // 6) Important news
  for (const n of s.news.slice(0, 10))
    if ((n.label === "usd_up_pressure" || n.label === "usd_down_pressure") && (n.relevance ?? 0) >= 0.7 * k)
      out.push({ rule: "news", severity: "info", title_ar: `خبر مؤثر: ${n.title}`, title_en: `Market-moving news: ${n.title}`,
        body_ar: `${n.reason ?? ""}\n${n.source} — ${n.published_at ?? ""}\n${n.url}`, body_en: `${n.label} — ${n.source} — ${n.published_at ?? ""}\n${n.url}`,
        data: n, sources: [n.source], freshness, dedupe: `news|${n.id}` });
  // 7) Session opening reminder
  if (s.market.state !== "open" && s.market.minutesToOpen !== null && s.market.minutesToOpen <= st.sessionReminderMin && s.market.minutesToOpen > 0)
    out.push({ rule: "session_open", severity: "info", title_ar: `الجلسة المصرفية تبدأ خلال ${s.market.minutesToOpen} دقيقة`, title_en: `Bank session opens in ${s.market.minutesToOpen} min`,
      body_ar: "راجع ماسح ما قبل الافتتاح في لوحة التحكم.", body_en: "Check the pre-open scanner on the dashboard.", data: s.market, sources: ["calendar"], freshness,
      dedupe: `session_open|${s.market.nextSessionDate}` });
  return out;
}

export async function processAlerts(s: Snapshot, st: Settings) {
  const db = await getDb();
  const created: Candidate[] = [];
  for (const c of evaluateRules(s, st)) {
    // cooldown per rule (except per-bank price moves and news which are keyed on unique events)
    if (!["price_move", "news", "session_open"].includes(c.rule)) {
      const recent = await db.get("SELECT created_at FROM alerts WHERE rule=? ORDER BY created_at DESC LIMIT 1", [c.rule]);
      if (recent && Date.now() - new Date(recent.created_at).getTime() < st.cooldownMin * 60000) continue;
    }
    const r = await db.run(
      `INSERT INTO alerts(created_at, rule, severity, strength, title_ar, title_en, body_ar, body_en, data_json, sources_json, freshness_json, dedupe_key)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`,
      [new Date().toISOString(), c.rule, c.severity, c.strength ?? null, c.title_ar, c.title_en, c.body_ar, c.body_en,
        JSON.stringify(c.data), JSON.stringify(c.sources), JSON.stringify(c.freshness), c.dedupe]);
    if (!r.changes) continue;
    created.push(c);
    const channels: string[] = [];
    if (sevRank[c.severity] >= sevRank[st.minSeverity]) {
      const msg = { title: c.title_ar, body: `${c.body_ar}\n\nالمصدر: ${c.sources.join(", ")}\nالأهمية: ${c.severity}${c.strength ? ` | قوة الإشارة: ${c.strength}` : ""}\nحداثة البيانات: ${JSON.stringify(c.freshness)}`, severity: c.severity };
      try { if (st.channels.telegram && (await sendTelegram(msg))) channels.push("telegram"); } catch (e) { console.error("[alerts] telegram", e); }
      try { if (st.channels.email && (await sendEmail(msg))) channels.push("email"); } catch (e) { console.error("[alerts] email", e); }
    }
    await db.run("UPDATE alerts SET channels=? WHERE dedupe_key=?", [channels.join(",") || "in-app", c.dedupe]);
  }
  return created.length;
}
