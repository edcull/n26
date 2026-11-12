// Battle report page: data/battles/<id>.json
import { esc, md, join } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fighterCard, fighterPopover } from '../fighter.js';
import { block, blocks, photo, sheet, assets } from '../blocks.js';

function navItems(d) {
  const items = [{ href: '#intro', text: 'Intro', class: 'nav-intro' }, { href: '#setup', text: 'Setup' }, { href: '#gangs', text: 'Gang lists' }];
  const rounds = d.rounds || [];
  if (rounds[0]?.id === 'deployment') items.push({ href: '#deployment', text: 'Deployment' });
  const numbered = rounds.filter(r => /^round-\d+$/.test(r.id));
  if (numbered.length) { items.push({ br: true }); numbered.forEach(r => items.push({ round: r.id.slice(6) })); }
  if (!rounds.length) items.push({ href: '#turns', text: 'Turn by turn' });
  items.push({ href: '#aftermath', text: 'Aftermath' });
  return d.nav || items;
}

function gang(g, d) {
  const parts = join(g.blocks, b => {
    if (b.sheet) return '\n  ' + sheet(b);
    if (b.assets) return '\n  ' + assets(b.assets);
    if (b.panel) return `\n  <details class="${['bench-panel', b.class].filter(Boolean).join(' ')}"><summary>${esc(b.panel)}</summary><div class="fighters">${join(b.fighters, r => fighterCard(d.fighters[r.id], r.class))}</div></details>`;
    if (b.photo) return '\n  ' + photo(b.photo);
    return '\n  ' + block(b);
  });
  return `<div class="gang ${g.class}">
  <div class="gang-head">
    <img class="portrait" src="${g.portrait}" alt="${esc(g.name)} gang portrait">
    <div><h3>${esc(g.name)}</h3><p class="house">${esc(g.house)}</p></div>
  </div>${parts}
</div>`;
}


function round(r, d) {
  return `<article class="round" id="${r.id}">
        <div class="round-no" aria-hidden="true">${esc(r.no)}</div>
        <div class="round-body">
          <div><h3>${md(r.title)}</h3></div>
          ${blocks(r.blocks, { board: d.board })}
        </div>
      </article>`;
}

export function render(d) {
  document.title = d.title;
  const gangOf = {};
  for (const g of d.gangs) for (const b of g.blocks) for (const r of b.fighters || []) gangOf[r.id] ??= g.class;
  const turns = d.rounds.length ? `<div class="rounds">${join(d.rounds, r => round(r, d))}</div>` : blocks(d.turnsBlocks || []);
  return hero({ kicker: d.kicker, cycle: d.cycle, name: d.name, sides: d.sides }) + '\n' + nav(navItems(d)) + `
<main class="wrap">
  <section id="intro">
    <h2>${esc(d.introHeading ?? 'Intro')}</h2>
    <div class="prose">${join(d.intro, p => `<p>${md(p)}</p>`)}</div>
  </section>
  <section id="setup">
    <h2>Setup</h2>
    <div class="setup">
      <dl class="facts">${join(d.setup.facts, ([k, v]) => `<div><dt>${md(k)}</dt><dd>${md(v)}</dd></div>`)}</dl>
      ${blocks(d.setup.blocks)}
    </div>
    ${blocks(d.setupAfter || [])}
  </section>
  <section id="gangs">
    <h2>Gang lists</h2>
    <div class="gangs">${join(d.gangs, g => gang(g, d))}</div>
  </section>
  <section id="turns">
    <h2>Turn by turn</h2>
    ${turns}
  </section>
  <section id="aftermath">
    <h2>Aftermath</h2>
    ${blocks(d.aftermath || [])}
  </section>
</main>
` + join(d.popovers, id => fighterPopover(id, d.fighters[id], gangOf[id]) + '\n');
}
