import banks from "../../../../config/banks.json";
import { config } from "../../config";
import { politeFetch } from "../http";
import { extractRowNumbers, sanityCheck } from "../parse";
import type { SourceAdapter } from "../types";

export type BankDef = {
  id: string; name_ar: string; name_en: string; url: string; parser: string; enabled?: boolean; disabled_reason?: string; official?: boolean; note?: string;
  rowMatch?: string; buyIndex?: number; sellIndex?: number;
  listPath?: string; matchPath?: string; match?: string; buyPath?: string; sellPath?: string; timePath?: string;
};
export const ALL_BANKS = banks.banks as BankDef[];
/** Banks actively collected (shown on the dashboard). */
export const BANKS = ALL_BANKS.filter((b) => b.enabled !== false);
export const bankName = (id: string, lang: "ar" | "en") => {
  const b = ALL_BANKS.find((x) => x.id === id); return b ? (lang === "ar" ? b.name_ar : b.name_en) : id;
};

let referenceMid: number | null = null;
export function setReferenceMid(v: number | null) { referenceMid = v; }

const get = (o: any, path?: string) => (path ? path.split(".").reduce((a, k) => (a == null ? a : a[k]), o) : undefined);

/** Parse a bank payload into buy/sell (+ the bank's own timestamp when it publishes one). Exported for tests. */
export function parseBank(b: BankDef, body: string): { buy: number; sell: number; sourceTime: string | null } {
  let buy: number, sell: number, sourceTime: string | null = null;
  if (b.parser === "json") {
    const list = get(JSON.parse(body), b.listPath);
    if (!Array.isArray(list)) throw new Error(`JSON: ${b.listPath} is not a list`);
    const item = list.find((x) => String(get(x, b.matchPath)).toUpperCase() === String(b.match).toUpperCase());
    if (!item) throw new Error(`JSON: no item with ${b.matchPath}=${b.match}`);
    buy = Number(get(item, b.buyPath)); sell = Number(get(item, b.sellPath));
    const t = get(item, b.timePath);
    if (t) { const d = new Date(String(t).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")); if (!isNaN(d.getTime())) sourceTime = d.toISOString(); }
  } else {
    const nums = extractRowNumbers(body, b.rowMatch || "US Dollar");
    if (!nums) throw new Error("USD row not found — page layout changed or rendered by JavaScript");
    buy = nums[b.buyIndex ?? 0]; sell = nums[b.sellIndex ?? 1];
  }
  const bad = sanityCheck(buy, sell, referenceMid);
  if (bad) throw new Error(`rejected by sanity check: ${bad}`);
  return { buy, sell, sourceTime };
}

export function bankAdapter(b: BankDef): SourceAdapter {
  return {
    id: `bank:${b.id}`, name: b.name_en, kind: "bank", url: b.url, dataClass: "polled",
    pollSeconds: config.bankPollSeconds, sessionOnly: true,
    async collect() {
      const { body, latencyMs } = await politeFetch(b.url, { accept: b.parser === "json" ? "application/json" : "text/html" });
      const { buy, sell, sourceTime } = parseBank(b, body);
      return { latencyMs, quotes: [{ entity: b.id, instrument: "USD/EGP", buy, sell, mid: (buy + sell) / 2, sourceTime }] };
    },
  };
}
