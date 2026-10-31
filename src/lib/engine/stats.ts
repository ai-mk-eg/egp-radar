export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
export function quantile(a: number[], q: number) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y); const pos = (s.length - 1) * q; const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}
export const median = (a: number[]) => quantile(a, 0.5);

/** Wilson score interval for a binomial proportion. */
export function wilson(k: number, n: number, z = 1.96) {
  if (n === 0) return { p: NaN, lo: 0, hi: 1 };
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, lo: (c - r) / d, hi: (c + r) / d };
}

export const CLASSES = ["down", "flat", "up"] as const;
export type Cls = (typeof CLASSES)[number];
export type Probs = [number, number, number]; // down, flat, up

/** Multinomial logistic regression (softmax) with L2, full-batch gradient descent on standardized inputs. */
export class Softmax {
  W: number[][] = []; mu: number[] = []; sd: number[] = [];
  constructor(public lambda = 0.05, public iters = 400, public lr = 0.3) {}
  fit(X: number[][], y: number[]) {
    const d = X[0].length, K = 3, n = X.length;
    this.mu = Array.from({ length: d }, (_, j) => mean(X.map((r) => r[j])));
    this.sd = Array.from({ length: d }, (_, j) => std(X.map((r) => r[j])) || 1);
    const Z = X.map((r) => [1, ...r.map((v, j) => (v - this.mu[j]) / this.sd[j])]);
    this.W = Array.from({ length: K }, () => new Array(d + 1).fill(0));
    for (let it = 0; it < this.iters; it++) {
      const G = Array.from({ length: K }, () => new Array(d + 1).fill(0));
      for (let i = 0; i < n; i++) {
        const p = this.softmax(Z[i]);
        for (let k = 0; k < K; k++) { const e = p[k] - (y[i] === k ? 1 : 0); for (let j = 0; j <= d; j++) G[k][j] += e * Z[i][j]; }
      }
      for (let k = 0; k < K; k++) for (let j = 0; j <= d; j++)
        this.W[k][j] -= this.lr * (G[k][j] / n + (j ? this.lambda * this.W[k][j] : 0));
    }
    return this;
  }
  private softmax(z: number[]): Probs {
    const s = this.W.map((w) => w.reduce((acc, wj, j) => acc + wj * z[j], 0));
    const m = Math.max(...s); const e = s.map((v) => Math.exp(v - m)); const t = e[0] + e[1] + e[2];
    return [e[0] / t, e[1] / t, e[2] / t];
  }
  standardize(x: number[]) { return [1, ...x.map((v, j) => (v - this.mu[j]) / this.sd[j])]; }
  predict(x: number[]): Probs { return this.softmax(this.standardize(x)); }
  /** Per-feature contribution to the log-odds of class k vs the average class. */
  contributions(x: number[], k: number) {
    const z = this.standardize(x).slice(1);
    return z.map((v, j) => v * (this.W[k][j + 1] - (this.W[0][j + 1] + this.W[1][j + 1] + this.W[2][j + 1]) / 3));
  }
}

export function logLoss(p: Probs, y: number) { return -Math.log(Math.max(p[y], 1e-6)); }
export function brier(p: Probs, y: number) { return p.reduce((s, pk, k) => s + (pk - (k === y ? 1 : 0)) ** 2, 0); }
