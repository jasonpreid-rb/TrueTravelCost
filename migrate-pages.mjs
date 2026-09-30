// One-off migration: converts old-style pages in src/pages/ to use the shared partials.
// Usage:  node migrate-pages.mjs
// - Skips pages that are already converted (safe to run twice).
// - Backs up each original to src/pages-backup/ before changing it.
// - If a page doesn't match the expected layout, it is left untouched and the reason is printed.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const PAGES = 'src/pages';
const BACKUP = 'src/pages-backup';
const DEFAULT_NOTE = 'TrueTravelCost provides estimates for informational purposes. Actual vehicle and journey costs will vary.';
const squash = (s) => s.replace(/\s+/g, ' ').trim();

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.html')) yield full;
  }
}

function migrate(src) {
  let html = src.replace(/\r\n/g, '\n');
  if (html.includes('@include header')) return { skip: 'already converted' };

  // ---- head: drop the boilerplate that now lives in src/partials/head.html ----
  const before = html;
  html = html.replace(/<!--\s*Google tag \(gtag\.js\)\s*-->\s*<script async[^>]*><\/script>\s*<script>[\s\S]*?<\/script>\s*/, '');
  html = html.replace(/[ \t]*<meta charset=[^>]*>\n?/, '');
  html = html.replace(/[ \t]*<meta name="viewport"[^>]*>\n?/, '');
  html = html.replace(/[ \t]*<link rel="preconnect"[^>]*>\n?/g, '');
  html = html.replace(/[ \t]*<link\s+href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/, '');
  html = html.replace(/[ \t]*<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\n?/g, '');
  if (html === before) return { fail: 'could not find the standard head section' };
  html = html.replace(/<head>\n?/, '<head>\n<!-- @include head -->\n');
  html = html.replace(/(<!-- @include head -->\n)\s*\n+/, '$1');

  // ---- header: replace with the shared header, inside .wrap ----
  const hdr = /<header class="top">[\s\S]*?<\/header>\s*<div class="wrap">/;
  if (!hdr.test(html)) return { fail: 'could not find <header class="top"> followed by <div class="wrap">' };
  html = html.replace(hdr, '<div class="wrap">\n\n<!-- @include header -->');

  // ---- footer: move inside .wrap and replace with the shared footer ----
  const ftr = /<\/main>\s*<\/div>\s*<footer>([\s\S]*?)<\/footer>/;
  const m = html.match(ftr);
  if (!m) return { fail: 'could not find </main></div><footer>…</footer>' };
  const paras = [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => squash(p[1]));
  const note = paras.join(' ');
  const noteBlock = note && note !== DEFAULT_NOTE ? `<!-- @footer-note -->\n${note}\n<!-- @end -->\n` : '';
  html = html.replace(ftr, `</main>\n\n${noteBlock}<!-- @include footer -->\n\n</div>`);

  return { html };
}

let done = 0, skipped = 0, failed = 0;
for (const file of walk(PAGES)) {
  const rel = relative(PAGES, file).split(sep).join('/');
  const original = readFileSync(file, 'utf8');
  const r = migrate(original);
  if (r.skip) { console.log(`skip    ${rel}  (${r.skip})`); skipped++; continue; }
  if (r.fail) { console.log(`FAILED  ${rel}  - ${r.fail}. Left unchanged.`); failed++; continue; }
  const bak = join(BACKUP, rel);
  mkdirSync(dirname(bak), { recursive: true });
  writeFileSync(bak, original);
  writeFileSync(file, r.html);
  console.log(`done    ${rel}`);
  done++;
}
console.log(`\n${done} converted, ${skipped} skipped, ${failed} failed. Originals are in ${BACKUP}/`);
