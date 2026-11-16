// Campaign tracker: data/pages/tracker.json.
// A campaign kept entirely in this browser (localStorage), cycle by cycle:
//   Gangs: create each gang (name, house, colour, credits, reputation, territories, tactics) and its
//          fighters (stats, weapons, wargear, skills, injuries, portrait).
//   Cycle: record each battle (challenger and challenged, stake, result, and for each gang lasting
//          injuries, XP, Reputation change, win/loss, side job and other income), then the post-cycle
//          phase (actions, income, territories as income or boon, advancements, recruits, purchases,
//          sales) with a live gang sheet. "Finish cycle" rolls the results into the gangs and opens the next.
//   Gang lists: every fighter card, with the cycle's XP, injuries and advancements shown.
// Export gives one cycle as JSON (battles plus post-cycle data in the shape data/post/<cycle>.json uses),
// or the whole campaign to load back in. A server comes later.
import { esc, attr, join, rule } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fightersAt } from '../roster.js';
import { fighterCard } from '../fighter.js';

const KEY = 'n26-tracker-campaign';
const ACTIONS = ['To come', 'Work Territory', 'Train (+2 XP)', 'Recovery', 'Critical Injury', 'Captured', 'Medical Escort', 'Fit Bionics', 'Develop Tactics', 'Rest', 'Other'];
const STAT_KEYS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Sv', 'Ld', 'Cl', 'Wil', 'Int', 'XP'];
const STATS = [['M', 'Movement'], ['WS', 'Weapon Skill'], ['BS', 'Ballistic Skill'], ['S', 'Strength'], ['T', 'Toughness'], ['W', 'Wounds'], ['I', 'Initiative'], ['A', 'Attacks'], ['Ld', 'Leadership'], ['Cl', 'Cool'], ['Wil', 'Willpower'], ['Int', 'Intelligence']];
const KINDS = [['', 'Choose…'], ...STATS.map(([k, s]) => ['stat:' + k, '+1 ' + s]), ['primary', 'Primary skill'], ['secondary', 'Secondary skill'], ['power', 'Psychoteric power'], ['other', 'Other']];
const SOURCES = ['Gang list', 'Trading post', 'Black market', 'Doc', 'Fit Bionics', 'Pets', 'Territory boon', 'Other'];
const INJURIES = ['Lasting Injury', 'Head Injury', 'Eye Injury', 'Hand Injury', 'Enfeebled', 'Hobbled', 'Spinal Injury', 'Grievous Wound', 'Humiliated', 'Critical Injury', 'Captured', 'Personal Enmity'];
const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#283a40"/></svg>');
const n = v => { const x = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(x) ? 0 : x; };
const plus = v => (v > 0 ? '+' + v : String(v));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const plain = s => String(s ?? '').replace(/\{tip[^:]*:([^}]*)\}/g, '$1').replace(/\{[@pt][^|:]*[|:]([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '');
const incomeOf = name => n((String(rule(name) || '').match(/Income: (\d+)/) || [])[1]);
const boonOf = name => ((String(rule(name) || '').match(/(?:Recruit|Equipment|Reputation): ([^.]+(?:\.[^.]*?)?)\. Battlefield/) || [])[1] || '').trim();
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

export async function prepare(d, { campaign, getJSON }) {
  const rules = await getJSON('data/rules.json');
  d.territoryNames = Object.keys(rules).filter(k => /\(.+\)$/.test(k) && /Boons: Income/.test(rules[k]));
  // for "Start from this campaign's gangs"
  const ed = d.editor;
  d.prev = await getJSON(`data/post/${ed.prev}.json`);
  const gangs = await Promise.all(campaign.gangs.map(g => getJSON(`data/gangs/${g}.json`)));
  d.siteGangs = gangs;
  d.cards = fightersAt(campaign, gangs, ed.at);
  const ids = Object.keys(campaign.pages).filter(id => id.startsWith(ed.at.split('.')[0] + '.') && campaign.pages[id].template === 'battle');
  d.scheduled = await Promise.all(ids.map(id => getJSON(campaign.pages[id].data)));
}

// ---- the campaign's own data
const newFighter = () => ({ id: uid('f'), name: '', type: '', cost: 0, stats: Object.fromEntries(STAT_KEYS.map(k => [k, ''])), weapons: '', wargear: '', skills: '', injuries: '', photo: '', out: false });
const newGang = () => ({ id: uid('g'), name: '', house: '', colour: '#f0b323', credits: 0, rep: 0, wins: 0, territories: '', tactics: '', fighters: [] });
const blankSide = () => ({ injuries: [], xp: [], rep: 0, winIncome: 0, sideIncome: 0, other: [] });
const newCycle = num => ({ n: num, battles: [], post: {}, closed: false });

// Weapons as text: "Name | SR | LR | Str | AP | L | traits"; a line with just a name heads a combi,
// and the "- " lines under it are its profiles.
function weaponsText(ws) {
  return (ws || []).map(w => w.profile ? `${/\bsub\b/.test(w.class || '') ? '- ' : ''}${plain(w.name)} | ${w.profile.map(plain).join(' | ')} | ${plain(w.traits)}` : plain(w.name)).join('\n');
}
function weaponsOf(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const sub = l.startsWith('- '), parts = l.replace(/^- /, '').split('|').map(x => x.trim());
    if (parts.length < 2) return { name: esc(parts[0]), nameClass: 'parent' };
    return { name: esc(parts[0]), class: sub ? 'sub' : '', profile: [1, 2, 3, 4, 5].map(i => esc(parts[i] ?? '-')), traits: esc(parts.slice(6).join(' | ')) };
  });
}

// The two gangs of this site, as they stand after the last post-cycle phase.
function fromSite(d) {
  const st = { name: 'Ash and Shadow', gangs: [], cycles: {}, current: String(+d.editor.at.split('.')[0]) };
  for (const e of d.prev.gangs) {
    const sg = d.siteGangs.find(g => g.id === e.gang), sheet = Object.fromEntries(e.roster.sheet);
    const chips = l => (e.roster.assets.find(a => a.label === l)?.chips || []).map(c => c.tip).join(', ');
    st.gangs.push({ id: sg.id, name: sg.name, house: sg.house, colour: sg.class === 'psalm' ? '#ef7f4d' : '#c3aef0', cls: sg.class, portrait: sg.portrait,
      credits: n(sheet.Credits), rep: n(sheet.Reputation), wins: n(sheet.Wins), territories: chips('Territories'), tactics: chips('Gang tactics'),
      fighters: e.roster.fighters.map(id => {
        const c = d.cards[id] || {}, foot = l => plain((c.foot || []).find(f => f.label === l)?.text || '');
        return { id, name: c.name || id, type: plain(c.type), cost: c.cost === '*' ? 0 : n(c.cost), stats: Object.fromEntries(STAT_KEYS.map(k => [k, plain(c.stats?.[k] ?? '')])),
          weapons: weaponsText(c.weapons), wargear: foot('Wargear'), skills: foot('Skills'), injuries: foot('Lasting injuries'), photo: c.portrait || '', out: false };
      }) });
  }
  const cyc = newCycle(st.current);
  const facts = b => Object.fromEntries((b.setup?.facts || []).map(([k, v]) => [k.toLowerCase(), v]));
  const [p, t] = st.gangs.map(g => g.id);
  cyc.battles = d.scheduled.map(b => { const f = facts(b), a = /Psalm/.test(f.challenger || '') ? p : t;
    return { name: b.name, a, b: a === p ? t : p, stake: String(f['at stake'] || '').replace(/ territory$/, ''), winner: '', sides: { [p]: blankSide(), [t]: blankSide() } }; });
  st.cycles[st.current] = cyc;
  return st;
}

export function render(d) {
  document.title = d.title;
  const items = [{ href: '#', text: 'Tracker' }, { href: '#gangs', text: 'Gangs' }, { href: '#post', text: 'Post-cycle' }, { href: '#next', text: 'Next cycle' }, { href: '#rosters', text: 'Rosters' }];
  return hero({ ...d.hero, cycle: null }) + '\n' + nav(items, 'Page sections') +
    `\n<main class="wrap pe" id="pe"><div id="pe-body"></div></main>
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
  const $ = id => document.getElementById(id);
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
  if (!st || !Array.isArray(st.gangs)) st = { name: '', gangs: [], cycles: { 1: newCycle('1') }, current: '1' };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { msg('This browser would not save (the portraits may be too large): use Export to keep a copy.'); } };
  const cyc = () => (st.cycles[st.current] ??= newCycle(st.current));
  const gang = id => st.gangs.find(g => g.id === id);
  const live = g => g.fighters.filter(f => !f.out);
  const fname = (g, fid) => g.fighters.find(f => f.id === fid)?.name || '?';
  const tone = g => `style="--tone:${attr(g.colour || '#f0b323')}"`;
  const opt = (v, label, cur) => `<option value="${attr(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const inp = (k, v, extra = '') => `<input data-k="${attr(k)}" value="${attr(v ?? '')}" ${extra}>`;
  const num = (k, v, extra = '') => inp(k, v, `type="number" inputmode="numeric" ${extra}`);
  const sel = (k, opts, cur, extra = '') => `<select data-k="${attr(k)}" ${extra}>${join(opts, o => Array.isArray(o) ? opt(o[0], o[1], cur) : opt(o, o, cur))}</select>`;
  const txt = (k, v, rows, extra = '') => `<textarea data-k="${attr(k)}" rows="${rows}" ${extra}>${esc(v ?? '')}</textarea>`;
  const del = (k, i, what = 'line') => `<button type="button" class="pe-x" data-del="${attr(k)}" data-i="${i}" aria-label="Remove ${what}">×</button>`;
  const add = (k, label, kind) => `<button type="button" class="pe-add" data-add="${attr(k)}" data-kind="${kind}">+ ${esc(label)}</button>`;
  const table = (head, rows, after = '') => (rows ? `<div class="pe-scroll"><table class="pe-t"><thead><tr>${join(head, h => `<th>${h}</th>`)}<th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '') + after;
  const gangOpts = [['', 'Choose…'], ...st.gangs.map(g => [g.id, g.name || 'Unnamed gang'])];
  const fighterOpts = g => [['', 'Choose…'], ...live(g).map(f => [f.id, f.name || 'Unnamed'])];

  // ---- each gang's post-cycle entry for the current cycle, made the first time it's needed
  function post(g) {
    const c = cyc();
    return c.post[g.id] ??= { story: '', ratingAdj: 0, actions: {}, adv: [], recruits: [], purchases: [], sales: [],
      territories: list(g.territories).map(name => ({ name, mode: 'income', income: incomeOf(name), boon: boonOf(name) })) };
  }
  const side = (b, gid) => (b.sides[gid] ??= blankSide());
  function fromBattles(g) {
    const out = { lines: [], rep: 0, xp: {}, injuries: {}, won: 0 };
    for (const b of cyc().battles) {
      if (b.a !== g.id && b.b !== g.id) continue;
      const s = side(b, g.id), nm = b.name || 'Battle';
      if (n(s.winIncome)) out.lines.push({ source: nm, credits: n(s.winIncome) });
      if (n(s.sideIncome)) out.lines.push({ source: `${nm}: side job`, credits: n(s.sideIncome) });
      for (const o of s.other) if (o.source || n(o.credits)) out.lines.push({ source: o.source || 'Other', credits: n(o.credits) });
      out.rep += n(s.rep);
      for (const x of s.xp) if (x.fighter) out.xp[x.fighter] = (out.xp[x.fighter] || 0) + n(x.xp);
      for (const x of s.injuries) if (x.fighter && x.injury) (out.injuries[x.fighter] ??= []).push(x.injury);
      if (b.winner === g.id) out.won++;
    }
    return out;
  }
  const ratingOf = g => live(g).reduce((s, f) => s + n(f.cost), 0);
  function totals(g) {
    const P = post(g), B = fromBattles(g);
    const work = Object.values(P.actions).filter(a => a.action === 'Work Territory').length;
    const rep = n(g.rep) + B.rep, wins = n(g.wins) + B.won;
    const terr = P.territories.reduce((s, t) => s + (t.mode === 'income' ? n(t.income) : 0), 0);
    const income = n(g.credits) + B.lines.reduce((s, l) => s + l.credits, 0) + terr + work * 15 + rep * 10;
    const rec = P.recruits.reduce((s, r) => s + Math.max(0, n(r.price) - n(r.discount)), 0);
    const buy = P.purchases.reduce((s, p) => s + n(p.cost), 0);
    const sell = P.sales.reduce((s, x) => s + n(x.credits), 0);
    const rating = ratingOf(g) + P.adv.reduce((s, a) => s + n(a.cost), 0) + P.recruits.reduce((s, r) => s + n(r.price), 0) +
      P.purchases.reduce((s, p) => s + (p.rating ? n(p.cost) : 0), 0) + n(P.ratingAdj);
    return { B, work, rep, wins, income, rec, buy, sell, spent: rec + buy, credits: income - rec - buy + sell, rating, fighters: live(g).length + P.recruits.length };
  }
  const xpNow = (g, f) => n(f.stats?.XP) + (fromBattles(g).xp[f.id] || 0) + (post(g).actions[f.id]?.action === 'Train (+2 XP)' ? 2 : 0);

  // ---- Gangs (setup)
  function fighterHtml(gi, fi, f) {
    const K = `gangs.${gi}.fighters.${fi}`;
    return `<details class="tr-fighter"${f.name ? '' : ' open'}><summary><img src="${attr(f.photo || BLANK)}" alt=""><span>${esc(f.name || 'New fighter')}</span><small>${esc(f.type)}${f.out ? ' · out of the gang' : ''}</small><b>${n(f.cost)}</b></summary>
      <div class="pe-grid"><label class="pe-f">Name${inp(`${K}.name`, f.name)}</label><label class="pe-f">Type${inp(`${K}.type`, f.type, 'placeholder="e.g. Ghost (Ganger, Specialist)"')}</label><label class="pe-f">Cost${num(`${K}.cost`, f.cost)}</label></div>
      <div class="tr-stats">${join(STAT_KEYS, k => `<label class="pe-f">${k}${inp(`${K}.stats.${k}`, f.stats[k], 'class="st"')}</label>`)}</div>
      <label class="pe-f">Weapons (one per line: Name | SR | LR | Str | AP | L | traits)${txt(`${K}.weapons`, f.weapons, 3, 'class="mono"')}</label>
      <div class="pe-grid"><label class="pe-f">Wargear${inp(`${K}.wargear`, f.wargear)}</label><label class="pe-f">Skills${inp(`${K}.skills`, f.skills)}</label><label class="pe-f">Lasting injuries${inp(`${K}.injuries`, f.injuries)}</label></div>
      <div class="pe-row"><button type="button" class="pe-add" data-photo="${K}">${f.photo ? 'Change portrait' : 'Add portrait'}</button>
        <label class="pe-check"><input type="checkbox" data-k="${K}.out"${f.out ? ' checked' : ''}> Out of the gang (dead or gone)</label>${del(`gangs.${gi}.fighters`, fi, 'fighter')}</div></details>`;
  }
  function setupHtml() {
    const gangs = join(st.gangs, (g, gi) => { const K = `gangs.${gi}`;
      return `<article class="tr-gang" ${tone(g)}><div class="tr-head"><h3>${esc(g.name || 'New gang')}</h3>${del('gangs', gi, 'gang')}</div>
        <div class="pe-grid"><label class="pe-f">Name${inp(`${K}.name`, g.name)}</label><label class="pe-f">House${inp(`${K}.house`, g.house, 'placeholder="e.g. House Cawdor"')}</label><label class="pe-f">Colour<input type="color" data-k="${K}.colour" value="${attr(g.colour || '#f0b323')}"></label>
          <label class="pe-f">Credits${num(`${K}.credits`, g.credits)}</label><label class="pe-f">Reputation${num(`${K}.rep`, g.rep)}</label><label class="pe-f">Wins${num(`${K}.wins`, g.wins)}</label></div>
        <label class="pe-f">Territories (comma between)${inp(`${K}.territories`, g.territories, 'list="tr-terr"')}</label>
        <label class="pe-f">Gang tactics (comma between)${inp(`${K}.tactics`, g.tactics)}</label>
        <p class="pe-sum">Rating <b>${ratingOf(g)}</b> · ${live(g).length} fighter${live(g).length === 1 ? '' : 's'}</p>
        <div class="tr-fighters">${join(g.fighters, (f, fi) => fighterHtml(gi, fi, f))}</div>${add(`${K}.fighters`, 'Fighter', 'fighter')}</article>`; });
    return `<section id="tr-setup"><h2>Gangs</h2>
      <label class="pe-f tr-name">Campaign name${inp('name', st.name, 'placeholder="e.g. Ash and Shadow"')}</label>
      ${st.gangs.length ? '' : `<p class="pe-note">Start by adding each gang and its fighters, or start from this site's two gangs as they stand after Cycle ${esc(d.editor.prev)}.</p>`}
      <div class="tr-list">${gangs}</div>
      <div class="pe-row">${add('gangs', 'New gang', 'gang')}<button type="button" class="pe-add" id="tr-site">Start from this site's gangs</button></div></section>`;
  }

  // ---- Battles
  function battleHtml(b, i) {
    const K = `cycles.${st.current}.battles.${i}`;
    const sideHtml = gid => {
      const g = gang(gid); if (!g) return '';
      const s = side(b, gid), P = `${K}.sides.${gid}`;
      const inj = join(s.injuries, (x, j) => `<tr><td>${sel(`${P}.injuries.${j}.fighter`, fighterOpts(g), x.fighter)}</td><td>${inp(`${P}.injuries.${j}.injury`, x.injury, 'placeholder="e.g. Head Injury" list="tr-inj"')}</td><td>${del(`${P}.injuries`, j)}</td></tr>`);
      const xp = join(s.xp, (x, j) => `<tr><td>${sel(`${P}.xp.${j}.fighter`, fighterOpts(g), x.fighter)}</td><td>${num(`${P}.xp.${j}.xp`, x.xp, 'class="sm"')}</td><td>${del(`${P}.xp`, j)}</td></tr>`);
      const oth = join(s.other, (x, j) => `<tr><td>${inp(`${P}.other.${j}.source`, x.source, 'placeholder="Source"')}</td><td>${num(`${P}.other.${j}.credits`, x.credits, 'class="sm"')}</td><td>${del(`${P}.other`, j)}</td></tr>`);
      return `<div class="tr-side" ${tone(g)}><h4>${esc(g.name)}</h4>
        <div class="pe-grid"><label class="pe-f">Reputation change${num(`${P}.rep`, s.rep)}</label><label class="pe-f">Win/loss income${num(`${P}.winIncome`, s.winIncome)}</label><label class="pe-f">Side job income${num(`${P}.sideIncome`, s.sideIncome)}</label></div>
        <h5>Lasting injuries</h5>${table(['Fighter', 'Injury'], inj, add(`${P}.injuries`, 'Injury', 'injury'))}
        <h5>Experience</h5>${table(['Fighter', 'XP'], xp, add(`${P}.xp`, 'XP', 'xp'))}
        <h5>Other income</h5>${table(['Source', 'Credits'], oth, add(`${P}.other`, 'Income', 'income'))}</div>`;
    };
    return `<article class="tr-battle"><div class="tr-head"><h3>${esc(b.name || `Battle ${i + 1}`)}</h3>${del(`cycles.${st.current}.battles`, i, 'battle')}</div>
      <div class="pe-grid">
        <label class="pe-f">Name${inp(`${K}.name`, b.name, 'placeholder="e.g. The Wormways War"')}</label>
        <label class="pe-f">Challenger${sel(`${K}.a`, gangOpts, b.a)}</label>
        <label class="pe-f">Challenged${sel(`${K}.b`, gangOpts, b.b)}</label>
        <label class="pe-f">At stake${inp(`${K}.stake`, b.stake, 'list="tr-terr" placeholder="Territory"')}</label>
        <label class="pe-f">Result${sel(`${K}.winner`, [['', 'Not played'], ...[b.a, b.b].filter(gang).map(id => [id, `${gang(id).name} won`]), ['draw', 'Draw']], b.winner)}</label>
      </div><div class="tr-sides">${sideHtml(b.a)}${b.b !== b.a ? sideHtml(b.b) : ''}</div></article>`;
  }

  // ---- Post-cycle
  function postHtml(g) {
    const P = post(g), B = fromBattles(g), K = `cycles.${st.current}.post.${g.id}`, gid = g.id;
    const forList = [['', 'Choose…'], ...live(g).map(f => f.name), ...P.recruits.filter(r => r.name).map(r => r.name), 'Gang stash'];
    const actions = join(live(g), f => `<tr><td>${esc(f.name)}</td><td>${inp(`${K}.actions.${f.id}.injuries`, P.actions[f.id]?.injuries, `placeholder="${attr((B.injuries[f.id] || []).join(', ') || '–')}"`)}</td><td>${sel(`${K}.actions.${f.id}.action`, ACTIONS, P.actions[f.id]?.action || 'To come')}</td><td></td></tr>`);
    const battles = B.lines.length ? join(B.lines, l => `<tr><td>${esc(l.source)}</td><td>${plus(l.credits)}</td><td></td></tr>`) : '<tr><td colspan="3" class="pe-hint">None recorded yet.</td></tr>';
    const terr = join(P.territories, (t, i) => `<tr><td>${inp(`${K}.territories.${i}.name`, t.name, 'list="tr-terr"')}</td>
      <td>${sel(`${K}.territories.${i}.mode`, [['income', 'Income'], ['boon', 'Boon instead']], t.mode)}</td>
      <td>${num(`${K}.territories.${i}.income`, t.income, 'class="sm"')}</td><td>${inp(`${K}.territories.${i}.boon`, t.boon, 'placeholder="Boon taken"')}</td><td>${del(`${K}.territories`, i)}</td></tr>`);
    const adv = join(P.adv, (a, i) => `<tr><td>${sel(`${K}.adv.${i}.fighter`, fighterOpts(g), a.fighter)}</td>
      <td>${num(`${K}.adv.${i}.xp`, a.xp, 'class="sm"')}</td><td>${inp(`${K}.adv.${i}.range`, a.range, 'class="sm" placeholder="e.g. 19–24"')}</td><td>${num(`${K}.adv.${i}.roll`, a.roll, 'class="sm"')}</td>
      <td>${sel(`${K}.adv.${i}.kind`, KINDS, a.kind)}</td><td>${inp(`${K}.adv.${i}.name`, a.name, 'placeholder="Skill or power"')}</td><td>${num(`${K}.adv.${i}.cost`, a.cost, 'class="sm"')}</td><td>${del(`${K}.adv`, i)}</td></tr>`);
    const rec = join(P.recruits, (r, i) => `<tr><td>${inp(`${K}.recruits.${i}.name`, r.name, 'placeholder="Name"')}</td><td>${inp(`${K}.recruits.${i}.type`, r.type, 'placeholder="e.g. Ghost (Ganger)"')}</td>
      <td>${num(`${K}.recruits.${i}.price`, r.price, 'class="sm"')}</td><td>${num(`${K}.recruits.${i}.discount`, r.discount, 'class="sm"')}</td><td>${inp(`${K}.recruits.${i}.note`, r.note, 'placeholder="e.g. Settlement"')}</td>
      <td class="pe-ph">${r.photo ? `<img src="${attr(r.photo)}" alt="${attr(r.name || 'Recruit')} portrait">` : ''}<button type="button" class="pe-add" data-photo="${K}.recruits.${i}">${r.photo ? 'Change' : 'Photo'}</button></td><td>${del(`${K}.recruits`, i)}</td></tr>`);
    const buy = join(P.purchases, (p, i) => `<tr><td>${inp(`${K}.purchases.${i}.item`, p.item, 'placeholder="Item"')}</td><td>${sel(`${K}.purchases.${i}.for`, forList, p.for)}</td>
      <td>${sel(`${K}.purchases.${i}.source`, SOURCES, p.source)}</td><td>${num(`${K}.purchases.${i}.cost`, p.cost, 'class="sm"')}</td>
      <td class="c"><input type="checkbox" data-k="${K}.purchases.${i}.rating"${p.rating ? ' checked' : ''} aria-label="Adds to the gang rating"></td><td>${del(`${K}.purchases`, i)}</td></tr>`);
    const sales = join(P.sales, (x, i) => `<tr><td>${inp(`${K}.sales.${i}.item`, x.item, 'placeholder="Item"')}</td><td>${sel(`${K}.sales.${i}.fighter`, forList, x.fighter)}</td><td>${num(`${K}.sales.${i}.credits`, x.credits, 'class="sm"')}</td><td>${del(`${K}.sales`, i)}</td></tr>`);
    return `<section class="pe-gang" ${tone(g)} id="pe-${attr(gid)}">
  <h2>${esc(g.name)}</h2>
  <label class="pe-f">Story (blank line between paragraphs)${txt(`${K}.story`, P.story, 3)}</label>
  <h3>Post-cycle actions</h3><p class="pe-hint">Lasting injuries from the battles show greyed in; type to replace them.</p>${table(['Fighter', 'Lasting injuries', 'Action'], actions)}
  <h3>Income</h3><p class="pe-sum">Carried over <b>${n(g.credits)}</b> · Reputation at the start <b>${n(g.rep)}</b> (set on the gang)</p>
  <h4>From the battles</h4>${table(['Source', 'Credits'], battles)}
  <h4>Territories</h4>${table(['Territory', 'Take', 'Income', 'Boon'], terr, add(`${K}.territories`, 'Territory', 'territory') + ` <button type="button" class="pe-add" data-stakes="${attr(gid)}">Apply battle stakes</button>`)}
  <p class="pe-sum">Work Territory: <b data-o="${attr(gid)}.work"></b> · Reputation: <b data-o="${attr(gid)}.rep"></b> · Total income: <b data-o="${attr(gid)}.income"></b></p>
  <h3>XP advancements</h3>${table(['Fighter', 'XP', 'Band', 'Roll', 'Advancement', 'Skill', 'Cost'], adv, add(`${K}.adv`, 'Advancement', 'adv'))}
  <h3>Trading post</h3>
  <h4>Recruits</h4>${table(['Name', 'Type', 'Price', 'Discount', 'Discount from', 'Portrait'], rec, add(`${K}.recruits`, 'Recruit', 'recruit'))}
  <h4>Purchases</h4>${table(['Item', 'For', 'Source', 'Cost', 'On card'], buy, add(`${K}.purchases`, 'Purchase', 'purchase'))}
  <h4>Sales</h4>${table(['Item', 'From', 'Credits'], sales, add(`${K}.sales`, 'Sale', 'sale'))}
  <h3>Gang sheet</h3>
  <div class="pe-grid"><label class="pe-f">Rating adjustment${num(`${K}.ratingAdj`, P.ratingAdj)}</label></div>
  <dl class="pe-sheet"><div><dt>Rating</dt><dd data-o="${attr(gid)}.rating"></dd></div><div><dt>Wins</dt><dd data-o="${attr(gid)}.wins"></dd></div><div><dt>Reputation</dt><dd data-o="${attr(gid)}.rep"></dd></div><div><dt>Credits</dt><dd data-o="${attr(gid)}.credits"></dd></div><div><dt>Fighters</dt><dd data-o="${attr(gid)}.fighters"></dd></div></dl>
  <p class="pe-sum">Spent: recruits <b data-o="${attr(gid)}.rec"></b> · purchases <b data-o="${attr(gid)}.buy"></b> · sales <b data-o="${attr(gid)}.sell"></b></p>
</section>`;
  }

  // ---- Gang lists
  const cardOf = (g, f, extra = []) => ({ name: f.name || 'Unnamed', portrait: f.photo || BLANK, type: esc(f.type), cost: String(n(f.cost)),
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, esc(f.stats?.[k] ?? '') || '–'])), weapons: weaponsOf(f.weapons),
    foot: [['Wargear', f.wargear], ['Skills', f.skills], ['Lasting injuries', f.injuries]].filter(([, v]) => v).map(([label, v]) => ({ label, text: esc(v) })).concat(extra) });
  function listsHtml() {
    return join(st.gangs, g => {
      const P = post(g), B = fromBattles(g);
      const cards = join(live(g), f => {
        const extra = [], inj = P.actions[f.id]?.injuries || (B.injuries[f.id] || []).join(', ');
        if (inj) extra.push({ label: 'New injuries', text: esc(inj) });
        const adv = P.adv.filter(a => a.fighter === f.id && a.kind).map(a => a.kind.startsWith('stat:') ? '+1 ' + a.kind.slice(5) : a.name || '?');
        if (adv.length) extra.push({ label: 'Advancements', text: esc(adv.join(', ')) });
        const act = P.actions[f.id]?.action; if (act && act !== 'To come') extra.push({ label: 'Post-cycle', text: esc(act) });
        const c = cardOf(g, f, extra); c.stats.XP = String(xpNow(g, f));
        return fighterCard(c);
      }) + join(P.recruits.filter(r => r.name), r => fighterCard({ ...cardOf(g, { name: r.name, type: r.type || 'New recruit', cost: r.price, photo: r.photo, stats: {} }), nameClass: 'new-i', stats: {},
        foot: [{ label: 'New recruit', text: 'Fill in their card once this cycle is finished' }] }));
      return `<div class="gang ${g.cls || ''}" ${g.cls ? '' : tone(g)}><div class="gang-head">${g.portrait ? `<img class="portrait" src="${attr(g.portrait)}" alt="">` : ''}<div><h3>${esc(g.name || 'Unnamed gang')}</h3><p class="house">${esc(g.house)}</p></div></div>
        <p class="pe-sum">Rating <b>${totals(g).rating}</b> · Credits <b>${totals(g).credits}</b> · Reputation <b>${totals(g).rep}</b>${g.territories ? ` · ${esc(g.territories)}` : ''}</p><div class="fighters">${cards || '<p class="pe-hint">No fighters yet.</p>'}</div></div>`;
    });
  }

  // ---- one cycle's results, in the shape data/post/<cycle>.json uses
  function buildCycle() {
    const c = cyc(), N = s => `<span class="new-i">${esc(s)}</span>`;
    return {
      campaign: st.name, cycle: c.n,
      battles: c.battles.map(b => ({ name: b.name, challenger: gang(b.a)?.name || '', challenged: gang(b.b)?.name || '', stake: b.stake,
        result: b.winner === 'draw' ? 'Draw' : gang(b.winner)?.name ? `${gang(b.winner).name} won` : 'Not played',
        sides: Object.fromEntries([b.a, b.b].filter(gang).map(id => { const s = side(b, id), g = gang(id);
          return [g.name, { reputation: n(s.rep), winIncome: n(s.winIncome), sideJobIncome: n(s.sideIncome), otherIncome: s.other, injuries: s.injuries.map(x => ({ fighter: fname(g, x.fighter), injury: x.injury })), xp: s.xp.map(x => ({ fighter: fname(g, x.fighter), xp: n(x.xp) })) }]; })) })),
      post: { page: 'post', title: `Cycle ${c.n} Post-cycle`,
        gangs: st.gangs.map(g => {
          const P = post(g), T = totals(g);
          const income = [{ source: 'Carried over from previous cycle', credits: String(n(g.credits)) }, ...T.B.lines.map(l => ({ source: l.source, credits: plus(l.credits) })),
            ...P.territories.map(t => t.mode === 'income' ? { source: t.name, credits: plus(n(t.income)) } : { source: t.name, credits: '0', recruitment: t.boon || 'Boon taken' }),
            ...(T.work ? [{ source: `Work Territory (${T.work} × 15)`, credits: plus(T.work * 15) }] : []), { source: `Reputation (${T.rep} × 10)`, credits: plus(T.rep * 10) }];
          return { gang: g.name, story: P.story ? P.story.split(/\n\s*\n/) : [],
            actions: live(g).map(f => ({ fighter: f.name, injuries: P.actions[f.id]?.injuries || (T.B.injuries[f.id] || []).join(', ') || '–', action: P.actions[f.id]?.action || 'To come' })),
            income, incomeTotal: String(T.income),
            advancements: P.adv.filter(a => a.fighter).map(a => { const [k, s] = a.kind.split(':'), stat = STATS.find(x => x[0] === s)?.[1];
              const what = k === 'stat' ? N('+1 ' + stat) : k === 'primary' ? `${N(a.name || '?')} (primary skill)` : k === 'secondary' ? `${N(a.name || '?')} (secondary skill)` : k === 'power' ? `${N(a.name || '?')} (Psychoteric power)` : N(a.name || '?');
              return { fighter: fname(g, a.fighter), xp: String(a.xp), range: a.range, roll: String(a.roll), advancement: what, cost: plus(n(a.cost)) }; }),
            recruits: P.recruits.map(r => ({ recruit: [r.name, r.type].filter(Boolean).join(', '), discount: n(r.discount) ? `${n(r.discount)} credits${r.note ? ', ' + r.note : ''}` : '–',
              cost: n(r.discount) ? `${n(r.price)} – ${n(r.discount)} = ${Math.max(0, n(r.price) - n(r.discount))}` : String(n(r.price)) })),
            purchases: P.purchases.map(p => ({ item: p.item, for: p.for, source: p.source, cost: String(n(p.cost)), tp: '–' })),
            sales: P.sales.map(x => ({ item: x.item, fighter: x.fighter, credits: String(n(x.credits)) })),
            tradingTotal: { recruit: [String(T.rec), '–'], purchase: [String(T.buy), '–'], sell: [String(T.sell), '–'], total: [String(T.spent), '0'] },
            sheet: [['Rating', String(T.rating)], ['Wins', String(T.wins)], ['Reputation', String(T.rep)], ['Credits', String(T.credits)], ['Fighters', String(T.fighters)]],
            territories: P.territories.map(t => t.name), xp: Object.fromEntries(live(g).map(f => [f.name, xpNow(g, f)])),
            newFighters: P.recruits.filter(r => r.name).map(r => ({ name: r.name, type: r.type, cost: n(r.price), ...(r.photo ? { portrait: r.photo } : {}) })) };
        }) },
    };
  }

  // ---- finish the cycle: results go onto the gangs and the next cycle opens
  const better = (k, v) => {   // +1 to a stat as the cards show it
    const s = String(v ?? '');
    if (/^\d+\+$/.test(s)) return Math.max(2, n(s) - 1) + '+';
    if (/^\d+"$/.test(s)) return (n(s) + 1) + '"';
    return s === '' ? s : String(n(s) + 1);
  };
  function finish() {
    const c = cyc();
    for (const g of st.gangs) {
      const P = post(g), T = totals(g), B = T.B;
      for (const f of live(g)) {
        f.stats.XP = String(xpNow(g, f));
        const inj = P.actions[f.id]?.injuries || (B.injuries[f.id] || []).join(', ');
        if (inj && inj !== '–') f.injuries = [f.injuries, inj].filter(Boolean).join(', ');
        for (const a of P.adv.filter(x => x.fighter === f.id && x.kind)) {
          if (a.kind.startsWith('stat:')) { const k = a.kind.slice(5); f.stats[k] = better(k, f.stats[k]); }
          else if (a.name) f.skills = [f.skills, a.name].filter(Boolean).join(', ');
          f.cost = n(f.cost) + n(a.cost);
        }
      }
      for (const r of P.recruits.filter(x => x.name)) g.fighters.push({ ...newFighter(), name: r.name, type: r.type, cost: n(r.price), photo: r.photo || '' });
      for (const p of P.purchases.filter(x => x.item && x.rating)) {
        const f = g.fighters.find(x => x.name === p.for);
        if (f) { f.cost = n(f.cost) + n(p.cost); f.wargear = [f.wargear, p.item].filter(Boolean).join(', '); }
      }
      g.credits = T.credits; g.rep = T.rep; g.wins = T.wins; g.territories = P.territories.map(t => t.name).filter(Boolean).join(', ');
    }
    c.closed = true; c.result = buildCycle();
    const next = String(+c.n + 1); st.cycles[next] ??= newCycle(next); st.current = next;
  }

  // ---- views: the landing page, and one page each for gangs, a battle, a gang's post-cycle and the next cycle
  const view = () => decodeURIComponent(location.hash.slice(1));
  const back = '<p class="tr-back"><a href="#">← Tracker</a></p>';
  function landingHtml(c, cycles) {
    const shut = c.closed, ok = st.gangs.length > 1;
    const tile = (href, numText, title, sub, extra = '') => `<a class="tr-tile" href="${href}" ${extra}><span class="num">${numText}</span><b>${title}</b><span>${sub}</span></a>`;
    const battles = c.battles.length ? join(c.battles, (b, i) => `<li><a href="#battle-${i}">${esc(b.name || `Battle ${i + 1}`)}</a><span>${esc(gang(b.a)?.name || '?')} v ${esc(gang(b.b)?.name || '?')} · ${b.winner === 'draw' ? 'Draw' : gang(b.winner) ? esc(gang(b.winner).name) + ' won' : 'Not played'}</span></li>`) : '<li class="pe-hint">No battles yet.</li>';
    const posts = join(st.gangs, g => { const P = c.post[g.id], T = totals(g);
      const started = P && (Object.values(P.actions).some(a => a.action && a.action !== 'To come') || P.adv.length || P.recruits.length || P.purchases.length);
      return `<li ${tone(g)}><a href="#post-${attr(g.id)}">${esc(g.name || 'Unnamed gang')}</a><span>${started ? 'Started' : 'Not started'} · ${T.credits} credits · rating ${T.rating}</span></li>`; });
    return `<div class="tr-cycle"><label class="pe-f">Cycle <select id="tr-cyc">${join(cycles, k => opt(k, `Cycle ${k}${st.cycles[k].closed ? ' (finished)' : ''}`, st.current))}</select></label>
      ${shut ? '<p class="pe-hint">This cycle is finished: its results are on the gangs. Pick the latest cycle to carry on.</p>' : ''}</div>
<nav class="tr-tiles" aria-label="Tracker">
  ${tile('#gangs', '1', 'Set up gangs', st.gangs.length ? `${st.gangs.length} gang${st.gangs.length === 1 ? '' : 's'}: ${esc(st.gangs.map(g => g.name || 'Unnamed').join(', '))}` : 'Create each gang and its fighters')}
  ${shut || !ok ? tile('#', '2', 'Add battle', ok ? 'This cycle is finished' : 'Needs two gangs first', 'aria-disabled="true" data-off') : `<button type="button" class="tr-tile" id="tr-newbattle"><span class="num">2</span><b>Add battle</b><span>One battle's result in Cycle ${esc(c.n)}</span></button>`}
  ${tile(shut || !st.gangs.length ? '#' : '#post', '3', 'Add post-cycle', st.gangs.length ? `For one gang, Cycle ${esc(c.n)}` : 'Needs a gang first', shut || !st.gangs.length ? 'aria-disabled="true" data-off' : '')}
  ${tile(shut || !st.gangs.length ? '#' : '#next', '4', 'Next cycle', shut ? 'This cycle is finished' : `Finish Cycle ${esc(c.n)} and start Cycle ${+c.n + 1}`, shut || !st.gangs.length ? 'aria-disabled="true" data-off' : '')}
  ${tile(st.gangs.length ? '#rosters' : '#', '5', 'Gang rosters', st.gangs.length ? 'Every fighter as they stand now' : 'Needs a gang first', st.gangs.length ? '' : 'aria-disabled="true" data-off')}
</nav>
<div class="tr-status"><section><h2>Cycle ${esc(c.n)} battles</h2><ul class="tr-links">${battles}</ul></section>
<section><h2>Cycle ${esc(c.n)} post-cycle</h2><ul class="tr-links">${posts || '<li class="pe-hint">No gangs yet.</li>'}</ul></section></div>
<section id="tr-export"><h2>Export</h2>
  <p class="pe-hint">Cycle ${esc(c.n)} as JSON: its battles, and the post-cycle phase in the shape the site's post-cycle pages use, with each fighter's XP and new recruits with their portraits. "Whole campaign" is everything here, to load into another browser.</p>
  <textarea id="pe-json" rows="10" spellcheck="false" aria-label="Export JSON"></textarea>
  <div class="pe-row"><button type="button" id="pe-copy">Copy</button><button type="button" id="pe-dl">Download cycle</button><button type="button" id="tr-all">Download whole campaign</button><button type="button" id="pe-load">Load pasted campaign</button><button type="button" id="pe-reset" class="danger">Clear everything</button></div></section>`;
  }
  function nextHtml(c) {
    const rows = join(st.gangs, g => { const T = totals(g);
      return `<tr><td>${esc(g.name)}</td><td>${T.rating}</td><td>${T.credits}</td><td>${T.rep}</td><td>${T.wins}</td><td>${T.fighters}</td><td></td></tr>`; });
    const open = c.battles.filter(b => !b.winner).length;
    return `${back}<section><h2>Finish Cycle ${esc(c.n)}</h2>
      <p class="pe-note">Finishing writes the cycle onto the gangs: XP, new injuries, advancements, skills and costs, recruits as new fighters, purchases onto fighters, and each gang's credits, reputation, wins and territories. Cycle ${esc(c.n)} is then kept as it was, and Cycle ${+c.n + 1} opens.</p>
      ${open ? `<p class="pe-note tr-warn">${open} battle${open === 1 ? ' has' : 's have'} no result yet.</p>` : ''}
      ${table(['Gang', 'Rating', 'Credits', 'Reputation', 'Wins', 'Fighters'], rows)}
      <div class="pe-row"><button type="button" id="tr-finish">Finish Cycle ${esc(c.n)} and start Cycle ${+c.n + 1}</button></div></section>`;
  }
  function draw() {
    const cycles = Object.keys(st.cycles).sort((a, b) => a - b);
    const c = cyc(), shut = c.closed, v = view();
    let body;
    if (v === 'gangs') body = back + setupHtml();
    else if (/^battle-\d+$/.test(v) && c.battles[+v.slice(7)]) body = `${back}<fieldset class="tr-run"${shut ? ' disabled' : ''}><section id="tr-battles"><h2>Cycle ${esc(c.n)}: battle</h2>${battleHtml(c.battles[+v.slice(7)], +v.slice(7))}</section></fieldset>`;
    else if (v === 'post') body = `${back}<section><h2>Cycle ${esc(c.n)}: post-cycle</h2><p class="pe-note">Choose a gang.</p><nav class="tr-tiles">${join(st.gangs, g => `<a class="tr-tile" href="#post-${attr(g.id)}" ${tone(g)}><b>${esc(g.name || 'Unnamed gang')}</b><span>${esc(g.house)}</span></a>`)}</nav></section>`;
    else if (v.startsWith('post-') && gang(v.slice(5))) body = `${back}<fieldset class="tr-run"${shut ? ' disabled' : ''}><section id="tr-post"><h2>Cycle ${esc(c.n)}: post-cycle</h2>${postHtml(gang(v.slice(5)))}</section></fieldset>`;
    else if (v === 'next' && !shut) body = nextHtml(c);
    else if (v === 'rosters') body = `${back}<section id="tr-gangs"><h2>Gang rosters</h2><p class="pe-note">Each gang as it stands now, with Cycle ${esc(c.n)}'s battles and post-cycle so far: new XP, injuries and advancements show on the cards, and new recruits are added.</p><div class="gangs">${listsHtml() || '<p class="pe-hint">No gangs yet.</p>'}</div></section>`;
    else body = landingHtml(c, cycles);
    $('pe-body').innerHTML = `<datalist id="tr-terr">${join(d.territoryNames, t => `<option value="${attr(t)}">`)}</datalist><datalist id="tr-inj">${join(INJURIES, t => `<option value="${attr(t)}">`)}</datalist>
<p class="pe-msg" id="pe-msg" role="status"></p>${body}
<p class="pe-hint tr-foot">Everything here is saved in this browser only. Use Export on the tracker's front page to keep or share a cycle.</p>`;
    outputs();
  }
  window.addEventListener('hashchange', () => { draw(); scrollTo(0, 0); });
  function outputs() {
    for (const g of st.gangs) {
      const T = totals(g);
      document.querySelectorAll(`[data-o^="${CSS.escape(g.id)}."]`).forEach(el => { el.textContent = T[el.dataset.o.slice(g.id.length + 1)]; });
    }
    const c = cyc();
    if ($('pe-json')) $('pe-json').value = JSON.stringify(c.closed && c.result ? c.result : buildCycle(), null, 1);
    save();
  }

  const path = k => k.split('.');
  const setAt = (k, v) => { const p = path(k); let o = st; for (const x of p.slice(0, -1)) o = o[x] ??= {}; o[p.at(-1)] = v; };
  const getAt = k => path(k).reduce((o, x) => o?.[x], st);
  // changes that alter names, lists or which panels show redraw; plain typing only recomputes
  const REDRAW = [/\.name$/, /^gangs\.\d+\.(colour|territories|house)$/, /\.fighters\.\d+\.(type|cost|out|photo)$/, /\.battles\.\d+\.(a|b|winner)$/, /\.actions\./, /\.adv\.\d+\.(kind|fighter)$/,
    /\.sides\.[^.]+\.(injuries|xp)\.\d+\./, /\.stats\./, /\.(weapons|wargear|skills|injuries)$/];
  $('pe').addEventListener('input', e => {
    const el = e.target; if (!el.dataset.k) return;
    setAt(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : n(el.value)) : el.value);
    outputs();
  });
  $('pe').addEventListener('change', e => {
    const k = e.target.dataset.k || '';
    if (e.target.id === 'tr-cyc') { st.current = e.target.value; draw(); return; }
    const m = k.match(/^cycles\.[^.]+\.post\.([^.]+)\.adv\.(\d+)\.fighter$/);
    if (m) { const g = gang(m[1]), a = post(g).adv[+m[2]], f = g.fighters.find(x => x.id === a.fighter); if (f) a.xp = xpNow(g, f); }
    const doc = k.match(/^(.+\.purchases\.\d+)\.source$/);
    if (doc && e.target.value === 'Doc') setAt(doc[1] + '.rating', false);
    if (m || doc || REDRAW.some(r => r.test(k))) later();
  });
  // redraw once the click that caused the change has landed, so it isn't swallowed
  let t0 = null;
  const later = () => { clearTimeout(t0); t0 = setTimeout(() => {
    const y = scrollY, f = document.activeElement?.dataset?.k, open = [...document.querySelectorAll('details[open] [data-k$=".name"]')].map(x => x.dataset.k);
    draw(); open.forEach(k => document.querySelector(`[data-k="${k}"]`)?.closest('details')?.setAttribute('open', ''));
    scrollTo(0, y); if (f) document.querySelector(`[data-k="${f}"]`)?.focus(); }, 150); };
  const NEW = { gang: newGang, fighter: newFighter, battle: () => ({ name: '', a: st.gangs[0]?.id || '', b: st.gangs[1]?.id || '', stake: '', winner: '', sides: {} }),
    injury: () => ({ fighter: '', injury: '' }), xp: () => ({ fighter: '', xp: 1 }), income: () => ({ source: '', credits: 0 }),
    territory: () => ({ name: '', mode: 'income', income: 0, boon: '' }), adv: () => ({ fighter: '', xp: '', range: '', roll: '', kind: '', name: '', cost: 0 }),
    recruit: () => ({ name: '', type: '', price: 0, discount: 0, note: '' }), purchase: () => ({ item: '', for: '', source: 'Gang list', cost: 0, rating: true }), sale: () => ({ item: '', fighter: '', credits: 0 }) };
  $('pe').addEventListener('click', e => {
    const a = e.target.closest('[data-add]'), x = e.target.closest('[data-del]'), sk = e.target.closest('[data-stakes]'), ph = e.target.closest('[data-photo]');
    if (a) { (getAt(a.dataset.add) ?? setAt(a.dataset.add, []) ?? getAt(a.dataset.add)).push(NEW[a.dataset.kind]()); draw(); }
    else if (x) { const w = x.getAttribute('aria-label'); if (/line$/.test(w) || confirm(`${w}?`)) { getAt(x.dataset.del).splice(+x.dataset.i, 1); if (w === 'Remove battle') location.hash = ''; draw(); } }
    else if (ph) { crop = { key: ph.dataset.photo }; $('pe-file').click(); }
    else if (sk) {   // a won stake moves to the winner's territories, a lost one leaves
      const g = gang(sk.dataset.stakes), P = post(g); let moved = 0;
      for (const b of cyc().battles) {
        if (!b.stake || !b.winner || b.winner === 'draw' || (b.a !== g.id && b.b !== g.id)) continue;
        const has = P.territories.some(t => t.name === b.stake);
        if (b.winner === g.id && !has) { P.territories.push({ name: b.stake, mode: 'income', income: incomeOf(b.stake), boon: boonOf(b.stake) }); moved++; }
        if (b.winner !== g.id && has) { P.territories = P.territories.filter(t => t.name !== b.stake); moved++; }
      }
      draw(); msg(moved ? `${moved} territor${moved === 1 ? 'y' : 'ies'} updated from the battle results.` : 'The territories already match the battle results.');
    }
    else if (e.target.id === 'tr-site') {
      if (st.gangs.length && !confirm('Replace the gangs and cycles here with this site\'s two gangs?')) return;
      st = fromSite(d); draw(); msg(`Loaded ${st.gangs.map(g => g.name).join(' and ')} as they stand after Cycle ${d.editor.prev}.`);
    }
    else if (e.target.closest('#tr-newbattle')) {
      const c = cyc(); c.battles.push(NEW.battle()); location.hash = 'battle-' + (c.battles.length - 1);
    }
    else if (e.target.closest('[data-off]')) e.preventDefault();
    else if (e.target.id === 'tr-finish') {
      if (!confirm(`Finish Cycle ${cyc().n}? XP, injuries, advancements, recruits, purchases, credits, reputation, wins and territories are written onto the gangs.`)) return;
      finish(); location.hash = ''; draw(); scrollTo(0, 0); msg('Cycle finished.');
    }
    else if (e.target.id === 'pe-copy') navigator.clipboard.writeText($('pe-json').value).then(() => msg('Copied.'), () => { $('pe-json').select(); msg('Selected: copy it with Ctrl+C.'); });
    else if (e.target.id === 'pe-dl') download(`${slug()}-cycle-${cyc().n}.json`, $('pe-json').value);
    else if (e.target.id === 'tr-all') download(`${slug()}-campaign.json`, JSON.stringify({ tracker: st }, null, 1));
    else if (e.target.id === 'pe-load') {
      try { const j = JSON.parse($('pe-json').value); if (!j.tracker?.gangs) throw new Error(); st = j.tracker; draw(); msg('Campaign loaded.'); }
      catch (err) { msg('Paste a "whole campaign" download here to load it.'); }
    } else if (e.target.id === 'pe-reset' && confirm('Clear the whole campaign from this browser? Download it first if you want to keep it.')) {
      st = { name: '', gangs: [], cycles: { 1: newCycle('1') }, current: '1' }; draw(); msg('Cleared.');
    }
  });
  const slug = () => (st.name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
  function download(file, text) {
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([text + '\n'], { type: 'application/json' }));
    l.download = file; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000);
  }
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
  draw();
}
