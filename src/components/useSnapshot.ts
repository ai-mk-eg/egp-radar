"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATIC, getSnapshot } from "@/lib/client";

const notify = (a: any) => {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && a.severity !== "info")
      new Notification(a.title_ar, { body: a.body_ar ?? "", tag: a.dedupe_key });
  } catch {}
};

/**
 * Loads the snapshot. Server mode: refresh on every SSE tick + push alerts.
 * Static mode (GitHub Pages): poll the exported JSON every 60 s and notify on alerts not seen before.
 */
export function useSnapshot() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const seen = useRef<Set<number> | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await getSnapshot(); setData(d); setError(null);
      const ids: number[] = (d.alerts ?? []).map((a: any) => a.id);
      if (seen.current) for (const a of d.alerts ?? []) if (!seen.current.has(a.id)) notify(a);
      seen.current = new Set(ids);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    load();
    let es: EventSource | null = null;
    if (!STATIC) {
      try {
        es = new EventSource("/api/stream");
        es.addEventListener("hello", () => setLive(true));
        es.addEventListener("tick", () => load());
        es.addEventListener("alert", () => load());
        es.onerror = () => setLive(false);
      } catch {}
    }
    const iv = setInterval(load, 60000);
    return () => { es?.close(); clearInterval(iv); };
  }, [load]);
  return { data, error, live, reload: load };
}
