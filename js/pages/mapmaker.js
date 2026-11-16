// Map creator: data/pages/mapmaker.json
// Lay out a 2' x 2' table from the terrain library: add pieces, drag them into place, turn them,
// label and stack them, then export the placements as a battle's "terrain" list.
// Work in progress is kept in this browser (localStorage) so a reload doesn't lose it.
import { esc, attr, join, pageHref } from '../lib.js';
import { hero, nav } from '../hero.js';
import { svgEl, pieceSvg, labelsSvg } from '../map.js';

const SIZE = 600, INCH = 25, KEY = 'n26-mapmaker';
const r2 = v => Math.round(v * 100) / 100;

export async function prepare(d, { campaign, getJSON }) {
  d.pieces = (await getJSON('data/terrain.json')).pieces;
  const ids = Object.keys(campaign.pages).filter(id => campaign.pages[id].template === 'battle');
  d.boards = (await Promise.all(ids.map(id => getJSON(campaign.pages[id].data))))
    .map(b => ({ id: b.id, name: b.name, terrain: (b.terrain || []).filter(p => Array.isArray(p) || (p && p.piece)) }));
}

export function render(d) {
  document.title = d.title;
  const opts = join(Object.entries(d.pieces), ([k, p]) => `<option value="${attr(k)}">${esc(p.name)}</option>`);
  const boards = join(d.boards, b => `<option value="${attr(b.id)}">${esc(b.id)} ${esc(b.name)}${b.terrain.some(p => p.piece) ? '' : ' (empty)'}</option>`);
  return hero(d.hero) + '\n' + nav([{ href: pageHref('terrain'), text: 'Terrain library' }], 'Related pages') + `
<main class="wrap mm">
  <div class="mm-tools">
    <section class="mm-box" aria-labelledby="mm-add">
      <h2 id="mm-add">Add a piece</h2>
      <div class="mm-row"><select id="mm-piece" aria-label="Terrain piece">${opts}</select><button type="button" id="mm-addbtn">Add</button></div>
      <p class="mm-hint">New pieces go in the middle of the table. Drag to move; select one to turn, label or stack it. Loose wall lines loaded from a battle are kept but can't be moved here.</p>
    </section>
    <section class="mm-box" aria-labelledby="mm-sel-h">
      <h2 id="mm-sel-h">Selected piece</h2>
      <div id="mm-sel"><p class="mm-hint">Nothing selected. Click a piece on the table.</p></div>
    </section>
    <section class="mm-box" aria-labelledby="mm-table">
      <h2 id="mm-table">Table</h2>
      <label class="mm-field">Deployment
        <select id="mm-deploy"><option value="none">None</option><option value="faceoff">Face Off (3" strips, top and bottom)</option><option value="sniping">Sniping Range (edges)</option><option value="corners">Corners (6")</option><option value="quarters">Table quarters</option></select></label>
      <label class="mm-check"><input type="checkbox" id="mm-centre"> Centre objective</label>
      <label class="mm-check"><input type="checkbox" id="mm-snap" checked> Snap to ¼"</label>
      <div class="mm-row"><select id="mm-board" aria-label="Start from a battle's table"><option value="">Start from a battle's table…</option>${boards}</select></div>
      <div class="mm-row"><button type="button" id="mm-clear">Clear table</button></div>
    </section>
    <section class="mm-box" aria-labelledby="mm-exp">
      <h2 id="mm-exp">Export</h2>
      <p class="mm-hint">The placements as a battle's <code>terrain</code> list. Paste one in here to load it.</p>
      <textarea id="mm-json" rows="8" spellcheck="false" aria-label="Terrain JSON"></textarea>
      <div class="mm-row"><button type="button" id="mm-copy">Copy</button><button type="button" id="mm-dl">Download</button><button type="button" id="mm-load">Load pasted</button></div>
      <p class="mm-msg" id="mm-msg" role="status"></p>
    </section>
  </div>
  <figure class="map mm-map"><div id="mm-svg"></div>
    <figcaption>Arrow keys nudge the selected piece ¼" (hold Shift to move it a single step). Q and E turn it 15°, R turns it 90°, Delete removes it.</figcaption></figure>
</main>
`;
}

export function mount(d) {
  const lib = d.pieces, $ = id => document.getElementById(id);
  let state = { terrain: [], deploy: 'none', centre: false };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.terrain)) state = { ...state, ...s }; } catch (e) { /* no saved table */ }
  const usable = p => Array.isArray(p) || (p && lib[p.piece] && Array.isArray(p.at));   // a library piece, or a loose SVG element (a wall line)
  state.terrain = state.terrain.filter(usable);
  let sel = -1, drag = null;
  const snap = v => ($('mm-snap').checked ? Math.round(v / 6.25) * 6.25 : r2(v));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } };
  const msg = t => { $('mm-msg').textContent = t; };

  function deployEls() {
    const P = 'svg-p', T = 'svg-t';
    switch (state.deploy) {
      case 'faceoff': return [['rect', { class: T, x: 0, y: 0, width: 600, height: 75 }], ['rect', { class: P, x: 0, y: 525, width: 600, height: 75 }]];
      case 'sniping': return [['rect', { class: T, x: 0, y: 0, width: 600, height: 12 }], ['rect', { class: P, x: 0, y: 588, width: 600, height: 12 }]];
      case 'corners': return [['path', { class: P, d: 'M0 0H150A150 150 0 0 1 0 150Z' }], ['path', { class: T, d: 'M600 0V150A150 150 0 0 1 450 0Z' }], ['path', { class: P, d: 'M600 600H450A150 150 0 0 1 600 450Z' }], ['path', { class: T, d: 'M0 600V450A150 150 0 0 1 150 600Z' }]];
      case 'quarters': return [['rect', { class: P, x: 0, y: 0, width: 300, height: 300 }], ['rect', { class: T, x: 300, y: 300, width: 300, height: 300 }]];
      default: return [];
    }
  }

  function draw() {
    const ticks = join([0, 150, 300, 450, 600], x => svgEl(['text', { class: 'm-tick', x, y: 618 }, `${x / INCH}"`]));
    const pieces = join(state.terrain, (p, i) => Array.isArray(p) ? `<g class="mm-loose">${pieceSvg(p, lib)}</g>`
      : `<g class="mm-p${i === sel ? ' sel' : ''}" data-i="${i}">${pieceSvg(p, lib)}</g>`);
    $('mm-svg').innerHTML = `<svg viewBox="-14 -14 628 644" role="img" aria-label="Map being built: ${state.terrain.length} terrain pieces">` +
      svgEl(['rect', { class: 'm-mat', x: 0, y: 0, width: 600, height: 600 }]) + join(deployEls(), svgEl) +
      svgEl(['path', { class: 'm-grid', d: 'M150 0V600M0 150H600M300 0V600M0 300H600M450 0V600M0 450H600' }]) +
      pieces + (state.centre ? svgEl(['circle', { class: 'm-centre', cx: 300, cy: 300, r: 10 }]) : '') +
      `<g class="mm-labels">${labelsSvg(state.terrain, lib, [])}</g>` + ticks + '</svg>';
    $('mm-json').value = JSON.stringify(state.terrain, null, 1);
    panel(); save();
  }

  function panel() {
    const p = state.terrain[sel];
    if (!p) { $('mm-sel').innerHTML = '<p class="mm-hint">Nothing selected. Click a piece on the table.</p>'; return; }
    const lab = p.label === false ? '' : Array.isArray(p.label) ? p.label.join(' / ') : p.label ?? '';
    $('mm-sel').innerHTML = `<p class="mm-name">${esc(lib[p.piece].name)}</p>
      <div class="mm-grid2">
        <label class="mm-field">Across (")<input type="number" step="0.25" id="mm-x" value="${r2(p.at[0] / INCH)}"></label>
        <label class="mm-field">Down (")<input type="number" step="0.25" id="mm-y" value="${r2(p.at[1] / INCH)}"></label>
        <label class="mm-field">Turn (°)<input type="number" step="1" id="mm-t" value="${p.turn || 0}"></label>
      </div>
      <div class="mm-row"><button type="button" data-turn="-90">−90°</button><button type="button" data-turn="-15">−15°</button><button type="button" data-turn="15">+15°</button><button type="button" data-turn="90">+90°</button></div>
      <label class="mm-field">Label <input type="text" id="mm-lab" value="${attr(lab)}" placeholder="${attr([].concat(lib[p.piece].label || []).join(' / ') || 'No label')}"></label>
      <label class="mm-check"><input type="checkbox" id="mm-nolab"${p.label === false ? ' checked' : ''}> No label</label>
      <label class="mm-check"><input type="checkbox" id="mm-stack"${p.stacked ? ' checked' : ''}> Stacked on another piece (drawn lighter)</label>
      <div class="mm-row"><button type="button" id="mm-up">Bring forward</button><button type="button" id="mm-down">Send back</button></div>
      <div class="mm-row"><button type="button" id="mm-dup">Duplicate</button><button type="button" id="mm-del" class="danger">Delete</button></div>`;
    const num = (id, f) => $(id).addEventListener('change', e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { f(v); tidy(p); draw(); } });
    num('mm-x', v => { p.at[0] = r2(v * INCH); });
    num('mm-y', v => { p.at[1] = r2(v * INCH); });
    num('mm-t', v => { p.turn = v; });
    $('mm-sel').querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => turn(+b.dataset.turn)));
    $('mm-lab').addEventListener('change', e => {
      const v = e.target.value.trim();
      if (!v) delete p.label; else p.label = v.includes(' / ') ? v.split(' / ') : v;
      draw();
    });
    $('mm-nolab').addEventListener('change', e => { if (e.target.checked) p.label = false; else delete p.label; draw(); });
    $('mm-stack').addEventListener('change', e => { if (e.target.checked) p.stacked = true; else delete p.stacked; draw(); });
    $('mm-up').addEventListener('click', () => move(1));
    $('mm-down').addEventListener('click', () => move(-1));
    $('mm-dup').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(p)); c.at = [p.at[0] + INCH, p.at[1] + INCH]; delete c.labelAt; state.terrain.push(c); sel = state.terrain.length - 1; draw(); });
    $('mm-del').addEventListener('click', remove);
  }

  // a placed piece keeps a turn between -180 and 180, and no stale label position once it has moved
  function tidy(p) {
    if (p.turn) { p.turn = ((((p.turn + 180) % 360) + 360) % 360) - 180; if (p.turn === -180) p.turn = 180; }
    if (!p.turn) delete p.turn;
  }
  function turn(by) { const p = state.terrain[sel]; if (!p) return; p.turn = (p.turn || 0) + by; delete p.labelAt; tidy(p); draw(); }
  function move(by) {
    const j = sel + by; if (sel < 0 || j < 0 || j >= state.terrain.length) return;
    [state.terrain[sel], state.terrain[j]] = [state.terrain[j], state.terrain[sel]]; sel = j; draw();
  }
  function remove() { if (sel < 0) return; state.terrain.splice(sel, 1); sel = -1; draw(); }

  const pt = e => { const svg = $('mm-svg').querySelector('svg'), m = svg.getScreenCTM().inverse(), q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; return q.matrixTransform(m); };
  $('mm-svg').addEventListener('pointerdown', e => {
    const g = e.target.closest('.mm-p');
    if (!g) { sel = -1; draw(); return; }
    sel = +g.dataset.i; const p = state.terrain[sel], q = pt(e);
    drag = { dx: q.x - p.at[0], dy: q.y - p.at[1], moved: false };
    draw();
    $('mm-svg').setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  $('mm-svg').addEventListener('pointermove', e => {
    if (!drag || sel < 0) return;
    const p = state.terrain[sel], q = pt(e);
    p.at = [snap(Math.min(SIZE, Math.max(0, q.x - drag.dx))), snap(Math.min(SIZE, Math.max(0, q.y - drag.dy)))];
    delete p.labelAt; drag.moved = true;
    const g = $('mm-svg').querySelector(`.mm-p[data-i="${sel}"] > g`);
    if (g) g.setAttribute('transform', `translate(${p.at[0]} ${p.at[1]})${p.turn ? ` rotate(${p.turn})` : ''}`);
  });
  const end = () => { if (drag?.moved) draw(); drag = null; };
  $('mm-svg').addEventListener('pointerup', end);
  $('mm-svg').addEventListener('pointercancel', end);

  document.addEventListener('keydown', e => {
    if (sel < 0 || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const p = state.terrain[sel], step = e.shiftKey ? 1 : 6.25;   // Shift: one map unit (1/25"), for fine placing
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { p.at = [r2(p.at[0] + mv[0]), r2(p.at[1] + mv[1])]; delete p.labelAt; draw(); e.preventDefault(); return; }
    if (e.key === 'q' || e.key === 'Q') turn(-15);
    else if (e.key === 'e' || e.key === 'E') turn(15);
    else if (e.key === 'r' || e.key === 'R') turn(90);
    else if (e.key === 'Delete' || e.key === 'Backspace') { remove(); e.preventDefault(); }
  });

  $('mm-addbtn').addEventListener('click', () => { state.terrain.push({ piece: $('mm-piece').value, at: [300, 300] }); sel = state.terrain.length - 1; draw(); });
  $('mm-deploy').value = state.deploy; $('mm-centre').checked = state.centre;
  $('mm-deploy').addEventListener('change', e => { state.deploy = e.target.value; draw(); });
  $('mm-centre').addEventListener('change', e => { state.centre = e.target.checked; draw(); });
  $('mm-board').addEventListener('change', e => {
    const b = d.boards.find(x => x.id === e.target.value); e.target.value = '';
    if (!b) return;
    if (state.terrain.length && !confirm(`Replace the table with ${b.id} ${b.name}?`)) return;
    state.terrain = JSON.parse(JSON.stringify(b.terrain)); sel = -1; draw(); msg(`Loaded ${b.id} ${b.name}.`);
  });
  $('mm-clear').addEventListener('click', () => { if (state.terrain.length && confirm('Remove every piece from the table?')) { state.terrain = []; sel = -1; draw(); } });
  $('mm-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('mm-json').value); msg('Copied.'); } catch (e) { $('mm-json').select(); msg('Selected: copy it with Ctrl+C.'); }
  });
  $('mm-dl').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('mm-json').value + '\n'], { type: 'application/json' }));
    a.download = 'terrain.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('mm-load').addEventListener('click', () => {
    try {
      const t = JSON.parse($('mm-json').value), list = Array.isArray(t) ? t : t.terrain;
      if (!Array.isArray(list)) throw new Error('not a list');
      const ok = list.filter(usable);
      state.terrain = ok; sel = -1; draw();
      msg(`Loaded ${ok.length} piece${ok.length === 1 ? '' : 's'}${ok.length < list.length ? ` (${list.length - ok.length} skipped)` : ''}.`);
    } catch (e) { msg('That isn\'t a terrain list.'); }
  });
  draw();
}
