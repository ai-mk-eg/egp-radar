// Runs the daily walk-forward backtest directly on data/daily_fx.csv (no DB needed).
import fs from "node:fs";
import { buildSamples, walkForward, evaluate, nextSession } from "../src/lib/engine/daily";
const [head, ...lines] = fs.readFileSync(process.argv[2] || "data/daily_fx.csv", "utf8").trim().split("\n");
const cols = head.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i] === "try" ? "try_" : cols[i], i ? Number(v) : v]))) as any[];
for (const theta of [0.05, 0.1, 0.25]) {
  const s = buildSamples(rows, theta); const { preds } = walkForward(s); const r = evaluate(preds, s, theta);
  console.log(`\nθ=${theta}%  samples=${r.nSamples} test=${r.nTest} (${r.firstTest}..${r.lastTest}) freq(d/f/u)=${r.classFreq.map((x) => x.toFixed(2)).join("/")}`);
  for (const [m, v] of Object.entries(r.metrics)) console.log(`  ${m.padEnd(12)} logloss=${v.logLoss.toFixed(4)} brier=${v.brier.toFixed(4)} acc=${(v.accuracy * 100).toFixed(1)}% BSS=${(v.bss * 100).toFixed(1)}%`);
  console.log(`  selected=${r.selected} (${r.selectedReason}); 80% interval coverage=${(r.interval.coverage * 100).toFixed(1)}%; no-change MAE=${r.pointMae.noChange.toFixed(3)}%`);
}
const f: any = nextSession(rows, 0.1, "2026-10-31");
console.log("\nnext:", JSON.stringify({ ...f, backtest: undefined }, null, 1));
