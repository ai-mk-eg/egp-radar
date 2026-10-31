"use client";
import { useCallback, useEffect, useState } from "react";

/** Loads /api/snapshot, refreshes on every SSE tick, raises browser notifications for new alerts. */
export function useSnapshot() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/snapshot", { cache: "no-store" }); if (!r.ok) throw new Error(String(r.status)); setData(await r.json()); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    load();
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/stream");
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("tick", () => load());
      es.addEventListener("alert", (ev) => {
        const a = JSON.parse((ev as MessageEvent).data);
        load();
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && a.severity !== "info")
            new Notification(a.title_ar, { body: a.body_ar ?? "", tag: a.dedupe_key });
        } catch {}
      });
      es.onerror = () => setLive(false);
    } catch {}
    const iv = setInterval(load, 60000);
    return () => { es?.close(); clearInterval(iv); };
  }, [load]);
  return { data, error, live, reload: load };
}
