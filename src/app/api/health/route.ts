import { getDb } from "@/lib/db";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  const db = await getDb();
  const sources = await db.all("SELECT * FROM sources ORDER BY kind, id");
  const ok = sources.filter((s) => s.last_success_at && !s.last_error).length;
  return Response.json({ db: db.dialect, sources, summary: { total: sources.length, healthy: ok } });
}
