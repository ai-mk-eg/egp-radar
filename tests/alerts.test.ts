import { describe, expect, it } from "vitest";
import { evaluateRules } from "../src/lib/alerts/engine";
import { DEFAULT_SETTINGS } from "../src/lib/snapshot";
const base: any = {
  generatedAt: "2026-11-01T08:00:00Z", market: { state: "open", minutesToOpen: null, nextSessionDate: "2026-11-01" },
  headline: { asOf: null, dataClass: "polled" }, banks: [], dispersion: null,
  radar: { active: null, movers: [], laggards: [], clusterStrength: null, windowMin: 30 },
  forecast: { nextSession: { status: "insufficient" } }, news: [], fusion: { signals: [], agreeing: 0, conflicting: 0, direction: 0 },
};
describe("alert rules", () => {
  it("fires a price-move alert only above the threshold, scaled by sensitivity", () => {
    const bank = { id: "NBE", name_ar: "الأهلي", name_en: "NBE", fresh: true, buy: 56.2, sell: 56.3, changedAt: "x", vsPrevDay: { dBuy: 0.3, dSell: 0.3, direction: 1 } };
    const s = { ...base, banks: [bank] };
    expect(evaluateRules(s, { ...DEFAULT_SETTINGS, sensitivity: "medium" }).map((a) => a.rule)).toContain("price_move");
    expect(evaluateRules(s, { ...DEFAULT_SETTINGS, sensitivity: "low" }).map((a) => a.rule)).not.toContain("price_move");
  });
  it("does not label stale banks", () => {
    const bank = { id: "NBE", fresh: false, vsPrevDay: { dBuy: 5, dSell: 5, direction: 1 } };
    expect(evaluateRules({ ...base, banks: [bank] }, DEFAULT_SETTINGS)).toHaveLength(0);
  });
  it("uses stable dedupe keys", () => {
    const s = { ...base, market: { state: "pre_open", minutesToOpen: 20, nextSessionDate: "2026-11-01" } };
    expect(evaluateRules(s, DEFAULT_SETTINGS)[0].dedupe).toBe("session_open|2026-11-01");
  });
});
