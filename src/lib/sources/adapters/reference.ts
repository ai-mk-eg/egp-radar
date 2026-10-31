import { politeFetch } from "../http";
import type { SourceAdapter } from "../types";
import { cairoDate } from "../../time";
import { fetchFromNpm } from "../npmMirror";
import { getDb } from "../../db";

export const DAILY_COLS = ["egp", "eur", "jpy", "gbp", "cad", "sek", "chf", "xau", "try", "zar", "brl", "inr", "ngn", "sar"];

/**
 * fawazahmed0/currency-api — free, no key, CC0-style open data, daily snapshot (~00:00 UTC).
 * Aggregated mid-rate; NOT an Egyptian bank quote. Primary CDN + documented fallback domain.
 */
export const currencyApi: SourceAdapter = {
  id: "ref:currency-api", name: "currency-api (fawazahmed0, daily)", kind: "reference",
  url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  dataClass: "daily", pollSeconds: 3600,
  async collect() {
    // 1) jsDelivr CDN → 2) Cloudflare Pages mirror → 3) npm registry (immutable daily versions)
    let d: { date: string; usd: Record<string, number> } | null = null; let latencyMs = 0;
    const t0 = Date.now();
    for (const u of [this.url, "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json"]) {
      try { const res = await politeFetch(u, { accept: "application/json", retries: 1 }); d = JSON.parse(res.body); latencyMs = res.latencyMs; break; } catch { /* next mirror */ }
    }
    if (!d) {
      const db = await getDb();
      const last = await db.get("SELECT MAX(date) d FROM daily_fx");
      d = await fetchFromNpm(last?.d ?? null);
      latencyMs = Date.now() - t0;
      if (!d) return { latencyMs, daily: [], quotes: [] }; // already up to date
    }
    const values = Object.fromEntries(DAILY_COLS.map((c) => [c, d.usd?.[c] ?? null]));
    const egp = d.usd?.egp ?? null;
    return {
      latencyMs,
      daily: [{ date: d.date, values }],
      quotes: egp ? [{ entity: "REF_DAILY", instrument: "USD/EGP", buy: null, sell: null, mid: egp, sourceTime: `${d.date}T00:00:00Z` }] : [],
    };
  },
};

/** ExchangeRate-API open endpoint — free, no key, daily refresh, attribution REQUIRED ("Rates By Exchange Rate API"). */
export const erApi: SourceAdapter = {
  id: "ref:er-api", name: "ExchangeRate-API open access (daily)", kind: "reference",
  url: "https://open.er-api.com/v6/latest/USD", dataClass: "daily", pollSeconds: 3600,
  async collect() {
    const res = await politeFetch(this.url, { accept: "application/json" });
    const d = JSON.parse(res.body);
    if (d.result !== "success") throw new Error(`er-api result=${d.result}`);
    const egp = d.rates?.EGP;
    const t = new Date(d.time_last_update_unix * 1000).toISOString();
    return {
      latencyMs: res.latencyMs,
      macro: egp ? [{ seriesId: "ERAPI_USDEGP", date: cairoDate(new Date(t)), value: egp }] : [],
      quotes: egp ? [{ entity: "REF_ERAPI", instrument: "USD/EGP", buy: null, sell: null, mid: egp, sourceTime: t }] : [],
    };
  },
};

/**
 * FRED (St. Louis Fed) — official, free. fredgraph.csv needs no key; series are published with a lag
 * (e.g. DTWEXBGS broad dollar index is released weekly via H.10). We store the observation date,
 * and the engine only uses values whose observation date is ≥ 1 business day old (publication-lag guard).
 */
export const FRED_SERIES: Record<string, { ar: string; en: string }> = {
  DTWEXBGS: { ar: "مؤشر الدولار الواسع (الفيدرالي)", en: "Broad USD index (Fed)" },
  DGS10: { ar: "عائد سندات الخزانة الأمريكية 10 سنوات", en: "US 10Y Treasury yield" },
  DGS2: { ar: "عائد سندات الخزانة الأمريكية سنتين", en: "US 2Y Treasury yield" },
  DCOILBRENTEU: { ar: "خام برنت", en: "Brent crude" },
  DFF: { ar: "سعر الفائدة الفيدرالي الفعلي", en: "Effective Fed funds rate" },
};
export function fredAdapter(series: string): SourceAdapter {
  return {
    id: `macro:fred:${series}`, name: `FRED ${series}`, kind: "macro",
    url: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`, dataClass: "delayed", pollSeconds: 6 * 3600,
    async collect() {
      const res = await politeFetch(this.url, { accept: "text/csv" });
      const lines = res.body.trim().split(/\r?\n/).slice(1);
      const macro = lines.slice(-400).map((l) => {
        const [date, v] = l.split(",");
        const value = v === "." || v === "" ? null : Number(v);
        return { seriesId: series, date, value: Number.isFinite(value as number) ? value : null };
      });
      return { latencyMs: res.latencyMs, macro };
    },
  };
}
