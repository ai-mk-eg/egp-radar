/**
 * HOURLY horizons (1/3/6/12h) — built ONLY from quotes this platform has collected itself
 * (no free source offers historical intraday Egyptian bank quotes). Until enough history exists,
 * the engine returns "insufficient" with the exact sample counts instead of a made-up number.
 *
 * Method: empirical conditional frequencies. State at time t = sign of the anchor's change during the last 60 min.
 * Outcome = anchor mid change over horizon h (classes down/flat/up, flat if |Δ| < 1 piaster).
 * Validation: leave-future-out by day (train on days before d, test on day d), Brier vs unconditional base rate.
 */
import { CLASSES, Probs, brier, mean, wilson } from "./stats";
import { cairoDate, isWithinSession } from "../time";

export const HORIZONS = [1, 3, 6, 12] as const;
export const MIN_DAYS = 20, MIN_STATE_N = 30;
type Q = { t: number; mid: number };

function valueAt(series: Q[], t: number) {
  let v: number | null = null;
  for (const q of series) { if (q.t <= t) v = q.mid; else break; }
  return v;
}

export type HorizonForecast = {
  horizonH: number; status: "ok" | "insufficient"; reason?: string; days: number; stateN: number;
  probs?: Probs; direction?: string; showProbabilities?: boolean; bss?: number; testN?: number; changeProbCi?: [number, number];
};

export function intradayForecasts(series: Q[], now = Date.now()): HorizonForecast[] {
  series = [...series].sort((a, b) => a.t - b.t);
  const grid: number[] = [];
  if (series.length) for (let t = Math.ceil(series[0].t / 3600000) * 3600000; t <= now; t += 3600000) if (isWithinSession(new Date(t))) grid.push(t);
  const days = new Set(grid.map((t) => cairoDate(new Date(t)))).size;
  const state = (t: number) => { const a = valueAt(series, t), b = valueAt(series, t - 3600000); return a === null || b === null ? null : Math.sign(Math.round((a - b) * 100)); };
  const curState = state(now) ?? 0;
  return HORIZONS.map((h) => {
    const rows = grid.filter((t) => t + h * 3600000 <= now).map((t) => {
      const a = valueAt(series, t), b = valueAt(series, t + h * 3600000), s = state(t);
      if (a === null || b === null || s === null) return null;
      const d = Math.round((b - a) * 100);
      return { day: cairoDate(new Date(t)), s, y: d > 0 ? 2 : d < 0 ? 0 : 1 };
    }).filter(Boolean) as { day: string; s: number; y: number }[];
    const stateRows = rows.filter((r) => r.s === curState);
    if (days < MIN_DAYS || stateRows.length < MIN_STATE_N)
      return { horizonH: h, status: "insufficient", days, stateN: stateRows.length,
        reason: `need ≥${MIN_DAYS} collected session days and ≥${MIN_STATE_N} samples in the current state` };
    const freq = (rs: typeof rows): Probs => { const c = [1, 1, 1]; rs.forEach((r) => c[r.y]++); const t = c[0] + c[1] + c[2]; return [c[0] / t, c[1] / t, c[2] / t]; };
    // day-blocked out-of-sample check
    const dayList = [...new Set(rows.map((r) => r.day))].sort();
    const cond: number[] = [], base: number[] = [];
    for (const d of dayList.slice(10)) {
      const train = rows.filter((r) => r.day < d), test = rows.filter((r) => r.day === d);
      for (const r of test) { cond.push(brier(freq(train.filter((x) => x.s === r.s)), r.y)); base.push(brier(freq(train), r.y)); }
    }
    const bss = cond.length ? 1 - mean(cond) / mean(base) : NaN;
    const probs = freq(stateRows);
    const changed = stateRows.filter((r) => r.y !== 1).length; const w = wilson(changed, stateRows.length);
    return { horizonH: h, status: "ok", days, stateN: stateRows.length, probs, direction: CLASSES[probs.indexOf(Math.max(...probs))],
      showProbabilities: bss > 0.02 && cond.length >= 100, bss, testN: cond.length, changeProbCi: [w.lo, w.hi] };
  });
}
