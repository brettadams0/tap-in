/**
 * The one AudioContext (SPEC "Mobile audio rules"). Unlocked by the first tap (iOS needs a
 * gesture), with mute and volume stored on the device and cue scheduling on the audio clock.
 */
import { LATE_PLAY_TOLERANCE_MS } from '@tap-in/shared';
import { voiceFor, type Recipe, type Voice } from './synth.js';

const PREFS_KEY = 'tapin:audio';

interface Prefs {
  muted: boolean;
  volume: number;
  silentNoticeSeen: boolean;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw)
      return {
        muted: false,
        volume: 0.8,
        silentNoticeSeen: false,
        ...(JSON.parse(raw) as Partial<Prefs>),
      };
  } catch {
    // ignore: private mode or corrupted value
  }
  return { muted: false, volume: 0.8, silentNoticeSeen: false };
}

export type AudioStatus = 'locked' | 'running' | 'suspended';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Private sounds go through a "whisper" low-pass (DESIGN.md §7). */
  private whisper: BiquadFilterNode | null = null;
  private prefs = loadPrefs();
  private listeners = new Set<() => void>();
  private snapshot: { status: AudioStatus; muted: boolean; volume: number; silentNotice: boolean } =
    {
      status: 'locked',
      muted: this.prefs.muted,
      volume: this.prefs.volume,
      silentNotice: false,
    };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  /** Call from any user gesture. Creates or resumes the context and warms it with a silent tick. */
  unlock = (): void => {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.whisper = this.ctx.createBiquadFilter();
      this.whisper.type = 'lowpass';
      this.whisper.frequency.value = 2600;
      this.whisper.connect(this.master);
      this.applyVolume();
      this.ctx.onstatechange = () => {
        this.emit();
      };
      const firstUnlock =
        !this.prefs.silentNoticeSeen && /iP(hone|ad|od)/.test(navigator.userAgent);
      if (firstUnlock) this.snapshot = { ...this.snapshot, silentNotice: true };
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => {
        this.emit();
      });
    }
    const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start();
    this.emit();
  };

  dismissSilentNotice(): void {
    this.prefs.silentNoticeSeen = true;
    this.save();
    this.snapshot = { ...this.snapshot, silentNotice: false };
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    this.save();
    this.applyVolume();
    this.emit();
  }

  setVolume(volume: number): void {
    this.prefs.volume = Math.min(1, Math.max(0, volume));
    this.save();
    this.applyVolume();
    this.emit();
  }

  /**
   * Play `recipe` so it is heard at `perfTime` (performance.now() timeline).
   * Up to 150 ms late it plays immediately; later than that it is skipped (DECISIONS D12).
   */
  play(
    recipe: Recipe,
    perfTime: number,
    voice: Voice = voiceFor(0),
    opts: { private?: boolean } = {},
  ): void {
    const ctx = this.ctx;
    const out = opts.private ? this.whisper : this.master;
    if (!ctx || !out || ctx.state !== 'running' || this.prefs.muted) return;
    const when = this.toContextTime(ctx, perfTime);
    const late = (ctx.currentTime - when) * 1000;
    if (late > LATE_PLAY_TOLERANCE_MS) return;
    recipe(ctx, out, Math.max(ctx.currentTime + 0.005, when), voice);
  }

  /** Play right now (local feedback like your own lock-in stamp). */
  playNow(recipe: Recipe, voice?: Voice): void {
    this.play(recipe, performance.now(), voice);
  }

  /** Map the performance.now() timeline onto the audio clock, accounting for output latency. */
  private toContextTime(ctx: AudioContext, perfTime: number): number {
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (
      ts?.contextTime !== undefined &&
      ts.performanceTime !== undefined &&
      ts.performanceTime > 0
    ) {
      return ts.contextTime + (perfTime - ts.performanceTime) / 1000;
    }
    return ctx.currentTime + (perfTime - performance.now()) / 1000 - (ctx.outputLatency || 0);
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(
      this.prefs.muted ? 0 : this.prefs.volume,
      this.ctx.currentTime,
      0.02,
    );
  }

  private save(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // ignore
    }
  }

  private emit(): void {
    const state = this.ctx?.state;
    this.snapshot = {
      ...this.snapshot,
      status: !this.ctx ? 'locked' : state === 'running' ? 'running' : 'suspended',
      muted: this.prefs.muted,
      volume: this.prefs.volume,
    };
    for (const fn of this.listeners) fn();
  }
}

export const audio = new AudioEngine();

/** Android only: iOS Safari has no Vibration API, so sound and shake carry the moment there. */
export function buzz(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
