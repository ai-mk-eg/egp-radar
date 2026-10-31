"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePrefs } from "@/components/prefs";
import { Card, DataClass, Empty, UsdDir, fmt, timeCairo } from "@/components/ui";

const RANGES = [[30, "شهر", "1M"], [90, "3 أشهر", "3M"], [365, "سنة", "1Y"], [1000, "الكل", "All"]] as const;

export default function History() {
  const { t, lang } = usePrefs();
  const [days, setDays] = useState(365);
  const [d, setD] = useState<any>(null);
  const [table, setTable] = useState(false);
  useEffect(() => { fetch(`/api/history?days=${days}`).then((r) => r.json()).then(setD); }, [days]);
  const series = useMemo(() => (d?.daily ?? []).map((r: any, i: number, a: any[]) => ({ date: r.date, egp: r.egp, ch: i ? r.egp - a[i - 1].egp : null })), [d]);
  const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12 }, labelStyle: { color: "var(--text-2)" } };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(([n, ar, en]) => <button key={n} onClick={() => setDays(n)} className={`rounded-lg border px-3 py-1 text-xs ${days === n ? "border-accent text-accent" : "border-line text-ink2"}`}>{t(ar, en)}</button>)}
        <button onClick={() => setTable(!table)} className="ms-auto rounded-lg border border-line px-3 py-1 text-xs text-ink2">{table ? t("عرض الرسم", "Chart view") : t("عرض الجدول", "Table view")}</button>
      </div>
      <Card title={t("سعر الدولار بالجنيه — سعر مرجعي يومي", "USD/EGP — daily reference")} sub={t("كل نقطة = لقطة يومية ~00:00 UTC تعكس سوق اليوم السابق. ليست أسعار بنوك.", "Each point = daily snapshot ~00:00 UTC (reflects prior day). Not bank quotes.")} right={<DataClass cls="daily" />}>
        {!d ? <Empty>…</Empty> : table ? (
          <div className="scroll-x max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead><tr className="text-muted"><th className="text-start">{t("التاريخ", "Date")}</th><th>{t("السعر", "Rate")}</th><th>{t("التغير", "Change")}</th></tr></thead>
            <tbody>{[...series].reverse().map((r: any) => <tr key={r.date} className="border-t border-line"><td>{r.date}</td><td className="num text-center">{fmt(r.egp, 4)}</td><td className="text-center"><span className="num">{r.ch === null ? "—" : fmt(r.ch, 3)}</span> {r.ch !== null && <UsdDir d={Math.sign(Math.round(r.ch * 100))} />}</td></tr>)}</tbody></table></div>
        ) : (
          <div className="h-72" dir="ltr"><ResponsiveContainer><LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={40} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--muted)", fontSize: 11 }} width={44} tickLine={false} axisLine={false} />
            <Tooltip {...tip} formatter={(v: any) => [fmt(v, 4), "USD/EGP"]} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            <Line type="monotone" dataKey="egp" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          </LineChart></ResponsiveContainer></div>
        )}
      </Card>
      {!table && d && (
        <Card title={t("التغير اليومي (جنيه)", "Daily change (EGP)")} sub={t("أخضر مزرق = الدولار ↑ · أحمر = الدولار ↓", "Teal = USD ↑ · Red = USD ↓")}>
          <div className="h-48" dir="ltr"><ResponsiveContainer><BarChart data={series.slice(1)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={40} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} width={44} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip {...tip} formatter={(v: any) => [`${fmt(v, 3)} ${t("جنيه", "EGP")}`, t("تغير الدولار", "USD change")]} cursor={{ fill: "var(--card-2)" }} />
            <Bar dataKey="ch" radius={[3, 3, 0, 0]}>{series.slice(1).map((r: any) => <Cell key={r.date} fill={r.ch >= 0 ? "var(--usd-up)" : "var(--usd-down)"} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </Card>
      )}
      <Card title={t("سجل تغيرات أسعار البنوك", "Bank price-change log")} sub={t("كل تغيير رصده جامع البيانات مع وقت الرصد", "Every change detected by the collector")} right={<DataClass cls="polled" />}>
        {!d?.changes?.length ? <Empty>{t("لم تُرصد تغيرات بعد. يبدأ السجل عند نجاح جمع أسعار البنوك (راجع صحة المصادر).", "No changes yet. Starts once bank collection succeeds (see Data health).")}</Empty> : (
          <div className="scroll-x"><table className="w-full text-xs"><thead><tr className="text-muted"><th className="text-start">{t("الوقت", "Time")}</th><th>{t("البنك", "Bank")}</th><th>{t("الاتجاه", "Dir")}</th><th>{t("شراء", "Buy")}</th><th>{t("بيع", "Sell")}</th></tr></thead>
            <tbody>{d.changes.map((c: any) => <tr key={c.id} className="border-t border-line"><td>{timeCairo(c.detected_at, lang, true)}</td><td className="text-center">{c.entity}</td><td className="text-center"><UsdDir d={c.direction} /></td><td className="num text-center">{fmt(c.old_buy)}→{fmt(c.new_buy)}</td><td className="num text-center">{fmt(c.old_sell)}→{fmt(c.new_sell)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
