import { XMLParser } from "fast-xml-parser";
import crypto from "node:crypto";
import { politeFetch } from "../http";
import type { NewsObs, SourceAdapter } from "../types";

const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 20);

/** Google News RSS search — free, no key; intended for personal/non-commercial reading. Links go to the original publisher. */
export function googleNews(id: string, q: string, lang: "ar" | "en"): SourceAdapter {
  const url = lang === "ar"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ar&gl=EG&ceid=EG:ar`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  return {
    id: `news:${id}`, name: `Google News RSS (${lang})`, kind: "news", url, dataClass: "polled", pollSeconds: 900,
    async collect() {
      const res = await politeFetch(url, { accept: "application/rss+xml,text/xml" });
      const x = new XMLParser({ ignoreAttributes: false }).parse(res.body);
      const items = [x?.rss?.channel?.item ?? []].flat();
      const news: NewsObs[] = items.slice(0, 40).map((it: any) => ({
        id: hash(String(it.link || it.title)), source: typeof it.source === "object" ? it.source["#text"] : String(it.source || "Google News"),
        title: String(it.title), url: String(it.link), lang,
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      }));
      return { latencyMs: res.latencyMs, news };
    },
  };
}

/** GDELT DOC 2.0 API — free, no key, rolling ~3 months, ~15-min update cadence. */
export const gdelt: SourceAdapter = {
  id: "news:gdelt", name: "GDELT DOC 2.0", kind: "news", dataClass: "polled", pollSeconds: 10800, // GDELT rate-limits shared CI IPs (HTTP 429)
  url: "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
    encodeURIComponent('("Egyptian pound" OR "Central Bank of Egypt" OR "الجنيه المصري") ') +
    "&mode=artlist&format=json&maxrecords=50&sort=datedesc&timespan=3d",
  async collect() {
    const res = await politeFetch(this.url, { accept: "application/json" });
    const d = JSON.parse(res.body || "{}");
    const news: NewsObs[] = (d.articles || []).map((a: any) => ({
      id: hash(a.url), source: a.domain, title: a.title, url: a.url,
      lang: String(a.language || "").toLowerCase().startsWith("arab") ? "ar" : "en",
      publishedAt: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:00Z` : null,
    }));
    return { latencyMs: res.latencyMs, news };
  },
};
