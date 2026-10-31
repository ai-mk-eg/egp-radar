import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildSamples, nextSession } from "../src/lib/engine/daily";
const load = () => {
  const [head, ...lines] = fs.readFileSync("data/daily_fx.csv", "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i] === "try" ? "try_" : cols[i], i ? Number(v) : v]))) as any[];
};
const hasData = fs.existsSync("data/daily_fx.csv");
describe.skipIf(!hasData)("next-session model", () => {
  it("features at t do not change when future data is appended (no look-ahead)", () => {
    const rows = load();
    const cut = rows.slice(0, rows.length - 60);
    const a = buildSamples(cut, 0.1), b = buildSamples(rows, 0.1);
    const lastA = a.at(-1)!; const sameInB = b.find((s) => s.date === lastA.date)!;
    expect(sameInB.x).toEqual(lastA.x);
    expect(lastA.y).toBeNull(); // the target is unknown at the cut
  });
  it("excludes pre-float regime and non-business market days", () => {
    const s = buildSamples(load(), 0.1);
    expect(s[0].date >= "2024-03-10").toBe(true);
    expect(s.every((x) => ![5, 6].includes(new Date(x.marketDay + "T12:00:00Z").getUTCDay()))).toBe(true);
  });
  it("only shows probabilities when the model beats the baseline", () => {
    const f: any = nextSession(load(), 0.1);
    expect(f.status).toBe("ok");
    if (f.model === "climatology") expect(f.showProbabilities).toBe(false);
    else expect(f.backtest.metrics[f.model].bss).toBeGreaterThan(0.02);
  });
});
