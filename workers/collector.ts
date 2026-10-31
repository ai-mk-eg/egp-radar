/**
 * Long-running collection worker (run on a VPS/Railway/Fly/your PC):  npm run worker
 * Single tick (for OS cron / GitHub Actions):                          npm run collect:once
 */
import { tick } from "../src/lib/pipeline";
import { sleep } from "../src/lib/sources/http";

const once = process.argv.includes("--once");
const force = process.argv.includes("--force");
let stopping = false;
process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });

async function main() {
  do {
    const started = Date.now();
    try {
      const r = await tick({ force });
      const fails = r.ran.filter((x) => !x.ok);
      console.log(`[${new Date().toISOString()}] ran=${r.ran.length} ok=${r.ran.length - fails.length} changed=${r.ran.filter((x) => x.changed).length} news=${r.classified} alerts=${r.alerts}` +
        (fails.length ? `\n  failures: ${fails.map((f) => `${f.id}: ${f.error}`).join("\n            ")}` : ""));
    } catch (e) { console.error("[worker] tick failed", e); }
    if (once) break;
    await sleep(Math.max(15000, 60000 - (Date.now() - started)));
  } while (!stopping);
  process.exit(0);
}
main();
