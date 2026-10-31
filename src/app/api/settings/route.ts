import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "@/lib/snapshot";
import { config } from "@/lib/config";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const authorized = (req: Request) => !process.env.ADMIN_TOKEN || req.headers.get("x-admin-token") === process.env.ADMIN_TOKEN;
export async function GET() {
  return Response.json({ settings: await loadSettings(),
    channelsConfigured: { telegram: Boolean(config.telegram.token && config.telegram.chatId), email: Boolean(config.smtp.host && config.smtp.to), claude: config.hasAnthropic() } });
}
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const cur = await getSetting<Settings>("settings", DEFAULT_SETTINGS);
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && v >= lo && v <= hi ? v : d);
  const next: Settings = {
    thetaPct: num(body.thetaPct, 0.01, 2, cur.thetaPct),
    sensitivity: ["low", "medium", "high"].includes(body.sensitivity) ? body.sensitivity : cur.sensitivity,
    priceMoveAlertEgp: num(body.priceMoveAlertEgp, 0.01, 20, cur.priceMoveAlertEgp),
    dispersionAlertEgp: num(body.dispersionAlertEgp, 0.01, 20, cur.dispersionAlertEgp),
    channels: { telegram: Boolean(body.channels?.telegram), email: Boolean(body.channels?.email), browser: Boolean(body.channels?.browser) },
    minSeverity: ["info", "warning", "critical"].includes(body.minSeverity) ? body.minSeverity : cur.minSeverity,
    cooldownMin: num(body.cooldownMin, 5, 1440, cur.cooldownMin), sessionReminderMin: num(body.sessionReminderMin, 0, 180, cur.sessionReminderMin),
  };
  await setSetting("settings", next);
  return Response.json({ settings: next });
}
