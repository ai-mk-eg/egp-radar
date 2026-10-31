import { buildSnapshot } from "@/lib/snapshot";
import { askAnalyst } from "@/lib/analyst";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const hits = new Map<string, number[]>();
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now(); const h = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (h.length >= 10) return Response.json({ error: "rate_limited" }, { status: 429 });
  hits.set(ip, [...h, now]);
  const { question } = await req.json().catch(() => ({ question: "" }));
  if (!question || typeof question !== "string" || question.length > 1000) return Response.json({ error: "bad_question" }, { status: 400 });
  try { return Response.json(await askAnalyst(question, await buildSnapshot())); }
  catch (e) { console.error(e); return Response.json({ error: "analyst_failed" }, { status: 502 }); }
}
