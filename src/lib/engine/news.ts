import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config";
import { getDb } from "../db";

/** Labels are about pressure on the USD/EGP RATE (i.e. on the dollar price in EGP), not "good/bad news". */
export const LABELS = ["usd_up_pressure", "usd_down_pressure", "limited", "unrelated_or_unverified"] as const;
export type Label = (typeof LABELS)[number];

const Classification = z.object({
  items: z.array(z.object({
    id: z.string(),
    label: z.enum(LABELS),
    relevance: z.number().describe("0..1 how directly the item bears on the USD/EGP rate"),
    reason_ar: z.string().describe("One short Arabic sentence explaining the label"),
  })),
});

const SYSTEM = `You classify news headlines by their likely pressure on the USD/EGP exchange rate (the price of one US dollar in Egyptian pounds).
- usd_up_pressure: makes a HIGHER USD/EGP more likely (e.g. foreign portfolio outflows/T-bill selling, FX shortages, reserves falling, rate cuts while inflation high, regional shocks hitting Suez/tourism, delayed IMF tranches).
- usd_down_pressure: makes a LOWER USD/EGP more likely (e.g. large FX inflows, IMF/GCC disbursements, record remittances, foreign T-bill buying, hawkish CBE).
- limited: related to Egypt's economy but weak/indirect effect on the rate.
- unrelated_or_unverified: not about Egypt FX, a rate-price listing article, opinion/rumour, or not verifiable from the headline.
Judge only from the headline and source given. A headline that merely reports today's rate is "unrelated_or_unverified" (it is an outcome, not a driver). Be conservative.`;

/** Transparent keyword fallback when no API key is configured. Labelled as rules-based in the UI. */
export function ruleClassify(title: string): { label: Label; relevance: number; reason: string } {
  const t = title.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has("سعر الدولار اليوم", "سعر الدولار الآن", "exchange rate today", "rates today") || /(سعر|أسعار)\s+(الدولار|العملات|الذهب).{0,60}(اليوم|الآن|لحظة)/.test(title) || /(اليوم|الآن).{0,30}(سعر|أسعار)\s+(الدولار|العملات)/.test(title)) return { label: "unrelated_or_unverified", relevance: 0.1, reason: "خبر يعرض السعر نفسه وليس عاملًا مؤثرًا" };
  if (has("outflow", "selling", "sold", "خروج", "تخارج", "بيع أذون", "record low", "أدنى مستوى", "shortage", "نقص", "cut rates", "خفض الفائدة", "تراجع الاحتياطي"))
    return { label: "usd_up_pressure", relevance: 0.5, reason: "كلمات تشير إلى خروج أموال أو ضغط على العملة (تصنيف بالقواعد)" };
  if (has("inflow", "disburse", "tranche", "شريحة", "تدفقات", "record remittances", "تحويلات قياسية", "deposit", "وديعة", "raise rates", "رفع الفائدة", "ارتفاع الاحتياطي"))
    return { label: "usd_down_pressure", relevance: 0.5, reason: "كلمات تشير إلى تدفقات دولارية داخلة (تصنيف بالقواعد)" };
  if (has("egypt", "مصر", "المركزي", "cbe", "imf", "صندوق النقد")) return { label: "limited", relevance: 0.3, reason: "مرتبط بالاقتصاد المصري بتأثير غير مباشر (تصنيف بالقواعد)" };
  return { label: "unrelated_or_unverified", relevance: 0.05, reason: "غير مرتبط بسعر الصرف (تصنيف بالقواعد)" };
}

/** Classify unlabelled news (batch). Uses Claude when credentials exist; otherwise rules. */
export async function classifyPendingNews(limit = 30) {
  const db = await getDb();
  const rows = await db.all("SELECT id, title, source, published_at FROM news WHERE label IS NULL ORDER BY published_at DESC LIMIT ?", [limit]);
  if (!rows.length) return 0;
  if (config.hasAnthropic()) {
    try {
      const client = new Anthropic();
      const list = rows.map((r) => `${r.id} | ${r.published_at ?? "?"} | ${r.source} | ${r.title}`).join("\n");
      const res = await client.messages.parse({
        model: config.anthropicModel, max_tokens: 8000,
        output_config: { effort: "low", format: zodOutputFormat(Classification) },
        system: SYSTEM,
        messages: [{ role: "user", content: `Classify each line (id | published | source | headline):\n${list}` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`classification unavailable (${res.stop_reason})`);
      for (const it of res.parsed_output.items) {
        await db.run("UPDATE news SET label=?, reason=?, relevance=?, classifier=? WHERE id=?", [it.label, it.reason_ar, it.relevance, `claude:${config.anthropicModel}`, it.id]);
      }
      return res.parsed_output.items.length;
    } catch (e) {
      console.error("[news] Claude classification failed, falling back to rules:", (e as Error).message);
    }
  }
  for (const r of rows) {
    const c = ruleClassify(r.title);
    await db.run("UPDATE news SET label=?, reason=?, relevance=?, classifier=? WHERE id=?", [c.label, c.reason, c.relevance, "rules", r.id]);
  }
  return rows.length;
}
