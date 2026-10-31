"use client";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/prefs";
import { Card, fmt, pct } from "@/components/ui";
import { getBacktest } from "@/lib/client";

export default function Methodology() {
  const { t } = usePrefs();
  const [bt, setBt] = useState<any[]>([]);
  useEffect(() => { getBacktest().then(setBt); }, []);
  const S = ({ h, children }: { h: string; children: React.ReactNode }) => <Card title={h}><div className="grid gap-2 text-sm leading-7 text-ink2">{children}</div></Card>;
  return (
    <div className="grid max-w-4xl gap-4">
      <S h={t("1. الكشف اللحظي (Instant Radar)", "1. Instant radar")}>
        <p>{t("نسحب صفحات أسعار البنوك بشكل دوري ونخزن السعر فقط عند تغيّره. كل تغيير يُسجل بوقت رصده ووقت آخر قراءة قبله، فالتغيير الحقيقي حدث بينهما. نجمع تغيرات البنوك في نفس الاتجاه خلال 45 دقيقة في «حلقة»، ثم نحسب تاريخيًا: من بدأ أولًا، متوسط التأخر، ونسبة المتابعة مع فترات ثقة ويلسون 95%.",
          "We poll bank pages and store a quote only when it changes. Each change carries detection time and previous-seen time. Same-direction changes within 45 min form an episode; we compute who led, median lag and follow rates with Wilson 95% intervals.")}</p>
        <p>{t("قوة الإشارة: قوية إذا كان الحد الأدنى لفترة الثقة ≥ 70%، متوسطة ≥ 45%، وإلا ضعيفة؛ وأقل من 8 حالات = بيانات غير كافية.", "Strength: strong if Wilson lower bound ≥ 70%, moderate ≥ 45%, else weak; < 8 cases = insufficient.")}</p>
      </S>
      <S h={t("2. توقع الجلسة القادمة", "2. Next-session forecast")}>
        <p>{t("البيانات: سعر مرجعي يومي مفتوح (currency-api) منذ مارس 2024 مع استبعاد ما قبل تحرير الصرف (10 مارس 2024). اللقطة المؤرخة D تعكس سوق اليوم D-1، ونستخدم أيام العمل المصرفية فقط.", "Data: open daily reference since Mar-2024, pre-float excluded. Snapshot D reflects market day D-1; banking days only.")}</p>
        <p>{t("النماذج المختبرة: المعدلات التاريخية (climatology)، سلسلة ماركوف لاتجاه آخر جلسة، وانحدار لوجستي متعدد الفئات بميزات: تغيرات 1/5/20 جلسة، التذبذب، البعد عن المتوسط، مؤشر دولار محسوب بمعادلة ICE، سلة عملات ناشئة، الذهب.", "Models: climatology, Markov on last direction, multinomial logistic regression on returns, volatility, z-score, synthetic DXY, EM basket, gold.")}</p>
        <p>{t("الاختبار: Walk-forward — يُعاد تدريب النموذج كل 10 جلسات على البيانات السابقة فقط، ويُقيَّم على الجلسة التالية. يُعرض احتمال الاتجاه فقط إذا تفوّق النموذج على المعدلات التاريخية في Log-loss و Brier (BSS > 2%) على ≥ 100 جلسة.", "Walk-forward, refit every 10 sessions on past data only. Probabilities shown only if the model beats climatology on log-loss and Brier (BSS > 2%) over ≥ 100 sessions.")}</p>
      </S>
      <Card title={t("النتائج الحالية للاختبار التاريخي (بيانات حقيقية)", "Current backtest results (real data)")}>
        {bt.length === 0 ? <p className="text-sm text-muted">{t("شغّل npm run backtest", "Run npm run backtest")}</p> : bt.map((b) => (
          <div key={b.id} className="mb-3 text-xs">
            <div className="font-semibold">θ = ±{b.thetaPct}% — n={b.nTest} ({b.firstTest} → {b.lastTest}) — {t("المختار", "selected")}: {b.selected}</div>
            <div className="scroll-x"><table className="mt-1 w-full"><thead><tr className="text-muted"><th className="text-start">Model</th><th>Log-loss</th><th>Brier</th><th>Acc</th><th>BSS</th></tr></thead>
              <tbody>{Object.entries(b.metrics).map(([k, v]: any) => <tr key={k}><td>{k}</td><td className="num text-center">{fmt(v.logLoss, 3)}</td><td className="num text-center">{fmt(v.brier, 3)}</td><td className="num text-center">{pct(v.accuracy, 1)}</td><td className="num text-center">{pct(v.bss, 1)}</td></tr>)}</tbody></table></div>
            <div className="text-muted">{t("تغطية النطاق 80%", "80% range coverage")}: {pct(b.interval.coverage, 1)} · {t("متوسط الخطأ المطلق لتوقع «لا تغيير»", "No-change MAE")}: {fmt(b.pointMae.noChange, 3)}%</div>
          </div>
        ))}
        <p className="text-sm text-warn">{t("الخلاصة الصادقة: اتجاه الجلسة القادمة شبه غير قابل للتنبؤ من البيانات العامة المجانية؛ الأفضلية المكتشفة صغيرة جدًا. لذلك تعرض المنصة المعدلات التاريخية وتصرّح بغياب الأفضلية بدل اختلاق ثقة.", "Honest finding: next-session direction is close to unpredictable from free public data; any edge is tiny. The platform shows base rates and says so instead of inventing confidence.")}</p>
      </Card>
      <S h={t("3. توقعات الساعات (1/3/6/12)", "3. Hourly horizons")}>
        <p>{t("لا يوجد مصدر مجاني لتاريخ لحظي لأسعار البنوك المصرية. لذلك تُبنى هذه التوقعات فقط من البيانات التي تجمعها المنصة، وتظل «غير كافية» حتى 20 يوم جلسة و30 عينة للحالة الحالية، ثم تُختبر بتقسيم زمني حسب اليوم.", "No free intraday history exists; built only from collected data and gated at 20 session days / 30 state samples, then day-blocked validation.")}</p>
      </S>
      <S h={t("4. الأخبار", "4. News")}>
        <p>{t("Google News RSS و GDELT. التصنيف بـ Claude (مخرجات منظمة) عند ضبط المفتاح، وإلا بقواعد كلمات مفتاحية مُعلنة. التصنيف يخص ضغط سعر الدولار بالجنيه وليس «خبر جيد/سيئ». الخبر الذي يعرض السعر فقط لا يُعد عاملًا مؤثرًا.", "Google News RSS & GDELT. Classified by Claude (structured output) or transparent rules. Labels describe pressure on USD/EGP; price-listing articles are not drivers.")}</p>
      </S>
      <S h={t("5. دمج الإشارات", "5. Signal fusion")}>
        <p>{t("نعرض عدد الإشارات المستقلة المتفقة والمتعارضة (حركة بنوك فعلية، النموذج، الأخبار، العملات الناشئة) دون تحويلها لنسبة مركبة غير معايرة.", "We count agreeing/conflicting independent signals rather than inventing an uncalibrated composite score.")}</p>
      </S>
    </div>
  );
}
