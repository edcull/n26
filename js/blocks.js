// Content blocks shared by battle and post-cycle pages: photos, text with roll
// callouts, maps, ledgers.
import { esc, attr, md, cls, join, tip, ruleLabel } from './lib.js';
import { die, diceList } from './dice.js';
import { renderMap, mapCaption } from './map.js';

export const raw = b => b.html;

export function photo(p) {
  return `<figure class="${cls('shot', p.class)}"><img class="${p.imgClass ?? 'whole'}" src="${attr(p.src)}" alt="${attr(p.alt)}">${p.caption != null ? `<figcaption>${md(p.caption)}</figcaption>` : ''}</figure>`;
}

// A test on a roll row: the final number in bold, then the base and modifiers.
//   {name:"To Hit", base:4, mods:[[1,"Aim"]]}           -> To Hit <b>3+</b> (4+ +1 Aim)
//   {name:"Save", base:6, mods:[[-1,"AP"]]}              -> Save <b>none</b> (6+ -1 AP)
//   {name:"Willpower", base:9, mods:[[3,"Psychoteric Choir"]], under:true}  -> Willpower <b>12</b> (9 +3 Psychoteric Choir)
// "under" tests (Leadership, Cool, Willpower, Strength) pass on the stat or less, so bonuses raise the
// number; the rest need the number or more, so bonuses lower it. "who" names the fighter, "note" adds a word.
export function checkLabel(c) {
  const sum = (c.mods || []).reduce((t, [v]) => t + v, 0);
  const show = n => (c.under ? `${n}` : n > 6 && c.name === 'Save' ? 'none' : `${n}+`);
  const total = c.under ? c.base + sum : c.base - sum;
  const detail = [c.mods?.length ? [show(c.base), ...c.mods.map(([v, why]) => `${v > 0 ? '+' : ''}${v} ${why}`)].join(' ') : '', c.note || ''].filter(Boolean).join(', ');
  return `${c.who ? esc(c.who) + ': ' : ''}${esc(c.name)} <b>${show(total)}</b>${detail ? ` (${esc(detail)})` : ''}`;
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
    return `<div class="roll-row"><span>${it.check ? checkLabel(it.check) : md(it.label)}</span><div class="dice">${dice}</div><${tag}${it.resultClass ? ` class="${it.resultClass}"` : ''}>${md(it.result)}</${tag}></div>`;
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
  if (b.map) return `<figure class="map">${renderMap(b.map, ctx)}${b.map.caption != null ? `<figcaption>${mapCaption(b.map.caption)}</figcaption>` : ''}</figure>`;
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

const TICK = l => `<svg class="tick" viewBox="0 0 12 12" role="img" aria-label="${l}"><path d="M1.5 6.5 4.7 9.7 10.5 2.7"/></svg>`;
export function chip(c) {
  return tip(c.tip, c.used ? 'chip used' : 'chip', c.used ? TICK(c.usedLabel) + esc(ruleLabel(c.tip)) : null);
}
export const sheet = b => `<dl class="${cls('sheet', b.class)}">${join(b.sheet, ([k, v]) => `<div><dt>${md(k)}</dt><dd>${md(v)}</dd></div>`)}</dl>`;
export const assets = list => `<dl class="assets">${join(list, a => `<div><dt>${esc(a.label)}</dt><dd>${a.chips ? join(a.chips, chip) : md(a.html)}</dd></div>`)}</dl>`;
