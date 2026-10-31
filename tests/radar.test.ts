import { describe, expect, it } from "vitest";
import { buildEpisodes, leaderboard, currentRadar, strengthFrom, type Change } from "../src/lib/engine/radar";
const ch = (entity: string, at: string, prev: string, direction = 1): Change =>
  ({ entity, direction, detected_at: at, prev_seen_at: prev, old_buy: 1, new_buy: 2, old_sell: 1, new_sell: 2, poll_seconds: 300 });
describe("radar", () => {
  const hist: Change[] = [];
  for (let d = 1; d <= 12; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    hist.push(ch("CIB", `${day}T07:00:00Z`, `${day}T06:55:00Z`), ch("NBE", `${day}T07:20:00Z`, `${day}T07:15:00Z`), ch("BM", `${day}T07:25:00Z`, `${day}T07:20:00Z`));
  }
  it("groups same-direction changes into episodes and finds the leader", () => {
    const eps = buildEpisodes(hist);
    expect(eps).toHaveLength(12);
    const lb = leaderboard(eps, ["CIB", "NBE", "BM"]);
    expect(lb[0].entity).toBe("CIB"); expect(lb[0].ledShare).toBe(1);
  });
  it("flags laggards with evidence from history", () => {
    const now = new Date("2026-10-01T07:05:00Z");
    const live = [...hist, ch("CIB", "2026-10-01T07:00:00Z", "2026-10-01T06:55:00Z")];
    const r = currentRadar(live, ["CIB", "NBE", "BM"], now);
    expect(r.movers).toEqual(["CIB"]);
    const nbe = r.laggards.find((l) => l.entity === "NBE")!;
    expect(nbe.strength.n).toBe(12); expect(nbe.strength.strength).toBe("strong");
  });
  it("refuses to rate tiny samples", () => { expect(strengthFrom(3, 3).strength).toBe("insufficient"); });
});
