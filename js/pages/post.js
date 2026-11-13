// Post-cycle page: data/post/<cycle>.json
// results of the cycle's battles, then for each gang: story, post-cycle actions,
// income, XP advancements, trading post and the full roster afterwards.
import { esc, attr, md, join, pageHref } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fighterCard } from '../fighter.js';
import { sheet, assets, roll } from '../blocks.js';

const ACTION_STYLE = { 'Recovery': 'act-rec', 'Work Territory': 'act-work', 'Critical Injury': 'act-crit', 'Captured': 'act-capt' };
const td = (html, c) => `<td${c ? ` class="${c}"` : ''}>${md(html)}</td>`;
const th = (html, c) => `<th${c ? ` class="${c}"` : ''}>${html}</th>`;
const tr = (cells, c) => `<tr${c ? ` class="${c}"` : ''}>${cells}</tr>`;
const ledger = (label, cls, head, rows) =>
  `<div class="table-scroll" tabindex="0" role="region" aria-label="${attr(label)}"><table class="${cls}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
const orNone = (rows, n, f) => rows.length ? join(rows, f) : tr(td('None') + join(Array(n - 1).fill(0), (_, i) => td('–', i === n - 2 ? 'num' : '')));

function gangBlock(e, d) {
  const g = d.gangInfo[e.gang], N = g.name;
  const actions = ledger(`${N} post-cycle actions`, 'ledger post', th('Fighter') + th('Lasting injuries', 'm-hide') + th('Action'),
    join(e.actions, a => tr(td(a.fighter) + td(a.injuries, 'm-hide') + td(ACTION_STYLE[a.action] ? `<span class="${ACTION_STYLE[a.action]}">${a.action}</span>` : a.action))));
  const income = ledger(`${N} income`, 'ledger income inc3', th('Source') + th('Recruitment', 'm-hide') + th('Credits', 'num'),
    join(e.income, r => tr(td(r.source) + td(r.recruitment ?? '–', 'm-hide') +
      td(r.recruitment ? `<span class="d-only">${r.credits}</span><span class="m-only">${r.recruitment}</span>` : r.credits, 'num'))) +
    tr(td('Total credits') + td('', 'm-hide') + td(e.incomeTotal ?? 'To come', 'num'), 'tot'));
  const todo = '<p class="todo">To come.</p>';
  const adv = !e.advancements ? todo : ledger(`${N} XP advancements`, 'ledger adv',
    th('Fighter') + th('Total XP', 'num m-hide') + th('Advances to', 'num m-hide') + th('Roll', 'num') + th('Advancement') + th('Cost', 'num m-hide'),
    join(e.advancements, a => tr(td(a.fighter) + td(a.xp, 'num m-hide') + td(a.range, 'num m-hide') + td(a.roll, 'num') +
      td(`${a.advancement}<span class="m-only">. Cost ${a.cost}</span>`) + td(a.cost, 'num m-hide'))));
  const recruits = !e.tradingTotal ? '' : ledger(`${N} recruits`, 'ledger income inc3', th('Recruit') + th('Discount') + th('Cost', 'num'),
    orNone(e.recruits, 3, r => tr(td(r.recruit) + td(r.discount) + td(r.cost, 'num'))));
  const buys = !e.tradingTotal ? '' : ledger(`${N} equipment`, 'ledger income inc4', th('Item') + th('For', 'm-hide') + th('Source', 'm-hide') + th('Cost', 'num') + th('TP', 'num'),
    e.purchases.length ? join(e.purchases, p => tr(td(p.item) + td(p.for, 'm-hide') + td(p.source, 'm-hide') + td(p.cost, 'num') + td(p.tp, 'num')))
      : tr(td('None') + td('–', 'm-hide') + td('–', 'm-hide') + td('–', 'num') + td('–', 'num')));
  const sales = !e.tradingTotal ? '' : ledger(`${N} sales`, 'ledger income inc3', th('Item') + th('Fighter') + th('Credits', 'num'),
    orNone(e.sales, 3, s => tr(td(s.item) + td(s.fighter) + td(s.credits, 'num'))));
  const T = e.tradingTotal;
  const totals = !T ? '' : ledger(`${N} tptotal`, 'ledger income inc3', th('Section') + th('Credits', 'num') + th('TP', 'num'),
    [['Recruit new models', T.recruit], ['Purchase equipment', T.purchase], ['Sell unwanted items', T.sell]].map(([l, [c, t]]) => tr(td(l) + td(c, 'num') + td(t, 'num'))).join('') +
    tr(td('Total spent') + td(T.total[0], 'num') + td(T.total[1], 'num'), 'tot'));
  const roster = sheet({ sheet: e.roster.sheet, class: 'four' }) + '\n' + assets(e.roster.assets) + '\n' +
    `<div class="fighters">${join(e.roster.fighters, id => fighterCard(d.fighters[id]))}</div>`;
  return `<section id="${e.section}"><div class="gang ${g.class}">
<div class="gang-head"><img class="portrait" src="${attr(g.portrait)}" alt="${attr(N)} gang portrait"><div><h2>${esc(N)}</h2><p class="house">${esc(g.house)}</p></div></div>
<div class="prose gang-story">${join(e.story, p => `<p>${md(p)}</p>`)}</div>
<div class="stepblock">
<h3 class="step">Post-cycle actions</h3>
${actions}${e.rolls ? `\n<div class="post-rolls">${join(e.rolls, r => roll(r))}</div>` : ''}
<h3 class="step">Income</h3>
${income}
<h3 class="step">XP advancements</h3>
${adv}
<h3 class="step">Trading post</h3>
${!T ? todo : `<h4 class="tpsub">Recruit new models</h4>
${recruits}
<h4 class="tpsub">Purchase equipment</h4>
${buys}
<h4 class="tpsub">Sell unwanted items</h4>
${sales}
<h4 class="tpsub">Trading post total</h4>
${totals}`}
<h3 class="step">Full gang roster</h3>
${roster}
</div>
</div></section>`;
}

const TODO = [['actions', 'Post-cycle actions'], ['income', 'Income'], ['xp', 'XP advancements'], ['trading', 'Trading post'], ['rosters', 'Full gang rosters']];

export function render(d) {
  document.title = d.title;
  if (d.todo) {   // cycle not played out yet: placeholder sections
    return hero(d.hero) + '\n' + nav(TODO.map(([id, t]) => ({ href: '#' + id, text: t }))) +
      `\n<main class="wrap">\n${join(TODO, ([id, t]) => `<section id="${id}">\n<h2>${t}</h2>\n<p class="todo">To come.</p>\n</section>\n`)}</main>\n`;
  }
  const side = s => Object.values(d.gangInfo).find(g => g.side === s);
  const results = `<section id="results">
<h2>Results</h2>
${ledger(d.results.label, 'ledger results', th('Battle') + th('Challenger') + th('Stakes', 'm-hide') + th('Winner'),
    join(d.results.battles, b => tr(td(`<a href="${attr(pageHref(b.page))}">${esc(b.name)}</a>`) + td(side(b.challenger).name, b.challenger) + td(b.stakes, 'm-hide') + td(side(b.winner).name, b.winner))))}
</section>`;
  const items = [{ href: '#results', text: 'Results' }, ...d.gangs.map(e => ({ href: '#' + e.section, text: d.gangInfo[e.gang].name }))];
  return hero(d.hero) + '\n' + nav(items, 'Page sections') + `\n<main class="wrap">\n${results}\n${join(d.gangs, e => gangBlock(e, d) + '\n')}</main>\n`;
}
