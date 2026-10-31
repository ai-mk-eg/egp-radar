"use client";
/**
 * Browser data access. Two deployment modes:
 *  - server mode (default): Next.js API routes (/api/*), SSE, settings writes, Claude analyst.
 *  - static mode (NEXT_PUBLIC_STATIC=1, GitHub Pages): JSON files exported by the scheduled
 *    GitHub Actions pipeline into /data/*.json; analyst answers deterministically in the browser.
 */
import { ruleAnswer } from "./shared/ruleAnswer";

export const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const j = async (u: string) => { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const file = (name: string) => j(`${BASE}/data/${name}.json?t=${Math.floor(Date.now() / 60000)}`);

export const getSnapshot = () => (STATIC ? file("snapshot") : j("/api/snapshot"));
export const getHealth = () => (STATIC ? file("health") : j("/api/health"));
export const getBacktest = () => (STATIC ? file("backtest") : j("/api/backtest"));
export const getSettings = () => (STATIC ? file("settings") : j("/api/settings"));

export async function getHistory(days: number) {
  if (!STATIC) return j(`/api/history?days=${days}`);
  const h = await file("history");
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { daily: h.daily.filter((r: any) => r.date >= since), quotes: h.quotes.filter((q: any) => q.first_seen_at >= since), changes: h.changes.filter((c: any) => c.detected_at >= since) };
}

export async function askAnalyst(question: string): Promise<{ answer: string; mode: string }> {
  if (STATIC) return { answer: ruleAnswer(question, await getSnapshot()), mode: "rules" };
  const r = await fetch("/api/analyst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
  const d = await r.json(); return { answer: d.answer ?? d.error, mode: d.mode };
}
