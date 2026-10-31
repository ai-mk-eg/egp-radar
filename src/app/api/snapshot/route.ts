import { buildSnapshot } from "@/lib/snapshot";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await buildSnapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error(e); return Response.json({ error: "snapshot_failed" }, { status: 500 }); }
}
