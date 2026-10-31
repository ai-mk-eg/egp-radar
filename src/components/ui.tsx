"use client";
import { usePrefs } from "./prefs";

export const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d));
export const pct = (n: number | null | undefined, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(d)}%`);

export function timeCairo(iso: string | null | undefined, lang: "ar" | "en", withDate = false) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo", ...(withDate ? { dateStyle: "medium" } : {}), timeStyle: "short" }).format(new Date(iso));
}
export function ago(min: number | null | undefined, lang: "ar" | "en") {
  if (min === null || min === undefined) return "—";
  if (min < 1) return lang === "ar" ? "الآن" : "now";
  if (min < 60) return lang === "ar" ? `منذ ${Math.round(min)} د` : `${Math.round(min)}m ago`;
  if (min < 2880) return lang === "ar" ? `منذ ${Math.round(min / 60)} س` : `${Math.round(min / 60)}h ago`;
  return lang === "ar" ? `منذ ${Math.round(min / 1440)} يوم` : `${Math.round(min / 1440)}d ago`;
}

export function Card({ title, sub, right, children, className = "" }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-2">
          <div><h2 className="text-[15px] font-semibold text-ink">{title}</h2>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "up" | "down" | "warn" | "accent" }) {
  const c = { neutral: "border-line text-ink2", up: "border-up/50 text-up", down: "border-down/50 text-down", warn: "border-warn/50 text-warn", accent: "border-accent/50 text-accent" }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>;
}

/** Data provenance badge — shown next to every number. */
export function DataClass({ cls }: { cls: string }) {
  const { t } = usePrefs();
  const m: Record<string, [string, string, "accent" | "neutral" | "warn"]> = {
    polled: ["مسحوب دوريًا", "Polled", "accent"], daily: ["مرجعي يومي", "Daily ref.", "neutral"],
    delayed: ["منشور بتأخير", "Delayed", "warn"], historical: ["تاريخي", "Historical", "neutral"],
  };
  const [ar, en, tone] = m[cls] || [cls, cls, "neutral"];
  return <Pill tone={tone}>{t(ar, en)}</Pill>;
}

/** Explicit USD direction — arrow + words, never color alone. kind distinguishes actual moves from forecasts. */
export function UsdDir({ d, kind = "actual", size = "sm" }: { d: number | string | null; kind?: "actual" | "forecast"; size?: "sm" | "lg" }) {
  const { t } = usePrefs();
  const v = typeof d === "string" ? (d === "up" ? 1 : d === "down" ? -1 : 0) : d ?? null;
  if (v === null) return <span className="text-muted">—</span>;
  const label = v > 0 ? t("الدولار ↑", "USD ↑") : v < 0 ? t("الدولار ↓", "USD ↓") : t("ثابت", "Flat");
  const k = kind === "forecast" ? t(" (توقع)", " (forecast)") : "";
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink2";
  return <span className={`font-semibold ${tone} ${size === "lg" ? "text-lg" : "text-xs"}`}>{label}<span className="font-normal text-muted">{k}</span></span>;
}

export function Strength({ s }: { s: string | null | undefined }) {
  const { t } = usePrefs();
  const m: Record<string, [string, string, "up" | "accent" | "neutral" | "warn"]> = {
    strong: ["أدلة قوية", "Strong evidence", "accent"], moderate: ["أدلة متوسطة", "Moderate", "accent"],
    weak: ["أدلة ضعيفة", "Weak", "neutral"], none: ["بلا أفضلية مثبتة", "No proven edge", "warn"],
    insufficient: ["بيانات غير كافية", "Insufficient data", "warn"],
  };
  const [ar, en, tone] = m[s || "insufficient"] || [s!, s!, "neutral"];
  return <Pill tone={tone}>{t(ar, en)}</Pill>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">{children}</div>;
}
