// Battle maps, built from data:
//   battle.board  - named runs of SVG elements shared by every map of the battle (terrain, labels, ticks)
//   map.items     - in drawing order: {board:name} | {clip:[...]} | {tok} fighter token | {b} status badge
//                   | {ooa:[x,y]} Out of Action skull | {el:[tag, attrs, text|children]} any other SVG element
//   map.caption   - {text, key:[[badgeKind, letter, label], ...]} or plain markup
import { esc, attr, md, join } from './lib.js';

const n = v => String(v);

export function svgEl(e) {
  const [tag, attrs = {}, body] = e;
  const a = join(Object.entries(attrs), ([k, v]) => ` ${k}="${attr(v)}"`);
  const inner = Array.isArray(body) ? join(body, svgEl) : body != null ? esc(body) : '';
  return `<${tag}${a}>${inner}</${tag}>`;
}

function item(it, board) {
  if (it.board) return join(board[it.board], svgEl);
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
  const defs = m.clip ? `<defs><clipPath id="${m.clip}"><rect x="0" y="0" width="600" height="600"/></clipPath></defs>` : '';
  return `<svg viewBox="${m.viewBox}" role="img" aria-label="${attr(m.label)}">${defs}${join(m.items, it => item(it, board))}</svg>`;
}

export function mapCaption(c) {
  if (typeof c === 'string') return md(c);
  const key = c.key ? `<ul class="b-key">${join(c.key, ([k, letter, label]) =>
    k === 'ooa' ? `<li><span class="ooa-k" aria-hidden="true">${letter}</span>${label}</li>` : `<li><span class="b b-${k}">${esc(letter)}</span>${label}</li>`)}</ul>` : '';
  return (c.text != null ? `<p>${md(c.text)}</p>` : '') + key;
}
