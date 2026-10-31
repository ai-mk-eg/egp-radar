import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ALL_BANKS, BANKS, parseBank, setReferenceMid } from "../src/lib/sources/adapters/bank";

// Fixtures are real responses captured from a GitHub Actions runner on 2026-10-31.
const def = (id: string) => ALL_BANKS.find((b) => b.id === id)!;
describe("bank adapters (real payloads)", () => {
  setReferenceMid(55.9);
  it("CIB JSON endpoint", () => {
    expect(parseBank(def("CIB"), fs.readFileSync("tests/fixtures/cib.json", "utf8"))).toEqual({ buy: 55.97, sell: 56.07, sourceTime: null });
  });
  it("Alex Bank JSON endpoint with the bank's own update time", () => {
    const r = parseBank(def("ALEX"), fs.readFileSync("tests/fixtures/alex.json", "utf8"));
    expect(r.buy).toBe(55.95); expect(r.sell).toBe(56.05); expect(r.sourceTime).toBe("2026-10-29T01:10:28.000Z");
  });
  it("Banque Misr HTML table", () => {
    const html = `<table><tbody><tr><td><img src="/-/media/flags/usd.ashx" /><br /> US Dollar </td><td>55.99</td><td>56.09</td><td>55.99</td><td>56.09</td></tr></tbody></table>`;
    expect(parseBank(def("BM"), html)).toMatchObject({ buy: 55.99, sell: 56.09 });
  });
  it("ADIB HTML table", () => {
    const html = `<table><tr height="20"><td height="20">US Dollars</td><td>56.0900</td><td>56.1900</td><td>56.0900</td><td>56.1900</td></tr></table>`;
    expect(parseBank(def("ADIB"), html)).toMatchObject({ buy: 56.09, sell: 56.19 });
  });
  it("only enabled banks are collected; disabled ones carry a reason", () => {
    expect(BANKS.map((b) => b.id).sort()).toEqual(["ADIB", "ALEX", "BM", "CIB"]);
    for (const b of ALL_BANKS.filter((x) => x.enabled === false)) expect(b.disabled_reason).toBeTruthy();
  });
});
