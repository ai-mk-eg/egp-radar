/**
 * NEXT-SESSION model on daily data.
 *
 * Timing / leakage rules
 *  - A daily snapshot dated S is taken ~00:00 UTC, so it reflects the market of calendar day S-1.
 *    We keep snapshots whose market day (S-1) is an Egyptian business day (Sun–Thu, minus configured holidays).
 *  - Features at step t use ONLY snapshots ≤ t. Target = change from t to the next kept snapshot (next session).
 *  - Walk-forward: the model is refit on data strictly before each test block; nothing from the test block
 *    (including standardization statistics) is used for training.
 *  - Data before 2024-03-10 is excluded (pre-float managed peg = different regime).
 */
import { addDays, isBusinessDay } from "../time";
import { CLASSES, Probs, Softmax, brier, logLoss, mean, quantile, std } from "./stats";

export type DailyRow = { date: string; egp: number; eur: number; jpy: number; gbp: number; cad: number; sek: number; chf: number; xau: number; try_: number; zar: number; brl: number; inr: number };

export const REGIME_START = "2024-03-10";
export const FEATURES = [
  { key: "r1", ar: "تغير الدولار في آخر جلسة", en: "Last-session USD/EGP change" },
  { key: "r5", ar: "تغير آخر 5 جلسات", en: "5-session change" },
  { key: "r20", ar: "تغير آخر 20 جلسة", en: "20-session change" },
  { key: "vol20", ar: "التذبذب (20 جلسة)", en: "20-session volatility" },
  { key: "z20", ar: "البعد عن متوسط 20 جلسة", en: "Distance from 20-session mean" },
  { key: "dxy1", ar: "مؤشر الدولار (DXY محسوب) – جلسة", en: "Synthetic DXY 1-session" },
  { key: "dxy5", ar: "مؤشر الدولار (DXY محسوب) – 5 جلسات", en: "Synthetic DXY 5-session" },
  { key: "em1", ar: "عملات ناشئة (TRY/ZAR/BRL/INR)", en: "EM FX basket (TRY/ZAR/BRL/INR)" },
  { key: "gold1", ar: "الذهب", en: "Gold (USD)" },
  { key: "lastUp", ar: "آخر حركة كانت صعودًا", en: "Previous session was up" },
  { key: "lastDown", ar: "آخر حركة كانت هبوطًا", en: "Previous session was down" },
] as const;

/** ICE DXY formula applied to USD-base rates (public weights). Proxy only — not the licensed ICE index. */
export function syntheticDxy(r: DailyRow) {
  return 50.14348112 * Math.pow(1 / r.eur, -0.576) * Math.pow(r.jpy, 0.136) * Math.pow(1 / r.gbp, -0.119) *
    Math.pow(r.cad, 0.091) * Math.pow(r.sek, 0.042) * Math.pow(r.chf, 0.036);
}

export type Sample = { date: string; marketDay: string; egp: number; x: number[]; y: number | null; pct: number | null };

export function buildSamples(rows: DailyRow[], thetaPct: number): Sample[] {
  const kept = rows.filter((r) => r.date >= REGIME_START && r.egp && isBusinessDay(addDays(r.date, -1)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const lr = (a: number, b: number) => 100 * Math.log(a / b);
  const cls = (pct: number) => (pct > thetaPct ? 2 : pct < -thetaPct ? 0 : 1);
  const out: Sample[] = [];
  for (let t = 21; t < kept.length; t++) {
    const c = kept[t], p = kept[t - 1];
    const r1s = Array.from({ length: 20 }, (_, i) => lr(kept[t - i].egp, kept[t - i - 1].egp));
    const lv = kept.slice(t - 19, t + 1).map((r) => r.egp);
    const em = ["try_", "zar", "brl", "inr"].map((k) => lr((c as any)[k], (p as any)[k]));
    const prevPct = lr(c.egp, p.egp);
    const x = [
      prevPct, lr(c.egp, kept[t - 5].egp), lr(c.egp, kept[t - 20].egp), std(r1s),
      (c.egp - mean(lv)) / (std(lv) || 1),
      lr(syntheticDxy(c), syntheticDxy(p)), lr(syntheticDxy(c), syntheticDxy(kept[t - 5])),
      mean(em), -lr(c.xau, p.xau), cls(prevPct) === 2 ? 1 : 0, cls(prevPct) === 0 ? 1 : 0,
    ];
    const n = kept[t + 1];
    const pct = n ? lr(n.egp, c.egp) : null;
    out.push({ date: c.date, marketDay: addDays(c.date, -1), egp: c.egp, x, y: pct === null ? null : cls(pct), pct });
  }
  return out;
}

type ModelName = "climatology" | "markov" | "logistic";
type Pred = { date: string; y: number; pct: number; probs: Record<ModelName, Probs>; lo: number; hi: number };

function climatology(train: Sample[]): Probs {
  const c = [1, 1, 1]; for (const s of train) c[s.y!]++; const t = c[0] + c[1] + c[2];
  return [c[0] / t, c[1] / t, c[2] / t];
}
function markov(train: Sample[], last: number): Probs {
  const c = [1, 1, 1]; for (let i = 1; i < train.length; i++) if (train[i - 1].y === last) c[train[i].y!]++;
  const t = c[0] + c[1] + c[2]; return [c[0] / t, c[1] / t, c[2] / t];
}
/** Class of the change that ended AT sample s (known at s): derived from features lastUp/lastDown. */
const lastClassOf = (s: Sample) => (s.x[9] ? 2 : s.x[10] ? 0 : 1);

export type Metrics = { n: number; logLoss: number; brier: number; accuracy: number; bss: number };
export type BacktestResult = {
  createdAt: string; thetaPct: number; nSamples: number; nTest: number; firstTest: string | null; lastTest: string | null;
  metrics: Record<ModelName, Metrics>; selected: ModelName; selectedReason: string;
  reliability: { bin: string; predicted: number; observed: number; n: number }[];
  interval: { nominal: number; coverage: number; n: number };
  pointMae: { noChange: number; n: number };
  classFreq: Probs;
  recent: { date: string; actual: string; predicted: string; pUp: number; pDown: number; pFlat: number }[];
};

const RANGE_Q: [number, number] = [0.1, 0.9];

export function walkForward(samples: Sample[], opts = { minTrain: 150, refit: 10 }): { preds: Pred[] } {
  const labeled = samples.filter((s) => s.y !== null);
  const preds: Pred[] = [];
  let model: Softmax | null = null;
  for (let t = opts.minTrain; t < labeled.length; t++) {
    const train = labeled.slice(0, t);
    if (!model || (t - opts.minTrain) % opts.refit === 0) model = new Softmax().fit(train.map((s) => s.x), train.map((s) => s.y!));
    const s = labeled[t];
    const pcts = train.slice(-120).map((x) => x.pct!);
    preds.push({
      date: s.date, y: s.y!, pct: s.pct!,
      probs: { climatology: climatology(train), markov: markov(train, lastClassOf(s)), logistic: model.predict(s.x) },
      lo: quantile(pcts, RANGE_Q[0]), hi: quantile(pcts, RANGE_Q[1]),
    });
  }
  return { preds };
}

export function evaluate(preds: Pred[], samples: Sample[], thetaPct: number): BacktestResult {
  const names: ModelName[] = ["climatology", "markov", "logistic"];
  const metrics = {} as Record<ModelName, Metrics>;
  for (const m of names) {
    const ll = mean(preds.map((p) => logLoss(p.probs[m], p.y)));
    const br = mean(preds.map((p) => brier(p.probs[m], p.y)));
    const acc = mean(preds.map((p) => (p.probs[m].indexOf(Math.max(...p.probs[m])) === p.y ? 1 : 0)));
    metrics[m] = { n: preds.length, logLoss: ll, brier: br, accuracy: acc, bss: NaN };
  }
  for (const m of names) metrics[m].bss = 1 - metrics[m].brier / metrics.climatology.brier;
  // Selection uses only the out-of-sample record. A model must beat climatology on BOTH log-loss and Brier.
  let selected: ModelName = "climatology";
  let selectedReason = "no model beats the historical base rates out-of-sample";
  if (preds.length >= 100) {
    for (const m of ["logistic", "markov"] as ModelName[]) {
      const ok = metrics[m].bss > 0.02 && metrics[m].logLoss < metrics.climatology.logLoss;
      if (ok && (selected === "climatology" || metrics[m].logLoss < metrics[selected].logLoss)) {
        selected = m; selectedReason = `beats climatology out-of-sample (BSS ${(metrics[m].bss * 100).toFixed(1)}%)`;
      }
    }
  } else selectedReason = `only ${preds.length} out-of-sample predictions (<100)`;
  const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0001];
  const reliability = bins.slice(0, -1).map((lo, i) => {
    const inBin = preds.filter((p) => p.probs[selected][2] >= lo && p.probs[selected][2] < bins[i + 1]);
    return { bin: `${Math.round(lo * 100)}–${Math.round(Math.min(bins[i + 1], 1) * 100)}%`, predicted: mean(inBin.map((p) => p.probs[selected][2])), observed: mean(inBin.map((p) => (p.y === 2 ? 1 : 0))), n: inBin.length };
  }).filter((b) => b.n > 0);
  const covered = preds.filter((p) => p.pct >= p.lo && p.pct <= p.hi).length;
  const labeled = samples.filter((s) => s.y !== null);
  return {
    createdAt: new Date().toISOString(), thetaPct, nSamples: labeled.length, nTest: preds.length,
    firstTest: preds[0]?.date ?? null, lastTest: preds.at(-1)?.date ?? null, metrics, selected, selectedReason, reliability,
    interval: { nominal: RANGE_Q[1] - RANGE_Q[0], coverage: preds.length ? covered / preds.length : NaN, n: preds.length },
    pointMae: { noChange: mean(preds.map((p) => Math.abs(p.pct))), n: preds.length },
    classFreq: climatology(labeled),
    recent: preds.slice(-15).reverse().map((p) => {
      const pr = p.probs[selected];
      return { date: p.date, actual: CLASSES[p.y], predicted: CLASSES[pr.indexOf(Math.max(...pr))], pDown: pr[0], pFlat: pr[1], pUp: pr[2] };
    }),
  };
}

export type NextSessionForecast = {
  status: "ok" | "insufficient";
  model: string; asOfSnapshot: string; basedOnMarketDay: string; base: number;
  probs: Probs | null; direction: string | null; showProbabilities: boolean;
  rangeLow: number | null; rangeHigh: number | null; evidence: "strong" | "moderate" | "weak" | "none";
  drivers: { key: string; ar: string; en: string; value: number; effect: number }[];
  backtest: BacktestResult; staleDays: number;
};

export function nextSession(rows: DailyRow[], thetaPct = 0.1, today = new Date().toISOString().slice(0, 10)): NextSessionForecast | { status: "insufficient"; reason: string } {
  const samples = buildSamples(rows, thetaPct);
  const labeled = samples.filter((s) => s.y !== null);
  if (labeled.length < 160) return { status: "insufficient", reason: `need ≥160 labeled sessions, have ${labeled.length}` };
  const { preds } = walkForward(samples);
  const bt = evaluate(preds, samples, thetaPct);
  const last = samples.at(-1)!;
  const sel = bt.selected;
  let probs: Probs;
  let drivers: NextSessionForecast["drivers"] = [];
  if (sel === "logistic") {
    const m = new Softmax().fit(labeled.map((s) => s.x), labeled.map((s) => s.y!));
    probs = m.predict(last.x);
    const k = probs.indexOf(Math.max(...probs));
    const c = m.contributions(last.x, k);
    drivers = FEATURES.map((f, j) => ({ key: f.key, ar: f.ar, en: f.en, value: last.x[j], effect: c[j] }))
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 3);
  } else if (sel === "markov") {
    probs = markov(labeled, lastClassOf(last));
    drivers = [{ key: "last", ar: "اتجاه آخر جلسة", en: "Last session direction", value: last.x[0], effect: 1 }];
  } else probs = climatology(labeled);
  const pcts = labeled.slice(-120).map((s) => s.pct!);
  const bss = bt.metrics[sel].bss;
  const evidence = sel === "climatology" ? "none" : bss >= 0.1 ? "strong" : bss >= 0.04 ? "moderate" : "weak";
  const staleDays = Math.round((new Date(today).getTime() - new Date(last.date).getTime()) / 86400000);
  return {
    status: "ok", model: sel, asOfSnapshot: last.date, basedOnMarketDay: last.marketDay, base: last.egp,
    probs, direction: CLASSES[probs.indexOf(Math.max(...probs))], showProbabilities: sel !== "climatology",
    rangeLow: last.egp * Math.exp(quantile(pcts, RANGE_Q[0]) / 100), rangeHigh: last.egp * Math.exp(quantile(pcts, RANGE_Q[1]) / 100),
    evidence, drivers, backtest: bt, staleDays,
  };
}
