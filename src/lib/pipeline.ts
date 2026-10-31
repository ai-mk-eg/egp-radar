import { runCycle } from "./collector";
import { classifyPendingNews } from "./engine/news";
import { buildSnapshot, DEFAULT_SETTINGS, type Settings } from "./snapshot";
import { processAlerts } from "./alerts/engine";
import { logNextSession, resolveForecasts } from "./engine/tracker";
import { getSetting } from "./db";
import type { NextSessionForecast } from "./engine/daily";

/** One full pipeline tick: collect → classify news → resolve/log forecasts → evaluate alerts. */
export async function tick(opts: { force?: boolean } = {}) {
  const report = await runCycle(opts);
  const classified = await classifyPendingNews().catch((e) => { console.error(e); return 0; });
  const st = await getSetting<Settings>("settings", DEFAULT_SETTINGS);
  await resolveForecasts(st.thetaPct);
  const snap = await buildSnapshot();
  const ns = snap.forecast.nextSession as NextSessionForecast;
  if (ns.status === "ok") await logNextSession(ns, snap.market.nextSessionDate);
  const alerts = await processAlerts(snap, st);
  return { ...report, classified, alerts };
}
