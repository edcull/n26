// Terrain library page: data/pages/terrain.json (title, hero) over data/terrain.json
// Every piece the battle maps are built from, drawn on a 1" grid with its label,
// with the names it has carried on the boards (read from the battle files) and
// a few it could take next (the piece's "ideas").
import { esc, attr, join } from '../lib.js';
import { hero, nav } from '../hero.js';
import { svgEl } from '../map.js';

const INCH = 25;   // map units per inch

// Before rendering: read each battle's placed pieces, to list the names they had.
export async function prepare(d, { campaign, getJSON }) {
  d.pieces = (await getJSON('data/terrain.json')).pieces;
  const ids = Object.keys(campaign.pages).filter(id => campaign.pages[id].template === 'battle');
  d.battles = (await Promise.all(ids.map(id => getJSON(campaign.pages[id].data))))
    .map(b => ({ id: b.id, name: b.name, terrain: (b.terrain || []).filter(p => p && p.piece) }))
    .filter(b => b.terrain.length);
}

function bounds(p) {
  const pts = [];
  for (const [tag, a] of p.els) {
    if (a.points) a.points.trim().split(/\s+/).forEach(s => pts.push(s.split(',').map(Number)));
    else if (tag === 'rect') pts.push([+a.x, +a.y], [+a.x + +a.width, +a.y + +a.height]);
    else if (tag === 'circle') pts.push([+a.cx - +a.r, +a.cy - +a.r], [+a.cx + +a.r, +a.cy + +a.r]);
  }
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function drawing(p) {
  const [x0, y0, x1, y1] = bounds(p), pad = 16;
  const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  const g = [];
  for (let x = vb[0] - (((vb[0] % INCH) + INCH) % INCH); x <= vb[0] + vb[2]; x += INCH) g.push(`M${x.toFixed(1)} ${vb[1].toFixed(1)}V${(vb[1] + vb[3]).toFixed(1)}`);
  for (let y = vb[1] - (((vb[1] % INCH) + INCH) % INCH); y <= vb[1] + vb[3]; y += INCH) g.push(`M${vb[0].toFixed(1)} ${y.toFixed(1)}H${(vb[0] + vb[2]).toFixed(1)}`);
  const lines = p.label ? [].concat(p.label) : [];
  const [lx, ly] = p.labelAt || [0, 0];
  const lab = join(lines, (t, i) => `<text class="m-lab" x="${lx}" y="${ly + i * 17.5}">${esc(t)}</text>`);
  return `<svg viewBox="${vb.map(v => v.toFixed(1)).join(' ')}" role="img" aria-label="${attr(p.name)}" style="width:${(vb[2] * 1.3).toFixed(0)}px">` +
    `<rect class="bed" x="${vb[0].toFixed(1)}" y="${vb[1].toFixed(1)}" width="${vb[2].toFixed(1)}" height="${vb[3].toFixed(1)}"/>` +
    `<path class="m-grid" d="${g.join('')}"/>${join(p.els, svgEl)}<circle class="origin" cx="0" cy="0" r="3.5"/>${lab}</svg>`;
}

const inch = v => `${+(v / INCH).toFixed(1)}"`;

function card(id, p, used, boards) {
  const [x0, y0, x1, y1] = bounds(p);
  const shared = boards.size > 1;
  const names = used.length ? join(used, ([b, n]) => `<li><span class="nm">${n ? esc(n) : '<span class="none">No label</span>'}</span><span class="where">${esc(b.id)} ${esc(b.name)}</span></li>`)
    : '<li class="none">Not named</li>';
  return `<article class="piece${shared ? ' shared' : ''}" id="${attr(id)}">
  <div class="draw">${drawing(p)}</div>
  <div class="info">
    <div class="head"><h3>${esc(p.name)}</h3>${shared ? '<span class="tag">Shared</span>' : ''}</div>
    <p class="meta"><code>${esc(id)}</code>${p.note ? '' : `<span>${inch(x1 - x0)} × ${inch(y1 - y0)}</span>`}</p>
    ${p.note ? `<p class="desc">${esc(p.note)}</p>` : ''}
    <h4>Named on the boards</h4>
    <ul class="used">${names}</ul>
    ${p.ideas?.length ? `<h4>Other names it could take</h4><ul class="ideas">${join(p.ideas, i => `<li>${esc(i)}</li>`)}</ul>` : ''}
  </div>
</article>`;
}

export function render(d) {
  document.title = d.title;
  const lib = d.pieces;
  // names each piece has had, board by board; a board that named it needs no unnamed entry
  const used = {}, onBoards = {};
  for (const b of d.battles || []) for (const pl of b.terrain) {
    const p = lib[pl.piece]; if (!p) continue;
    (onBoards[pl.piece] ??= new Set()).add(b.id);
    let n = pl.label === undefined ? p.label : pl.label;
    n = Array.isArray(n) ? n.join(' ') : n || null;
    const list = used[pl.piece] ??= [];
    if (!list.some(([bb, nn]) => bb === b && nn === n)) list.push([b, n]);
  }
  for (const k in used) used[k] = used[k].filter(([b, n]) => n || !used[k].some(([b2, n2]) => b2 === b && n2));
  const ids = Object.keys(lib);
  const boards = k => onBoards[k] || new Set();
  const groups = [
    ['pieces', 'All pieces', 'Shared pieces are outlined: placed on more than one board, turned to fit.', ids.filter(k => !k.startsWith('v1-'))],
    ['cycle1', 'Cycle 1 pieces', "The first cycle's drawings, kept as they were on the 1.1 and 1.2 maps.", ids.filter(k => k.startsWith('v1-') && boards(k).size <= 1)],
  ].filter(g => g[3].length);
  const key = `<ul class="key" aria-label="Key">
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><rect class="m-solid" x="2" y="2" width="22" height="12"/></svg>Solid terrain</li>
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><rect class="m-top" x="2" y="2" width="22" height="12"/></svg>Raised top</li>
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><rect class="m-plat" x="2" y="2" width="22" height="12"/></svg>Platform</li>
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><path class="m-wall" d="M2 8H24"/></svg>Wall</li>
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><circle class="origin" cx="13" cy="8" r="3.5"/></svg>Origin, where the piece is placed from</li>
    <li><svg viewBox="0 0 26 16" aria-hidden="true"><rect class="key-shared" x="2" y="2" width="22" height="12"/></svg>Shared between boards</li>
  </ul>`;
  const many = groups.length > 1;   // a heading per group only when there is more than one
  return hero(d.hero) + '\n' + nav(many ? groups.map(g => ({ href: '#' + g[0], text: g[1] })) : [], 'Page sections') +
    `\n<main class="wrap tlib">\n${key}\n` +
    join(groups, ([id, t, s, ks]) => `<section id="${id}">
  ${many ? `<div class="sec-head"><h2>${esc(t)}</h2><p>${esc(s)} <span class="count">${ks.length} piece${ks.length === 1 ? '' : 's'}</span></p></div>` : ''}
  <div class="grid">${join(ks, k => card(k, lib[k], used[k] || [], boards(k)))}</div>
</section>\n`) + '</main>\n';
}
