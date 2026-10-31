"use client";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/prefs";
import { Card, Empty, Pill } from "@/components/ui";

export default function SettingsPage() {
  const { t } = usePrefs();
  const [s, setS] = useState<any>(null); const [cfg, setCfg] = useState<any>(null); const [msg, setMsg] = useState(""); const [token, setToken] = useState("");
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((j) => { setS(j.settings); setCfg(j.channelsConfigured); }); }, []);
  if (!s) return <Empty>…</Empty>;
  const save = async () => {
    const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": token }, body: JSON.stringify(s) });
    setMsg(r.ok ? t("تم الحفظ", "Saved") : t("غير مصرح — أدخل ADMIN_TOKEN", "Unauthorized — enter ADMIN_TOKEN"));
  };
  const num = (k: string, ar: string, en: string, step = 0.01) => (
    <label className="grid gap-1 text-xs"><span className="text-ink2">{t(ar, en)}</span>
      <input type="number" step={step} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} className="rounded-lg border border-line bg-card2 px-3 py-2 text-sm" /></label>
  );
  return (
    <div className="grid max-w-3xl gap-4">
      <Card title={t("حساسية التنبيهات", "Alert sensitivity")} sub={t("لتقليل الرسائل المتكررة والإنذارات المزعجة", "Reduce noise and repeated alerts")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs"><span className="text-ink2">{t("الحساسية", "Sensitivity")}</span>
            <select value={s.sensitivity} onChange={(e) => setS({ ...s, sensitivity: e.target.value })} className="rounded-lg border border-line bg-card2 px-3 py-2 text-sm">
              <option value="low">{t("منخفضة (أقل رسائل)", "Low")}</option><option value="medium">{t("متوسطة", "Medium")}</option><option value="high">{t("عالية (أكثر رسائل)", "High")}</option></select></label>
          <label className="grid gap-1 text-xs"><span className="text-ink2">{t("أقل أهمية تُرسل خارجيًا", "Min severity sent externally")}</span>
            <select value={s.minSeverity} onChange={(e) => setS({ ...s, minSeverity: e.target.value })} className="rounded-lg border border-line bg-card2 px-3 py-2 text-sm">
              <option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option></select></label>
          {num("priceMoveAlertEgp", "تنبيه عند تحرك الدولار بمقدار (جنيه)", "Alert when USD moves by (EGP)")}
          {num("dispersionAlertEgp", "تنبيه عند فرق بين البنوك (جنيه)", "Cross-bank gap alert (EGP)")}
          {num("cooldownMin", "فترة التهدئة بين تنبيهات نفس النوع (دقيقة)", "Cooldown per rule (min)", 1)}
          {num("sessionReminderMin", "تذكير قبل افتتاح الجلسة (دقيقة)", "Pre-open reminder (min)", 1)}
          {num("thetaPct", "عتبة 'الاستقرار' للتوقع (%)", "Forecast flat band (%)")}
        </div>
      </Card>
      <Card title={t("قنوات التنبيه", "Channels")} sub={t("المفاتيح تُضبط في متغيرات البيئة على الخادم فقط", "Credentials are set in server env vars only")}>
        <div className="grid gap-2 text-sm">
          {(["telegram", "email", "browser"] as const).map((c) => (
            <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={s.channels[c]} onChange={(e) => setS({ ...s, channels: { ...s.channels, [c]: e.target.checked } })} />
              <span>{c}</span>{c !== "browser" && (cfg?.[c] ? <Pill tone="up">{t("مُعدّ", "configured")}</Pill> : <Pill tone="warn">{t("غير مُعدّ في البيئة", "not configured")}</Pill>)}</label>))}
          <div className="text-xs text-muted">Claude API: {cfg?.claude ? t("مُعدّ (تصنيف الأخبار + المحلل الذكي)", "configured") : t("غير مُعدّ — يُستخدم وضع القواعد", "not configured — rules mode")}</div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <input type="password" placeholder="ADMIN_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} className="rounded-lg border border-line bg-card2 px-3 py-2 text-sm" />
        <button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">{t("حفظ", "Save")}</button><span className="text-sm text-muted">{msg}</span>
      </div>
    </div>
  );
}
