import {
  angularDistance,
  clampView,
  isAligned,
  type LookPuzzle,
  type Viewpoint,
} from '@ii00ii/kit';

const HINT_ORDER = ['nudge', 'where', 'how'];

function insideLimits(view: Viewpoint, puzzle: LookPuzzle): boolean {
  const clamped = clampView(view, puzzle.limits);
  return clamped.yaw === view.yaw && clamped.pitch === view.pitch;
}

/**
 * Prove a LOOK puzzle is fair. Returns a list of problems; an empty list means the
 * puzzle can be solved, does not start solved, and its hints lead to the answer.
 */
export function verifyLookPuzzle(puzzle: LookPuzzle): string[] {
  const problems: string[] = [];
  if (puzzle.tolerance <= 0) problems.push('tolerance must be above zero');
  if (puzzle.limits.yaw <= 0 || puzzle.limits.pitch <= 0) {
    problems.push('limits must be above zero');
  }
  if (!insideLimits(puzzle.secret, puzzle)) problems.push('the secret view is outside the limits');
  if (!insideLimits(puzzle.start, puzzle)) problems.push('the start view is outside the limits');
  if (isAligned(puzzle.start, puzzle.secret, puzzle.tolerance * 3)) {
    problems.push('the start view is too close to the secret');
  }

  let previousRank = -1;
  let previousDistance = angularDistance(puzzle.start, puzzle.secret);
  puzzle.hints.forEach((hint, i) => {
    const rank = HINT_ORDER.indexOf(hint.kind);
    if (rank <= previousRank) {
      problems.push(`hint ${i} is out of order: nudge, then where, then how`);
    }
    previousRank = rank;
    if (!insideLimits(hint.view, puzzle)) problems.push(`hint ${i} is outside the limits`);
    const distance = angularDistance(hint.view, puzzle.secret);
    if (distance >= previousDistance) problems.push(`hint ${i} does not move closer to the secret`);
    previousDistance = distance;
  });
  const last = puzzle.hints.at(-1);
  if (last && !isAligned(last.view, puzzle.secret, puzzle.tolerance)) {
    problems.push('the last hint does not reach the secret');
  }
  return problems;
}
