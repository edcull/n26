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
//   {name:"To Wound", base:4, s:3, t:3}                 -> To Wound <b>4+</b> (S3-T3)
// "under" tests (Leadership, Cool, Willpower, Strength) pass on the stat or less, so bonuses raise the
// number; the rest need the number or more, so bonuses lower it. "who" names the fighter, "note" adds a word.
export function checkLabel(c) {
  const sum = (c.mods || []).reduce((t, [v]) => t + v, 0);
  const show = n => (c.under ? `${n}` : n > 6 && c.name === 'Save' ? 'none' : `${n}+`);
  const total = c.under ? c.base + sum : c.base - sum;
  const detail = [c.s != null ? `S${c.s}-T${c.t}` : '', c.mods?.length ? [show(c.base), ...c.mods.map(([v, why]) => `${v > 0 ? '+' : ''}${v} ${why}`)].join(' ') : '', c.note || ''].filter(Boolean).join(', ');
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
// Fighter names in an attack title open the same pop-up card as names in the narrative.
function fighterLink(fighters, id) {
  const f = fighters?.[id];
  return `<button type="button" class="fname" popovertarget="fc-${id}">${esc(f ? f.name : id)}</button>`;
}
export function weaponNumbers(f, key) {
  const rows = weaponRows(f, key);
  const w = rows[0] || {};
  const dmg = +((plain(w.traits).match(/Damage \((\d+)\)/) || [])[1] || 1);
  const leth = +(plain(w.profile?.[4]).match(/^\d+$/) ? plain(w.profile[4]) : 1);
  return { dmg, leth };
}
function weaponBits(f, k) {
  const { dmg, leth } = weaponNumbers(f, k);
  return [dmg > 1 ? `Damage (${dmg})` : '', leth > 1 ? `Lethality (${leth})` : ''].filter(Boolean).join(', ');
}
// Which of the callout's weapons a section heading (h6) is about, e.g. "Autopistol (secondary)" -> "Autopistol".
const ACTION_WORDS = /^(Overwatch|Reaction|Counter-attack|Charge|Coup de Grâce):\s*|\s*\(secondary\)$/g;
function sectionWeapon(r, h6) {
  const t = plain(h6).replace(ACTION_WORDS, '').toLowerCase();
  return (r.weapons || []).find(k => weaponLabel(k).toLowerCase() === t || wkey(k).split('/').includes(t));
}
function rollTitle(r, fighters) {
  if (!r.by) return md(r.name);
  const f = fighters?.[r.by];
  const targets = r.target == null ? [] : [].concat(r.target);
  return `${fighterLink(fighters, r.by)} - ${r.action ? esc(r.action) + ': ' : ''}${r.weapons.map(k => esc(weaponLabel(k))).join(' and ')}` +
    (targets.length ? ` → ${targets.map(t => fighterLink(fighters, t)).join(' and ')}` : '');
}

export function roll(r, ctx = {}) {
  let n = r.n;
  if (n === undefined) n = Math.max(0, ...r.rows.filter(x => x.dice != null).map(x => (typeof x.dice === 'string' ? diceList(x.dice) : x.dice).length));
  const face = r.face ? `<span class="r-face ${r.side} face-${r.face}" aria-hidden="true"></span>` : '';
  // With several weapons each section (h6) ends with its own weapon's Damage/Lethality note;
  // with one weapon the note goes at the bottom.
  const f = ctx.fighters?.[r.by];
  const perSection = r.by && r.weapons.length > 1 && r.rows.some(it => it.h6 != null && sectionWeapon(r, it.h6));
  // Notes that end a weapon section (or the callout) are merged with that weapon's
  // Damage/Lethality into one "Note: …" line.
  let current = null, body = '', notes = [];
  const sentence = t => (/[.!?]$/.test(t) ? t : t + '.');
  const flushNotes = () => { body += join(notes, n => `<p class="roll-note">${md(n)}</p>`); notes = []; };
  const close = weapons => {
    const merged = notes.filter(n => /^Note: /.test(n)).map(n => sentence(n.slice(6)));
    const other = notes.filter(n => !/^Note: /.test(n));
    const bits = weapons.map(k => weaponBits(f, k)).filter(Boolean).map(sentence);
    notes = other; flushNotes();
    if (merged.length || bits.length) body += `<p class="roll-note">Note: ${md([...merged, ...bits].join(' '))}</p>`;
  };
  for (const it of r.rows) {
    if (it.note != null) { notes.push(it.note); continue; }
    if (it.h6 != null) {
      if (perSection) close(current ? [current] : []); else flushNotes();
      current = sectionWeapon(r, it.h6); body += `<h6>${md(it.h6)}</h6>`; continue;
    }
    flushNotes();
    if (it.html != null) { body += it.html; continue; }
    const dice = typeof it.dice === 'string' ? join(diceList(it.dice), die) : join(it.dice, d => (typeof d === 'string' ? die(d) : d.html));
    const tag = it.resultTag ?? 'strong';
    body += `<div class="roll-row"><span>${it.check ? checkLabel(it.check) : md(it.label)}</span><div class="dice">${dice}</div><${tag}${it.resultClass ? ` class="${it.resultClass}"` : ''}>${md(it.result).replace(/, /g, ',<br>')}</${tag}></div>`;
  }
  if (!r.by) flushNotes();
  else close(perSection ? (current ? [current] : []) : r.weapons.length > 1 ? r.weapons : r.weapons.slice(0, 1));
  return `<details class="roll"${n !== null ? ` style="--n:${n}"` : ''}><summary>${face}<span class="r-name">${rollTitle(r, ctx.fighters)}</span><span class="r-res ${r.resultClass ?? ''}">${md(r.result)}</span></summary><div class="roll-body">${body}</div></details>`;
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
