import { describe, expect, it } from 'vitest';
import { ClockSync, estimateOffset, median, sampleFromPong, schedulePlayAt } from './clock.js';

describe('clock sync', () => {
  it('computes offset from a symmetric ping', () => {
    // local 1000 → server stamps 6050 → local 1100: true offset 5000.
    expect(sampleFromPong(1000, 1100, 6050)).toEqual({ rtt: 100, offset: 5000 });
  });

  it('median handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow();
  });

  it('prefers low-RTT samples and ignores asymmetric outliers', () => {
    const trueOffset = 5000;
    const samples = [
      { rtt: 20, offset: trueOffset + 2 },
      { rtt: 25, offset: trueOffset - 3 },
      { rtt: 22, offset: trueOffset + 1 },
      { rtt: 400, offset: trueOffset + 180 }, // congested, asymmetric
      { rtt: 350, offset: trueOffset - 150 },
    ];
    const est = estimateOffset(samples);
    expect(est).not.toBeNull();
    expect(Math.abs((est as number) - trueOffset)).toBeLessThanOrEqual(3);
    expect(estimateOffset([])).toBeNull();
  });

  it('stays within ~10ms under simulated jitter', () => {
    const trueOffset = -123456;
    const sync = new ClockSync();
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 8; i++) {
      const t0 = i * 1000;
      const up = 10 + rand() * 40;
      const down = 10 + rand() * 40;
      const serverTime = t0 + up + trueOffset;
      sync.add(sampleFromPong(t0, t0 + up + down, serverTime));
    }
    expect(Math.abs((sync.offset as number) - trueOffset)).toBeLessThan(25);
  });

  it('rolls the window, converts times and ignores bad samples', () => {
    const sync = new ClockSync(2);
    expect(sync.offset).toBeNull();
    expect(sync.rtt).toBeNull();
    expect(sync.toLocal(500)).toBe(500);
    sync.add({ rtt: -1, offset: 9 });
    expect(sync.size).toBe(0);
    sync.add({ rtt: 10, offset: 100 });
    sync.add({ rtt: 12, offset: 100 });
    sync.add({ rtt: 30, offset: 100 });
    expect(sync.size).toBe(2);
    expect(sync.rtt).toBe(12);
    expect(sync.toLocal(1100)).toBe(1000);
    expect(sync.toServer(1000)).toBe(1100);
    sync.reset();
    expect(sync.size).toBe(0);
  });

  it('schedules playAt: on time, slightly late, too late', () => {
    expect(schedulePlayAt(10_000, 4_000, 5_000)).toEqual({
      at: 5_000,
      lateBy: 0,
      skipSound: false,
    });
    expect(schedulePlayAt(10_000, 5_100, 5_000)).toEqual({
      at: 5_000,
      lateBy: 100,
      skipSound: false,
    });
    expect(schedulePlayAt(10_000, 5_200, 5_000).skipSound).toBe(true);
  });
});
