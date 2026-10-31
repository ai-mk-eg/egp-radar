import { describe, expect, it } from "vitest";
import { marketStatus, isBusinessDay, nextBusinessDay } from "../src/lib/time";
describe("Egyptian market calendar", () => {
  it("Fri/Sat are weekend, Sun–Thu business", () => {
    expect(isBusinessDay("2026-10-30")).toBe(false); // Fri
    expect(isBusinessDay("2026-10-31")).toBe(false); // Sat
    expect(isBusinessDay("2026-11-01")).toBe(true);  // Sun
  });
  it("skips configured holidays", () => {
    expect(isBusinessDay("2026-10-08")).toBe(false);
    expect(nextBusinessDay("2026-10-07")).toBe("2026-10-11");
  });
  it("uses Cairo time incl. DST (summer UTC+3)", () => {
    // 2026-07-15 06:30 UTC = 09:30 Cairo (DST) -> open
    expect(marketStatus(new Date("2026-07-15T06:30:00Z")).state).toBe("open");
    // 2026-11-02 06:30 UTC = 08:30 Cairo (standard) -> pre-open, 30 min
    const s = marketStatus(new Date("2026-11-02T06:30:00Z"));
    expect(s.state).toBe("pre_open"); expect(s.minutesToOpen).toBe(30);
  });
});
