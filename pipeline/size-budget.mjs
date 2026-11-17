// Size budget check: the site shell's JavaScript must stay under 100 KB compressed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../apps/site/dist/', import.meta.url));
const SHELL_JS_LIMIT = 100 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(dist);
} catch {
  console.error('apps/site/dist not found. Run `pnpm build` first.');
  process.exit(1);
}

// Inline <script> blocks count too: Astro inlines small scripts into the HTML.
let total = 0;
for (const path of files) {
  let size = 0;
  if (path.endsWith('.js')) {
    size = gzipSync(readFileSync(path)).length;
  } else if (path.endsWith('.html')) {
    const scripts = readFileSync(path, 'utf8').match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? [];
    if (scripts.length > 0) size = gzipSync(scripts.join('\n')).length;
  }
  if (size > 0) {
    total += size;
    console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${relative(dist, path)}`);
  }
}

const verdict = total <= SHELL_JS_LIMIT ? 'ok' : 'OVER BUDGET';
console.log(
  `${(total / 1024).toFixed(1).padStart(7)} KB  shell JavaScript, gzip (limit 100 KB): ${verdict}`,
);
process.exit(total <= SHELL_JS_LIMIT ? 0 : 1);
