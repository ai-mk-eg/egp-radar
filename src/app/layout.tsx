import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PrefsProvider } from "@/components/prefs";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "EGP Radar — الدولار مقابل الجنيه",
  description: "Dollar early-warning & intelligence system for USD/EGP: bank moves, evidence-based signals, calibrated forecasts.",
};
export const viewport: Viewport = { themeColor: "#0B1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <body><PrefsProvider><Shell>{children}</Shell></PrefsProvider></body>
    </html>
  );
}
