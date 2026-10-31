// Writes the JSON files the static (GitHub Pages) site reads: public/data/*.json
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { buildSnapshot, loadSettings } from "../src/lib/snapshot";
import { config } from "../src/lib/config";

(async () => {
  const out = path.resolve("public/data"); fs.mkdirSync(out, { recursive: true });
  const db = await getDb();
  const w = (name: string, v: unknown) => fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(v));
  w("snapshot", await buildSnapshot());
  const since = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  w("history", {
    daily: await db.all("SELECT date, egp, source FROM daily_fx ORDER BY date"),
    quotes: await db.all("SELECT entity, buy, sell, mid, first_seen_at, last_seen_at FROM quotes WHERE source_id LIKE 'bank:%' AND first_seen_at >= ? ORDER BY first_seen_at", [since]),
    changes: await db.all("SELECT * FROM price_changes WHERE detected_at >= ? ORDER BY detected_at DESC LIMIT 1000", [since]),
  });
  const sources = await db.all("SELECT * FROM sources ORDER BY kind, id");
  w("health", { db: `${db.dialect} (GitHub Actions)`, sources, summary: { total: sources.length, healthy: sources.filter((s) => s.last_success_at && !s.last_error).length } });
  w("backtest", (await db.all("SELECT id, created_at, payload FROM backtests ORDER BY id")).map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.payload) })));
  w("settings", { settings: await loadSettings(), channelsConfigured: { telegram: Boolean(config.telegram.token && config.telegram.chatId), email: Boolean(config.smtp.host && config.smtp.to), claude: config.hasAnthropic() } });
  console.log("exported", fs.readdirSync(out).map((f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`).join(", "));
  process.exit(0);
})();
