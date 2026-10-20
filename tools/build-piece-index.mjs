// Builds vendor/ascii-magic-art/index.json: the metadata of every piece, so the
// browser can match lyric keywords to pieces without importing all 600+ modules.
//   node tools/build-piece-index.mjs

import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'ascii-magic-art');
const out = [];
for (const f of readdirSync(join(root, 'pieces')).filter((f) => f.endsWith('.js')).sort()) {
  const { meta } = await import(pathToFileURL(join(root, 'pieces', f)).href);
  out.push({
    slug: meta.slug, name: meta.name, category: meta.category, tags: meta.tags || [],
    note: meta.note || '', cols: meta.cols, rows: meta.rows, cell: meta.cell || 'text', look: meta.look || null,
  });
}
writeFileSync(join(root, 'index.json'), JSON.stringify(out));
console.log(`${out.length} pieces indexed`);
