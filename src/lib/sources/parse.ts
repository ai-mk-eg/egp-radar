import * as cheerio from "cheerio";

/** Arabic-Indic → ASCII digits, strip thousands separators. */
export function normalizeNumber(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g, ".").replace(/,(?=\d{3}\b)/g, "");
}

export function numbersIn(text: string): number[] {
  return (normalizeNumber(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

/**
 * Find a table row (tr, or a div-row fallback) whose text matches `rowMatch`, return numeric cells.
 * Numbers outside a plausible USD/EGP range are dropped (e.g., unit "1", years, codes).
 */
export function extractRowNumbers(html: string, rowMatch: string, range: [number, number] = [5, 500]): number[] | null {
  const $ = cheerio.load(html);
  const re = new RegExp(rowMatch, "i");
  const candidates = $("tr").toArray().concat($("[class*=row], li").toArray());
  for (const el of candidates) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!re.test(text) || text.length > 400) continue;
    const cells = $(el).find("td,th,span,div").toArray().map((c) => $(c).text().trim()).filter(Boolean);
    const nums = (cells.length ? cells.flatMap(numbersIn) : numbersIn(text)).filter((n) => n >= range[0] && n <= range[1]);
    const uniq = nums.filter((n, i) => i === 0 || n !== nums[i - 1]);
    if (uniq.length >= 2) return uniq;
  }
  return null;
}

/**
 * Sanity checks before we accept a bank quote. Rejecting is better than storing garbage
 * (a parser that silently picks the wrong column would poison the lead-lag statistics).
 */
export function sanityCheck(buy: number, sell: number, reference: number | null): string | null {
  if (!(buy > 0 && sell > 0)) return "non-positive";
  if (buy > sell) return `buy>sell (${buy}>${sell})`;
  if ((sell - buy) / sell > 0.03) return `spread too wide (${(sell - buy).toFixed(3)})`;
  if (reference && Math.abs(buy / reference - 1) > 0.08) return `far from reference ${reference.toFixed(2)}`;
  return null;
}
