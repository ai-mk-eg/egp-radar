import { getDb } from "./db";
import { allAdapters } from "./sources/registry";
import { setReferenceMid, ALL_BANKS } from "./sources/adapters/bank";
import type { CollectResult, SourceAdapter } from "./sources/types";
import { cairoParts, isBusinessDay } from "./time";

const nowIso = () => new Date().toISOString();

async function ensureSource(a: SourceAdapter) {
  const db = await getDb();
  await db.run(
    `INSERT INTO sources(id, name, kind, url, data_class, poll_seconds) VALUES(?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, data_class=excluded.data_class, poll_seconds=excluded.poll_seconds, enabled=1,
       -- a changed URL (adapter fixed in config) clears the failure backoff so it is retried immediately
       consecutive_failures = CASE WHEN sources.url = excluded.url THEN sources.consecutive_failures ELSE 0 END,
       last_attempt_at = CASE WHEN sources.url = excluded.url THEN sources.last_attempt_at ELSE NULL END,
       last_error = CASE WHEN sources.url = excluded.url THEN sources.last_error ELSE NULL END`,
    [a.id, a.name, a.kind, a.url, a.dataClass, a.pollSeconds]);
}

/** Effective poll interval: bank pages are polled densely only around the session window; failures back off exponentially (max 1h). */
function effectiveInterval(a: SourceAdapter, failures: number, now: Date) {
  let base = a.pollSeconds;
  if (a.sessionOnly) {
    const p = cairoParts(now); const m = p.hour * 60 + p.minute;
    const busy = isBusinessDay(p.date) && m >= 8 * 60 && m < 17 * 60;
    if (!busy) base = Math.max(base, 1800);
  }
  return Math.min(base * 2 ** Math.min(failures, 4), Math.max(base, 3600));
}

export async function isDue(a: SourceAdapter, now = new Date()) {
  const db = await getDb();
  const s = await db.get("SELECT enabled, last_attempt_at, consecutive_failures FROM sources WHERE id = ?", [a.id]);
  if (!s) return true;
  if (!s.enabled) return false;
  if (!s.last_attempt_at) return true;
  return (now.getTime() - new Date(s.last_attempt_at).getTime()) / 1000 >= effectiveInterval(a, s.consecutive_failures, now) - 5;
}

async function persist(a: SourceAdapter, r: CollectResult, at: string) {
  const db = await getDb();
  let changed = false;
  for (const q of r.quotes || []) {
    const prev = await db.get(
      "SELECT * FROM quotes WHERE source_id=? AND entity=? AND instrument=? ORDER BY first_seen_at DESC LIMIT 1", [a.id, q.entity, q.instrument]);
    const same = prev && prev.buy === q.buy && prev.sell === q.sell && prev.mid === q.mid;
    if (same) { await db.run("UPDATE quotes SET last_seen_at=? WHERE id=?", [at, prev.id]); continue; }
    await db.run(
      `INSERT INTO quotes(source_id, entity, instrument, buy, sell, mid, source_time, first_seen_at, last_seen_at, data_class, dedupe_key)
       VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`,
      [a.id, q.entity, q.instrument, q.buy, q.sell, q.mid, q.sourceTime, at, at, a.dataClass, `${a.id}|${q.entity}|${q.instrument}|${at}`]);
    changed = true;
    if (prev && a.kind === "bank") {
      const dir = Math.sign((q.mid ?? 0) - (prev.mid ?? 0));
      await db.run(
        `INSERT INTO price_changes(entity, instrument, source_id, old_buy, new_buy, old_sell, new_sell, direction, detected_at, prev_seen_at, poll_seconds)
         VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
        [q.entity, q.instrument, a.id, prev.buy, q.buy, prev.sell, q.sell, dir, at, prev.last_seen_at, a.pollSeconds]);
    }
  }
  for (const d of r.daily || []) {
    const v = d.values;
    const res = await db.run(
      `INSERT INTO daily_fx(date, egp, eur, jpy, gbp, cad, sek, chf, xau, try_, zar, brl, inr, ngn, sar, source)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date) DO NOTHING`,
      [d.date, v.egp, v.eur, v.jpy, v.gbp, v.cad, v.sek, v.chf, v.xau, v.try, v.zar, v.brl, v.inr, v.ngn, v.sar, a.id]);
    changed ||= res.changes > 0;
  }
  for (const m of r.macro || []) {
    const res = await db.run(
      `INSERT INTO macro(series_id, date, value, source, fetched_at) VALUES(?,?,?,?,?)
       ON CONFLICT(series_id, date) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at`,
      [m.seriesId, m.date, m.value, a.id, at]);
    changed ||= res.changes > 0;
  }
  for (const n of r.news || []) {
    const res = await db.run(
      "INSERT INTO news(id, source, title, url, published_at, fetched_at, lang) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      [n.id, n.source, n.title, n.url, n.publishedAt, at, n.lang]);
    changed ||= res.changes > 0;
  }
  return changed;
}

export type CycleReport = { ran: { id: string; ok: boolean; error?: string; changed?: boolean }[] };

/** Run every due adapter once (bounded concurrency). Safe to call from a worker loop or a cron HTTP endpoint. */
export async function runCycle(opts: { force?: boolean } = {}): Promise<CycleReport> {
  const db = await getDb();
  const adapters = allAdapters();
  for (const a of adapters) await ensureSource(a);
  for (const b of ALL_BANKS.filter((x) => x.enabled === false))
    await db.run(`INSERT INTO sources(id, name, kind, url, data_class, poll_seconds, enabled, last_error) VALUES(?,?,?,?,?,?,0,?)
      ON CONFLICT(id) DO UPDATE SET enabled=0, url=excluded.url, last_error=excluded.last_error`,
      [`bank:${b.id}`, b.name_en, "bank", b.url, "polled", 0, `DISABLED: ${b.disabled_reason}`]);
  const ref = await db.get("SELECT egp FROM daily_fx ORDER BY date DESC LIMIT 1");
  setReferenceMid(ref?.egp ?? null);
  const due: SourceAdapter[] = [];
  for (const a of adapters) if (opts.force || (await isDue(a))) due.push(a);
  const report: CycleReport = { ran: [] };
  const queue = [...due];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const at = nowIso();
      try {
        const r = await a.collect();
        const changed = await persist(a, r, at);
        await db.run(
          `UPDATE sources SET last_attempt_at=?, last_success_at=?, last_error=NULL, consecutive_failures=0, last_latency_ms=?, verified=1
           ${changed ? ", last_change_at=?" : ""} WHERE id=?`, changed ? [at, at, r.latencyMs, at, a.id] : [at, at, r.latencyMs, a.id]);
        report.ran.push({ id: a.id, ok: true, changed });
      } catch (e: any) {
        const msg = String(e?.cause?.code || e?.message || e).slice(0, 300);
        await db.run("UPDATE sources SET last_attempt_at=?, last_error=?, consecutive_failures=consecutive_failures+1 WHERE id=?", [at, msg, a.id]);
        report.ran.push({ id: a.id, ok: false, error: msg });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return report;
}
