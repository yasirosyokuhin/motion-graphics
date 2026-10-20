// Bundles the app into a single page + script for publishing as a claude.ai
// artifact (which allows few files): every ASCII piece is imported statically.
//   npm run build:artifact   ->   dist/artifact/{index.html, app.js}

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const vendor = join(root, 'vendor', 'ascii-magic-art');
const index = JSON.parse(readFileSync(join(vendor, 'index.json'), 'utf8'));
const source = [
  ...index.map((p, i) => `import * as p${i} from ${JSON.stringify(join(vendor, 'pieces', p.slug + '.js'))};`),
  `import INDEX from ${JSON.stringify(join(vendor, 'index.json'))};`,
  `import CATS from ${JSON.stringify(join(vendor, 'categories.json'))};`,
  `const MAP = { ${index.map((p, i) => `${JSON.stringify(p.slug)}: p${i}`).join(', ')} };`,
  'export const loadPiece = async (slug) => { const m = MAP[slug]; if (!m) throw new Error("no piece " + slug); return m; };',
  'export const loadIndex = async () => INDEX;',
  'export const loadCategories = async () => CATS;',
].join('\n');

async function bundle(entry, out) {
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [join(root, 'src', entry)],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    logLevel: 'error',
    outfile: join(out, 'app.js'),
    plugins: [{
      name: 'bundled-pieces',
      setup(b) {
        b.onResolve({ filter: /piece-source\.js$/ }, () => ({ path: 'bundled-pieces', namespace: 'mv' }));
        b.onLoad({ filter: /.*/, namespace: 'mv' }, () => ({ contents: source, resolveDir: root, loader: 'js' }));
      },
    }],
  });
}

// The MV generator page: no doctype/head/body (the host adds them), styles inline.
{
  const out = join(root, 'dist', 'artifact');
  await bundle('main.js', out);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  writeFileSync(join(out, 'index.html'), `<title>MV//GEN</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
:root { color-scheme: dark; }
html, body { height: 100%; }
.bar { padding-left: max(18px, env(safe-area-inset-left, 0px)); padding-right: max(18px, env(safe-area-inset-right, 0px)); }
.panel { padding-left: max(16px, env(safe-area-inset-left, 0px)); }
.stage { padding-right: max(16px, env(safe-area-inset-right, 0px)); }
@media (max-width: 900px) {
  .panel { padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .stage { padding-left: max(16px, env(safe-area-inset-left, 0px)); }
}
</style>
${body}
<script>window.MV_EMBED = true;</script>
<script type="module" src="app.js"></script>
`);
  console.log('built', out);
}

// The ASCII catalog page.
{
  const out = join(root, 'dist', 'catalog');
  await bundle('catalog.js', out);
  const html = readFileSync(join(root, 'catalog.html'), 'utf8');
  const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  writeFileSync(join(out, 'index.html'), `${head.replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">')}
${body}
<script type="module" src="app.js"></script>
`);
  console.log('built', out);
}
