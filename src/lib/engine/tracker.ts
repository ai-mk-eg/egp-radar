/** Forecast-vs-reality log: every issued forecast is stored once and later resolved. Wrong forecasts are never deleted. */
import { getDb } from "../db";
import { addDays } from "../time";
import type { NextSessionForecast } from "./daily";

export async function logNextSession(f: NextSessionForecast, nextSessionDate: string) {
  const db = await getDb();
  await db.run(
    `INSERT INTO forecasts(created_at, horizon, target_time, model, status, direction, p_up, p_flat, p_down, base_value, low, high, evidence, drivers)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(horizon, target_time, model) DO NOTHING`,
    [new Date().toISOString(), "next_session", nextSessionDate, f.model, f.status, f.direction, f.probs?.[2], f.probs?.[1], f.probs?.[0],
      f.base, f.rangeLow, f.rangeHigh, f.evidence, JSON.stringify(f.drivers)]);
}

/** Resolve: the close of market day D appears in the daily snapshot dated D+1. */
export async function resolveForecasts(thetaPct: number) {
  const db = await getDb();
  const open = await db.all("SELECT * FROM forecasts WHERE resolved_at IS NULL AND horizon='next_session'");
  for (const f of open) {
    const snap = await db.get("SELECT egp FROM daily_fx WHERE date=?", [addDays(f.target_time, 1)]);
    if (!snap) continue;
    const pct = 100 * Math.log(snap.egp / f.base_value);
    const cls = pct > thetaPct ? "up" : pct < -thetaPct ? "down" : "flat";
    await db.run("UPDATE forecasts SET resolved_at=?, actual_value=?, actual_class=?, hit=? WHERE id=?",
      [new Date().toISOString(), snap.egp, cls, cls === f.direction ? 1 : 0, f.id]);
  }
}
