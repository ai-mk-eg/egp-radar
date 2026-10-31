/**
 * INSTANT RADAR — detection of moves that ALREADY happened, plus evidence-based "who usually follows".
 * Precision caveat: a change is detected at poll time; true change time ∈ (prev_seen_at, detected_at].
 * Two banks that changed inside the same poll window are a TIE (ordering unknown) and are reported as such.
 */
import { median, wilson } from "./stats";

export type Change = { entity: string; direction: number; detected_at: string; prev_seen_at: string; old_buy: number | null; new_buy: number | null; old_sell: number | null; new_sell: number | null; poll_seconds: number };
export type Episode = { start: string; end: string; direction: number; order: { entity: string; at: string; lagMin: number; tieWithLeader: boolean }[] };

const ms = (s: string) => new Date(s).getTime();

/** Group same-direction changes across banks into episodes (gap between consecutive changes ≤ gapMin). */
export function buildEpisodes(changes: Change[], gapMin = 45): Episode[] {
  const sorted = changes.filter((c) => c.direction !== 0).sort((a, b) => ms(a.detected_at) - ms(b.detected_at));
  const eps: Episode[] = [];
  for (const c of sorted) {
    const cur = eps.find((e) => e.direction === c.direction && ms(c.detected_at) - ms(e.end) <= gapMin * 60000 && !e.order.some((o) => o.entity === c.entity));
    if (cur) {
      const lagMin = (ms(c.detected_at) - ms(cur.start)) / 60000;
      cur.order.push({ entity: c.entity, at: c.detected_at, lagMin, tieWithLeader: ms(c.prev_seen_at) < ms(cur.start) });
      cur.end = c.detected_at;
    } else eps.push({ start: c.detected_at, end: c.detected_at, direction: c.direction, order: [{ entity: c.entity, at: c.detected_at, lagMin: 0, tieWithLeader: false }] });
  }
  return eps;
}

export type LeaderRow = { entity: string; episodes: number; ledCount: number; ledShare: number; ledCi: [number, number]; medianLagMin: number | null; followRate: number | null; followCi: [number, number] | null };

/** Per-bank historical behaviour across multi-bank episodes. */
export function leaderboard(episodes: Episode[], entities: string[], followWindowMin = 120): LeaderRow[] {
  const multi = episodes.filter((e) => e.order.length >= 2);
  return entities.map((ent) => {
    const part = multi.filter((e) => e.order.some((o) => o.entity === ent));
    const led = part.filter((e) => e.order[0].entity === ent && !e.order.some((o, i) => i > 0 && o.tieWithLeader)).length;
    const lags = part.map((e) => e.order.find((o) => o.entity === ent)!).filter((o) => o.lagMin > 0).map((o) => o.lagMin);
    const notLeader = multi.filter((e) => e.order[0].entity !== ent);
    const followed = notLeader.filter((e) => e.order.some((o) => o.entity === ent && o.lagMin <= followWindowMin)).length;
    const wl = wilson(led, part.length), wf = wilson(followed, notLeader.length);
    return {
      entity: ent, episodes: part.length, ledCount: led, ledShare: part.length ? led / part.length : 0, ledCi: [wl.lo, wl.hi] as [number, number],
      medianLagMin: lags.length ? median(lags) : null,
      followRate: notLeader.length ? followed / notLeader.length : null, followCi: notLeader.length ? ([wf.lo, wf.hi] as [number, number]) : null,
    };
  }).sort((a, b) => b.ledShare - a.ledShare || b.episodes - a.episodes);
}

export type Strength = "strong" | "moderate" | "weak" | "insufficient";
/** Strength from historical follow-through: Wilson lower bound & sample size — never from a single move. */
export function strengthFrom(k: number, n: number): { strength: Strength; p: number; lo: number; n: number } {
  const w = wilson(k, n);
  const strength: Strength = n < 8 ? "insufficient" : w.lo >= 0.7 ? "strong" : w.lo >= 0.45 ? "moderate" : "weak";
  return { strength, p: w.p, lo: w.lo, n };
}

export type RadarState = {
  windowMin: number; active: Episode | null; movers: string[]; laggards: { entity: string; strength: ReturnType<typeof strengthFrom> }[];
  clusterStrength: ReturnType<typeof strengthFrom> | null; recent: Change[];
};

/**
 * Current radar: the most recent episode still "open" (last change within windowMin).
 * For each fresh bank that has not moved: P(it follows within followWindow | historical episodes where ≥ m banks had moved).
 */
export function currentRadar(changes: Change[], freshEntities: string[], now = new Date(), windowMin = 30, followWindowMin = 120): RadarState {
  const eps = buildEpisodes(changes);
  const recent = changes.filter((c) => now.getTime() - ms(c.detected_at) <= 6 * 3600000).sort((a, b) => ms(b.detected_at) - ms(a.detected_at));
  const last = eps.at(-1);
  const active = last && now.getTime() - ms(last.end) <= windowMin * 60000 ? last : null;
  if (!active) return { windowMin, active: null, movers: [], laggards: [], clusterStrength: null, recent };
  const movers = active.order.map((o) => o.entity);
  const m = movers.length;
  const hist = eps.slice(0, -1).filter((e) => e.order.length >= m);
  // cluster: P(episode eventually reaches ≥ m+1 banks | reached m)
  const grows = hist.filter((e) => e.order.length >= m + 1).length;
  const clusterStrength = strengthFrom(grows, hist.length);
  const laggards = freshEntities.filter((e) => !movers.includes(e)).map((ent) => {
    const relevant = hist.filter((e) => !e.order.slice(0, m).some((o) => o.entity === ent));
    const k = relevant.filter((e) => e.order.some((o) => o.entity === ent && o.lagMin <= followWindowMin)).length;
    return { entity: ent, strength: strengthFrom(k, relevant.length) };
  });
  return { windowMin, active, movers, laggards, clusterStrength, recent };
}
