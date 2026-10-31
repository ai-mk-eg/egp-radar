import { getDb } from "@/lib/db";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  const db = await getDb();
  const rows = await db.all("SELECT id, created_at, payload FROM backtests ORDER BY id");
  return Response.json(rows.map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.payload) })));
}
