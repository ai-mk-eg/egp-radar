import { config } from "../config";

const etags = new Map<string, { etag?: string; lastModified?: string; body: string }>();

export class FetchError extends Error {
  constructor(message: string, public status?: number, public retryable = true) { super(message); }
}

/**
 * Polite fetch: timeout, bounded retries with exponential backoff + jitter,
 * conditional requests (ETag / Last-Modified) to save the provider's bandwidth.
 * Never retries 4xx except 408/429 (and honours Retry-After).
 */
export async function politeFetch(url: string, opts: { timeoutMs?: number; retries?: number; accept?: string } = {}) {
  const { timeoutMs = 15000, retries = 2, accept = "*/*" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const cached = etags.get(url);
      const headers: Record<string, string> = { "User-Agent": config.userAgent, Accept: accept, "Accept-Language": "en,ar;q=0.8" };
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
      const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow", cache: "no-store" });
      if (res.status === 304 && cached) return { body: cached.body, latencyMs: Date.now() - started, notModified: true };
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
        const err = new FetchError(`HTTP ${res.status}`, res.status, retryable);
        if (!retryable) throw err;
        const ra = Number(res.headers.get("retry-after"));
        if (ra && attempt < retries) await sleep(Math.min(ra, 60) * 1000);
        throw err;
      }
      const body = await res.text();
      etags.set(url, { etag: res.headers.get("etag") || undefined, lastModified: res.headers.get("last-modified") || undefined, body });
      return { body, latencyMs: Date.now() - started, notModified: false };
    } catch (e) {
      lastErr = e;
      if (e instanceof FetchError && !e.retryable) break;
      if (attempt < retries) await sleep(1000 * 2 ** attempt + Math.random() * 500);
    } finally { clearTimeout(t); }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
