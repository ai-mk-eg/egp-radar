// Import data/daily_fx.csv (from `npm run backfill:history`) into the database. Idempotent.
import fs from "node:fs";
import { getDb } from "../src/lib/db";
const file = process.argv[2] || "data/daily_fx.csv";
const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split("\n");
const cols = head.split(",");
(async () => {
  const db = await getDb();
  let n = 0;
  for (const l of lines) {
    const v = Object.fromEntries(l.split(",").map((x, i) => [cols[i], i ? (x === "" ? null : Number(x)) : x]));
    const r = await db.run(`INSERT INTO daily_fx(date, egp, eur, jpy, gbp, cad, sek, chf, xau, try_, zar, brl, inr, ngn, sar, source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date) DO NOTHING`,
      [v.date, v.egp, v.eur, v.jpy, v.gbp, v.cad, v.sek, v.chf, v.xau, v.try, v.zar, v.brl, v.inr, v.ngn, v.sar, "historical:npm-currency-api"]);
    n += r.changes;
  }
  console.log(`imported ${n} new rows (${lines.length} in file)`);
  process.exit(0);
})();
