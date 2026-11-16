// Post-cycle editor: data/post/<cycle>.json with "editor" settings.
// Fill in a cycle's post-cycle phase as forms: battle results, each fighter's action, income
// (battles, territories taken as income or boon, Work Territory, Reputation), XP advancements,
// recruits, purchases and sales. Totals, trading post and the gang sheet update as you type.
// Work is kept in this browser (localStorage); Export gives the finished post-cycle data in the
// same shape the post-cycle pages read (data/post/<cycle>.json), plus the editor's own state so it
// can be loaded back in. (Saving to a server comes later.)
import { esc, attr, join, rule, pageHref } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fightersAt } from '../roster.js';

const ACTIONS = ['To come', 'Work Territory', 'Train (+2 XP)', 'Recovery', 'Critical Injury', 'Captured', 'Medical Escort', 'Fit Bionics', 'Develop Tactics', 'Rest', 'Other'];
const STATS = ['Movement', 'Weapon Skill', 'Ballistic Skill', 'Strength', 'Toughness', 'Wounds', 'Initiative', 'Attacks', 'Leadership', 'Cool', 'Willpower', 'Intelligence'];
const KINDS = [['', 'Choose…'], ...STATS.map(s => ['stat:' + s, '+1 ' + s]), ['primary', 'Primary skill'], ['secondary', 'Secondary skill'], ['power', 'Psychoteric power'], ['other', 'Other']];
const SOURCES = ['Gang list', 'Trading post', 'Black market', 'Doc', 'Fit Bionics', 'Pets', 'Territory boon', 'Other'];
const n = v => { const x = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(x) ? 0 : x; };
const plus = v => (v > 0 ? '+' + v : String(v));

export async function prepare(d, { campaign, getJSON }) {
  const ed = d.editor;
  d.prev = await getJSON(`data/post/${ed.prev}.json`);
  const gangs = await Promise.all(campaign.gangs.map(g => getJSON(`data/gangs/${g}.json`)));
  d.gangInfo = Object.fromEntries(gangs.map(g => [g.id, g]));
  d.cards = fightersAt(campaign, gangs, ed.at);
  d.battles = await Promise.all(ed.battles.map(id => getJSON(campaign.pages[id].data)));
}

// The starting point for each gang: last cycle's roster, territories and sheet.
function fresh(d) {
  const facts = b => Object.fromEntries((b.setup?.facts || []).map(([k, v]) => [k.toLowerCase(), v]));
  const st = { results: d.battles.map(b => { const f = facts(b); return {
    page: b.id, name: b.name, challenger: /Psalm/.test(f.challenger || '') ? 'p' : 't',
    stakes: String(f['at stake'] || '').replace(/ territory$/, ''), winner: '' }; }), gangs: {} };
  for (const e of d.prev.gangs) {
    const sheet = Object.fromEntries(e.roster.sheet);
    const terr = (e.roster.assets.find(a => a.label === 'Territories')?.chips || []).map(c => c.tip);
    st.gangs[e.gang] = {
      story: '', carried: n(sheet.Credits), rep: n(sheet.Reputation), wins: n(sheet.Wins),
      startRating: n(sheet.Rating), startFighters: n(sheet.Fighters), ratingAdj: 0,
      battles: d.battles.map(b => ({ source: b.name, credits: 0 })),
      territories: terr.map(name => ({ name, mode: 'income', income: incomeOf(name), boon: boonOf(name) })),
      fighters: [...e.roster.fighters],
      actions: Object.fromEntries(e.roster.fighters.map(id => [id, { action: 'To come', injuries: '' }])),
      adv: [], recruits: [], purchases: [], sales: [] };
  }
  return st;
}
const incomeOf = name => n((String(rule(name) || '').match(/Income: (\d+)/) || [])[1]);
const boonOf = name => ((String(rule(name) || '').match(/(?:Recruit|Equipment|Reputation): ([^.]+(?:\.[^.]*?)?)\. Battlefield/) || [])[1] || '').trim();

// Everything the gang sheet and totals are worked out from.
function totals(g, d) {
  const work = Object.values(g.actions).filter(a => a.action === 'Work Territory').length;
  const terr = g.territories.reduce((s, t) => s + (t.mode === 'income' ? n(t.income) : 0), 0);
  const income = n(g.carried) + g.battles.reduce((s, b) => s + n(b.credits), 0) + terr + work * 15 + g.rep * 10;
  const rec = g.recruits.reduce((s, r) => s + Math.max(0, n(r.price) - n(r.discount)), 0);
  const buy = g.purchases.reduce((s, p) => s + n(p.cost), 0);
  const sell = g.sales.reduce((s, x) => s + n(x.credits), 0);
  const rating = n(g.startRating) + g.adv.reduce((s, a) => s + n(a.cost), 0) + g.recruits.reduce((s, r) => s + n(r.price), 0) +
    g.purchases.reduce((s, p) => s + (p.rating ? n(p.cost) : 0), 0) + n(g.ratingAdj);
  return { work, income, rec, buy, sell, spent: rec + buy, credits: income - rec - buy + sell, rating, fighters: n(g.startFighters) + g.recruits.length };
}

// The finished post-cycle data, in the shape data/post/<cycle>.json already uses.
function build(st, d) {
  const name = id => d.cards[id]?.name || id;
  const N = s => `<span class="new-i">${esc(s)}</span>`;
  return {
    page: 'post', id: d.id, title: d.title, hero: d.hero, roster: d.editor.at,
    results: { label: `${d.hero.cycle} results`, battles: st.results.map(r => ({ page: r.page, name: r.name, challenger: r.challenger, stakes: r.stakes, winner: r.winner || r.challenger })) },
    gangs: d.prev.gangs.map(e => {
      const g = st.gangs[e.gang], T = totals(g, d);
      const income = [{ source: 'Carried over from previous cycle', credits: String(n(g.carried)) },
        ...g.battles.filter(b => b.source).map(b => ({ source: b.source, credits: plus(n(b.credits)) })),
        ...g.territories.map(t => t.mode === 'income' ? { source: t.name, credits: plus(n(t.income)) } : { source: t.name, credits: '0', recruitment: t.boon || 'Boon taken' }),
        ...(T.work ? [{ source: `Work Territory (${T.work} × 15)`, credits: plus(T.work * 15) }] : []),
        { source: `Reputation (${g.rep} × 10)`, credits: plus(g.rep * 10) }];
      const adv = g.adv.filter(a => a.fighter).map(a => {
        const [k, stat] = a.kind.split(':');
        const what = k === 'stat' ? N('+1 ' + stat) : k === 'primary' ? `${N(a.name || '?')} (primary skill)` : k === 'secondary' ? `${N(a.name || '?')} (secondary skill)`
          : k === 'power' ? `${N(a.name || '?')} (Psychoteric power)` : N(a.name || '?');
        return { fighter: name(a.fighter), xp: String(a.xp), range: a.range, roll: String(a.roll), advancement: what, cost: plus(n(a.cost)) };
      });
      return {
        gang: e.gang, section: e.section, story: g.story ? g.story.split(/\n\s*\n/) : [],
        actions: g.fighters.map(id => ({ fighter: name(id), injuries: g.actions[id]?.injuries || '–', action: g.actions[id]?.action || 'To come' })),
        income, incomeTotal: String(T.income),
        advancements: adv,
        recruits: g.recruits.map(r => ({ recruit: [r.name, r.type].filter(Boolean).join(', '), discount: n(r.discount) ? `${n(r.discount)} credits${r.note ? ', ' + r.note : ''}` : '–',
          cost: n(r.discount) ? `${n(r.price)} – ${n(r.discount)} = ${Math.max(0, n(r.price) - n(r.discount))}` : String(n(r.price)) })),
        purchases: g.purchases.map(p => ({ item: p.item, for: p.for, source: p.source, cost: String(n(p.cost)), tp: '–' })),
        sales: g.sales.map(x => ({ item: x.item, fighter: x.fighter, credits: String(n(x.credits)) })),
        newFighters: g.recruits.filter(r => r.name).map(r => ({ name: r.name, type: r.type, cost: n(r.price), ...(r.photo ? { portrait: r.photo } : {}) })),
        tradingTotal: { recruit: [String(T.rec), '–'], purchase: [String(T.buy), '–'], sell: [String(T.sell), '–'], total: [String(T.spent), '0'] },
        roster: { sheet: [['Rating', String(T.rating)], ['Wins', String(g.wins)], ['Reputation', String(g.rep)], ['Credits', String(T.credits)], ['Fighters', String(T.fighters)]],
          assets: e.roster.assets.map(a => a.label === 'Territories' ? { ...a, chips: g.territories.map(t => ({ tip: t.name })) } : a),
          fighters: [...g.fighters, ...g.recruits.map(r => r.id).filter(Boolean)] },
      };
    }),
  };
}

export function render(d) {
  document.title = d.title;
  const items = [{ href: '#pe-results', text: 'Results' }, ...d.prev.gangs.map(e => ({ href: '#pe-' + e.section, text: d.gangInfo[e.gang].name })), { href: '#pe-export', text: 'Export' }];
  return hero({ ...d.hero, name: 'Post-cycle editor' }) + '\n' + nav(items, 'Page sections') +
    `\n<main class="wrap pe" id="pe"><p class="pe-note">Fill in the post-cycle phase below. Totals and the gang sheet update as you go. Your work is saved in this browser only; use Export to send it on. Fighter cards (new skills, injuries, wargear) aren't changed here.</p><div id="pe-body"></div></main>
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
  const KEY = 'n26-postedit-' + d.id, $ = id => document.getElementById(id);
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
  if (!st || !st.gangs) st = fresh(d);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked */ } };
  const opt = (v, label, cur) => `<option value="${attr(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const name = id => d.cards[id]?.name || id;
  // Inputs carry a data-k path into the state, e.g. "gangs.the-carrion-psalm.adv.0.roll".
  const inp = (k, v, extra = '') => `<input data-k="${attr(k)}" value="${attr(v ?? '')}" ${extra}>`;
  const num = (k, v, extra = '') => inp(k, v, `type="number" inputmode="numeric" ${extra}`);
  const sel = (k, list, cur, extra = '') => `<select data-k="${attr(k)}" ${extra}>${join(list, o => Array.isArray(o) ? opt(o[0], o[1], cur) : opt(o, o, cur))}</select>`;
  const del = (k, i) => `<button type="button" class="pe-x" data-del="${attr(k)}" data-i="${i}" aria-label="Remove line">×</button>`;
  const table = (head, rows, add) => `<div class="pe-scroll"><table class="pe-t"><thead><tr>${join(head, h => `<th>${h}</th>`)}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${add}`;

  const forListOf = g => [['', 'Choose…'], ...g.fighters.map(name), ...g.recruits.filter(r => r.name).map(r => r.name), 'Gang stash'];
  function forLists(id) {
    const g = st.gangs[id], list = forListOf(g);
    document.querySelectorAll(`[data-k^="gangs.${id}.purchases."][data-k$=".for"], [data-k^="gangs.${id}.sales."][data-k$=".fighter"]`).forEach(el => {
      const cur = getAt(el.dataset.k);
      el.innerHTML = join(list, o => Array.isArray(o) ? opt(o[0], o[1], cur) : opt(o, o, cur));
    });
  }

  function gangHtml(e) {
    const id = e.gang, g = st.gangs[id], P = `gangs.${id}`, info = d.gangInfo[id];
    const forList = forListOf(g);
    const actions = join(g.fighters, f => `<tr><td>${esc(name(f))}</td><td>${inp(`${P}.actions.${f}.injuries`, g.actions[f]?.injuries, 'placeholder="–"')}</td><td>${sel(`${P}.actions.${f}.action`, ACTIONS, g.actions[f]?.action)}</td><td></td></tr>`);
    const battles = join(g.battles, (b, i) => `<tr><td>${inp(`${P}.battles.${i}.source`, b.source)}</td><td>${num(`${P}.battles.${i}.credits`, b.credits)}</td><td>${del(`${P}.battles`, i)}</td></tr>`);
    const terr = join(g.territories, (t, i) => `<tr><td>${inp(`${P}.territories.${i}.name`, t.name)}</td>
      <td>${sel(`${P}.territories.${i}.mode`, [['income', 'Income'], ['boon', 'Boon instead']], t.mode)}</td>
      <td>${num(`${P}.territories.${i}.income`, t.income)}</td><td>${inp(`${P}.territories.${i}.boon`, t.boon, 'placeholder="Boon taken"')}</td><td>${del(`${P}.territories`, i)}</td></tr>`);
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
    const add = (k, label) => `<button type="button" class="pe-add" data-add="${attr(k)}">+ ${esc(label)}</button>`;
    return `<section class="pe-gang ${info.class}" id="pe-${e.section}">
  <h2>${esc(info.name)}</h2>
  <label class="pe-f">Story (blank line between paragraphs)<textarea data-k="${P}.story" rows="3">${esc(g.story)}</textarea></label>
  <h3>Post-cycle actions</h3>${table(['Fighter', 'Lasting injuries', 'Action'], actions, '')}
  <h3>Income</h3>
  <div class="pe-grid"><label class="pe-f">Carried over${num(`${P}.carried`, g.carried)}</label><label class="pe-f">Reputation${num(`${P}.rep`, g.rep)}</label><label class="pe-f">Wins${num(`${P}.wins`, g.wins)}</label></div>
  <h4>Battles</h4>${table(['Source', 'Credits'], battles, add(`${P}.battles`, 'Battle or other income'))}
  <h4>Territories</h4>${table(['Territory', 'Take', 'Income', 'Boon'], terr, add(`${P}.territories`, 'Territory'))}
  <p class="pe-sum">Work Territory: <b data-o="${id}.work"></b> · Total income: <b data-o="${id}.income"></b></p>
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

  function draw() {
    const res = join(st.results, (r, i) => `<tr><td>${esc(r.page)} ${esc(r.name)}</td><td>${sel(`results.${i}.winner`, [['', 'Not played'], ['p', 'The Carrion Psalm'], ['t', 'The Midnight Theatre']], r.winner)}</td><td></td></tr>`);
    $('pe-body').innerHTML = `<section id="pe-results"><h2>Results</h2>${table(['Battle', 'Winner'], res, '')}</section>` +
      join(d.prev.gangs, gangHtml) +
      `<section id="pe-export"><h2>Export</h2>
  <p class="pe-hint">The post-cycle data, ready to save as <code>data/post/${esc(d.id.split('-')[0])}.json</code>, with the editor's state under <code>editor</code> so it can be loaded back in here.</p>
  <textarea id="pe-json" rows="12" spellcheck="false" aria-label="Post-cycle JSON"></textarea>
  <div class="pe-row"><button type="button" id="pe-copy">Copy</button><button type="button" id="pe-dl">Download</button><button type="button" id="pe-load">Load pasted</button><button type="button" id="pe-reset" class="danger">Start again</button></div>
  <p class="pe-msg" id="pe-msg" role="status"></p></section>`;
    outputs();
  }

  // Recompute every total in place (no redraw, so typing keeps its focus).
  function outputs() {
    for (const e of d.prev.gangs) {
      const g = st.gangs[e.gang], T = { ...totals(g, d), wins: g.wins, rep: g.rep };
      document.querySelectorAll(`[data-o^="${e.gang}."]`).forEach(el => { el.textContent = T[el.dataset.o.slice(e.gang.length + 1)]; });
    }
    $('pe-json').value = JSON.stringify({ ...build(st, d), editor: st }, null, 1);
    save();
  }

  const path = k => k.split('.');
  function setAt(k, v) { const p = path(k); let o = st; for (const x of p.slice(0, -1)) o = o[x] ??= {}; o[p.at(-1)] = v; }
  function getAt(k) { return path(k).reduce((o, x) => o?.[x], st); }
  const isNum = el => el.type === 'number';
  $('pe').addEventListener('input', e => {
    const el = e.target; if (!el.dataset.k) return;
    setAt(el.dataset.k, el.type === 'checkbox' ? el.checked : isNum(el) ? (el.value === '' ? '' : n(el.value)) : el.value);
    outputs();
  });
  $('pe').addEventListener('change', e => {   // a fighter chosen for an advancement brings their XP with them
    const k = e.target.dataset.k || '';
    const m = k.match(/^gangs\.([^.]+)\.adv\.(\d+)\.fighter$/);
    if (m) {
      const a = st.gangs[m[1]].adv[+m[2]], c = d.cards[a.fighter];
      if (c && !a.xp) { a.xp = n(c.stats?.XP); const x = document.querySelector(`[data-k="${k.replace(/fighter$/, 'xp')}"]`); if (x) x.value = a.xp; outputs(); }
    }
    const r = k.match(/^gangs\.([^.]+)\.recruits\.\d+\.name$/);
    if (r) forLists(r[1]);   // new recruits appear in the "For" and "From" lists, without redrawing the form
  });
  $('pe').addEventListener('click', e => {
    const a = e.target.closest('[data-add]'), x = e.target.closest('[data-del]');
    if (a) {
      const list = getAt(a.dataset.add), kind = a.dataset.add.split('.').at(-1);
      list.push({ battles: { source: '', credits: 0 }, territories: { name: '', mode: 'income', income: 0, boon: '' },
        adv: { fighter: '', xp: '', range: '', roll: '', kind: '', name: '', cost: 0 }, recruits: { name: '', type: '', price: 0, discount: 0, note: '' },
        purchases: { item: '', for: '', source: 'Gang list', cost: 0, rating: true }, sales: { item: '', fighter: '', credits: 0 } }[kind]);
      draw();
    } else if (x) { getAt(x.dataset.del).splice(+x.dataset.i, 1); draw(); }
    else if (e.target.id === 'pe-copy') navigator.clipboard.writeText($('pe-json').value).then(() => msg('Copied.'), () => { $('pe-json').select(); msg('Selected: copy it with Ctrl+C.'); });
    else if (e.target.id === 'pe-dl') {
      const l = document.createElement('a');
      l.href = URL.createObjectURL(new Blob([$('pe-json').value + '\n'], { type: 'application/json' }));
      l.download = `${d.id.split('-')[0]}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000);
    } else if (e.target.id === 'pe-load') {
      try { const j = JSON.parse($('pe-json').value); if (!j.editor?.gangs) throw new Error(); st = j.editor; draw(); msg('Loaded.'); } catch (err) { msg('That isn\'t an export from this editor.'); }
    } else if (e.target.id === 'pe-reset' && confirm('Clear everything and start again from last cycle?')) { st = fresh(d); draw(); msg('Started again.'); }
  });
  // purchases from the Doc are services, so by default they don't go on a fighter's card
  $('pe').addEventListener('change', e => {
    const m = (e.target.dataset.k || '').match(/^(gangs\.[^.]+\.purchases\.\d+)\.source$/);
    if (m && (e.target.value === 'Doc')) { setAt(m[1] + '.rating', false); draw(); }
  });
  const msg = t => { $('pe-msg').textContent = t; };

  // Portrait crop: load a photo, pan and zoom it under a round guide, save a 192px square JPEG.
  const cv = $('pe-cv'), cx = cv.getContext('2d'), OUT = 192;
  let crop = null;   // {img, key, z, x, y, rot}: x/y is the image point at the canvas centre
  const dims = () => (crop.rot % 180 ? [crop.img.height, crop.img.width] : [crop.img.width, crop.img.height]);
  const base = () => { const [w, h] = dims(); return cv.width / Math.min(w, h); };   // scale where the short side fills the frame
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
