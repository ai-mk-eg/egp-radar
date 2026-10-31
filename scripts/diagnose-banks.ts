// Diagnostic: fetch bank pages + homepages, save HTML and discovered rate-page links to diag/ for adapter fixing.
import fs from "node:fs";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
const targets: Record<string, string[]> = {
  CBEua: ["https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates"],
  ALEX: ["https://www.alexbank.com/en/retail/currencies-exchange-rates.html"],
  CIB: ["https://www.cibeg.com/en/currency-converter"],
  NBEjs: ["https://www.nbe.com.eg/NBE/MainSite/Modules/ExchangeRate/Scripts/ExchangeRateConstants.js", "https://www.nbe.com.eg/NBE/E/GeneratedScripts/InitData.js", "https://www.nbe.com.eg/NBE/E/GeneratedScripts/StaticWidgets.js"],
  HSBC: ["https://www.hsbc.com.eg/foreign-exchange/rates/", "https://www.hsbc.com.eg/foreign-exchange/currency-rates/"],
  BDC: ["https://www.bdc.com.eg/bdcwebsite/home/exchange-rates"],
};
fs.mkdirSync("diag", { recursive: true });
(async () => {
  const summary: string[] = [];
  for (const ua of ["EGP-Radar/1.0 (+personal research; contact: set COLLECTOR_USER_AGENT)", "Mozilla/5.0 (compatible; EGP-Radar/1.0; +https://github.com/ai-mk-eg/egp-radar)"]) {
    try { const r = await fetch(targets.CBEua[0], { headers: { "User-Agent": ua, Accept: "text/html,application/json" } }); const b = await r.text();
      summary.push(`## CBE UA test [${ua}] status=${r.status} bytes=${b.length} hasUSD=${/US Dollar/.test(b)}\n${b.slice(0, 300).replace(/\s+/g, " ")}\n`); } catch (e: any) { summary.push(`## CBE UA test ERROR ${e.message}`); }
  }
  for (const [id, urls] of Object.entries(targets)) for (const [i, u] of urls.entries()) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "en,ar" }, signal: AbortSignal.timeout(25000) });
      const body = await r.text();
      fs.writeFileSync(`diag/${id}-${i}.html`, body.slice(0, 1_500_000));
      const links = [...new Set([...body.matchAll(/(?:href|src|url)\s*[=:]\s*["']([^"']*(?:exchange|rate|currenc|fx|سعر|عملات)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 40);
      const apis = [...new Set([...body.matchAll(/["'](\/?[\w\-./]*(?:api|_vti_bin|\.asmx|\.ashx|json)[\w\-./?=&]*)["']/gi)].map((m) => m[1]))].slice(0, 40);
      const scripts = [...new Set([...body.matchAll(/<script[^>]+src=["\']([^"\']+)["\']/gi)].map((m) => m[1]))].slice(0, 40);
      const usd = (body.match(/.{0,200}(US Dollar|USD|دولار أمريكي).{0,300}/s) || [""])[0].replace(/\s+/g, " ");
      summary.push(`## ${id}-${i} ${u}\nstatus=${r.status} final=${r.url} bytes=${body.length}\nLINKS: ${links.join(" | ")}\nAPIS: ${apis.join(" | ")}\nSCRIPTS: ${scripts.join(" | ")}\nUSD-CONTEXT: ${usd.slice(0, 500)}\n`);
    } catch (e: any) { summary.push(`## ${id}-${i} ${u}\nERROR ${e?.cause?.code || e.message}\n`); }
  }
  fs.writeFileSync("diag/SUMMARY.md", summary.join("\n"));
  console.log(summary.join("\n"));
})();
