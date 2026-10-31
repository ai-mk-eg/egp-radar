import { getDb } from "@/lib/db";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const days = Math.min(Number(new URL(req.url).searchParams.get("days") || 365), 2000);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const db = await getDb();
  const daily = await db.all("SELECT date, egp, source FROM daily_fx WHERE date >= ? ORDER BY date", [since]);
  const quotes = await db.all("SELECT entity, buy, sell, mid, first_seen_at, last_seen_at FROM quotes WHERE source_id LIKE 'bank:%' AND first_seen_at >= ? ORDER BY first_seen_at", [since]);
  const changes = await db.all("SELECT * FROM price_changes WHERE detected_at >= ? ORDER BY detected_at DESC LIMIT 500", [since]);
  return Response.json({ daily, quotes, changes });
}
