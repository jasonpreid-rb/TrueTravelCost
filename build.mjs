// TrueTravelCost static build: src/pages/**/*.html  ->  public/**/*.html
// Fills in the shared head, header and footer from src/partials/.
// Also generates per-page og:title, og:description and og:url from each page's own
// <title>, meta description and canonical, so they never need editing by hand.
// Usage: node build.mjs        (Vercel: Build Command "node build.mjs", Output Directory "public")
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const PAGES = 'src/pages';
const PARTIALS = 'src/partials';
const OUT = 'public';

const DEFAULT_FOOTER_NOTE =
  'TrueTravelCost provides estimates for informational purposes. Actual vehicle and journey costs will vary.';

const partial = (name) => readFileSync(join(PARTIALS, `${name}.html`), 'utf8').replace(/\r\n/g, '\n').trimEnd();

// Make text safe inside a double-quoted HTML attribute without double-escaping existing entities
const attr = (s) =>
  s
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.html')) yield full;
  }
}

let count = 0;
for (const file of walk(PAGES)) {
  const rel = relative(PAGES, file).split(sep).join('/');            // e.g. buy-a-car/index.html
  const urlPath = '/' + rel.replace(/(^|\/)index\.html$/, '$1');     // e.g. /buy-a-car/   or   /
  let html = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  // Optional per-page footer note:  <!-- @footer-note --> ...html... <!-- @end -->
  let note = null;
  html = html.replace(/[ \t]*<!--\s*@footer-note\s*-->([\s\S]*?)<!--\s*@end\s*-->\n?/, (_, n) => {
    note = n.trim();
    return '';
  });

  // Partials:  <!-- @include head|header|footer -->
  html = html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) => partial(name));

  // Tokens inside partials
  html = html.replace(/\{\{footer-note\}\}/g, note ?? DEFAULT_FOOTER_NOTE);
  html = html.replace(/\{\{current:([^}]+)\}\}/g, (_, p) => (p === urlPath ? ' aria-current="page"' : ''));

  // Per-page social tags, built from the page's own title, description and canonical.
  // Skipped for any tag the page already defines by hand.
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  const description = (html.match(/<meta\s+name=["']description["']\s+content="([^"]*)"/i) || [])[1];
  const canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1];
  const og = [];
  if (title && !/property=["']og:title["']/i.test(html)) og.push(`<meta property="og:title" content="${attr(title.trim())}">`);
  if (description && !/property=["']og:description["']/i.test(html)) og.push(`<meta property="og:description" content="${description}">`);
  if (canonical && !/property=["']og:url["']/i.test(html)) og.push(`<meta property="og:url" content="${canonical}">`);
  if (!title || !description || !canonical) {
    console.warn(`WARNING ${rel}: missing <title>, meta description or canonical, so some social tags were not generated`);
  }
  if (og.length) html = html.replace('</head>', `${og.join('\n')}\n</head>`);

  // Shared stylesheet goes last so it wins over older per-page header/footer rules
  if (!html.includes('/css/site.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/css/site.css">\n</head>');
  }

  // Heads-up (not a failure) if the page has no language attribute on <html>
  if (!/<html[^>]*\slang=/i.test(html)) {
    console.warn(`WARNING ${rel}: <html> has no lang attribute (e.g. <html lang="en-GB">)`);
  }

  const leftover = html.match(/\{\{[^}]+\}\}|<!--\s*@\w+/);
  if (leftover) throw new Error(`${rel}: unresolved template marker "${leftover[0]}"`);

  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  console.log(`built ${urlPath.padEnd(28)} <- ${PAGES}/${rel}`);
  count++;
}
console.log(`\n${count} page(s) built into ${OUT}/`);
