"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrefs } from "./prefs";

const NAV = [
  ["/", "اللوحة الرئيسية", "Dashboard"], ["/history", "التحليل التاريخي", "History"], ["/alerts", "التنبيهات", "Alerts"],
  ["/health", "صحة المصادر", "Data health"], ["/settings", "الإعدادات", "Settings"], ["/methodology", "المنهجية", "Methodology"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const path = usePathname();
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden><circle cx="14" cy="14" r="12" fill="none" stroke="var(--accent)" strokeWidth="2"/><circle cx="14" cy="14" r="6" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity=".6"/><path d="M14 14 L24 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/><circle cx="20" cy="10" r="2" fill="var(--usd-up)"/></svg>
            <div className="leading-tight"><div className="text-[15px] font-bold tracking-wide">EGP RADAR</div><div className="text-[10px] text-muted">{t("نظام الإنذار المبكر للدولار", "Dollar Early-Warning System")}</div></div>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map(([href, ar, en]) => (
              <Link key={href} href={href} className={`rounded-lg px-3 py-1.5 text-sm ${path === href ? "bg-card2 text-ink" : "text-ink2 hover:text-ink"}`}>{t(ar, en)}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="rounded-lg border border-line px-2.5 py-1 text-xs" aria-label="language">{lang === "ar" ? "EN" : "ع"}</button>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-lg border border-line px-2.5 py-1 text-xs" aria-label="theme">{theme === "dark" ? "☀" : "☾"}</button>
          </div>
        </div>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-card md:hidden">
        {NAV.map(([href, ar, en]) => (
          <Link key={href} href={href} className={`px-1 py-2.5 text-center text-[10px] ${path === href ? "text-accent" : "text-ink2"}`}>{t(ar, en)}</Link>
        ))}
      </nav>
    </div>
  );
}
