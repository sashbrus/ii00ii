// The bake-off start page: one button runs every engine on every scene size in turn,
// then the results are shown here to copy.
import { describeDevice, formatResult, readState, SCENES, writeState } from './bench.ts';

const SIZES = ['s', 'm', 'l'] as const;
const variants = [
  { label: 'Spark (WebGL2)', path: '/lab/spark/', extra: '' },
  { label: 'PlayCanvas (WebGL2)', path: '/lab/playcanvas/', extra: '&gpu=webgl2' },
  ...('gpu' in navigator
    ? [{ label: 'PlayCanvas (WebGPU)', path: '/lab/playcanvas/', extra: '&gpu=webgpu' }]
    : []),
];

const startButton = document.getElementById('start') as HTMLButtonElement;
const resumeButton = document.getElementById('resume') as HTMLButtonElement;
const copyButton = document.getElementById('copy') as HTMLButtonElement;
const output = document.getElementById('results') as HTMLElement;
const links = document.getElementById('links') as HTMLElement;

function go(): void {
  const state = readState();
  const next = state.queue.shift();
  writeState(state);
  if (next) location.href = next;
  else location.reload();
}

const state = readState();
if (state.current) {
  // We are back here while a test was still marked as running: its tab crashed.
  const url = new URL(state.current, location.origin);
  const size = url.searchParams.get('scene') as keyof typeof SCENES | null;
  state.results.push({
    engine: url.pathname.includes('spark') ? 'spark' : 'playcanvas',
    backend: url.searchParams.get('gpu') ?? 'webgl2',
    scene: size && size in SCENES ? SCENES[size].label : '?',
    error: 'page crashed during the test',
  });
  state.current = null;
  writeState(state);
}

const report = [...state.results.map(formatResult), describeDevice()].join('\n');
if (state.results.length > 0) {
  output.textContent = report;
  copyButton.hidden = false;
  copyButton.addEventListener('click', () => {
    navigator.clipboard?.writeText(report).then(
      () => {
        copyButton.textContent = 'Скопировано';
      },
      () => {
        // No clipboard access: select the text so it can be copied by hand.
        getSelection()?.selectAllChildren(output);
      },
    );
  });
}
if (state.queue.length > 0) {
  resumeButton.hidden = false;
  resumeButton.textContent = `Продолжить (осталось ${state.queue.length})`;
  resumeButton.addEventListener('click', go);
}

startButton.addEventListener('click', () => {
  // Smallest scene first, so a phone that cannot hold the largest still reports the rest.
  const queue = SIZES.flatMap((size) =>
    variants.map((variant) => `${variant.path}?scene=${size}&auto=1${variant.extra}`),
  );
  writeState({ queue, results: [], current: null });
  go();
});

for (const size of SIZES) {
  for (const variant of variants) {
    const link = document.createElement('a');
    link.href = `${variant.path}?scene=${size}${variant.extra}`;
    link.textContent = `${variant.label} · ${SCENES[size].label}`;
    links.append(link);
  }
}
