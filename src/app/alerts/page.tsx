"use client";
import { useState } from "react";
import { usePrefs } from "@/components/prefs";
import { useSnapshot } from "@/components/useSnapshot";
import { Card, Empty, Pill, Strength, timeCairo, fmt, pct } from "@/components/ui";

export default function Alerts() {
  const { t, lang } = usePrefs();
  const { data } = useSnapshot();
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  return (
    <div className="grid gap-4">
      <Card title={t("إشعارات المتصفح", "Browser notifications")}>
        <div className="flex items-center gap-3 text-sm">
          <span>{t("الحالة", "Status")}: <b>{perm}</b></span>
          {perm === "default" && <button onClick={async () => setPerm(await Notification.requestPermission())} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white">{t("تفعيل", "Enable")}</button>}
        </div>
        <p className="mt-2 text-xs text-muted">{t("تعمل أثناء فتح المنصة في المتصفح. للتنبيه والمتصفح مغلق استخدم Telegram أو البريد (الإعدادات).", "Works while the dashboard is open. For background alerts use Telegram or email (Settings).")}</p>
      </Card>
      <Card title={t("سجل التنبيهات", "Alert log")} sub={t("كل تنبيه بوقته والبيانات المسببة والمصدر وقوة الإشارة وحداثة البيانات", "Each alert with time, trigger data, sources, strength & freshness")}>
        {!data ? <Empty>…</Empty> : data.alerts.length === 0 ? <Empty>{t("لا توجد تنبيهات بعد", "No alerts yet")}</Empty> : (
          <ul className="grid gap-3">{data.alerts.map((a: any) => {
            const fr = JSON.parse(a.freshness_json || "{}");
            return (<li key={a.id} className="rounded-xl border border-line p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2"><Pill tone={a.severity === "critical" ? "down" : a.severity === "warning" ? "warn" : "neutral"}>{a.severity}</Pill>{a.strength && <Strength s={a.strength} />}<span className="text-muted">{timeCairo(a.created_at, lang, true)}</span><span className="text-muted">· {a.rule} · {a.channels}</span></div>
              <div className="mt-1 text-sm font-semibold">{lang === "ar" ? a.title_ar : a.title_en}</div>
              <div className="mt-1 whitespace-pre-wrap text-ink2">{lang === "ar" ? a.body_ar : a.body_en}</div>
              <div className="mt-1 text-[11px] text-muted">{t("المصادر", "Sources")}: {JSON.parse(a.sources_json || "[]").join(", ")} · {t("حداثة البيانات", "Freshness")}: {fr.headlineClass} @ {timeCairo(fr.headlineAsOf, lang, true)} · {t("بنوك محدثة", "fresh banks")}: {fr.freshBanks}</div>
            </li>);
          })}</ul>
        )}
      </Card>
      <Card title={t("سجل التوقعات مقابل الواقع", "Forecast vs reality")} sub={t("كل توقع صدر يُحفظ ولا يُحذف حتى لو كان خاطئًا", "Every issued forecast is kept, including wrong ones")}>
        {!data?.tracker?.length ? <Empty>{t("لا توجد توقعات مسجلة بعد", "No forecasts logged yet")}</Empty> : (
          <div className="scroll-x"><table className="w-full text-xs"><thead><tr className="text-muted"><th className="text-start">{t("الجلسة", "Session")}</th><th>{t("النموذج", "Model")}</th><th>{t("الاتجاه", "Call")}</th><th>P↑/=/↓</th><th>{t("الأساس", "Base")}</th><th>{t("الفعلي", "Actual")}</th><th>{t("النتيجة", "Result")}</th></tr></thead>
            <tbody>{data.tracker.map((f: any) => <tr key={f.id} className="border-t border-line"><td>{f.target_time}</td><td className="text-center">{f.model}</td><td className="text-center">{f.direction}</td><td className="num text-center">{pct(f.p_up)}/{pct(f.p_flat)}/{pct(f.p_down)}</td><td className="num text-center">{fmt(f.base_value, 3)}</td><td className="num text-center">{f.actual_value ? `${fmt(f.actual_value, 3)} (${f.actual_class})` : t("بانتظار", "pending")}</td><td className="text-center">{f.hit === null ? "—" : f.hit ? "✓" : "✗"}</td></tr>)}</tbody></table></div>
        )}
        <p className="mt-2 text-[11px] text-muted">{t("ملاحظة: عندما يكون النموذج المختار climatology فهذا ليس توقعًا بل معدلات تاريخية، ويُسجَّل للشفافية.", "When the model is 'climatology' it is base rates, not a forecast; logged for transparency.")}</p>
      </Card>
    </div>
  );
}
