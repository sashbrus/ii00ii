import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type LookPuzzle, parseLookPuzzle } from '@ii00ii/kit';
import { describe, expect, it } from 'vitest';
import { verifyLookPuzzle } from './solver.ts';

const dailies = fileURLToPath(new URL('../../../content/dailies/', import.meta.url));
const files = readdirSync(dailies).filter((name) => name.endsWith('.json'));

describe('content/dailies', () => {
  it('holds at least one puzzle', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is solvable and its hints reach the answer', (name) => {
    const puzzle = parseLookPuzzle(JSON.parse(readFileSync(`${dailies}${name}`, 'utf8')));
    expect(`${puzzle.id}.json`).toBe(name);
    expect(verifyLookPuzzle(puzzle)).toEqual([]);
  });
});

describe('verifyLookPuzzle', () => {
  const base: LookPuzzle = {
    id: 'test',
    scene: 'test',
    start: { yaw: -30, pitch: 10 },
    secret: { yaw: 0, pitch: 0 },
    tolerance: 4,
    limits: { yaw: 60, pitch: 40 },
    hints: [],
  };

  it('flags a puzzle that starts solved', () => {
    expect(verifyLookPuzzle({ ...base, start: { yaw: 2, pitch: 1 } })).toContain(
      'the start view is too close to the secret',
    );
  });

  it('flags hints that stop short of the answer', () => {
    const hints: LookPuzzle['hints'] = [{ kind: 'nudge', view: { yaw: -20, pitch: 5 } }];
    expect(verifyLookPuzzle({ ...base, hints })).toContain(
      'the last hint does not reach the secret',
    );
  });

  it('flags a secret the player cannot reach', () => {
    expect(verifyLookPuzzle({ ...base, secret: { yaw: 80, pitch: 0 } })).toContain(
      'the secret view is outside the limits',
    );
  });
});
