// Where ASCII art pieces come from. The artifact build swaps this module for
// one that bundles every piece (see tools/build-artifact.mjs).

const BASE = new URL('../vendor/ascii-magic-art/', import.meta.url).href;

export const loadPiece = (slug) => import(BASE + 'pieces/' + slug + '.js');

export async function loadIndex() {
  const res = await fetch(BASE + 'index.json');
  return res.json();
}
