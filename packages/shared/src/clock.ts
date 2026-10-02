/**
 * NTP-style clock offset estimation (PLAN.md §5, DECISIONS D11).
 * offset = serverTime - midpoint(t0, t1); we keep the median offset of the
 * lowest-RTT samples, because low RTT means the least asymmetric error.
 */
export interface ClockSample {
  rtt: number;
  offset: number;
}

export function sampleFromPong(t0: number, t1: number, serverTime: number): ClockSample {
  return { rtt: t1 - t0, offset: serverTime - (t0 + t1) / 2 };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of empty list');
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function estimateOffset(samples: readonly ClockSample[], keep = 3): number | null {
  if (samples.length === 0) return null;
  const best = [...samples].sort((x, y) => x.rtt - y.rtt).slice(0, keep);
  return median(best.map((s) => s.offset));
}

/** Rolling estimator: keeps the most recent `window` samples. */
export class ClockSync {
  private samples: ClockSample[] = [];
  constructor(private readonly window = 8) {}

  add(sample: ClockSample): void {
    if (!Number.isFinite(sample.rtt) || sample.rtt < 0) return;
    this.samples.push(sample);
    if (this.samples.length > this.window) this.samples.shift();
  }

  reset(): void {
    this.samples = [];
  }

  get size(): number {
    return this.samples.length;
  }

  /** Server-minus-local offset in ms, or null before the first sample. */
  get offset(): number | null {
    return estimateOffset(this.samples);
  }

  get rtt(): number | null {
    if (this.samples.length === 0) return null;
    return Math.min(...this.samples.map((s) => s.rtt));
  }

  /** Convert a server timestamp to the local clock the samples were taken on. */
  toLocal(serverTime: number): number {
    return serverTime - (this.offset ?? 0);
  }

  toServer(localTime: number): number {
    return localTime + (this.offset ?? 0);
  }
}

export interface PlayAtDecision {
  /** Local time to fire at. */
  at: number;
  /** ms already elapsed past the target (0 if on time). Used to start audio mid-buffer. */
  lateBy: number;
  /** Too late: skip the sound and snap visuals to the end state. */
  skipSound: boolean;
}

export const LATE_PLAY_TOLERANCE_MS = 150;

/** Decide how to honour a synced cue that should happen at server time `playAt`. */
export function schedulePlayAt(playAt: number, localNow: number, offset: number): PlayAtDecision {
  const at = playAt - offset;
  const lateBy = Math.max(0, localNow - at);
  return { at, lateBy, skipSound: lateBy > LATE_PLAY_TOLERANCE_MS };
}
