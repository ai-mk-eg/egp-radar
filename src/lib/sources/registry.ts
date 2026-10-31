import { BANKS, bankAdapter } from "./adapters/bank";
import { currencyApi, erApi, fredAdapter, FRED_SERIES } from "./adapters/reference";
import { gdelt, googleNews } from "./adapters/news";
import type { SourceAdapter } from "./types";

export function allAdapters(): SourceAdapter[] {
  return [
    ...BANKS.map(bankAdapter),
    currencyApi, erApi,
    ...Object.keys(FRED_SERIES).map(fredAdapter),
    googleNews("gn-ar", "الدولار الجنيه المصري البنك المركزي", "ar"),
    googleNews("gn-en", "Egyptian pound dollar central bank", "en"),
    gdelt,
  ];
}
