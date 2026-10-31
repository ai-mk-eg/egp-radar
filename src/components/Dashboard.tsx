"use client";
import { useState } from "react";
import { usePrefs } from "./prefs";
import { useSnapshot } from "./useSnapshot";
import { askAnalyst, STATIC } from "@/lib/client";
import { Card, DataClass, Empty, Pill, Strength, UsdDir, ago, fmt, pct, timeCairo } from "./ui";

export function Dashboard() {
  const { data, error, live } = useSnapshot();
  const { t } = usePrefs();
  if (!data) return <Empty>{error ? t(`تعذّر تحميل البيانات (${error})`, `Failed to load (${error})`) : t("جارٍ التحميل…", "Loading…")}</Empty>;
  return (
    <div className="grid gap-4">
      <TopBar s={data} live={live} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Headline s={data} />
        <Radar s={data} />
        <Fusion s={data} />
      </div>
      <Heatmap s={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Prediction s={data} />
        <Leaderboard s={data} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Indicators s={data} />
        <News s={data} />
        <Analyst />
      </div>
    </div>
  );
}

function TopBar({ s, live }: { s: any; live: boolean }) {
  const { t, lang } = usePrefs();
  const m = s.market;
  const st: Record<string, [string, string, any]> = {
    open: ["السوق المصرفي مفتوح", "Bank session open", "up"], pre_open: ["قبل افتتاح الجلسة", "Pre-open", "warn"],
    closed_after: ["الجلسة انتهت", "Session closed", "neutral"], weekend: ["عطلة نهاية الأسبوع — البنوك مغلقة", "Weekend — banks closed", "neutral"],
    holiday: [`عطلة رسمية: ${m.holiday?.name_ar ?? ""}`, `Holiday: ${m.holiday?.name_en ?? ""}`, "warn"],
  };
  const [ar, en, tone] = st[m.state];
  const h = m.minutesToOpen; const hh = h !== null ? `${Math.floor(h / 60)}:${String(h % 60).padStart(2, "0")}` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Pill tone={tone}>{t(ar, en)}</Pill>
      {hh && <Pill>{t("الجلسة القادمة", "Next session")} <span className="num">{m.nextSessionDate}</span> — {t("بعد", "in")} <span className="num">{hh}</span></Pill>}
      {STATIC ? <Pill>{t("تُجمع البيانات تلقائيًا كل ~15 دقيقة", "Data collected automatically every ~15 min")}</Pill> : <Pill tone={live ? "accent" : "neutral"}>{live ? t("● تحديث تلقائي متصل", "● Live updates connected") : t("○ تحديث دوري", "○ Periodic refresh")}</Pill>}
      <span className="text-muted">{t("آخر بناء للبيانات", "Snapshot")}: {timeCairo(s.generatedAt, lang)} {t("(توقيت القاهرة)", "(Cairo)")}</span>
    </div>
  );
}

function Headline({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const h = s.headline; const ref = s.reference;
  const isDaily = h.dataClass !== "polled";
  return (
    <Card title={t("سعر الدولار مقابل الجنيه", "USD/EGP")} sub={t("آخر سعر متاح ومصدره", "Latest available price & its source")} right={<DataClass cls={h.dataClass} />}>
      {isDaily ? (
        <div>
          <div className="num text-4xl font-bold">{fmt(h.mid, 4)}</div>
          <p className="mt-1 text-xs text-warn">{t("لا توجد أسعار بنوك حديثة — هذا سعر مرجعي يومي مجمّع وليس سعر شراء/بيع في بنك.", "No fresh bank quotes — this is a daily aggregated reference, not a bank buy/sell price.")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-muted">{t("شراء", "Buy")}</div><div className="num text-3xl font-bold">{fmt(h.buy)}</div></div>
          <div><div className="text-xs text-muted">{t("بيع", "Sell")}</div><div className="num text-3xl font-bold">{fmt(h.sell)}</div></div>
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">{t("المصدر", "Source")}</dt><dd>{isDaily ? t("currency-api — مرجعي يومي مجمّع (ليس سعر بنك)", "currency-api — daily aggregated reference (not a bank price)") : h.source === "CBE" ? t("البنك المركزي المصري", "Central Bank of Egypt") : h.source}</dd>
        <dt className="text-muted">{t("وقت القراءة", "As of")}</dt><dd>{timeCairo(h.asOf, lang, true)}</dd>
        {ref.daily && <><dt className="text-muted">{t("مرجعي يومي", "Daily ref.")}</dt><dd><span className="num">{fmt(ref.daily.egp, 4)}</span> {ref.daily.change !== null && <UsdDir d={Math.sign(Math.round(ref.daily.change * 100))} />} <span className="text-muted">({t("سوق", "mkt")} <span className="num">{ref.daily.marketDay}</span>)</span></dd></>}
        {ref.erapi && <><dt className="text-muted">ExchangeRate-API</dt><dd><span className="num">{fmt(ref.erapi.mid, 4)}</span> <span className="text-muted">{timeCairo(ref.erapi.asOf, lang, true)}</span></dd></>}
      </dl>
    </Card>
  );
}

function Radar({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const r = s.radar;
  const name = (id: string) => s.banks.find((b: any) => b.id === id)?.[lang === "ar" ? "name_ar" : "name_en"] ?? id;
  return (
    <Card title={t("رادار الإنذار المبكر", "Early-warning radar")} sub={t("حركات حدثت فعلًا + من يتبع عادةً (من التاريخ المجمّع)", "Moves that already happened + who usually follows")}>
      {r.active ? (
        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2"><UsdDir d={r.active.direction} size="lg" /><span>{t(`${r.movers.length} بنوك تحركت خلال ${r.windowMin} دقيقة`, `${r.movers.length} banks moved within ${r.windowMin} min`)}</span></div>
          <ol className="text-xs text-ink2">{r.active.order.map((o: any) => <li key={o.entity}>{name(o.entity)} — {timeCairo(o.at, lang)} {o.tieWithLeader && <Pill>{t("ترتيب غير مؤكد", "tie")}</Pill>}</li>)}</ol>
          <div className="text-xs">{t("احتمال اتساع الحركة لبنك إضافي", "Chance the move spreads to another bank")}: <Strength s={r.clusterStrength?.strength} /> <span className="num text-muted">{pct(r.clusterStrength?.p)} (n={r.clusterStrength?.n})</span></div>
          <div className="text-xs font-semibold">{t("لم تتحرك بعد", "Not moved yet")}</div>
          <ul className="grid gap-1 text-xs">{r.laggards.map((l: any) => <li key={l.entity} className="flex justify-between"><span>{name(l.entity)}</span><span><Strength s={l.strength.strength} /> <span className="num text-muted">{pct(l.strength.p)} n={l.strength.n}</span></span></li>)}</ul>
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <Empty>{t("لا توجد حركة متزامنة نشطة بين البنوك الآن.", "No active multi-bank move right now.")}</Empty>
          {s.firstMoverToday && <p className="text-xs">{t("أول تغيير اليوم", "First change today")}: <b>{name(s.firstMoverToday.entity)}</b> <UsdDir d={s.firstMoverToday.direction} /> {timeCairo(s.firstMoverToday.detected_at, lang)}</p>}
          <p className="text-xs text-muted">{t(`الحلقات التاريخية المسجلة: ${s.episodesCount}. قوة أي إشارة تُحسب من عدد الحالات السابقة (حد أدنى 8).`, `Recorded episodes: ${s.episodesCount}. Signal strength needs ≥ 8 past cases.`)}</p>
        </div>
      )}
      {r.recent.length > 0 && (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">{t("آخر التغيرات (6 ساعات)", "Recent changes (6h)")}</summary>
          <ul className="mt-1 grid gap-0.5">{r.recent.slice(0, 15).map((c: any, i: number) => <li key={i}>{timeCairo(c.detected_at, lang)} — {name(c.entity)} <UsdDir d={c.direction} /> <span className="num">{fmt(c.old_buy)}→{fmt(c.new_buy)}</span></li>)}</ul>
        </details>
      )}
      <p className="mt-2 text-[11px] text-muted">{t("دقة التوقيت = فترة السحب (التغيير حدث بين آخر قراءتين).", "Timing precision = poll interval (change happened between two polls).")}</p>
    </Card>
  );
}

function Fusion({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const f = s.fusion;
  return (
    <Card title={t("دمج الإشارات", "Signal fusion")} sub={t("عدد المؤشرات المستقلة المتفقة — بدون نسب مصطنعة", "Independent signals that agree — no synthetic score")}>
      {f.signals.length === 0 ? <Empty>{t("لا توجد إشارات نشطة. عدم وجود إشارة ≠ استقرار مضمون.", "No active signals. No signal ≠ guaranteed stability.")}</Empty> : (
        <>
          <div className="mb-2 flex items-center gap-2 text-sm"><UsdDir d={f.direction} kind="forecast" size="lg" /><span className="text-xs text-muted">{t(`${f.agreeing} متفقة / ${f.conflicting} متعارضة`, `${f.agreeing} agree / ${f.conflicting} conflict`)}</span></div>
          <ul className="grid gap-1.5 text-xs">{f.signals.map((x: any) => <li key={x.key} className="flex items-center justify-between gap-2"><span>{lang === "ar" ? x.ar : x.en} <span className="text-muted">({x.detail})</span></span><span className="flex gap-1"><UsdDir d={x.direction} kind={x.key === "radar" ? "actual" : "forecast"} /><Strength s={x.strength} /></span></li>)}</ul>
        </>
      )}
      <div className="mt-3 border-t border-line pt-2 text-xs">
        <div className="mb-1 font-semibold">{t("آخر التنبيهات", "Latest alerts")}</div>
        {s.alerts.length === 0 ? <span className="text-muted">—</span> : <ul className="grid gap-1">{s.alerts.slice(0, 4).map((a: any) => <li key={a.id}><Pill tone={a.severity === "critical" ? "down" : a.severity === "warning" ? "warn" : "neutral"}>{a.severity}</Pill> {lang === "ar" ? a.title_ar : a.title_en} <span className="text-muted">{timeCairo(a.created_at, lang)}</span></li>)}</ul>}
      </div>
    </Card>
  );
}

function Heatmap({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  return (
    <Card title={t("خريطة حركة البنوك", "Bank movement heatmap")} sub={t("التغير مقابل آخر سعر في اليوم السابق — بالجنيه", "Change vs previous day's last quote — EGP")} right={<DataClass cls="polled" />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {s.banks.map((b: any) => {
          const d = b.vsPrevDay?.direction ?? null;
          const bg = !b.buy ? "var(--card-2)" : d > 0 ? "color-mix(in oklab, var(--usd-up) 22%, var(--card))" : d < 0 ? "color-mix(in oklab, var(--usd-down) 22%, var(--card))" : "var(--card-2)";
          return (
            <div key={b.id} className="rounded-xl border border-line p-2.5" style={{ background: bg }} title={b.error ?? ""}>
              <div className="flex items-center justify-between gap-1"><span className="truncate text-xs font-semibold">{lang === "ar" ? b.name_ar : b.name_en}</span>{b.official && <Pill tone="accent">CBE</Pill>}</div>
              {b.buy ? (
                <>
                  <div className="num mt-1 text-sm font-bold">{fmt(b.buy)} / {fmt(b.sell)}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px]"><UsdDir d={d} /><span className="num">{b.vsPrevDay ? `${b.vsPrevDay.dBuy >= 0 ? "+" : ""}${fmt(b.vsPrevDay.dBuy)}` : "—"}</span></div>
                  <div className="text-[10px] text-muted">{t("تغيّر", "changed")} {timeCairo(b.changedAt, lang)} · {t("تأكيد", "seen")} {ago(b.ageMin, lang)} {!b.fresh && <span className="text-warn">· {t("قديم", "stale")}</span>}</div>
                </>
              ) : (
                <div className="mt-1 text-[11px] text-muted">{b.error ? t("المصدر لا يعمل — راجع صحة المصادر", "Source failing — see Data health") : t("لم يُجمع بعد", "Not collected yet")}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Prediction({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const ns = s.forecast.nextSession; const intr = s.forecast.intraday;
  const probRow = (p: number[]) => (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      {[[2, "صعود", "Up", "text-up"], [1, "استقرار", "Flat", "text-ink2"], [0, "هبوط", "Down", "text-down"]].map(([i, ar, en, c]) => (
        <div key={i as number} className="rounded-lg bg-card2 p-2"><div className="text-muted">{t(`الدولار: ${ar}`, `USD ${en}`)}</div><div className={`num text-lg font-bold ${c}`}>{pct(p[i as number])}</div></div>
      ))}
    </div>
  );
  return (
    <Card title={t("مركز التوقعات", "Prediction center")} sub={t("كل توقع مُختبر خارج العينة ومقارن بخط أساس بسيط", "Every forecast is backtested out-of-sample vs a simple baseline")}>
      <div className="grid gap-3">
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">{t("الجلسة القادمة", "Next session")} <span className="num">{s.market.nextSessionDate}</span></b>
            {ns.status === "ok" ? <Strength s={ns.evidence} /> : <Strength s="insufficient" />}
          </div>
          {ns.status !== "ok" ? <Empty>{t("بيانات غير كافية", "Insufficient data")}: {ns.reason}</Empty> : (
            <div className="grid gap-2 text-xs">
              {ns.showProbabilities ? <>{probRow(ns.probs)}<div><UsdDir d={ns.direction} kind="forecast" size="lg" /></div></> : (
                <div className="rounded-lg border border-warn/40 p-2 text-warn">
                  {t(`لا يوجد نموذج تفوّق على المعدلات التاريخية في ${ns.backtest.nTest} جلسة اختبار. لا تثق في أي "توقع اتجاه" لهذه الجلسة. المعدلات التاريخية للمقارنة فقط:`,
                    `No model beat historical base rates over ${ns.backtest.nTest} test sessions. Don't trust a direction call. Base rates for reference only:`)}
                  <div className="mt-2">{probRow(ns.probs)}</div>
                </div>
              )}
              <div>{t("النطاق المرجح (80% اسمي)", "Likely range (80% nominal)")}: <span className="num font-semibold">{fmt(ns.rangeLow)} – {fmt(ns.rangeHigh)}</span> <span className="text-muted">{t(`— التغطية الفعلية تاريخيًا ${pct(ns.backtest.interval.coverage)}`, `— realized coverage ${pct(ns.backtest.interval.coverage)}`)}</span></div>
              {ns.drivers?.length > 0 && <div>{t("أهم المؤثرات", "Top drivers")}: {ns.drivers.map((d: any) => (lang === "ar" ? d.ar : d.en)).join(" · ")}</div>}
              <div className="text-muted">{t("الأساس: سعر مرجعي يومي", "Base: daily ref")} <span className="num">{fmt(ns.base, 4)}</span> ({t("سوق", "market")} <span className="num">{ns.basedOnMarketDay}</span>). {t("عتبة «الاستقرار»", "Flat band")}: <span className="num">±{s.settings.thetaPct}%</span></div>
              <details><summary className="cursor-pointer text-muted">{t("نتائج الاختبار التاريخي (Walk-forward)", "Walk-forward backtest")}</summary>
                <div className="scroll-x"><table className="mt-1 w-full text-[11px]"><thead><tr className="text-muted"><th className="text-start">{t("النموذج", "Model")}</th><th>Log-loss</th><th>Brier</th><th>{t("الدقة", "Acc.")}</th><th>BSS</th></tr></thead>
                  <tbody>{Object.entries(ns.backtest.metrics).map(([k, v]: any) => <tr key={k} className={k === ns.model ? "font-bold" : ""}><td>{k}</td><td className="num">{fmt(v.logLoss, 3)}</td><td className="num">{fmt(v.brier, 3)}</td><td className="num">{pct(v.accuracy, 1)}</td><td className="num">{pct(v.bss, 1)}</td></tr>)}</tbody></table></div>
                <p className="mt-1 text-muted">{ns.backtest.selectedReason} · n={ns.backtest.nTest} ({ns.backtest.firstTest} → {ns.backtest.lastTest})</p>
              </details>
              <div className="text-muted">{t("ما قد يُبطل التوقع: قرار مفاجئ من البنك المركزي، تدفقات أجنبية كبيرة داخلة/خارجة (أذون الخزانة)، صدمة إقليمية، أو تأخر بيانات المصدر.", "Invalidators: surprise CBE action, large foreign T-bill flows, regional shock, or stale source data.")}{ns.staleDays > 2 && <span className="text-warn"> {t(`تنبيه: البيانات عمرها ${ns.staleDays} أيام.`, `Warning: data is ${ns.staleDays} days old.`)}</span>}</div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {intr.map((h: any) => (
            <div key={h.horizonH} className="rounded-xl border border-line p-2.5 text-xs">
              <div className="mb-1 font-semibold">{t(`${h.horizonH} ساعة`, `${h.horizonH}h`)}</div>
              {h.status !== "ok" ? (<><Strength s="insufficient" /><div className="mt-1 text-[10px] text-muted">{t(`أيام مجمّعة: ${h.days}/20 · عينات الحالة: ${h.stateN}/30`, `days ${h.days}/20 · state n ${h.stateN}/30`)}</div></>) :
                h.showProbabilities ? <><UsdDir d={h.direction} kind="forecast" /><div className="num text-muted">↑{pct(h.probs[2])} ={pct(h.probs[1])} ↓{pct(h.probs[0])}</div></> :
                  <><Strength s="none" /><div className="mt-1 text-[10px] text-muted">{t(`احتمال أي تغيير: ${pct(h.changeProbCi[0])}–${pct(h.changeProbCi[1])}`, `P(any change) ${pct(h.changeProbCi[0])}–${pct(h.changeProbCi[1])}`)}</div></>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">{t(`توقعات الساعات تعتمد فقط على أسعار البنوك التي تجمعها المنصة بنفسها (المرجع: ${s.forecast.anchorEntity}). لا يوجد مصدر مجاني لتاريخ لحظي لأسعار البنوك المصرية، لذا تبدأ "غير كافية" حتى تتراكم البيانات.`, `Hourly horizons use only bank quotes collected by this platform (anchor: ${s.forecast.anchorEntity}). No free intraday history exists, so they start as insufficient.`)}</p>
      </div>
    </Card>
  );
}

function Leaderboard({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const rows = s.leaders.filter((r: any) => r.episodes > 0);
  return (
    <Card title={t("ترتيب البنوك (من يبدأ الحركة؟)", "Bank leaderboard (who moves first?)")} sub={t("محسوب من الحلقات التاريخية متعددة البنوك مع فترات ثقة ويلسون 95%", "From multi-bank episodes, Wilson 95% intervals")}>
      {rows.length === 0 ? <Empty>{t("لا توجد حلقات كافية بعد. يُبنى الترتيب تلقائيًا مع تراكم بيانات أسعار البنوك — لا نفترض أن بنكًا بعينه يقود السوق.", "No episodes yet. Built automatically as bank data accumulates — no bank is assumed to lead.")}</Empty> : (
        <div className="scroll-x"><table className="w-full text-xs">
          <thead><tr className="text-muted"><th className="text-start">{t("البنك", "Bank")}</th><th>{t("حلقات", "Episodes")}</th><th>{t("بدأ أولًا", "Led")}</th><th>{t("فترة الثقة", "95% CI")}</th><th>{t("متوسط التأخر", "Median lag")}</th><th>{t("يتبع خلال ساعتين", "Follows ≤2h")}</th></tr></thead>
          <tbody>{rows.map((r: any) => (
            <tr key={r.entity} className="border-t border-line"><td className="py-1">{s.banks.find((b: any) => b.id === r.entity)?.[lang === "ar" ? "name_ar" : "name_en"]}</td>
              <td className="num text-center">{r.episodes}</td><td className="num text-center">{pct(r.ledShare)}</td><td className="num text-center text-muted">{pct(r.ledCi[0])}–{pct(r.ledCi[1])}</td>
              <td className="num text-center">{r.medianLagMin === null ? "—" : `${Math.round(r.medianLagMin)}m`}</td><td className="num text-center">{r.followRate === null ? "—" : pct(r.followRate)}</td></tr>))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

function Indicators({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  return (
    <Card title={t("المؤشرات الاقتصادية", "Economic indicators")} sub={t("ارتباط تاريخي لا يعني سببية", "Correlation ≠ causation")}>
      {s.indicators.length === 0 ? <Empty>{t("لا توجد بيانات بعد", "No data yet")}</Empty> : (
        <ul className="grid gap-1.5 text-xs">{s.indicators.map((i: any) => (
          <li key={i.key} className="flex items-center justify-between gap-2 border-b border-line pb-1.5">
            <span>{lang === "ar" ? i.ar : i.en}<span className="block text-[10px] text-muted">{i.date} · <DataClass cls={i.cls} /></span></span>
            <span className="text-end"><span className="num font-semibold">{fmt(i.value, i.value > 100 ? 1 : 2)}</span>
              <span className="num block text-[10px] text-muted">{i.chUnit === "abs" ? `Δ ${fmt(i.ch1, 2)}` : `${fmt(i.ch1, 2)}% / 5d ${fmt(i.ch5, 2)}%`}</span></span>
          </li>))}</ul>
      )}
    </Card>
  );
}

function News({ s }: { s: any }) {
  const { t, lang } = usePrefs();
  const lab: Record<string, [string, string, any]> = {
    usd_up_pressure: ["ضغط صعودي على الدولار", "USD upward pressure", "up"], usd_down_pressure: ["ضغط هبوطي على الدولار", "USD downward pressure", "down"],
    limited: ["تأثير محدود", "Limited impact", "neutral"], unrelated_or_unverified: ["غير مرتبط/غير مؤكد", "Unrelated/unverified", "neutral"],
  };
  const items = s.news.filter((n: any) => n.label !== "unrelated_or_unverified").slice(0, 10);
  return (
    <Card title={t("مراقب تأثير الأخبار", "News impact monitor")} sub={t("تصنيف تلقائي مع السبب والمصدر والتاريخ", "Auto-classified with reason, source & date")}>
      {items.length === 0 ? <Empty>{t("لا توجد أخبار مصنفة بعد", "No classified news yet")}</Empty> : (
        <ul className="grid gap-2 text-xs">{items.map((n: any) => {
          const [ar, en, tone] = lab[n.label] || [n.label, n.label, "neutral"];
          return (<li key={n.id} className="border-b border-line pb-2">
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{n.title}</a>
            <div className="mt-1 flex flex-wrap items-center gap-1"><Pill tone={tone}>{t(ar, en)}</Pill><span className="text-muted">{n.source} · {timeCairo(n.published_at, lang, true)}</span></div>
            <div className="mt-0.5 text-muted">{n.reason} <span className="text-[10px]">[{n.classifier}]</span></div>
          </li>);
        })}</ul>
      )}
    </Card>
  );
}

function Analyst() {
  const { t } = usePrefs();
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: string; mode?: string }[]>([]);
  const ask = async (question: string) => {
    if (!question.trim()) return; setBusy(true);
    try {
      const j = await askAnalyst(question); setLog((l) => [{ q: question, a: j.answer, mode: j.mode }, ...l]); setQ("");
    } finally { setBusy(false); }
  };
  const presets = [t("هل توجد مؤشرات إن الدولار هيرتفع بكرة؟", "Any signs USD will rise tomorrow?"), t("مين أول بنك رفع السعر النهارده؟", "Which bank moved first today?"), t("إيه سبب التحذير الحالي؟", "Why the current alert?")];
  return (
    <Card title={t("المحلل الذكي", "AI analyst")} sub={t("يجيب من بيانات المنصة فقط مع ذكر المصادر", "Answers only from platform data, with sources")}>
      <div className="mb-2 flex flex-wrap gap-1">{presets.map((p) => <button key={p} onClick={() => ask(p)} className="rounded-full border border-line px-2 py-1 text-[11px] text-ink2 hover:text-ink">{p}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("اسأل عن الدولار…", "Ask about USD/EGP…")} className="min-w-0 flex-1 rounded-lg border border-line bg-card2 px-3 py-2 text-sm outline-none focus:border-accent" />
        <button disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : t("اسأل", "Ask")}</button>
      </form>
      <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto text-xs">
        {log.map((x, i) => <div key={i}><div className="font-semibold">{x.q}</div><div className="mt-1 whitespace-pre-wrap text-ink2">{x.a}</div>{x.mode === "rules" && <div className="mt-1 text-[10px] text-muted">{t("وضع القواعد (لم يُضبط مفتاح Claude API)", "Rules mode (no Claude API key configured)")}</div>}</div>)}
      </div>
    </Card>
  );
}
