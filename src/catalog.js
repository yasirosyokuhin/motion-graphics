// ASCII catalog: every ascii-magic-art piece in a grid, animated while on
// screen, filterable by category / search, re-letterable in any look.

import { renderTo, LOOKS } from '../vendor/ascii-magic-art/runtime/canvas.js';
import { loadPiece, loadIndex, loadCategories } from './piece-source.js';
import { CATEGORY_WEIGHT } from './library.js';

const $ = (id) => document.getElementById(id);
const JA = {
  landscapes: '風景', screens: 'UI画面', 'live-data': 'ライブデータ', explainers: '図解', lettering: '文字', solids: '立体',
  cosmos: '宇宙', 'motion-lab': '物理・動き', weather: '天気・自然', animals: '動物', things: 'モノ', algorithms: 'アルゴリズム',
  demoscene: 'デモシーン', arcade: 'アーケード', frames: '罫線・枠', occasions: '行事', cities: '世界の都市', mascots: 'キャラクター',
  'empty-states': '空状態', retro: 'レトロPC', science: '科学', music: '音楽', food: '食べ物', india: 'インド',
};

const state = { index: [], cats: [], cat: 'all', q: '', look: 'original', mvOnly: false, cards: [], visible: new Set(), modal: null, t0: performance.now() };
const usedInMV = (p) => (CATEGORY_WEIGHT[p.category] ?? 0.3) > 0;

async function getPiece(slug) {
  const c = getPiece.cache || (getPiece.cache = new Map());
  if (!c.has(slug)) {
    const mod = await loadPiece(slug);
    c.set(slug, { meta: mod.meta, draw: mod.default() });
  }
  return c.get(slug);
}

function lookOpts() {
  return state.look === 'original' ? {} : { look: state.look };
}

function paintCard(card, t) {
  const p = card.piece;
  if (!p) return;
  const frame = p.draw(t);
  renderTo(card.canvas, frame, frame.palette || p.meta.palette, { width: card.canvas.width, height: card.canvas.height, bg: '#0b0b10', fit: 'contain', margin: 0.04, meta: p.meta, look: lookOpts() });
}

function buildChips() {
  const counts = {};
  for (const p of state.index) counts[p.category] = (counts[p.category] || 0) + 1;
  const chips = [['all', `すべて`, state.index.length], ...state.cats.filter((c) => counts[c.id]).map((c) => [c.id, JA[c.id] || c.name, counts[c.id]])];
  $('cats').innerHTML = chips.map(([id, label, n]) => `<button class="chip${id === state.cat ? ' on' : ''}" data-cat="${id}">${label}<span>${n}</span></button>`).join('');
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return state.index.filter((p) =>
    (state.cat === 'all' || p.category === state.cat) &&
    (!state.mvOnly || usedInMV(p)) &&
    (!q || p.slug.includes(q) || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)) || (JA[p.category] || '').includes(q)));
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const card = e.target._card;
    if (e.isIntersecting) {
      state.visible.add(card);
      if (!card.piece && !card.loading) {
        card.loading = true;
        getPiece(card.slug).then((p) => { card.piece = p; paintCard(card, 0); });
      }
    } else state.visible.delete(card);
  }
}, { rootMargin: '200px' });

function buildGrid() {
  const grid = $('grid');
  for (const c of state.cards) io.unobserve(c.el);
  state.cards = [];
  state.visible.clear();
  grid.innerHTML = '';
  const list = filtered();
  $('count').textContent = `${list.length} 作品`;
  const frag = document.createDocumentFragment();
  for (const p of list) {
    const el = document.createElement('button');
    el.className = 'card';
    el.innerHTML = `<canvas width="480" height="270"></canvas><div class="meta"><b>${p.name}</b><span>${JA[p.category] || p.category}${usedInMV(p) ? '' : ' · MV外'}</span></div>`;
    const card = { el, slug: p.slug, info: p, canvas: el.querySelector('canvas'), piece: null };
    el._card = card;
    el.addEventListener('click', () => openModal(card));
    io.observe(el);
    state.cards.push(card);
    frag.append(el);
  }
  grid.append(frag);
}

async function openModal(card) {
  const p = card.info;
  $('mTitle').textContent = p.name;
  $('mCat').textContent = `${JA[p.category] || p.category} / ${p.slug}${usedInMV(p) ? '' : '（MVの自動選択には出ないカテゴリ）'}`;
  $('mNote').textContent = p.note;
  $('mTags').innerHTML = p.tags.map((t) => `<span>${t}</span>`).join('');
  $('modal').hidden = false;
  state.modal = { piece: await getPiece(p.slug), canvas: $('mCanvas') };
}
$('close').addEventListener('click', () => { $('modal').hidden = true; state.modal = null; });
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('close').click(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.modal) $('close').click(); });

// One loop for the whole page: the open piece every frame, visible cards in turn.
let rr = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const t = (now - state.t0) / 1000;
  if (state.modal) {
    const { piece, canvas } = state.modal;
    const r = canvas.getBoundingClientRect();
    const w = Math.round(r.width * Math.min(2, devicePixelRatio || 1)), h = Math.round(r.height * Math.min(2, devicePixelRatio || 1));
    const frame = piece.draw(t);
    renderTo(canvas, frame, frame.palette || piece.meta.palette, { width: w, height: h, bg: '#0b0b10', fit: 'contain', margin: 0.03, meta: piece.meta, look: lookOpts() });
    return;
  }
  const vis = [...state.visible].filter((c) => c.piece);
  for (let i = 0; i < Math.min(5, vis.length); i++) paintCard(vis[(rr + i) % vis.length], t);
  rr = (rr + 5) % Math.max(1, vis.length);
}

async function main() {
  state.index = await loadIndex();
  state.cats = await loadCategories();
  $('total').textContent = state.index.length;
  $('look').innerHTML = Object.entries(LOOKS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  buildChips();
  buildGrid();
  $('cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    buildChips();
    buildGrid();
  });
  $('q').addEventListener('input', () => { state.q = $('q').value; buildGrid(); });
  $('mv').addEventListener('change', () => { state.mvOnly = $('mv').checked; buildGrid(); });
  $('look').addEventListener('change', () => {
    state.look = $('look').value;
    for (const c of state.cards) if (c.piece) paintCard(c, (performance.now() - state.t0) / 1000);
  });
  requestAnimationFrame(loop);
}
main();
