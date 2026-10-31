import { getDb } from "@/lib/db";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
/** Server-Sent Events: pushes new alerts and a heartbeat. The client reloads the snapshot on each "tick". */
export async function GET(req: Request) {
  const db = await getDb();
  let lastId = (await db.get("SELECT MAX(id) m FROM alerts"))?.m ?? 0;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("hello", { at: new Date().toISOString() });
      const iv = setInterval(async () => {
        try {
          const rows = await db.all("SELECT * FROM alerts WHERE id > ? ORDER BY id", [lastId]);
          for (const r of rows) { send("alert", r); lastId = r.id; }
          send("tick", { at: new Date().toISOString() });
        } catch { /* keep stream alive */ }
      }, 15000);
      req.signal.addEventListener("abort", () => { clearInterval(iv); try { ctrl.close(); } catch {} });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
