// Battle maps, built from data:
//   battle.board  - named runs of SVG elements shared by every map of the battle (terrain, labels, ticks)
//   map.items     - in drawing order: {board:name} | {clip:[...]} | {tok} fighter token | {b} status badge
//                   | {ooa:[x,y]} Out of Action skull | {el:[tag, attrs, text|children]} any other SVG element
//   map.caption   - {text, key:[[badgeKind, letter, label], ...]} or plain markup
// Terrain is built from placed pieces (data/terrain.json):
//   battle.terrain - in drawing order: [tag, attrs, body] loose SVG (walls, ladders, planks…)
//                    | {piece, at:[x,y], turn?, label?, labelAt?} a library piece, turned (degrees) about its origin
//   a board run draws them with {pieces:true}, and their labels with {labels:true}.
//   label: text, a list of lines, or false; labelAt: [x,y] where it sits instead of the piece's own label spot.
//   On each map a label that a token would cover steps to the nearest clear spot nearby.
import { esc, attr, md, join } from './lib.js';

const n = v => String(v);

export function svgEl(e) {
  const [tag, attrs = {}, body] = e;
  const a = join(Object.entries(attrs), ([k, v]) => ` ${k}="${attr(v)}"`);
  const inner = Array.isArray(body) ? join(body, svgEl) : body != null ? esc(body) : '';
  return `<${tag}${a}>${inner}</${tag}>`;
}

const fmt = v => String(+(+v).toFixed(2));
// Where a placed piece's label sits: labelAt, or the piece's label spot turned with the piece.
function labelSpot(p, piece) {
  if (p.labelAt) return p.labelAt;
  const [dx, dy] = piece.labelAt || [0, 0], a = (p.turn || 0) * Math.PI / 180;
  return [p.at[0] + dx * Math.cos(a) - dy * Math.sin(a), p.at[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}
function pieceSvg(p, lib) {
  if (Array.isArray(p)) return svgEl(p);
  const piece = lib[p.piece];
  if (!piece) throw new Error('Unknown terrain piece ' + p.piece);
  const t = `translate(${fmt(p.at[0])} ${fmt(p.at[1])})${p.turn ? ` rotate(${fmt(p.turn)})` : ''}`;
  return svgEl(['g', { class: 'piece', transform: t }, piece.els]);
}
// Labels: one text line per entry, 17.5 apart. Tokens and badges on this map push a label aside.
const LINE = 17.5;
function labelsSvg(terrain, lib, marks) {
  const boxes = [];
  return join(terrain.filter(p => !Array.isArray(p)), p => {
    const piece = lib[p.piece] || {};
    const text = p.label === undefined ? piece.label : p.label;
    if (!text) return '';
    const lines = [].concat(text);
    const [x, y] = labelSpot(p, piece);
    const w = Math.max(...lines.map(l => l.length)) * 7.6 + 6, h = LINE * (lines.length - 1) + 15;
    const box = (dx, dy) => ({ l: x + dx - w / 2, r: x + dx + w / 2, t: y + dy - 12, b: y + dy - 12 + h });
    const hits = b => marks.some(m => m.x + m.r > b.l && m.x - m.r < b.r && m.y + m.r > b.t && m.y - m.r < b.b) ||
      boxes.some(o => o.r > b.l && o.l < b.r && o.b > b.t && o.t < b.b);
    let d = [0, 0];
    if (hits(box(0, 0))) {
      const tries = [];
      for (const s of [1, 2, 3, 4]) for (const [ux, uy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) tries.push([ux * s * 22, uy * s * 14]);
      d = tries.find(([dx, dy]) => { const b = box(dx, dy); return b.l > 0 && b.r < 600 && b.t > 0 && b.b < 600 && !hits(b); }) || [0, 0];
    }
    boxes.push(box(...d));
    return join(lines, (l, i) => svgEl(['text', { class: 'm-lab', x: fmt(x + d[0]), y: fmt(y + d[1] + i * LINE) }, l]));
  });
}

function item(it, board) {
  if (it.board) return join(board[it.board], e => e.pieces ? join(item.terrain || [], p => pieceSvg(p, item.lib))
    : e.labels ? labelsSvg(item.terrain || [], item.lib, item.marks) : svgEl(e));
  if (it.clip) return `<g clip-path="url(#${item.clipId})">${join(it.clip, x => item(x, board))}</g>`;
  if (it.tok) {
    const t = it.tok;
    return `<circle class="tok-${t.s}" cx="${n(t.x)}" cy="${n(t.y)}" r="${n(t.r ?? 12.5)}"/>` +
      `<text class="${t.tc ?? (t.t.length > 1 ? 'tok-n two' : 'tok-n')}" x="${n(t.x)}" y="${n(t.ty ?? +(t.y + 5.5).toFixed(2))}">${esc(t.t)}</text>`;
  }
  if (it.b) {
    const b = it.b;
    return `<circle class="b-${b.k}" cx="${n(b.x)}" cy="${n(b.y)}" r="8.5"/><text class="b-t" x="${n(b.x)}" y="${n(b.ty ?? +(b.y + 3.8).toFixed(2))}">${esc(b.t)}</text>`;
  }
  if (it.ooa) return `<text class="ooa-e" x="${n(it.ooa[0])}" y="${n(it.ooa[1])}" aria-label="Out of Action">💀</text>`;
  if (it.el) return svgEl(it.el);
  throw new Error('Unknown map item ' + JSON.stringify(it));
}

export function renderMap(m, ctx = {}) {
  if (m.svg) return m.svg;
  const board = ctx.board || {};
  item.clipId = m.clip;
  item.terrain = ctx.terrain; item.lib = ctx.pieces || {};
  // what a label must not sit under: this map's fighter tokens, badges and skulls
  item.marks = [];
  const mark = it => {
    if (it.tok) item.marks.push({ x: +it.tok.x, y: +it.tok.y, r: +(it.tok.r ?? 12.5) + 2 });
    if (it.b) item.marks.push({ x: +it.b.x, y: +it.b.y, r: 10 });
    if (it.ooa) item.marks.push({ x: +it.ooa[0], y: +it.ooa[1] - 6, r: 10 });
    if (it.clip) it.clip.forEach(mark);
  };
  m.items.forEach(mark);
  const defs = m.clip ? `<defs><clipPath id="${m.clip}"><rect x="0" y="0" width="600" height="600"/></clipPath></defs>` : '';
  return `<svg viewBox="${m.viewBox}" role="img" aria-label="${attr(m.label)}">${defs}${join(m.items, it => item(it, board))}</svg>`;
}

export function mapCaption(c) {
  if (typeof c === 'string') return md(c);
  const key = c.key ? `<ul class="b-key">${join(c.key, ([k, letter, label]) =>
    k === 'ooa' ? `<li><span class="ooa-k" aria-hidden="true">${letter}</span>${label}</li>` : `<li><span class="b b-${k}">${esc(letter)}</span>${label}</li>`)}</ul>` : '';
  return (c.text != null ? `<p>${md(c.text)}</p>` : '') + key;
}
