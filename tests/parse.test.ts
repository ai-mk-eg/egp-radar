import { describe, expect, it } from "vitest";
import { extractRowNumbers, sanityCheck, normalizeNumber } from "../src/lib/sources/parse";
describe("bank page parsing", () => {
  it("finds the USD row and numeric cells", () => {
    const html = `<table><tr><td>Euro</td><td>58.1</td><td>58.4</td></tr><tr><td>US Dollar</td><td>1</td><td>55.80</td><td>55.90</td></tr></table>`;
    expect(extractRowNumbers(html, "US Dollar")).toEqual([55.8, 55.9]);
  });
  it("handles Arabic-Indic digits", () => { expect(normalizeNumber("٥٥٫٨٠")).toBe("55.80"); });
  it("rejects implausible quotes", () => {
    expect(sanityCheck(55.9, 55.8, null)).toMatch(/buy>sell/);
    expect(sanityCheck(30, 30.1, 55.8)).toMatch(/far from reference/);
    expect(sanityCheck(55.8, 55.9, 55.85)).toBeNull();
  });
});
