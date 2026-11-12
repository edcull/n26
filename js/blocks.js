// Content blocks shared by battle and post-cycle pages: photos, text with roll
// callouts, maps, ledgers.
import { esc, attr, md, cls, join } from './lib.js';
import { die, diceList } from './dice.js';
import { renderMap } from './map.js';

export const raw = b => b.html;

export function photo(p) {
  return `<figure class="${cls('shot', p.class)}"><img class="${p.imgClass ?? 'whole'}" src="${attr(p.src)}" alt="${attr(p.alt)}">${p.caption != null ? `<figcaption>${md(p.caption)}</figcaption>` : ''}</figure>`;
}

export function roll(r) {
  let n = r.n;
  if (n === undefined) n = Math.max(0, ...r.rows.filter(x => x.dice != null).map(x => (typeof x.dice === 'string' ? diceList(x.dice) : x.dice).length));
  const face = r.face ? `<span class="r-face ${r.side} face-${r.face}" aria-hidden="true"></span>` : '';
  const body = join(r.rows, it => {
    if (it.html != null) return it.html;
    if (it.note != null) return `<p class="roll-note">${md(it.note)}</p>`;
    if (it.h6 != null) return `<h6>${md(it.h6)}</h6>`;
    const dice = typeof it.dice === 'string' ? join(diceList(it.dice), die) : join(it.dice, d => (typeof d === 'string' ? die(d) : d.html));
    const tag = it.resultTag ?? 'strong';
    return `<div class="roll-row"><span>${md(it.label)}</span><div class="dice">${dice}</div><${tag}${it.resultClass ? ` class="${it.resultClass}"` : ''}>${md(it.result)}</${tag}></div>`;
  });
  return `<details class="roll"${n !== null ? ` style="--n:${n}"` : ''}><summary>${face}<span class="r-name">${md(r.name)}</span><span class="r-res ${r.resultClass ?? ''}">${md(r.result)}</span></summary><div class="roll-body">${body}</div></details>`;
}

export function textItems(items) {
  return join(items, it => {
    if (typeof it === 'string') return `<p>${md(it)}</p>`;
    if (it.roll) return roll(it.roll);
    if (it.p != null) return `<p class="${it.class}">${md(it.p)}</p>`;
    return it.html;
  });
}

export function table(t) {
  const th = join(t.head, c => `<th${c.class ? ` class="${c.class}"` : ''}>${md(c.html)}</th>`);
  const rows = join(t.rows, r => `<tr${r.class ? ` class="${r.class}"` : ''}>${join(r.cells, c => `<td${c.class ? ` class="${c.class}"` : ''}>${md(c.html)}</td>`)}</tr>`);
  return `<table class="${t.class}"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}
export const scrollTable = t => `<div class="table-scroll" tabindex="0" role="region" aria-label="${attr(t.label)}">${table(t)}</div>`;

export function block(b, ctx = {}) {
  if (b.html != null) return b.html;
  if (b.split) return `<div class="${cls('round-split', b.split)}"><div class="round-text">${textItems(b.text)}</div>${b.ports ? `<div class="ports">${join(b.ports, photo)}</div>` : ''}</div>`;
  if (b.text) return `<div class="round-text">${textItems(b.text)}</div>`;
  if (b.ends) return `<div class="${cls('ends', b.class)}">${join(b.ends, photo)}</div>`;
  if (b.photo) return photo(b.photo);
  if (b.map) return `<figure class="map">${renderMap(b.map, ctx)}${b.map.caption != null ? `<figcaption>${md(b.map.caption)}</figcaption>` : ''}</figure>`;
  if (b.vp != null) return `<p class="vp">${md(b.vp)}</p>`;
  if (b.todo != null) return `<p class="todo">${md(b.todo)}</p>`;
  if (b.endsHead != null) return `<h4 class="ends-head">${md(b.endsHead)}</h4>`;
  if (b.roll) return roll(b.roll);
  if (b.result != null) return `<p class="result">${md(b.result)}</p>`;
  if (b.prose) return `<div class="prose">${join(b.prose, p => `<p>${md(p)}</p>`)}</div>`;
  if (b.table) return scrollTable(b.table);
  if (b.h3 != null) return `<h3${b.class ? ` class="${b.class}"` : ''}>${md(b.h3)}</h3>`;
  if (b.captures) return `<div class="capt">${join(b.captures, roll)}</div>`;
  if (b.xp) return `<div class="xp-grid">${join(b.xp, g => `<div class="xp-gang"><h4 class="${g.class}">${md(g.title)}</h4>${table(g.table)}</div>`)}</div>`;
  throw new Error('Unknown block ' + JSON.stringify(b).slice(0, 80));
}
export const blocks = (bs, ctx) => join(bs, b => block(b, ctx) + '\n');
