import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import type { Snapshot } from "./snapshot";
import { ruleAnswer } from "./shared/ruleAnswer";

const SYSTEM = `أنت "محلل EGP Radar" — محلل كمي لسعر الدولار مقابل الجنيه المصري.
قواعد صارمة:
1. أجب فقط من بيانات المنصة المرفقة (JSON). لا تستخدم أي سعر أو خبر من ذاكرتك.
2. اذكر دائمًا مصدر كل رقم ووقته، ونوع البيانات (polled = مسحوب دوريًا من موقع البنك، daily = سعر مرجعي يومي، delayed = منشور بتأخير). لا تصف أي بيانات بأنها "لحظية" إلا إذا كانت polled وحديثة.
3. فرّق بوضوح بين حركة حدثت فعلًا (radar / changes) وتوقع لم يحدث (forecast).
4. لا تخترع احتمالات. إذا كان showProbabilities=false أو status=insufficient قل صراحة إن النموذج لا يملك أفضلية مثبتة أو إن البيانات غير كافية، واذكر السبب ونتائج الاختبار التاريخي.
5. اتجاه الدولار: "صعود" = الدولار أغلى بالجنيه.
6. أجب بلغة السؤال (عربي مصري مفهوم أو إنجليزي)، باختصار ووضوح، ثم سطر "المصادر:".
7. لست مستشارًا ماليًا؛ لا تعطِ توصيات شراء/بيع.`;

/** Compact context: everything the analyst may cite, nothing it may not. */
export function analystContext(s: Snapshot) {
  const ns: any = s.forecast.nextSession;
  return {
    now: s.generatedAt, market: s.market, headline: s.headline, reference: s.reference,
    banks: s.banks.map((b) => ({ id: b.id, name: b.name_ar, buy: b.buy, sell: b.sell, changedAt: b.changedAt, lastSeenAt: b.lastSeenAt, fresh: b.fresh, vsPrevDay: b.vsPrevDay, error: b.error })),
    firstMoverToday: s.firstMoverToday, radar: { active: s.radar.active, movers: s.radar.movers, laggards: s.radar.laggards, clusterStrength: s.radar.clusterStrength, recentChanges: s.radar.recent.slice(0, 20) },
    leaders: s.leaders.slice(0, 8), dispersion: s.dispersion,
    nextSession: ns.status === "ok" ? { ...ns, backtest: { nTest: ns.backtest.nTest, metrics: ns.backtest.metrics, selected: ns.backtest.selected, reason: ns.backtest.selectedReason, intervalCoverage: ns.backtest.interval } } : ns,
    intraday: s.forecast.intraday, indicators: s.indicators, newsPressure: s.newsPressure,
    news: s.news.slice(0, 12).map((n) => ({ title: n.title, source: n.source, published: n.published_at, label: n.label, reason: n.reason, classifier: n.classifier, url: n.url })),
    fusion: s.fusion, recentAlerts: s.alerts.slice(0, 8).map((a) => ({ at: a.created_at, rule: a.rule, title: a.title_ar, severity: a.severity, strength: a.strength })),
    sourceHealth: s.health.map((h) => ({ id: h.id, lastSuccess: h.last_success_at, error: h.last_error, failures: h.consecutive_failures })),
  };
}

export async function askAnalyst(question: string, s: Snapshot): Promise<{ answer: string; mode: "claude" | "rules" }> {
  if (!config.hasAnthropic()) return { answer: ruleAnswer(question, s), mode: "rules" };
  const client = new Anthropic();
  const params: any = {
    model: config.anthropicModel, max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: `بيانات المنصة (JSON):\n${JSON.stringify(analystContext(s))}\n\nالسؤال: ${question}` }],
  };
  const res = await client.beta.messages.create(params);
  if (res.stop_reason === "refusal") return { answer: "تعذّر إنشاء إجابة لهذا السؤال.", mode: "claude" };
  const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return { answer: text || "—", mode: "claude" };
}

export { ruleAnswer };
