// Diagnostic: fetch bank pages + homepages, save HTML and discovered rate-page links to diag/ for adapter fixing.
import fs from "node:fs";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
const targets: Record<string, string[]> = {
  CBE: ["https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates", "https://www.cbe.org.eg/ar/economic-research/statistics/exchange-rates"],
  NBE: ["https://www.nbe.com.eg/NBE/E/#/EN/ExchangeRatesAndCurrencyConverter", "https://www.nbe.com.eg/"],
  CIB: ["https://www.cibeg.com/en", "https://www.cibeg.com/"],
  ALEX: ["https://www.alexbank.com/", "https://www.alexbank.com/en"],
  HSBC: ["https://www.hsbc.com.eg/", "https://www.hsbc.com.eg/foreign-exchange/"],
  QNB: ["https://www.qnbalahli.com/sites/qnb/qnbegypt/page/en/enfxrates.html"],
  BDC: ["https://www.bdc.com.eg/bdcwebsite/home/exchange-rates", "https://www.bdc.com.eg/"],
  AAIB: ["https://aaib.com/services/rates", "https://aaib.com/"],
  SAIB: ["https://www.saib.com.eg/foreign-currencies/"],
};
fs.mkdirSync("diag", { recursive: true });
(async () => {
  const summary: string[] = [];
  for (const [id, urls] of Object.entries(targets)) for (const [i, u] of urls.entries()) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "en,ar" }, signal: AbortSignal.timeout(25000) });
      const body = await r.text();
      fs.writeFileSync(`diag/${id}-${i}.html`, body.slice(0, 1_500_000));
      const links = [...new Set([...body.matchAll(/(?:href|src|url)\s*[=:]\s*["']([^"']*(?:exchange|rate|currenc|fx|سعر|عملات)[^"']*)["']/gi)].map((m) => m[1]))].slice(0, 40);
      const apis = [...new Set([...body.matchAll(/["'](\/?[\w\-./]*(?:api|_vti_bin|\.asmx|\.ashx|json)[\w\-./?=&]*)["']/gi)].map((m) => m[1]))].slice(0, 40);
      const usd = (body.match(/.{0,200}(US Dollar|USD|دولار أمريكي).{0,300}/s) || [""])[0].replace(/\s+/g, " ");
      summary.push(`## ${id}-${i} ${u}\nstatus=${r.status} final=${r.url} bytes=${body.length}\nLINKS: ${links.join(" | ")}\nAPIS: ${apis.join(" | ")}\nUSD-CONTEXT: ${usd.slice(0, 500)}\n`);
    } catch (e: any) { summary.push(`## ${id}-${i} ${u}\nERROR ${e?.cause?.code || e.message}\n`); }
  }
  fs.writeFileSync("diag/SUMMARY.md", summary.join("\n"));
  console.log(summary.join("\n"));
})();
