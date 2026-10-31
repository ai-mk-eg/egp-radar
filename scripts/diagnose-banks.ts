// Diagnostic: run the real adapters and header variants on the runner; save results to diag/.
import fs from "node:fs";
import { ALL_BANKS, bankAdapter } from "../src/lib/sources/adapters/bank";
const UA = process.env.COLLECTOR_USER_AGENT || "EGP-Radar/1.0 (+https://github.com/ai-mk-eg/egp-radar)";
fs.mkdirSync("diag", { recursive: true });
(async () => {
  const out: string[] = [`UA=${UA}`];
  for (const id of ["CIB", "ALEX"]) {
    const b = ALL_BANKS.find((x) => x.id === id)!;
    try { const r = await bankAdapter(b).collect(); out.push(`${id} adapter OK ${JSON.stringify(r.quotes)}`); } catch (e: any) { out.push(`${id} adapter FAIL ${e.message}`); }
    const variants: Record<string, Record<string, string>> = {
      A_json: { Accept: "application/json" },
      B_json_lang: { Accept: "application/json", "Accept-Language": "en,ar;q=0.8" },
      C_mixed: { Accept: "application/json, text/html;q=0.8" },
      D_none: {},
    };
    for (const [k, h] of Object.entries(variants)) {
      try { const r = await fetch(b.url, { headers: { "User-Agent": UA, ...h }, cache: "no-store" }); const t = await r.text(); out.push(`${id} ${k} status=${r.status} bytes=${t.length}`); }
      catch (e: any) { out.push(`${id} ${k} ERROR ${e.message}`); }
    }
  }
  fs.writeFileSync("diag/SUMMARY.md", out.join("\n")); console.log(out.join("\n"));
})();
