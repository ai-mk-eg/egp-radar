"use client";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/prefs";
import { Card, DataClass, Empty, Pill, ago, timeCairo } from "@/components/ui";
import { getHealth } from "@/lib/client";

export default function Health() {
  const { t, lang } = usePrefs();
  const [d, setD] = useState<any>(null);
  useEffect(() => { const f = () => getHealth().then(setD); f(); const iv = setInterval(f, 30000); return () => clearInterval(iv); }, []);
  if (!d) return <Empty>…</Empty>;
  const status = (s: any) => {
    if (!s.last_attempt_at) return ["لم يُشغَّل بعد", "Never run", "neutral"];
    if (s.last_error && !s.last_success_at) return ["فشل — لم ينجح قط", "Failing — never succeeded", "down"];
    if (s.last_error) return ["فشل مؤخرًا", "Failing", "down"];
    const age = (Date.now() - new Date(s.last_success_at).getTime()) / 1000;
    if (age > s.poll_seconds * 4 + 600) return ["متأخر", "Stale", "warn"];
    return ["يعمل", "OK", "up"];
  };
  return (
    <div className="grid gap-4">
      <Card title={t("مراقب حداثة المصادر", "Data freshness monitor")} sub={t(`قاعدة البيانات: ${d.db} · مصادر تعمل: ${d.summary.healthy}/${d.summary.total}`, `DB: ${d.db} · healthy: ${d.summary.healthy}/${d.summary.total}`)}>
        <div className="scroll-x"><table className="w-full text-xs">
          <thead><tr className="text-muted"><th className="text-start">{t("المصدر", "Source")}</th><th>{t("النوع", "Class")}</th><th>{t("الحالة", "Status")}</th><th>{t("آخر نجاح", "Last success")}</th><th>{t("آخر تغيّر بيانات", "Last data change")}</th><th>{t("فشل متتالٍ", "Fails")}</th><th>{t("الاستجابة", "Latency")}</th><th className="text-start">{t("آخر خطأ", "Last error")}</th></tr></thead>
          <tbody>{d.sources.map((s: any) => { const [ar, en, tone] = status(s); return (
            <tr key={s.id} className="border-t border-line align-top"><td className="py-1.5"><div className="font-medium">{s.id}</div><a className="text-[10px] text-muted hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>{!s.verified && <div><Pill tone="warn">{t("محوّل غير متحقق", "unverified adapter")}</Pill></div>}</td>
              <td className="text-center"><DataClass cls={s.data_class} /></td><td className="text-center"><Pill tone={tone as any}>{t(ar, en)}</Pill></td>
              <td className="text-center">{s.last_success_at ? `${timeCairo(s.last_success_at, lang, true)}` : "—"}</td><td className="text-center">{s.last_change_at ? ago((Date.now() - new Date(s.last_change_at).getTime()) / 60000, lang) : "—"}</td>
              <td className="num text-center">{s.consecutive_failures}</td><td className="num text-center">{s.last_latency_ms ? `${s.last_latency_ms}ms` : "—"}</td><td className="max-w-[260px] break-words text-down">{s.last_error ?? ""}</td></tr>); })}</tbody>
        </table></div>
      </Card>
      <Card title={t("ماذا تعني الأنواع؟", "What the classes mean")}>
        <ul className="grid gap-1 text-xs text-ink2">
          <li><DataClass cls="polled" /> {t("نسحب صفحة البنك كل بضع دقائق. ليست بيانات لحظية؛ التغيير حدث بين قراءتين.", "We poll the page every few minutes. Not tick data.")}</li>
          <li><DataClass cls="daily" /> {t("سعر مرجعي مجمّع مرة يوميًا (~00:00 UTC).", "Aggregated reference, once a day (~00:00 UTC).")}</li>
          <li><DataClass cls="delayed" /> {t("سلسلة رسمية تُنشر بتأخير (مثل FRED).", "Official series published with a lag (e.g., FRED).")}</li>
        </ul>
      </Card>
    </div>
  );
}
