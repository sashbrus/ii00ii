// Shared measuring code for the renderer bake-off. Both engine pages use it, so the
// camera path, the resolution rule and the numbers are identical for each engine.

export const SCENES = {
  t: { splats: 20_000, label: '20K' },
  s: { splats: 300_000, label: '300K' },
  m: { splats: 1_000_000, label: '1M' },
  l: { splats: 2_000_000, label: '2M' },
} as const;
export type SceneId = keyof typeof SCENES;

export interface LabResult {
  engine: string;
  backend: string;
  scene: string;
  /** Milliseconds from opening the page to the first frame that shows the scene. */
  loadMs?: number;
  fps?: number;
  /** Frame rate of the slowest 1% of frames. */
  lowFps?: number;
  worstMs?: number;
  codeKb?: number;
  heapMb?: number | null;
  width?: number;
  height?: number;
  dpr?: number;
  error?: string;
}

export interface LabState {
  queue: string[];
  results: LabResult[];
  /** The test that is running. Still set on the next page load means it never finished. */
  current: string | null;
}

const STORE_KEY = 'ii00ii.lab';
const FOV = 50;
const PITCH = 28;
const DEGREES_PER_SECOND = 24;
const WARMUP_SECONDS = 1;
const LOAD_TIMEOUT_SECONDS = 90;
const RAD = Math.PI / 180;

export function readState(): LabState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as LabState;
  } catch {
    // No storage: the tests still run one at a time.
  }
  return { queue: [], results: [], current: null };
}

export function writeState(state: LabState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // See readState.
  }
}

export function formatResult(result: LabResult): string {
  const head = `${result.engine} ${result.backend} ${result.scene}`;
  if (result.error) return `${head} | ERROR: ${result.error}`;
  return [
    head,
    `load ${((result.loadMs ?? 0) / 1000).toFixed(2)} s`,
    `${result.fps} fps (low ${result.lowFps}, worst ${result.worstMs} ms)`,
    `code ${Math.round(result.codeKb ?? 0)} KB`,
    `heap ${result.heapMb ?? 'n/a'} MB`,
    `${result.width}x${result.height} @${result.dpr}`,
  ].join(' | ');
}

export function describeDevice(): string {
  return `${navigator.userAgent} | screen ${screen.width}x${screen.height} @${devicePixelRatio} | cores ${navigator.hardwareConcurrency ?? '?'}`;
}

type Phase = 'loading' | 'warmup' | 'measuring' | 'done';

export class Bench {
  readonly canvas: HTMLCanvasElement;
  readonly scene: { id: SceneId; url: string; splats: number; label: string };
  /** Both engines render at the device's pixel ratio, capped at 2. */
  readonly pixelRatio = Math.min(devicePixelRatio || 1, 2);
  readonly fov = FOV;
  readonly params = new URLSearchParams(location.search);

  private readonly engine: string;
  private backend = '?';
  private readonly hud: HTMLElement;
  private readonly auto: boolean;
  private readonly seconds: number;
  private phase: Phase = 'loading';
  private loadedAt = 0;
  private lastFrame = 0;
  private readonly frames: number[] = [];
  private yaw = 35;
  private pitch = PITCH;
  private lastPose = performance.now();
  private pendingSnapshot: ((art: string) => void) | null = null;
  private finished = false;

  constructor(engine: string) {
    this.engine = engine;
    this.auto = this.params.get('auto') === '1';
    this.seconds = Number(this.params.get('secs')) || 12;
    const requested = this.params.get('scene') ?? 's';
    const id: SceneId = requested in SCENES ? (requested as SceneId) : 's';
    this.scene = { id, url: `/lab/scene-${id}.sog`, ...SCENES[id] };

    this.canvas = document.getElementById('view') as HTMLCanvasElement;
    this.hud = document.getElementById('hud') as HTMLElement;
    this.say('загрузка…');

    Object.assign(window, {
      __lab: {
        result: null,
        snapshot: () =>
          new Promise<string>((resolve) => {
            this.pendingSnapshot = resolve;
          }),
      },
    });

    addEventListener('error', (event) => this.fail(event.message));
    addEventListener('unhandledrejection', (event) => this.fail(String(event.reason)));
    setTimeout(() => {
      if (this.phase === 'loading') this.fail(`no picture after ${LOAD_TIMEOUT_SECONDS} s`);
    }, LOAD_TIMEOUT_SECONDS * 1000);

    if (this.auto) {
      const state = readState();
      const here = location.pathname + location.search;
      if (state.current === here) {
        // This same test was started before and never finished: the tab crashed or reloaded.
        this.fail('page crashed or reloaded during the test');
        return;
      }
      state.current = here;
      writeState(state);
    }
    this.listenForDrag();
  }

  setBackend(name: string): void {
    this.backend = name;
    this.say('загрузка…');
  }

  /** Where the camera is this frame. It circles the table while measuring; afterwards a drag turns it. */
  pose(): { position: [number, number, number]; target: [number, number, number] } {
    const now = performance.now();
    if (this.phase !== 'done') this.yaw += ((now - this.lastPose) / 1000) * DEGREES_PER_SECOND;
    this.lastPose = now;
    // Far enough back that the whole table fits, in portrait as well as landscape.
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const halfAngle = Math.atan(Math.tan((FOV / 2) * RAD) * Math.min(1, aspect));
    const distance = 1.3 / Math.tan(halfAngle);
    const target: [number, number, number] = [0, 0.2, 0];
    const flat = Math.cos(this.pitch * RAD) * distance;
    return {
      position: [
        target[0] + Math.sin(this.yaw * RAD) * flat,
        target[1] + Math.sin(this.pitch * RAD) * distance,
        target[2] + Math.cos(this.yaw * RAD) * flat,
      ],
      target,
    };
  }

  /** The engine calls this once the scene's splats are ready to draw. */
  loaded(): void {
    if (this.phase === 'loading' && this.loadedAt === 0) this.loadedAt = -1;
  }

  /** The engine calls this right after every frame it draws. */
  frame(): void {
    const now = performance.now();
    if (this.pendingSnapshot) {
      this.pendingSnapshot(this.asciiSnapshot());
      this.pendingSnapshot = null;
    }
    if (this.finished) return;
    if (this.phase === 'loading' && this.loadedAt === -1) {
      this.loadedAt = now;
      this.phase = 'warmup';
    } else if (this.phase === 'warmup' && now - this.loadedAt >= WARMUP_SECONDS * 1000) {
      this.phase = 'measuring';
      this.frames.length = 0;
    } else if (this.phase === 'measuring') {
      this.frames.push(now - this.lastFrame);
      const elapsed = (now - this.loadedAt) / 1000 - WARMUP_SECONDS;
      if (elapsed >= this.seconds) this.finish();
      else if (this.frames.length % 30 === 0)
        this.say(`замер… ${Math.ceil(this.seconds - elapsed)} с`);
    }
    this.lastFrame = now;
  }

  fail(message: string): void {
    if (this.finished) return;
    this.report({
      engine: this.engine,
      backend: this.backend,
      scene: this.scene.label,
      error: message.slice(0, 200),
    });
  }

  private finish(): void {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const total = sorted.reduce((sum, ms) => sum + ms, 0);
    const slow = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
    const worst = sorted.at(-1) ?? 0;
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const bytes = (match: (name: string) => boolean): number =>
      entries
        .filter((entry) => match(new URL(entry.name).pathname))
        .reduce((sum, entry) => sum + entry.encodedBodySize, 0);
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.report({
      engine: this.engine,
      backend: this.backend,
      scene: this.scene.label,
      loadMs: Math.round(this.loadedAt),
      fps: Math.round((sorted.length / total) * 1000),
      lowFps: Math.round(1000 / slow),
      worstMs: Math.round(worst),
      codeKb: bytes((name) => name.endsWith('.js')) / 1024,
      heapMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      width: this.canvas.width,
      height: this.canvas.height,
      dpr: this.pixelRatio,
    });
  }

  private report(result: LabResult): void {
    this.finished = true;
    this.phase = 'done';
    (window as unknown as { __lab: { result: LabResult } }).__lab.result = result;
    const line = formatResult(result);
    this.say(line.split(' | ').slice(1).join('\n'));

    if (this.auto) {
      const state = readState();
      state.results.push(result);
      state.current = null;
      const next = state.queue.shift();
      writeState(state);
      setTimeout(() => {
        location.href = next ?? '/lab/';
      }, 400);
      return;
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Копировать';
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(`${line}\n${describeDevice()}`).then(
        () => {
          copy.textContent = 'Скопировано';
        },
        () => {
          copy.textContent = 'Не удалось';
        },
      );
    });
    this.hud.append(copy);
  }

  private say(status: string): void {
    this.hud.textContent = `${this.engine} · ${this.backend} · ${this.scene.label}\n${status}\n`;
    if (!this.auto) {
      const back = document.createElement('a');
      back.href = '/lab/';
      back.textContent = '← все тесты';
      this.hud.append(back, '\n');
    }
  }

  private listenForDrag(): void {
    let last: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.phase !== 'done') return;
      last = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!last) return;
      this.yaw -= (event.clientX - last.x) * 0.3;
      this.pitch = Math.min(80, Math.max(5, this.pitch + (event.clientY - last.y) * 0.3));
      last = { x: event.clientX, y: event.clientY };
    });
    const end = (): void => {
      last = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** A coarse brightness picture of the frame as text, so a test can check what was drawn. */
  private asciiSnapshot(): string {
    const cols = 48;
    const rows = 24;
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const context = small.getContext('2d');
    if (!context) return '';
    context.drawImage(this.canvas, 0, 0, cols, rows);
    const pixels = context.getImageData(0, 0, cols, rows).data;
    const ramp = ' .:-=+*#%@';
    let art = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const light =
          (0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0)) /
          255;
        art += ramp[Math.min(ramp.length - 1, Math.floor(light * ramp.length))];
      }
      art += '\n';
    }
    return art;
  }
}
