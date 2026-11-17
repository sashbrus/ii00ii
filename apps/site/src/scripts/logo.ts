// The playable logo. Each glyph hangs at its own depth, sized and placed so that from
// the secret viewpoint (straight on) the six read as "ii00ii". Drag to look around.
import {
  clampView,
  easeView,
  glide,
  isAligned,
  parseLookPuzzle,
  type Viewpoint,
} from '@ii00ii/kit';
import logoPuzzle from '../../../../content/dailies/logo.json';

const puzzle = parseLookPuzzle(logoPuzzle);

const SOLVED_KEY = 'ii00ii.logo';
/** Depth of each glyph as a fraction of the logo's width. Positive is nearer the viewer. */
const DEPTHS = [-0.42, 0.3, -0.16, 0.46, -0.5, 0.22];
/** Camera distance as a multiple of the logo's width. */
const DISTANCE = 2.4;
const DEGREES_PER_PIXEL = 0.3;
const KEY_STEP = 3;
/** Seconds the view must rest on the answer before it counts. */
const DWELL = 0.25;
/** Seconds the logo takes to settle once solved. */
const SETTLE = 0.7;

const root = document.documentElement;
const room = document.getElementById('room');
const stage = document.getElementById('stage');
const rig = document.getElementById('rig');
const skip = document.getElementById('skip');

if (room && stage && rig && skip && root.classList.contains('play')) {
  play(room, stage, rig, skip);
}

function play(room: HTMLElement, stage: HTMLElement, rig: HTMLElement, skip: HTMLElement): void {
  const glyphs = [...rig.querySelectorAll<HTMLElement>('.g')];
  const stillness = matchMedia('(prefers-reduced-motion: reduce)');

  let view: Viewpoint = puzzle.start;
  let velocity: Viewpoint = { yaw: 0, pitch: 0 };
  let dragging = false;
  let solved = false;
  let dwell = 0;
  let lastFrame = performance.now();
  let lastMove = { x: 0, y: 0, time: 0 };

  /** Push each glyph back or forward, then shrink or grow it so the straight-on view is unchanged. */
  function layout(): void {
    const width = rig.offsetWidth;
    const distance = width * DISTANCE;
    stage.style.perspective = `${distance}px`;
    glyphs.forEach((glyph, i) => {
      const depth = DEPTHS[i % DEPTHS.length] ?? 0;
      const z = depth * width;
      const x = glyph.offsetLeft + glyph.offsetWidth / 2 - width / 2;
      const y = glyph.offsetTop + glyph.offsetHeight / 2 - rig.offsetHeight / 2;
      const scale = (distance - z) / distance;
      const shiftX = (-x * z) / distance;
      const shiftY = (-y * z) / distance;
      glyph.style.transform = `translate3d(${shiftX}px, ${shiftY}px, ${z}px) scale(${scale})`;
      // Glyphs deeper in the room sit further from the light.
      glyph.style.opacity = String(0.55 + 0.45 * (depth + 0.5));
    });
  }

  function render(): void {
    rig.style.transform = `rotateX(${view.pitch}deg) rotateY(${view.yaw}deg)`;
  }

  function open(): void {
    if (solved) return;
    solved = true;
    dragging = false;
    room.classList.remove('dragging');
    try {
      localStorage.setItem(SOLVED_KEY, '1');
    } catch {
      // Private browsing: the puzzle simply plays again next visit.
    }
    root.classList.replace('play', 'open');

    const from = view;
    const began = performance.now();
    const settle = (now: number): void => {
      const t = stillness.matches ? 1 : (now - began) / 1000 / SETTLE;
      view = easeView(from, puzzle.secret, t);
      render();
      if (t < 1) requestAnimationFrame(settle);
    };
    settle(began);
  }

  function frame(now: number): void {
    if (solved) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!dragging) {
      const next = glide(view, velocity, dt);
      view = clampView(next.view, puzzle.limits);
      velocity = next.velocity;
    }
    render();
    dwell = isAligned(view, puzzle.secret, puzzle.tolerance) ? dwell + dt : 0;
    if (dwell >= DWELL) {
      open();
      return;
    }
    requestAnimationFrame(frame);
  }

  room.addEventListener('pointerdown', (event) => {
    if (solved || (event.target as Element).closest('button')) return;
    dragging = true;
    velocity = { yaw: 0, pitch: 0 };
    lastMove = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    room.setPointerCapture(event.pointerId);
    room.classList.add('dragging');
  });

  room.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const turn = {
      yaw: (event.clientX - lastMove.x) * DEGREES_PER_PIXEL,
      pitch: -(event.clientY - lastMove.y) * DEGREES_PER_PIXEL,
    };
    const dt = Math.max(1, event.timeStamp - lastMove.time) / 1000;
    view = clampView({ yaw: view.yaw + turn.yaw, pitch: view.pitch + turn.pitch }, puzzle.limits);
    velocity = { yaw: turn.yaw / dt, pitch: turn.pitch / dt };
    lastMove = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  });

  const release = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    room.classList.remove('dragging');
    // A finger that paused before lifting leaves the logo at rest.
    if (stillness.matches || event.timeStamp - lastMove.time > 80) {
      velocity = { yaw: 0, pitch: 0 };
    }
  };
  room.addEventListener('pointerup', release);
  room.addEventListener('pointercancel', release);

  stage.addEventListener('keydown', (event) => {
    const turns: Record<string, Viewpoint> = {
      ArrowLeft: { yaw: -KEY_STEP, pitch: 0 },
      ArrowRight: { yaw: KEY_STEP, pitch: 0 },
      ArrowUp: { yaw: 0, pitch: KEY_STEP },
      ArrowDown: { yaw: 0, pitch: -KEY_STEP },
    };
    const turn = turns[event.key];
    if (solved || !turn) return;
    event.preventDefault();
    velocity = { yaw: 0, pitch: 0 };
    view = clampView({ yaw: view.yaw + turn.yaw, pitch: view.pitch + turn.pitch }, puzzle.limits);
  });

  skip.addEventListener('click', open);
  new ResizeObserver(layout).observe(rig);

  layout();
  render();
  root.classList.add('ready');
  requestAnimationFrame(frame);
}
