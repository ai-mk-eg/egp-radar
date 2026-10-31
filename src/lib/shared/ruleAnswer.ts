/** Deterministic analyst answers (no API key, and the static GitHub Pages build). Pure — safe for the browser. */
import banks from "../../../config/banks.json";

const nameOf = (id: string) => banks.banks.find((b) => b.id === id)?.name_ar ?? id;
const p = (x: number) => `${Math.round(x * 100)}%`;

export function ruleAnswer(q: string, s: any): string {
  const t = q.toLowerCase();
  if (/أول|اول|first|بدأ/.test(t)) {
    const f = s.firstMoverToday;
    return f ? `أول تغيير مرصود اليوم: ${nameOf(f.entity)} ${f.direction > 0 ? "رفع" : "خفض"} سعر الدولار (رُصد ${f.detected_at}؛ التغيير حدث بين ${f.prev_seen_at} و${f.detected_at}).`
      : "لم يُرصد أي تغيير في أسعار البنوك المراقبة اليوم (أو لا توجد أسعار بنوك حديثة بعد — راجع صفحة صحة المصادر).";
  }
  if (/تحذير|إنذار|انذار|alert|سبب/.test(t)) {
    const a = s.alerts?.[0];
    return a ? `آخر تنبيه (${a.created_at}): ${a.title_ar}\n${a.body_ar ?? ""}\nالمصادر: ${a.sources_json}` : "لا توجد تنبيهات حالية.";
  }
  const ns = s.forecast?.nextSession;
  if (!ns || ns.status !== "ok") return `بيانات غير كافية للتوقع: ${ns?.reason ?? "—"}`;
  const radar = s.radar?.active ? `\nتنبيه: توجد حركة بنوك فعلية جارية الآن (${s.radar.movers.map(nameOf).join("، ")}) — ${s.radar.active.direction > 0 ? "رفع" : "خفض"} للدولار.` : "";
  return (ns.showProbabilities
    ? `توقع الجلسة القادمة (${s.market.nextSessionDate}) بنموذج ${ns.model}: صعود الدولار ${p(ns.probs[2])}، استقرار ${p(ns.probs[1])}، هبوط ${p(ns.probs[0])}. قوة الأدلة: ${ns.evidence}. النطاق المرجح: ${ns.rangeLow.toFixed(2)}–${ns.rangeHigh.toFixed(2)}.`
    : `لا يوجد نموذج تفوّق على المعدلات التاريخية في الاختبار خارج العينة (${ns.backtest.nTest} جلسة)، لذلك لا توجد مؤشرات موثوقة على اتجاه الجلسة القادمة. المعدلات التاريخية: صعود ${p(ns.probs[2])}، استقرار ${p(ns.probs[1])}، هبوط ${p(ns.probs[0])}. النطاق المعتاد ليوم واحد: ${ns.rangeLow.toFixed(2)}–${ns.rangeHigh.toFixed(2)} (المصدر: سعر مرجعي يومي).`) + radar;
}
