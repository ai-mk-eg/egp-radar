// Full walk-forward backtest from the database; stores the report in `backtests`.
import { getDb } from "../src/lib/db";
import { loadDaily } from "../src/lib/snapshot";
import { buildSamples, walkForward, evaluate } from "../src/lib/engine/daily";
(async () => {
  const rows = await loadDaily();
  const db = await getDb();
  for (const theta of [0.05, 0.1, 0.25]) {
    const s = buildSamples(rows, theta); const { preds } = walkForward(s); const r = evaluate(preds, s, theta);
    await db.run("INSERT INTO backtests(id, created_at, payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at, payload=excluded.payload",
      [`daily-theta-${theta}`, r.createdAt, JSON.stringify(r)]);
    console.log(`θ=${theta}% n=${r.nTest} selected=${r.selected}`, Object.fromEntries(Object.entries(r.metrics).map(([k, v]) => [k, `BSS ${(v.bss * 100).toFixed(1)}% ll ${v.logLoss.toFixed(3)}`])));
  }
  process.exit(0);
})();
