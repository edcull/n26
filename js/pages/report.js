// Post-cycle, status, setup and home pages: data/pages/<id>.json
// A page is a hero header, optional section nav, and a tree of blocks: layout
// containers {tag, class, attrs, children} holding content blocks.
import { esc, attr, md, cls, join, pageHref } from '../lib.js';
import { hero, nav } from '../hero.js';
import { fighterCard } from '../fighter.js';
import { photo, sheet, assets } from '../blocks.js';

function table(t) {
  const part = (name, rows, cellTag) => rows ? `<t${name}>${join(rows, r => `<tr${r.class ? ` class="${r.class}"` : ''}>${join(r.cells, c => {
    const tag = c.tag ?? cellTag;
    const at = join(Object.entries(c.attrs || {}), ([k, v]) => ` ${k}="${attr(v)}"`);
    return `<${tag}${c.class ? ` class="${c.class}"` : ''}${at}>${md(c.html)}</${tag}>`;
  })}</tr>`)}</t${name}>` : '';
  return `<table${t.class ? ` class="${t.class}"` : ''}>${part('head', t.head, 'th')}${part('body', t.body, 'td')}${part('foot', t.foot, 'td')}</table>`;
}

function node(b, d) {
  if (b.children) {
    const at = join(Object.entries(b.attrs || {}), ([k, v]) => ` ${k}="${attr(v)}"`);
    return `<${b.tag}${b.class ? ` class="${b.class}"` : ''}${at}>\n${join(b.children, c => node(c, d) + '\n')}</${b.tag}>`;
  }
  if (b.table) return b.wrap ? `<div class="${b.wrap}" tabindex="0" role="region" aria-label="${attr(b.label)}">${table(b.table)}</div>` : table(b.table);
  if (b.prose) return `<div class="${cls('prose', b.class)}">${join(b.prose, p => `<p>${md(p)}</p>`)}</div>`;
  if (b.photo) return photo(b.photo);
  if (b.sheet) return sheet(b);
  if (b.facts) return `<dl class="facts">${join(b.facts, ([k, v]) => `<div><dt>${md(k)}</dt><dd>${md(v)}</dd></div>`)}</dl>`;
  if (b.assets) return assets(b.assets);
  if (b.fighters) return `<div class="fighters">${join(b.fighters, r => fighterCard(d.fighters[r.id], r.class, { id: r.id, xpButton: d.xpButtons }))}</div>`;
  if (b.gangHead) {
    const g = b.gangHead;
    return `<div class="gang-head">\n<img class="portrait" src="${attr(g.portrait)}" alt="${attr(g.alt)}">\n<div><${g.tag}>${esc(g.name)}</${g.tag}><p class="house">${esc(g.house)}</p></div>\n</div>`;
  }
  if (b.card) {
    const c = b.card;
    const media = c.img != null ? `<img src="${attr(c.img)}" alt="${attr(c.alt)}">` : `<div class="ph" aria-hidden="true">${esc(c.placeholder)}</div>`;
    return `<a class="battle" href="${attr(pageHref(c.page))}">\n${media}\n<div class="info">\n${join(c.info, i => `<${i.tag}${i.class ? ` class="${i.class}"` : ''}>${md(i.html)}</${i.tag}>\n`)}</div>\n</a>`;
  }
  if (b.tcard) return `<article class="${cls('t-card', b.tcard.class)}">${join(b.tcard.parts, p => `<${p.tag}${p.class ? ` class="${p.class}"` : ''}>${md(p.html)}</${p.tag}>`)}</article>`;
  if (b.xppop) {
    const x = b.xppop;
    return `<div class="xp-pop" id="xp-${x.id}" popover><div class="xp-pop-head"><h4>${md(x.title)}</h4><button class="xp-close" type="button" popovertarget="xp-${x.id}" popovertargetaction="hide" aria-label="Close">×</button></div>${table(x.table)}</div>`;
  }
  for (const tag of ['h2', 'h3', 'h4', 'p']) if (b[tag] != null) return `<${tag}${b.class ? ` class="${b.class}"` : ''}>${md(b[tag])}</${tag}>`;
  if (b.html != null) return b.html;
  throw new Error('Unknown block ' + JSON.stringify(b).slice(0, 80));
}

export function render(d) {
  document.title = d.title;
  return hero(d.hero) + (d.nav ? '\n' + nav(d.nav, d.navLabel) : '') + `\n<main class="wrap">\n${join(d.main, b => node(b, d) + '\n')}</main>\n` + join(d.after || [], b => node(b, d) + '\n');
}
