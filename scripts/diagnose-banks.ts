// Diagnostic: probe bank JSON endpoints with the collector's honest User-Agent; save raw responses to diag/.
import fs from "node:fs";
const UA = "EGP-Radar/1.0 (+https://github.com/ai-mk-eg/egp-radar)";
const probes: [string, string, RequestInit?][] = [
  ["CIB", "https://www.cibeg.com/api/currency/rates"],
  ["ALEXcash", "https://www.alexbank.com/digitalServicesServlet/?operation=latestExchangeRatesCash&httpMethod=GET&endpointName=latestExchangeRatesCash&headers=standardHeaders&bank=ALEX&bankId=ALEX&locale=en"],
  ["ALEX", "https://www.alexbank.com/digitalServicesServlet/?operation=latestExchangeRates&httpMethod=GET&endpointName=latestExchangeRates&headers=standardHeaders&bank=ALEX&bankId=ALEX&locale=en"],
  ["NBEasmx", "https://www.nbe.com.eg/NBE/Services/Prices/CurrencyPrices.asmx/GetCurrPrices", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ Lang: "en" }) }],
  ["BM", "https://www.banquemisr.com/Home/CAPITAL%20MARKETS/Exchange%20Rates%20and%20Currencies"],
  ["ADIB", "https://www.adib.eg/Foreign-Currencies"],
];
fs.mkdirSync("diag", { recursive: true });
(async () => {
  const out: string[] = [];
  for (const [id, url, init] of probes) {
    try {
      const r = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json, text/html;q=0.8", ...(init?.headers || {}) }, signal: AbortSignal.timeout(25000) });
      const b = await r.text(); fs.writeFileSync(`diag/${id}.txt`, b.slice(0, 400000));
      const usd = (b.match(/.{0,250}(USD|US Dollar).{0,350}/s) || [""])[0].replace(/\s+/g, " ");
      out.push(`## ${id} status=${r.status} type=${r.headers.get("content-type")} bytes=${b.length}\nHEAD: ${b.slice(0, 400).replace(/\s+/g, " ")}\nUSD: ${usd.slice(0, 600)}\n`);
    } catch (e: any) { out.push(`## ${id} ERROR ${e?.cause?.code || e.message}\n`); }
  }
  fs.writeFileSync("diag/SUMMARY.md", out.join("\n")); console.log(out.join("\n"));
})();
