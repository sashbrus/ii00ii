// Size budget check. For every built page, adds up the JavaScript it loads (inline
// scripts, script files and everything those import), compressed. The site shell
// (the landing page) must stay under 100 KB; other pages are reported for reference.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../apps/site/dist/', import.meta.url));
const SHELL_PAGE = 'index.html';
const SHELL_JS_LIMIT = 100 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let pages;
try {
  pages = walk(dist).filter((path) => path.endsWith('.html'));
} catch {
  console.error('apps/site/dist not found. Run `pnpm build` first.');
  process.exit(1);
}

/** Every script file a page pulls in: its <script src> files and their imports, followed to the end. */
function scriptsOf(html) {
  const found = new Set();
  const visit = (urlPath) => {
    if (found.has(urlPath)) return;
    let source;
    try {
      source = readFileSync(join(dist, urlPath), 'utf8');
    } catch {
      return;
    }
    found.add(urlPath);
    const imports = source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g);
    for (const [, specifier] of imports) visit(posix.join(posix.dirname(urlPath), specifier));
  };
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) visit(src);
  return [...found];
}

let shellSize = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const inline = (html.match(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) ?? []).join('\n');
  let size = inline ? gzipSync(inline).length : 0;
  for (const script of scriptsOf(html)) size += gzipSync(readFileSync(join(dist, script))).length;
  const name = relative(dist, page).replaceAll('\\', '/');
  if (name === SHELL_PAGE) shellSize = size;
  console.log(
    `${(size / 1024).toFixed(1).padStart(8)} KB  ${name === SHELL_PAGE ? name : dirname(name)}/`,
  );
}

const ok = shellSize <= SHELL_JS_LIMIT;
console.log(
  `Shell JavaScript, gzip: ${(shellSize / 1024).toFixed(1)} KB of 100 KB: ${ok ? 'ok' : 'OVER BUDGET'}`,
);
process.exit(ok ? 0 : 1);
