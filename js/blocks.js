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

// ---- attack callouts: shooter, weapon and target with tooltips, damage notes
const plain = s => String(s ?? '').replace(/\{tip[^:]*:([^}]*)\}/g, '$1').replace(/\{@[\w-]+\|([^}]*)\}/g, '$1').replace(/\{[pt]:([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const UNARMED = { name: 'Unarmed', profile: ['E', '-', 'S', '-', '1'], traits: 'Melee' };
const wkey = s => plain(s).toLowerCase().replace(/\*$/, '').trim();
export const weaponLabel = name => plain(name).replace(/\*$/, '').replace(/^(Cawdor|Delaque) /, '').replace(/(^|[\s])(\w)/g, (m, a, b) => a + b.toUpperCase());

function weaponRows(f, key) {
  if (key === 'Unarmed') return [UNARMED];
  const ws = f?.weapons || [];
  const i = ws.findIndex(w => wkey(w.name) === wkey(key));
  if (i < 0) return [];
  if (ws[i].profile) return [ws[i]];
  const subs = [];   // combi-weapon heading: its profiles are the rows that follow
  for (let j = i + 1; j < ws.length && ws[j].profile && /\bsub\b/.test(ws[j].class || ''); j++) subs.push(ws[j]);
  return subs;
}
const profileText = w => `SR ${plain(w.profile[0])} · LR ${plain(w.profile[1])} · Str ${plain(w.profile[2])} · AP ${plain(w.profile[3])} · L ${plain(w.profile[4])}${w.traits ? ' · ' + plain(w.traits) : ''}`;
function weaponTip(f, key) {
  const rows = weaponRows(f, key);
  const text = rows.length > 1 ? rows.map(w => `${weaponLabel(w.name)}: ${profileText(w)}`).join(' / ') : rows[0] ? profileText(rows[0]) : '';
  return `<span class="sk" tabindex="0" data-tip="${attr(text)}">${esc(weaponLabel(key))}</span>`;
}
const STATS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Sv'];
function fighterTip(fighters, id) {
  const f = fighters?.[id];
  if (!f) return esc(id);
  const text = `${plain(f.type)}: ${STATS.map(k => `${k} ${plain(f.stats[k])}`).join(' · ')}`;
  return `<span class="sk" tabindex="0" data-tip="${attr(text)}">${esc(f.name)}</span>`;
}
export function weaponNumbers(f, key) {
  const rows = weaponRows(f, key);
  const w = rows[0] || {};
  const dmg = +((plain(w.traits).match(/Damage \((\d+)\)/) || [])[1] || 1);
  const leth = +(plain(w.profile?.[4]).match(/^\d+$/) ? plain(w.profile[4]) : 1);
  return { dmg, leth };
}
function damageNote(r, fighters) {
  const f = fighters?.[r.by];
  const parts = (r.weapons || []).map(k => {
    const { dmg, leth } = weaponNumbers(f, k);
    const bits = [dmg > 1 ? `Damage (${dmg})` : '', leth > 1 ? `Lethality (${leth})` : ''].filter(Boolean).join(', ');
    return bits && (r.weapons.length > 1 ? `${weaponLabel(k)}: ${bits}` : bits);
  }).filter(Boolean);
  return parts.length ? `<p class="roll-note">Note: ${parts.join('; ')}</p>` : '';
}
function rollTitle(r, fighters) {
  if (!r.by) return md(r.name);
  const f = fighters?.[r.by];
  const targets = r.target == null ? [] : [].concat(r.target);
  return `${fighterTip(fighters, r.by)} - ${r.action ? esc(r.action) + ': ' : ''}${r.weapons.map(k => weaponTip(f, k)).join(' and ')}` +
    (targets.length ? ` → ${targets.map(t => fighterTip(fighters, t)).join(' and ')}` : '');
}

export function roll(r, ctx = {}) {
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
  return `<details class="roll"${n !== null ? ` style="--n:${n}"` : ''}><summary>${face}<span class="r-name">${rollTitle(r, ctx.fighters)}</span><span class="r-res ${r.resultClass ?? ''}">${md(r.result)}</span></summary><div class="roll-body">${body}${r.by ? damageNote(r, ctx.fighters) : ''}</div></details>`;
}

export function textItems(items, ctx = {}) {
  return join(items, it => {
    if (typeof it === 'string') return `<p>${md(it)}</p>`;
    if (it.roll) return roll(it.roll, ctx);
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
  if (b.split) return `<div class="${cls('round-split', b.split)}"><div class="round-text">${textItems(b.text, ctx)}</div>${b.ports ? `<div class="ports">${join(b.ports, photo)}</div>` : ''}</div>`;
  if (b.text) return `<div class="round-text">${textItems(b.text, ctx)}</div>`;
  if (b.ends) return `<div class="${cls('ends', b.class)}">${join(b.ends, photo)}</div>`;
  if (b.photo) return photo(b.photo);
  if (b.map) return `<figure class="map">${renderMap(b.map, ctx)}${b.map.caption != null ? `<figcaption>${mapCaption(b.map.caption)}</figcaption>` : ''}</figure>`;
  if (b.vp != null) return `<p class="vp">${md(b.vp)}</p>`;
  if (b.todo != null) return `<p class="todo">${md(b.todo)}</p>`;
  if (b.endsHead != null) return `<h4 class="ends-head">${md(b.endsHead)}</h4>`;
  if (b.roll) return roll(b.roll, ctx);
  if (b.result != null) return `<p class="result">${md(b.result)}</p>`;
  if (b.prose) return `<div class="prose">${join(b.prose, p => `<p>${md(p)}</p>`)}</div>`;
  if (b.table) return scrollTable(b.table);
  if (b.h3 != null) return `<h3${b.class ? ` class="${b.class}"` : ''}>${md(b.h3)}</h3>`;
  if (b.captures) return `<div class="capt">${join(b.captures, r => roll(r, ctx))}</div>`;
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
