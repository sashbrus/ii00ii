import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  clampView,
  easeView,
  glide,
  isAligned,
  localDateKey,
  parseLookPuzzle,
} from './index.ts';

describe('viewpoint', () => {
  it('measures the angle between views', () => {
    expect(angularDistance({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 })).toBe(0);
    expect(angularDistance({ yaw: 30, pitch: 0 }, { yaw: 0, pitch: 0 })).toBeCloseTo(30);
    expect(angularDistance({ yaw: 0, pitch: -20 }, { yaw: 0, pitch: 25 })).toBeCloseTo(45);
  });

  it('aligns only inside the tolerance', () => {
    const secret = { yaw: 10, pitch: 5 };
    expect(isAligned({ yaw: 12, pitch: 6 }, secret, 4)).toBe(true);
    expect(isAligned({ yaw: 16, pitch: 5 }, secret, 4)).toBe(false);
  });

  it('clamps to the limits', () => {
    expect(clampView({ yaw: 90, pitch: -80 }, { yaw: 70, pitch: 45 })).toEqual({
      yaw: 70,
      pitch: -45,
    });
  });

  it('glides to a stop without reversing', () => {
    let state = { view: { yaw: 0, pitch: 0 }, velocity: { yaw: 100, pitch: 0 } };
    let last = 0;
    for (let i = 0; i < 300; i++) {
      state = glide(state.view, state.velocity, 1 / 60);
      expect(state.view.yaw).toBeGreaterThanOrEqual(last);
      last = state.view.yaw;
    }
    expect(state.velocity.yaw).toBeLessThan(0.01);
  });

  it('eases without overshoot', () => {
    const from = { yaw: -40, pitch: 20 };
    const to = { yaw: 0, pitch: 0 };
    expect(easeView(from, to, 0)).toEqual(from);
    expect(easeView(from, to, 1)).toEqual(to);
    expect(easeView(from, to, 0.5).yaw).toBeLessThanOrEqual(0);
  });
});

describe('daily', () => {
  it('formats the local date', () => {
    expect(localDateKey(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });

  it('rejects a puzzle with a missing field', () => {
    expect(() => parseLookPuzzle({ id: 'x', scene: 's' })).toThrow('puzzle.start');
  });
});
