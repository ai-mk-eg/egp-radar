import zlib from "node:zlib";
import { config } from "../config";

/**
 * Last-resort mirror for the currency-api daily dataset: the npm registry publishes one immutable
 * version per day (@fawazahmed0/currency-api@YYYY.M.D). We fetch the small "latest" manifest first and only
 * download the tarball (~1.3 MB) when its date is newer than what we already have.
 */
export async function fetchFromNpm(knownDate: string | null): Promise<{ date: string; usd: Record<string, number> } | null> {
  const t0 = Date.now();
  const man = await fetch("https://registry.npmjs.org/@fawazahmed0%2fcurrency-api/latest", { headers: { "User-Agent": config.userAgent } });
  if (!man.ok) throw new Error(`npm manifest HTTP ${man.status}`);
  const m = await man.json();
  const date = String(m.version).split(".").map((x: string, i: number) => (i ? x.padStart(2, "0") : x)).join("-");
  if (knownDate && date <= knownDate) return null;
  const tgz = await fetch(m.dist.tarball, { headers: { "User-Agent": config.userAgent } });
  if (!tgz.ok) throw new Error(`npm tarball HTTP ${tgz.status}`);
  const tar = zlib.gunzipSync(Buffer.from(await tgz.arrayBuffer()));
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.subarray(off, off + 100).toString("utf8").replace(/\0[\s\S]*$/, "");
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString("utf8").replace(/\0[\s\S]*$/, "").trim() || "0", 8);
    if (name === "package/v1/currencies/usd.min.json") {
      const d = JSON.parse(tar.subarray(off + 512, off + 512 + size).toString("utf8"));
      void t0; return { date: d.date, usd: d.usd };
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("usd.min.json not found in npm tarball");
}
