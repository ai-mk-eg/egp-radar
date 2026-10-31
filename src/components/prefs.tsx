"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Lang = "ar" | "en"; type Theme = "dark" | "light";
const Ctx = createContext<{ lang: Lang; theme: Theme; setLang: (l: Lang) => void; setTheme: (t: Theme) => void; t: (ar: string, en: string) => string }>(null as any);

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangS] = useState<Lang>("ar");
  const [theme, setThemeS] = useState<Theme>("dark");
  useEffect(() => { const l = read("lang"), th = read("theme"); if (l === "en") setLangS("en"); if (th === "light") setThemeS("light"); }, []);
  useEffect(() => {
    document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
  }, [lang, theme]);
  const setLang = (l: Lang) => { setLangS(l); write("lang", l); };
  const setTheme = (t: Theme) => { setThemeS(t); write("theme", t); };
  return <Ctx.Provider value={{ lang, theme, setLang, setTheme, t: (ar, en) => (lang === "ar" ? ar : en) }}>{children}</Ctx.Provider>;
}
export const usePrefs = () => useContext(Ctx);
