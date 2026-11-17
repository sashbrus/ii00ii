// Builds the synthetic test scenes for the renderer bake-off: a still life on a table,
// made of surface-aligned Gaussian splats, at fixed splat counts. The scenes are our own
// (no third-party assets), deterministic, and written as .sog, which both engines load.
//
//   node pipeline/make-test-scenes.mjs          build any scene that is missing
//   node pipeline/make-test-scenes.mjs --force  rebuild all
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCENES = [
  { id: 't', splats: 20_000 },
  { id: 's', splats: 300_000 },
  { id: 'm', splats: 1_000_000 },
  { id: 'l', splats: 2_000_000 },
];

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const outDir = at('../apps/site/public/lab/');
const cacheDir = at('./.cache/');
const cli = at('../node_modules/@playcanvas/splat-transform/bin/cli.mjs');
const force = process.argv.includes('--force');

// ---------- small maths helpers ----------

/** Deterministic random numbers, so every build makes the same scene. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const rotateY = ([x, y, z], angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
};
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- the still life ----------
// Each object: its surface area (m²), a detail weight, and a sampler that returns a
// point on the surface, the normal there and the base colour.

function disc({ radius, y, colour }) {
  return {
    area: Math.PI * radius * radius,
    sample: (rnd) => {
      const r = radius * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const p = [r * Math.cos(a), y, r * Math.sin(a)];
      return { p, n: [0, 1, 0], c: colour(p) };
    },
  };
}

function cylinderSide({ radius, y0, y1, colour }) {
  return {
    area: 2 * Math.PI * radius * (y1 - y0),
    sample: (rnd) => {
      const a = rnd() * Math.PI * 2;
      const p = [radius * Math.cos(a), y0 + rnd() * (y1 - y0), radius * Math.sin(a)];
      return { p, n: [Math.cos(a), 0, Math.sin(a)], c: colour(p) };
    },
  };
}

function sphere({ centre, radius, colour }) {
  return {
    area: 4 * Math.PI * radius * radius,
    sample: (rnd) => {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const n = [s * Math.cos(a), u, s * Math.sin(a)];
      const p = [centre[0] + n[0] * radius, centre[1] + n[1] * radius, centre[2] + n[2] * radius];
      return { p, n, c: colour(p, n) };
    },
  };
}

function box({ centre, size, turn, colour }) {
  const [w, h, d] = size;
  const faces = [
    { n: [1, 0, 0], area: h * d },
    { n: [-1, 0, 0], area: h * d },
    { n: [0, 1, 0], area: w * d },
    { n: [0, 0, 1], area: w * h },
    { n: [0, 0, -1], area: w * h },
  ];
  const total = faces.reduce((sum, face) => sum + face.area, 0);
  return {
    area: total,
    sample: (rnd) => {
      let pick = rnd() * total;
      let face = faces[0];
      for (const candidate of faces) {
        face = candidate;
        pick -= candidate.area;
        if (pick <= 0) break;
      }
      const u = rnd() - 0.5;
      const v = rnd() - 0.5;
      const [nx, ny, nz] = face.n;
      const local = nx
        ? [(nx * w) / 2, u * h, v * d]
        : ny
          ? [u * w, (ny * h) / 2, v * d]
          : [u * w, v * h, (nz * d) / 2];
      const turned = rotateY(local, turn);
      const p = [centre[0] + turned[0], centre[1] + turned[1], centre[2] + turned[2]];
      return { p, n: rotateY(face.n, turn), c: colour(local, face.n) };
    },
  };
}

/** A surface of revolution around a vertical axis; `profile(t)` gives the radius at height t in 0..1. */
function lathe({ base, height, profile, colour }) {
  const STEPS = 64;
  const bands = [];
  let total = 0;
  for (let i = 0; i < STEPS; i++) {
    const r0 = profile(i / STEPS);
    const r1 = profile((i + 1) / STEPS);
    const slant = Math.hypot(r1 - r0, height / STEPS);
    const area = Math.PI * (r0 + r1) * slant;
    total += area;
    bands.push(area);
  }
  return {
    area: total,
    sample: (rnd) => {
      let pick = rnd() * total;
      let band = 0;
      for (; band < STEPS - 1; band++) {
        pick -= bands[band];
        if (pick <= 0) break;
      }
      const t = (band + rnd()) / STEPS;
      const r = profile(t);
      const slope = (profile(t + 0.002) - profile(t - 0.002)) / (0.004 * height);
      const a = rnd() * Math.PI * 2;
      const p = [base[0] + r * Math.cos(a), base[1] + t * height, base[2] + r * Math.sin(a)];
      return { p, n: normalize([Math.cos(a), -slope, Math.sin(a)]), c: colour(t, a) };
    },
  };
}

function torus({ centre, major, minor, colour }) {
  return {
    area: 4 * Math.PI * Math.PI * major * minor,
    sample: (rnd) => {
      const a = rnd() * Math.PI * 2;
      // Rejection sampling keeps the density even between the inside and outside of the ring.
      let b = rnd() * Math.PI * 2;
      while (rnd() > (major + minor * Math.cos(b)) / (major + minor)) b = rnd() * Math.PI * 2;
      const ring = major + minor * Math.cos(b);
      const p = [
        centre[0] + ring * Math.cos(a),
        centre[1] + minor * Math.sin(b),
        centre[2] + ring * Math.sin(a),
      ];
      const n = [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
      return { p, n, c: colour(p, n) };
    },
  };
}

const wood = ([x, , z]) => {
  const grain = 0.5 + 0.5 * Math.sin(x * 55 + Math.sin(z * 9) * 2.5);
  const k = 0.75 + 0.25 * grain;
  return [0.5 * k, 0.32 * k, 0.17 * k];
};
const brass = () => [0.78, 0.58, 0.22];
const ceramic = (t) => (t > 0.42 && t < 0.5 ? [0.16, 0.27, 0.55] : [0.9, 0.88, 0.82]);
const paper = () => [0.93, 0.91, 0.85];
const cloth = (rgb) => (local) => {
  const weave = 0.92 + 0.08 * Math.sin(local[0] * 400) * Math.sin(local[2] * 400);
  return rgb.map((channel) => channel * weave);
};

const OBJECTS = [
  { weight: 1, ...disc({ radius: 1.1, y: 0, colour: wood }) },
  { weight: 1, ...cylinderSide({ radius: 1.1, y0: -0.06, y1: 0, colour: wood }) },
  {
    weight: 2,
    ...lathe({
      base: [-0.36, 0, -0.12],
      height: 0.62,
      profile: (t) => 0.07 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 1.4 + 0.02 * t,
      colour: ceramic,
    }),
  },
  { weight: 2, ...sphere({ centre: [0.32, 0.16, 0.26], radius: 0.16, colour: brass }) },
  {
    weight: 1.5,
    ...box({
      centre: [0.28, 0.05, -0.36],
      size: [0.5, 0.1, 0.34],
      turn: 0.35,
      colour: cloth([0.5, 0.12, 0.1]),
    }),
  },
  {
    weight: 1.5,
    ...box({
      centre: [0.26, 0.14, -0.35],
      size: [0.42, 0.08, 0.28],
      turn: 0.1,
      colour: cloth([0.12, 0.3, 0.22]),
    }),
  },
  {
    weight: 3,
    ...torus({ centre: [-0.08, 0.036, 0.46], major: 0.13, minor: 0.035, colour: brass }),
  },
  {
    weight: 1.5,
    ...box({ centre: [-0.5, 0.003, 0.3], size: [0.3, 0.004, 0.21], turn: -0.5, colour: paper }),
  },
];

const LIGHT = normalize([0.3, 1, 0.4]);
const SH_C0 = 0.28209479177387814;
const FLOATS_PER_SPLAT = 14;

/** Rotation (w, x, y, z) that turns a splat's flat axis (local z) to face along `n`. */
function facing([nx, ny, nz]) {
  if (nz < -0.999999) return [0, 1, 0, 0];
  const w = 1 + nz;
  const length = Math.hypot(w, -ny, nx);
  return [w / length, -ny / length, nx / length, 0];
}

function writePly(path, count) {
  const rnd = mulberry32(0x1100 + count);
  const shares = OBJECTS.map((object) => object.area * object.weight);
  const totalShare = shares.reduce((sum, share) => sum + share, 0);

  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${count}`,
    ...['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'].map(
      (name) => `property float ${name}`,
    ),
    ...['scale_0', 'scale_1', 'scale_2'].map((name) => `property float ${name}`),
    ...['rot_0', 'rot_1', 'rot_2', 'rot_3'].map((name) => `property float ${name}`),
    'end_header',
    '',
  ].join('\n');

  const file = openSync(path, 'w');
  writeSync(file, header);
  const CHUNK = 65536;
  const floats = new Float32Array(CHUNK * FLOATS_PER_SPLAT);
  const bytes = new Uint8Array(floats.buffer);
  let filled = 0;
  let written = 0;

  OBJECTS.forEach((object, index) => {
    const isLast = index === OBJECTS.length - 1;
    const n = isLast ? count - written : Math.round((count * shares[index]) / totalShare);
    // Splats are flat discs: wide enough to overlap their neighbours, thin along the normal.
    const spacing = Math.sqrt(object.area / Math.max(1, n));
    const width = Math.log(spacing * 0.6);
    const thickness = Math.log(spacing * 0.12);
    for (let i = 0; i < n; i++) {
      const { p, n: normal, c } = object.sample(rnd);
      const diffuse = Math.max(
        0,
        normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2],
      );
      // One pool of light over the middle of the table, fading towards the edge.
      const pool = 1 - 0.55 * smoothstep(0.45, 1.25, Math.hypot(p[0], p[2]));
      const lit = (0.22 + 0.9 * diffuse) * pool * (0.96 + 0.08 * rnd());
      const q = facing(normal);
      const o = filled * FLOATS_PER_SPLAT;
      floats[o] = p[0];
      floats[o + 1] = p[1];
      floats[o + 2] = p[2];
      floats[o + 3] = (Math.min(1, c[0] * lit) - 0.5) / SH_C0;
      floats[o + 4] = (Math.min(1, c[1] * lit) - 0.5) / SH_C0;
      floats[o + 5] = (Math.min(1, c[2] * lit) - 0.5) / SH_C0;
      floats[o + 6] = 3; // opacity logit: about 0.95
      floats[o + 7] = width;
      floats[o + 8] = width;
      floats[o + 9] = thickness;
      floats[o + 10] = q[0];
      floats[o + 11] = q[1];
      floats[o + 12] = q[2];
      floats[o + 13] = q[3];
      filled++;
      if (filled === CHUNK) {
        writeSync(file, bytes);
        filled = 0;
      }
    }
    written += n;
  });
  if (filled > 0) writeSync(file, bytes, 0, filled * FLOATS_PER_SPLAT * 4);
  closeSync(file);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

for (const scene of SCENES) {
  const sog = `${outDir}scene-${scene.id}.sog`;
  if (existsSync(sog) && !force) {
    console.log(`scene-${scene.id}.sog exists (${(statSync(sog).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  const ply = `${cacheDir}scene-${scene.id}.ply`;
  const started = Date.now();
  writePly(ply, scene.splats);
  const run = spawnSync(
    process.execPath,
    [cli, ply, '-m', sog, '-g', 'cpu', '-w', '-q', '--no-tty'],
    {
      stdio: 'inherit',
    },
  );
  rmSync(ply, { force: true });
  if (run.status !== 0) {
    console.error(`splat-transform failed for scene-${scene.id}`);
    process.exit(1);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const size = (statSync(sog).size / 1e6).toFixed(1);
  console.log(`scene-${scene.id}.sog  ${scene.splats} splats  ${size} MB  (${seconds} s)`);
}
