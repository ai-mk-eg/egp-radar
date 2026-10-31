import { tick } from "@/lib/pipeline";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
/** For serverless schedulers (Vercel Cron, GitHub Actions, cron-job.org). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await tick());
}
