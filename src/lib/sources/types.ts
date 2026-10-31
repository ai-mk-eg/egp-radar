/**
 * data_class semantics (shown in the UI next to every number):
 *  - "polled":     scraped from a bank/CBE page by our poller; freshness = poll interval (NOT tick-level real-time)
 *  - "daily":      a once-a-day reference/aggregated rate
 *  - "delayed":    a published series with a known publication lag (e.g. FRED)
 *  - "historical": backfilled history
 */
export type DataClass = "polled" | "daily" | "delayed" | "historical";

export type QuoteObs = { entity: string; instrument: string; buy: number | null; sell: number | null; mid: number | null; sourceTime: string | null };
export type DailyObs = { date: string; values: Record<string, number | null> };
export type MacroObs = { seriesId: string; date: string; value: number | null };
export type NewsObs = { id: string; source: string; title: string; url: string; publishedAt: string | null; lang: string };

export type CollectResult = { quotes?: QuoteObs[]; daily?: DailyObs[]; macro?: MacroObs[]; news?: NewsObs[]; latencyMs: number };

export interface SourceAdapter {
  id: string; name: string; kind: "bank" | "reference" | "macro" | "news";
  url: string; dataClass: DataClass; pollSeconds: number;
  /** Only poll during the Egyptian bank session window (+ margin)? */
  sessionOnly?: boolean;
  collect(): Promise<CollectResult>;
}
