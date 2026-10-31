import banks from "../../../../config/banks.json";
import { config } from "../../config";
import { politeFetch } from "../http";
import { extractRowNumbers, sanityCheck } from "../parse";
import type { SourceAdapter } from "../types";

export type BankDef = (typeof banks.banks)[number];
export const BANKS: BankDef[] = banks.banks;
export const bankName = (id: string, lang: "ar" | "en") => {
  const b = BANKS.find((x) => x.id === id); return b ? (lang === "ar" ? b.name_ar : b.name_en) : id;
};

/** Reference value used by sanity checks — injected by the collector (latest daily mid). */
let referenceMid: number | null = null;
export function setReferenceMid(v: number | null) { referenceMid = v; }

export function bankAdapter(b: BankDef): SourceAdapter {
  return {
    id: `bank:${b.id}`, name: b.name_en, kind: "bank", url: b.url, dataClass: "polled",
    pollSeconds: config.bankPollSeconds, sessionOnly: true,
    async collect() {
      const { body, latencyMs } = await politeFetch(b.url, { accept: "text/html,application/json" });
      const nums = extractRowNumbers(body, b.rowMatch);
      if (!nums) throw new Error("USD row not found — page layout changed or rendered by JavaScript");
      const buy = nums[b.buyIndex], sell = nums[b.sellIndex];
      const bad = sanityCheck(buy, sell, referenceMid);
      if (bad) throw new Error(`rejected by sanity check: ${bad}`);
      return { latencyMs, quotes: [{ entity: b.id, instrument: "USD/EGP", buy, sell, mid: (buy + sell) / 2, sourceTime: null }] };
    },
  };
}
