import type { ViewLimits, Viewpoint } from './viewpoint.ts';

/** One rung of the hint ladder: each hint moves the view closer to the secret. */
export interface LookHint {
  kind: 'nudge' | 'where' | 'how';
  view: Viewpoint;
}

/**
 * A LOOK puzzle as data: a scene, where the player starts, and the one viewpoint
 * from which the scene resolves. New puzzles ship as files like this, without new code.
 * This covers the first depth only (find the viewpoint); the lock and the second
 * alignment join the format when LOOK itself is built.
 */
export interface LookPuzzle {
  id: string;
  scene: string;
  start: Viewpoint;
  secret: Viewpoint;
  /** How close, in degrees, the view must come to the secret. */
  tolerance: number;
  limits: ViewLimits;
  hints: LookHint[];
}

const HINT_KINDS = ['nudge', 'where', 'how'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${where}.${key} must be a number`);
  }
  return value;
}

function readString(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${where}.${key} must be a non-empty string`);
  }
  return value;
}

function readView(source: Record<string, unknown>, key: string, where: string): Viewpoint {
  const value = source[key];
  if (!isRecord(value)) throw new Error(`${where}.${key} must be an object`);
  return {
    yaw: readNumber(value, 'yaw', `${where}.${key}`),
    pitch: readNumber(value, 'pitch', `${where}.${key}`),
  };
}

/** Validate untrusted JSON as a LOOK puzzle. Throws with the path of the first problem. */
export function parseLookPuzzle(raw: unknown): LookPuzzle {
  if (!isRecord(raw)) throw new Error('puzzle must be an object');
  const hintsRaw = raw.hints ?? [];
  if (!Array.isArray(hintsRaw)) throw new Error('puzzle.hints must be an array');
  const hints = hintsRaw.map((hint, i): LookHint => {
    const where = `puzzle.hints[${i}]`;
    if (!isRecord(hint)) throw new Error(`${where} must be an object`);
    const kind = readString(hint, 'kind', where);
    if (!HINT_KINDS.includes(kind)) throw new Error(`${where}.kind must be nudge, where or how`);
    return { kind: kind as LookHint['kind'], view: readView(hint, 'view', where) };
  });
  return {
    id: readString(raw, 'id', 'puzzle'),
    scene: readString(raw, 'scene', 'puzzle'),
    start: readView(raw, 'start', 'puzzle'),
    secret: readView(raw, 'secret', 'puzzle'),
    tolerance: readNumber(raw, 'tolerance', 'puzzle'),
    limits: readView(raw, 'limits', 'puzzle'),
    hints,
  };
}

/** The player's calendar date as YYYY-MM-DD: dailies switch at local midnight. */
export function localDateKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
