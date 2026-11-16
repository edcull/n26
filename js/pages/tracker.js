// Campaign tracker: data/pages/tracker.json ("editor": prev post-cycle, roster point, cycle).
// One page to keep a cycle as it is played:
//   1. Battles: challenger, stake, result, and for each gang lasting injuries, XP, Reputation change,
//      win/loss income, side job income and any other income.
//   2. Post-cycle phase: each fighter's action, income (fed by the battles), territories taken as income
//      or boon, XP advancements, recruits (with a cropped portrait), purchases and sales; the gang sheet
//      updates as you type.
//   3. Gang lists: every fighter card with this cycle's XP, injuries and advancements, plus new recruits.
// Work is kept in this browser (localStorage). Export gives the post-cycle data in the shape the
// post-cycle pages read (data/post/<cycle>.json), the battles, and the tracker's own state to load back.
import { esc, attr, join, rule } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fightersAt } from '../roster.js';
import { fighterCard } from '../fighter.js';

const ACTIONS = ['To come', 'Work Territory', 'Train (+2 XP)', 'Recovery', 'Critical Injury', 'Captured', 'Medical Escort', 'Fit Bionics', 'Develop Tactics', 'Rest', 'Other'];
const STATS = ['Movement', 'Weapon Skill', 'Ballistic Skill', 'Strength', 'Toughness', 'Wounds', 'Initiative', 'Attacks', 'Leadership', 'Cool', 'Willpower', 'Intelligence'];
const KINDS = [['', 'Choose…'], ...STATS.map(s => ['stat:' + s, '+1 ' + s]), ['primary', 'Primary skill'], ['secondary', 'Secondary skill'], ['power', 'Psychoteric power'], ['other', 'Other']];
const SOURCES = ['Gang list', 'Trading post', 'Black market', 'Doc', 'Fit Bionics', 'Pets', 'Territory boon', 'Other'];
const n = v => { const x = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(x) ? 0 : x; };
const plus = v => (v > 0 ? '+' + v : String(v));
const incomeOf = name => n((String(rule(name) || '').match(/Income: (\d+)/) || [])[1]);
const boonOf = name => ((String(rule(name) || '').match(/(?:Recruit|Equipment|Reputation): ([^.]+(?:\.[^.]*?)?)\. Battlefield/) || [])[1] || '').trim();

export async function prepare(d, { campaign, getJSON }) {
  const ed = d.editor;
  d.prev = await getJSON(`data/post/${ed.prev}.json`);
  const gangs = await Promise.all(campaign.gangs.map(g => getJSON(`data/gangs/${g}.json`)));
  d.gangInfo = Object.fromEntries(gangs.map(g => [g.id, g]));
  d.bySide = Object.fromEntries(gangs.map(g => [g.side, g.id]));
  d.cards = fightersAt(campaign, gangs, ed.at);
  // every territory the rules know, for the stake list
  const rules = await getJSON('data/rules.json');
  d.territories = Object.keys(rules).filter(k => /\(.+\)$/.test(k) && /Boons: Income/.test(rules[k]));
  // the cycle's scheduled battles start the list
  const ids = Object.keys(campaign.pages).filter(id => id.startsWith(ed.at.split('.')[0] + '.') && campaign.pages[id].template === 'battle');
  d.scheduled = await Promise.all(ids.map(id => getJSON(campaign.pages[id].data)));
}

const blankSide = () => ({ injuries: [], xp: [], rep: 0, winIncome: 0, sideIncome: 0, other: [] });

function fresh(d) {
  const facts = b => Object.fromEntries((b.setup?.facts || []).map(([k, v]) => [k.toLowerCase(), v]));
  const st = { battles: d.scheduled.map(b => { const f = facts(b); return {
    name: b.name, page: b.id, challenger: /Psalm/.test(f.challenger || '') ? 'p' : 't',
    stake: String(f['at stake'] || '').replace(/ territory$/, ''), winner: '', p: blankSide(), t: blankSide() }; }), gangs: {} };
  for (const e of d.prev.gangs) {
    const sheet = Object.fromEntries(e.roster.sheet);
    const terr = (e.roster.assets.find(a => a.label === 'Territories')?.chips || []).map(c => c.tip);
    st.gangs[e.gang] = {
      story: '', carried: n(sheet.Credits), rep: n(sheet.Reputation), wins: n(sheet.Wins),
      startRating: n(sheet.Rating), startFighters: n(sheet.Fighters), ratingAdj: 0,
      territories: terr.map(name => ({ name, mode: 'income', income: incomeOf(name), boon: boonOf(name) })),
      fighters: [...e.roster.fighters],
      actions: Object.fromEntries(e.roster.fighters.map(id => [id, { action: 'To come', injuries: '' }])),
      adv: [], recruits: [], purchases: [], sales: [] };
  }
  return st;
}

export function render(d) {
  document.title = d.title;
  const items = [{ href: '#tr-battles', text: 'Battles' }, { href: '#tr-post', text: 'Post-cycle' }, { href: '#tr-gangs', text: 'Gang lists' }, { href: '#tr-export', text: 'Export' }];
  return hero(d.hero) + '\n' + nav(items, 'Page sections') +
    `\n<main class="wrap pe" id="pe"><p class="pe-note">Record each battle as it is played, then the post-cycle phase. Totals, the gang sheets and the gang lists update as you go. Your work is saved in this browser only; use Export to send it on.</p><div id="pe-body"></div></main>
<dialog class="pe-crop" id="pe-crop" aria-labelledby="pe-crop-h"><h2 id="pe-crop-h">Crop portrait</h2>
  <p class="pe-hint">Drag the photo to centre the fighter's head and shoulders; zoom with the slider or the mouse wheel.</p>
  <canvas id="pe-cv" width="320" height="320" aria-label="Photo being cropped"></canvas>
  <label class="pe-f">Zoom <input type="range" id="pe-zoom" min="1" max="4" step="0.01" value="1"></label>
  <label class="pe-f">Turn <select id="pe-rot"><option value="0">None</option><option value="90">90° right</option><option value="180">180°</option><option value="270">90° left</option></select></label>
  <div class="pe-row"><button type="button" id="pe-crop-ok">Use this</button><button type="button" id="pe-crop-no" class="pe-add">Cancel</button></div>
</dialog>
<input type="file" id="pe-file" accept="image/*" hidden>\n`;
}

export function mount(d) {
  const KEY = 'n26-tracker-' + d.editor.at, $ = id => document.getElementById(id);
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
  if (!st || !st.gangs || !st.battles) st = fresh(d);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { msg('This browser would not save: the export still works.'); } };
  const side = id => d.gangInfo[id].side, gid = s => d.bySide[s], gname = s => d.gangInfo[gid(s)].name;
  const name = id => d.cards[id]?.name || id;
  const opt = (v, label, cur) => `<option value="${attr(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const inp = (k, v, extra = '') => `<input data-k="${attr(k)}" value="${attr(v ?? '')}" ${extra}>`;
  const num = (k, v, extra = '') => inp(k, v, `type="number" inputmode="numeric" ${extra}`);
  const sel = (k, list, cur, extra = '') => `<select data-k="${attr(k)}" ${extra}>${join(list, o => Array.isArray(o) ? opt(o[0], o[1], cur) : opt(o, o, cur))}</select>`;
  const del = (k, i) => `<button type="button" class="pe-x" data-del="${attr(k)}" data-i="${i}" aria-label="Remove">×</button>`;
  const add = (k, label) => `<button type="button" class="pe-add" data-add="${attr(k)}">+ ${esc(label)}</button>`;
  const table = (head, rows, after = '') => `<div class="pe-scroll"><table class="pe-t"><thead><tr>${join(head, h => `<th>${h}</th>`)}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${after}`;
  const fighterList = id => [['', 'Choose…'], ...st.gangs[id].fighters.map(f => [f, name(f)])];

  // ---- what the battles add up to, per gang
  function fromBattles(id) {
    const s = side(id), out = { lines: [], rep: 0, xp: {}, injuries: {}, won: 0 };
    for (const b of st.battles) {
      const g = b[s]; if (!g) continue;
      if (n(g.winIncome)) out.lines.push({ source: b.name || 'Battle', credits: n(g.winIncome) });
      if (n(g.sideIncome)) out.lines.push({ source: `${b.name || 'Battle'}: side job`, credits: n(g.sideIncome) });
      for (const o of g.other) if (o.source || n(o.credits)) out.lines.push({ source: o.source || 'Other', credits: n(o.credits) });
      out.rep += n(g.rep);
      for (const x of g.xp) if (x.fighter) out.xp[x.fighter] = (out.xp[x.fighter] || 0) + n(x.xp);
      for (const x of g.injuries) if (x.fighter && x.injury) (out.injuries[x.fighter] ??= []).push(x.injury);
      if (b.winner === s) out.won++;
    }
    return out;
  }

  function totals(id) {
    const g = st.gangs[id], B = fromBattles(id);
    const work = Object.values(g.actions).filter(a => a.action === 'Work Territory').length;
    const rep = n(g.rep) + B.rep, wins = n(g.wins) + B.won;
    const terr = g.territories.reduce((s, t) => s + (t.mode === 'income' ? n(t.income) : 0), 0);
    const income = n(g.carried) + B.lines.reduce((s, l) => s + l.credits, 0) + terr + work * 15 + rep * 10;
    const rec = g.recruits.reduce((s, r) => s + Math.max(0, n(r.price) - n(r.discount)), 0);
    const buy = g.purchases.reduce((s, p) => s + n(p.cost), 0);
    const sell = g.sales.reduce((s, x) => s + n(x.credits), 0);
    const rating = n(g.startRating) + g.adv.reduce((s, a) => s + n(a.cost), 0) + g.recruits.reduce((s, r) => s + n(r.price), 0) +
      g.purchases.reduce((s, p) => s + (p.rating ? n(p.cost) : 0), 0) + n(g.ratingAdj);
    return { B, work, rep, wins, income, rec, buy, sell, spent: rec + buy, credits: income - rec - buy + sell, rating, fighters: n(g.startFighters) + g.recruits.length };
  }
  // XP a fighter ends the cycle on: their card, battle XP, and +2 for training
  const xpNow = (id, f) => n(d.cards[f]?.stats?.XP) + (fromBattles(id).xp[f] || 0) + (st.gangs[id].actions[f]?.action === 'Train (+2 XP)' ? 2 : 0);

  // ---- 1. battles
  function battleHtml(b, i) {
    const K = `battles.${i}`, other = b.challenger === 'p' ? 't' : 'p';
    const sideHtml = s => {
      const g = b[s], P = `${K}.${s}`, id = gid(s);
      const inj = join(g.injuries, (x, j) => `<tr><td>${sel(`${P}.injuries.${j}.fighter`, fighterList(id), x.fighter)}</td><td>${inp(`${P}.injuries.${j}.injury`, x.injury, 'placeholder="e.g. Head Injury" list="tr-inj"')}</td><td>${del(`${P}.injuries`, j)}</td></tr>`);
      const xp = join(g.xp, (x, j) => `<tr><td>${sel(`${P}.xp.${j}.fighter`, fighterList(id), x.fighter)}</td><td>${num(`${P}.xp.${j}.xp`, x.xp, 'class="sm"')}</td><td>${del(`${P}.xp`, j)}</td></tr>`);
      const oth = join(g.other, (x, j) => `<tr><td>${inp(`${P}.other.${j}.source`, x.source, 'placeholder="Source"')}</td><td>${num(`${P}.other.${j}.credits`, x.credits, 'class="sm"')}</td><td>${del(`${P}.other`, j)}</td></tr>`);
      return `<div class="tr-side ${d.gangInfo[id].class}"><h4>${esc(gname(s))}</h4>
        <div class="pe-grid"><label class="pe-f">Reputation change${num(`${P}.rep`, g.rep)}</label><label class="pe-f">Win/loss income${num(`${P}.winIncome`, g.winIncome)}</label><label class="pe-f">Side job income${num(`${P}.sideIncome`, g.sideIncome)}</label></div>
        <h5>Lasting injuries</h5>${g.injuries.length ? table(['Fighter', 'Injury'], inj) : ''}${add(`${P}.injuries`, 'Injury')}
        <h5>Experience</h5>${g.xp.length ? table(['Fighter', 'XP'], xp) : ''}${add(`${P}.xp`, 'XP')}
        <h5>Other income</h5>${g.other.length ? table(['Source', 'Credits'], oth) : ''}${add(`${P}.other`, 'Income')}</div>`;
    };
    return `<article class="tr-battle"><div class="tr-head"><h3>${esc(b.name || `Battle ${i + 1}`)}</h3>${del('battles', i)}</div>
      <div class="pe-grid">
        <label class="pe-f">Name${inp(`${K}.name`, b.name, 'placeholder="e.g. The Wormways War"')}</label>
        <label class="pe-f">Challenger${sel(`${K}.challenger`, [['p', gname('p')], ['t', gname('t')]], b.challenger)}</label>
        <label class="pe-f">Challenged<span class="tr-ro" data-o="ch.${i}">${esc(gname(other))}</span></label>
        <label class="pe-f">At stake${inp(`${K}.stake`, b.stake, 'list="tr-terr" placeholder="Territory"')}</label>
        <label class="pe-f">Result${sel(`${K}.winner`, [['', 'Not played'], ['p', `${gname('p')} won`], ['t', `${gname('t')} won`], ['draw', 'Draw']], b.winner)}</label>
      </div>
      <div class="tr-sides">${sideHtml('p')}${sideHtml('t')}</div></article>`;
  }

  // ---- 2. post-cycle
  function gangHtml(e) {
    const id = e.gang, g = st.gangs[id], P = `gangs.${id}`, info = d.gangInfo[id], B = fromBattles(id);
    const forList = [['', 'Choose…'], ...g.fighters.map(name), ...g.recruits.filter(r => r.name).map(r => r.name), 'Gang stash'];
    const actions = join(g.fighters, f => `<tr><td>${esc(name(f))}</td><td>${inp(`${P}.actions.${f}.injuries`, g.actions[f]?.injuries, `placeholder="${attr((B.injuries[f] || []).join(', ') || '–')}"`)}</td><td>${sel(`${P}.actions.${f}.action`, ACTIONS, g.actions[f]?.action)}</td><td></td></tr>`);
    const battles = B.lines.length ? join(B.lines, l => `<tr><td>${esc(l.source)}</td><td>${plus(l.credits)}</td><td></td></tr>`) : '<tr><td colspan="3" class="pe-hint">None recorded yet.</td></tr>';
    const terr = join(g.territories, (t, i) => `<tr><td>${inp(`${P}.territories.${i}.name`, t.name, 'list="tr-terr"')}</td>
      <td>${sel(`${P}.territories.${i}.mode`, [['income', 'Income'], ['boon', 'Boon instead']], t.mode)}</td>
      <td>${num(`${P}.territories.${i}.income`, t.income, 'class="sm"')}</td><td>${inp(`${P}.territories.${i}.boon`, t.boon, 'placeholder="Boon taken"')}</td><td>${del(`${P}.territories`, i)}</td></tr>`);
    const adv = join(g.adv, (a, i) => `<tr><td>${sel(`${P}.adv.${i}.fighter`, [['', 'Choose…'], ...g.fighters.map(f => [f, name(f)])], a.fighter)}</td>
      <td>${num(`${P}.adv.${i}.xp`, a.xp, 'class="sm"')}</td><td>${inp(`${P}.adv.${i}.range`, a.range, 'class="sm" placeholder="e.g. 19–24"')}</td><td>${num(`${P}.adv.${i}.roll`, a.roll, 'class="sm"')}</td>
      <td>${sel(`${P}.adv.${i}.kind`, KINDS, a.kind)}</td><td>${inp(`${P}.adv.${i}.name`, a.name, 'placeholder="Skill or power"')}</td><td>${num(`${P}.adv.${i}.cost`, a.cost, 'class="sm"')}</td><td>${del(`${P}.adv`, i)}</td></tr>`);
    const rec = join(g.recruits, (r, i) => `<tr><td>${inp(`${P}.recruits.${i}.name`, r.name, 'placeholder="Name"')}</td><td>${inp(`${P}.recruits.${i}.type`, r.type, 'placeholder="e.g. Ghost (Ganger)"')}</td>
      <td>${num(`${P}.recruits.${i}.price`, r.price, 'class="sm"')}</td><td>${num(`${P}.recruits.${i}.discount`, r.discount, 'class="sm"')}</td><td>${inp(`${P}.recruits.${i}.note`, r.note, 'placeholder="e.g. Settlement"')}</td>
      <td class="pe-ph">${r.photo ? `<img src="${attr(r.photo)}" alt="${attr(r.name || 'Recruit')} portrait">` : ''}<button type="button" class="pe-add" data-photo="${P}.recruits.${i}">${r.photo ? 'Change' : 'Photo'}</button></td><td>${del(`${P}.recruits`, i)}</td></tr>`);
    const buy = join(g.purchases, (p, i) => `<tr><td>${inp(`${P}.purchases.${i}.item`, p.item, 'placeholder="Item"')}</td><td>${sel(`${P}.purchases.${i}.for`, forList, p.for)}</td>
      <td>${sel(`${P}.purchases.${i}.source`, SOURCES, p.source)}</td><td>${num(`${P}.purchases.${i}.cost`, p.cost, 'class="sm"')}</td>
      <td class="c"><input type="checkbox" data-k="${P}.purchases.${i}.rating"${p.rating ? ' checked' : ''} aria-label="Adds to the gang rating"></td><td>${del(`${P}.purchases`, i)}</td></tr>`);
    const sales = join(g.sales, (x, i) => `<tr><td>${inp(`${P}.sales.${i}.item`, x.item, 'placeholder="Item"')}</td><td>${sel(`${P}.sales.${i}.fighter`, forList, x.fighter)}</td><td>${num(`${P}.sales.${i}.credits`, x.credits, 'class="sm"')}</td><td>${del(`${P}.sales`, i)}</td></tr>`);
    return `<section class="pe-gang ${info.class}" id="pe-${e.section}">
  <h2>${esc(info.name)}</h2>
  <label class="pe-f">Story (blank line between paragraphs)<textarea data-k="${P}.story" rows="3">${esc(g.story)}</textarea></label>
  <h3>Post-cycle actions</h3><p class="pe-hint">Lasting injuries from the battles show greyed in; type to replace them.</p>${table(['Fighter', 'Lasting injuries', 'Action'], actions)}
  <h3>Income</h3>
  <div class="pe-grid"><label class="pe-f">Carried over${num(`${P}.carried`, g.carried)}</label><label class="pe-f">Reputation last cycle${num(`${P}.rep`, g.rep)}</label><label class="pe-f">Wins last cycle${num(`${P}.wins`, g.wins)}</label></div>
  <h4>From the battles</h4>${table(['Source', 'Credits'], battles)}
  <h4>Territories</h4>${table(['Territory', 'Take', 'Income', 'Boon'], terr, add(`${P}.territories`, 'Territory') + ' <button type="button" class="pe-add" data-stakes="' + attr(id) + '">Apply battle stakes</button>')}
  <p class="pe-sum">Work Territory: <b data-o="${id}.work"></b> · Reputation: <b data-o="${id}.rep"></b> · Total income: <b data-o="${id}.income"></b></p>
  <h3>XP advancements</h3>${table(['Fighter', 'XP', 'Band', 'Roll', 'Advancement', 'Skill', 'Cost'], adv, add(`${P}.adv`, 'Advancement'))}
  <h3>Trading post</h3>
  <h4>Recruits</h4>${table(['Name', 'Type', 'Price', 'Discount', 'Discount from', 'Portrait'], rec, add(`${P}.recruits`, 'Recruit'))}
  <h4>Purchases</h4>${table(['Item', 'For', 'Source', 'Cost', 'On card'], buy, add(`${P}.purchases`, 'Purchase'))}
  <h4>Sales</h4>${table(['Item', 'From', 'Credits'], sales, add(`${P}.sales`, 'Sale'))}
  <h3>Gang sheet</h3>
  <div class="pe-grid"><label class="pe-f">Rating last cycle${num(`${P}.startRating`, g.startRating)}</label><label class="pe-f">Fighters last cycle${num(`${P}.startFighters`, g.startFighters)}</label><label class="pe-f">Rating adjustment${num(`${P}.ratingAdj`, g.ratingAdj)}</label></div>
  <dl class="pe-sheet"><div><dt>Rating</dt><dd data-o="${id}.rating"></dd></div><div><dt>Wins</dt><dd data-o="${id}.wins"></dd></div><div><dt>Reputation</dt><dd data-o="${id}.rep"></dd></div><div><dt>Credits</dt><dd data-o="${id}.credits"></dd></div><div><dt>Fighters</dt><dd data-o="${id}.fighters"></dd></div></dl>
  <p class="pe-sum">Spent: recruits <b data-o="${id}.rec"></b> · purchases <b data-o="${id}.buy"></b> · sales <b data-o="${id}.sell"></b></p>
</section>`;
  }

  // ---- 3. gang lists: the fighter cards with this cycle's changes
  function listsHtml() {
    return join(d.prev.gangs, e => {
      const id = e.gang, g = st.gangs[id], info = d.gangInfo[id], B = fromBattles(id);
      const cards = join(g.fighters, f => {
        const c = JSON.parse(JSON.stringify(d.cards[f] || { name: f, stats: {} }));
        if (c.stats && 'XP' in c.stats) c.stats.XP = String(xpNow(id, f));
        const extra = [];
        const inj = g.actions[f]?.injuries || (B.injuries[f] || []).join(', ');
        if (inj) extra.push({ label: 'New lasting injuries', text: inj });
        const adv = g.adv.filter(a => a.fighter === f && a.kind).map(a => a.kind.startsWith('stat:') ? '+1 ' + a.kind.slice(5) : a.name || '?');
        if (adv.length) extra.push({ label: 'Advancements', text: adv.join(', ') });
        const act = g.actions[f]?.action; if (act && act !== 'To come') extra.push({ label: 'Post-cycle', text: act });
        c.foot = [...(c.foot || []), ...extra];
        return fighterCard(c);
      }) + join(g.recruits.filter(r => r.name), r => fighterCard({ name: r.name, nameClass: 'new-i', type: esc(r.type || 'New recruit'), cost: String(n(r.price)),
        portrait: r.photo || info.thumb || info.portrait, stats: {}, foot: [{ label: 'New recruit', text: 'Stats, wargear and skills to come' }] }));
      return `<div class="gang ${info.class}"><div class="gang-head"><img class="portrait" src="${attr(info.portrait)}" alt=""><div><h3>${esc(info.name)}</h3><p class="house">${esc(info.house)}</p></div></div><div class="fighters">${cards}</div></div>`;
    });
  }

  // ---- the post-cycle data, in the shape data/post/<cycle>.json uses
  function build() {
    const N = s => `<span class="new-i">${esc(s)}</span>`;
    return {
      page: 'post', id: d.editor.post + '-post', title: `${d.editor.cycle} Post-cycle`, roster: d.editor.post + '-post',
      hero: { kicker: 'Ash and Shadow', cycle: d.editor.cycle, name: 'Post-cycle phase', sides: d.hero.sides },
      results: { label: `${d.editor.cycle} results`, battles: st.battles.map(b => ({ page: b.page || '', name: b.name, challenger: b.challenger, stakes: b.stake, winner: b.winner === 'draw' ? '' : b.winner })) },
      gangs: d.prev.gangs.map(e => {
        const id = e.gang, g = st.gangs[id], T = totals(id);
        const income = [{ source: 'Carried over from previous cycle', credits: String(n(g.carried)) },
          ...T.B.lines.map(l => ({ source: l.source, credits: plus(l.credits) })),
          ...g.territories.map(t => t.mode === 'income' ? { source: t.name, credits: plus(n(t.income)) } : { source: t.name, credits: '0', recruitment: t.boon || 'Boon taken' }),
          ...(T.work ? [{ source: `Work Territory (${T.work} × 15)`, credits: plus(T.work * 15) }] : []),
          { source: `Reputation (${T.rep} × 10)`, credits: plus(T.rep * 10) }];
        return {
          gang: id, section: e.section, story: g.story ? g.story.split(/\n\s*\n/) : [],
          actions: g.fighters.map(f => ({ fighter: name(f), injuries: g.actions[f]?.injuries || (T.B.injuries[f] || []).join(', ') || '–', action: g.actions[f]?.action || 'To come' })),
          income, incomeTotal: String(T.income),
          advancements: g.adv.filter(a => a.fighter).map(a => {
            const [k, stat] = a.kind.split(':');
            const what = k === 'stat' ? N('+1 ' + stat) : k === 'primary' ? `${N(a.name || '?')} (primary skill)` : k === 'secondary' ? `${N(a.name || '?')} (secondary skill)`
              : k === 'power' ? `${N(a.name || '?')} (Psychoteric power)` : N(a.name || '?');
            return { fighter: name(a.fighter), xp: String(a.xp), range: a.range, roll: String(a.roll), advancement: what, cost: plus(n(a.cost)) };
          }),
          recruits: g.recruits.map(r => ({ recruit: [r.name, r.type].filter(Boolean).join(', '), discount: n(r.discount) ? `${n(r.discount)} credits${r.note ? ', ' + r.note : ''}` : '–',
            cost: n(r.discount) ? `${n(r.price)} – ${n(r.discount)} = ${Math.max(0, n(r.price) - n(r.discount))}` : String(n(r.price)) })),
          purchases: g.purchases.map(p => ({ item: p.item, for: p.for, source: p.source, cost: String(n(p.cost)), tp: '–' })),
          sales: g.sales.map(x => ({ item: x.item, fighter: x.fighter, credits: String(n(x.credits)) })),
          tradingTotal: { recruit: [String(T.rec), '–'], purchase: [String(T.buy), '–'], sell: [String(T.sell), '–'], total: [String(T.spent), '0'] },
          roster: { sheet: [['Rating', String(T.rating)], ['Wins', String(T.wins)], ['Reputation', String(T.rep)], ['Credits', String(T.credits)], ['Fighters', String(T.fighters)]],
            assets: e.roster.assets.map(a => a.label === 'Territories' ? { ...a, chips: g.territories.map(t => ({ tip: t.name })) } : a),
            fighters: [...g.fighters] },
          xp: Object.fromEntries(g.fighters.map(f => [name(f), xpNow(id, f)])),
          newFighters: g.recruits.filter(r => r.name).map(r => ({ name: r.name, type: r.type, cost: n(r.price), ...(r.photo ? { portrait: r.photo } : {}) })),
        };
      }),
    };
  }

  function draw() {
    const injuries = ['Lasting Injury', 'Head Injury', 'Eye Injury', 'Hand Injury', 'Enfeebled', 'Hobbled', 'Spinal Injury', 'Grievous Wound', 'Humiliated', 'Critical Injury', 'Captured', 'Personal Enmity'];
    $('pe-body').innerHTML = `<datalist id="tr-terr">${join(d.territories, t => `<option value="${attr(t)}">`)}</datalist><datalist id="tr-inj">${join(injuries, t => `<option value="${attr(t)}">`)}</datalist>
<section id="tr-battles"><h2>Battles</h2><div class="tr-list">${join(st.battles, battleHtml)}</div>${add('battles', 'Add battle')}</section>
<section id="tr-post"><h2>Post-cycle phase</h2><div class="tr-list">${join(d.prev.gangs, gangHtml)}</div></section>
<section id="tr-gangs"><h2>Gang lists</h2><div class="gangs">${listsHtml()}</div></section>
<section id="tr-export"><h2>Export</h2>
  <p class="pe-hint">The post-cycle data in the shape <code>data/post/${esc(d.editor.post)}.json</code> uses, with the battles under <code>results</code>, each fighter's XP, new recruits with their portraits, and the tracker's own state under <code>tracker</code> so it can be loaded back in.</p>
  <textarea id="pe-json" rows="12" spellcheck="false" aria-label="Tracker JSON"></textarea>
  <div class="pe-row"><button type="button" id="pe-copy">Copy</button><button type="button" id="pe-dl">Download</button><button type="button" id="pe-load">Load pasted</button><button type="button" id="pe-reset" class="danger">Start again</button></div>
  <p class="pe-msg" id="pe-msg" role="status"></p></section>`;
    outputs();
  }

  // Recompute every total in place (no redraw, so typing keeps its focus).
  function outputs() {
    for (const e of d.prev.gangs) {
      const T = totals(e.gang);
      document.querySelectorAll(`[data-o^="${e.gang}."]`).forEach(el => { el.textContent = T[el.dataset.o.slice(e.gang.length + 1)]; });
    }
    $('pe-json').value = JSON.stringify({ ...build(), battles: st.battles, tracker: st }, null, 1);
    save();
  }

  const path = k => k.split('.');
  const setAt = (k, v) => { const p = path(k); let o = st; for (const x of p.slice(0, -1)) o = o[x] ??= {}; o[p.at(-1)] = v; };
  const getAt = k => path(k).reduce((o, x) => o?.[x], st);
  // structural changes (new names in lists, a challenger) redraw; plain typing only recomputes
  const REDRAW = [/^battles\.\d+\.(challenger|name)$/, /\.recruits\.\d+\.name$/, /\.actions\.[^.]+\.(action|injuries)$/, /\.adv\.\d+\.(kind|name|fighter)$/, /^battles\.\d+\.[pt]\.(injuries|xp)\.\d+\./];
  $('pe').addEventListener('input', e => {
    const el = e.target; if (!el.dataset.k) return;
    setAt(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : n(el.value)) : el.value);
    outputs();
  });
  $('pe').addEventListener('change', e => {
    const k = e.target.dataset.k || '';
    const m = k.match(/^gangs\.([^.]+)\.adv\.(\d+)\.fighter$/);
    if (m) { const a = st.gangs[m[1]].adv[+m[2]]; if (a.fighter) a.xp = xpNow(m[1], a.fighter); }
    const doc = k.match(/^(gangs\.[^.]+\.purchases\.\d+)\.source$/);
    if (doc && e.target.value === 'Doc') setAt(doc[1] + '.rating', false);
    if (m || doc || REDRAW.some(r => r.test(k))) later();
  });
  // redraw after the click that caused the change has landed, so it isn't swallowed
  let t0 = null;
  const later = () => { clearTimeout(t0); t0 = setTimeout(() => { const y = scrollY, f = document.activeElement?.dataset?.k; draw(); scrollTo(0, y); if (f) document.querySelector(`[data-k="${f}"]`)?.focus(); }, 150); };
  $('pe').addEventListener('click', e => {
    const a = e.target.closest('[data-add]'), x = e.target.closest('[data-del]'), sk = e.target.closest('[data-stakes]');
    if (a) {
      const k = a.dataset.add, list = getAt(k), kind = k.split('.').at(-1);
      list.push({ battles: { name: '', challenger: 'p', stake: '', winner: '', p: blankSide(), t: blankSide() },
        injuries: { fighter: '', injury: '' }, xp: { fighter: '', xp: 1 }, other: { source: '', credits: 0 },
        territories: { name: '', mode: 'income', income: 0, boon: '' },
        adv: { fighter: '', xp: '', range: '', roll: '', kind: '', name: '', cost: 0 }, recruits: { name: '', type: '', price: 0, discount: 0, note: '' },
        purchases: { item: '', for: '', source: 'Gang list', cost: 0, rating: true }, sales: { item: '', fighter: '', credits: 0 } }[kind]);
      draw();
    } else if (x) { if (x.dataset.del !== 'battles' || confirm('Remove this battle?')) { getAt(x.dataset.del).splice(+x.dataset.i, 1); draw(); } }
    else if (sk) {   // a won stake moves to the winner's territories, a lost one leaves
      const id = sk.dataset.stakes, s = side(id), g = st.gangs[id]; let moved = 0;
      for (const b of st.battles) {
        if (!b.stake || !b.winner || b.winner === 'draw') continue;
        const has = g.territories.some(t => t.name === b.stake);
        if (b.winner === s && !has) { g.territories.push({ name: b.stake, mode: 'income', income: incomeOf(b.stake), boon: boonOf(b.stake) }); moved++; }
        if (b.winner !== s && has) { g.territories = g.territories.filter(t => t.name !== b.stake); moved++; }
      }
      draw(); msg(moved ? `${moved} territor${moved === 1 ? 'y' : 'ies'} updated from the battle results.` : 'The territories already match the battle results.');
    }
    else if (e.target.id === 'pe-copy') navigator.clipboard.writeText($('pe-json').value).then(() => msg('Copied.'), () => { $('pe-json').select(); msg('Selected: copy it with Ctrl+C.'); });
    else if (e.target.id === 'pe-dl') {
      const l = document.createElement('a');
      l.href = URL.createObjectURL(new Blob([$('pe-json').value + '\n'], { type: 'application/json' }));
      l.download = `tracker-${d.editor.post}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000);
    } else if (e.target.id === 'pe-load') {
      try { const j = JSON.parse($('pe-json').value); if (!j.tracker?.gangs) throw new Error(); st = j.tracker; draw(); msg('Loaded.'); } catch (err) { msg('That isn\'t an export from the tracker.'); }
    } else if (e.target.id === 'pe-reset' && confirm('Clear everything and start again from last cycle?')) { st = fresh(d); draw(); msg('Started again.'); }
  });
  function msg(t) { const m = $('pe-msg'); if (m) m.textContent = t; }

  // ---- portrait crop: load a photo, pan and zoom it under a round guide, save a 192px square JPEG
  const cv = $('pe-cv'), cx = cv.getContext('2d'), OUT = 192;
  let crop = null;   // {img, key, z, x, y, rot}: x/y is the image point at the canvas centre
  const dims = () => (crop.rot % 180 ? [crop.img.height, crop.img.width] : [crop.img.width, crop.img.height]);
  const base = () => { const [w, h] = dims(); return cv.width / Math.min(w, h); };
  function paint(ctx, size) {
    const [w, h] = dims(), sc = base() * crop.z * size / cv.width;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(sc, sc); ctx.translate(-crop.x, -crop.y);
    ctx.translate(w / 2, h / 2); ctx.rotate(crop.rot * Math.PI / 180); ctx.drawImage(crop.img, -crop.img.width / 2, -crop.img.height / 2); ctx.restore();
  }
  function show() {
    paint(cx, cv.width);
    cx.save(); cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.rect(0, 0, cv.width, cv.height);
    cx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 2, 0, Math.PI * 2, true); cx.fill('evenodd');
    cx.strokeStyle = '#f0b323'; cx.lineWidth = 2; cx.beginPath(); cx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 2, 0, Math.PI * 2); cx.stroke(); cx.restore();
  }
  function clamp() {
    const [w, h] = dims(), half = cv.width / 2 / (base() * crop.z);
    crop.x = Math.min(w - half, Math.max(half, crop.x)); crop.y = Math.min(h - half, Math.max(half, crop.y));
  }
  $('pe-file').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const img = new Image();
    img.onload = () => {
      crop = { img, key: crop.key, z: 1, rot: 0 }; const [w, h] = dims(); crop.x = w / 2; crop.y = h / 2.6; clamp();
      $('pe-zoom').value = 1; $('pe-rot').value = '0'; show(); $('pe-crop').showModal(); URL.revokeObjectURL(img.src);
    };
    img.onerror = () => msg('That file could not be read as an image.');
    img.src = URL.createObjectURL(f);
  });
  let pan = null;
  cv.addEventListener('pointerdown', e => { pan = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!pan) return;
    const k = (cv.width / cv.getBoundingClientRect().width) / (base() * crop.z);
    crop.x -= (e.clientX - pan.x) * k; crop.y -= (e.clientY - pan.y) * k; pan = { x: e.clientX, y: e.clientY }; clamp(); show();
  });
  cv.addEventListener('pointerup', () => { pan = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); crop.z = Math.min(4, Math.max(1, crop.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); $('pe-zoom').value = crop.z; clamp(); show(); }, { passive: false });
  $('pe-zoom').addEventListener('input', e => { crop.z = +e.target.value; clamp(); show(); });
  $('pe-rot').addEventListener('change', e => { crop.rot = +e.target.value; const [w, h] = dims(); crop.x = w / 2; crop.y = h / 2.6; clamp(); show(); });
  $('pe-crop-no').addEventListener('click', () => $('pe-crop').close());
  $('pe-crop-ok').addEventListener('click', () => {
    const out = document.createElement('canvas'); out.width = out.height = OUT; paint(out.getContext('2d'), OUT);
    getAt(crop.key).photo = out.toDataURL('image/jpeg', 0.88); $('pe-crop').close(); draw(); msg('Portrait added.');
  });
  $('pe').addEventListener('click', e => { const b = e.target.closest('[data-photo]'); if (b) { crop = { key: b.dataset.photo }; $('pe-file').click(); } });
  draw();
}
