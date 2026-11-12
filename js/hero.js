// Page header ("hero") and the sticky section navigation.
import { esc, attr, md, join } from './lib.js';

export function hero(d) {
  const sides = join(d.sides, (s, i) => `
      <div class="side${i ? ' right' : ''}"><img src="${attr(s.img)}" alt=""><div><strong>${esc(s.name)}</strong><span>${esc(s.note)}</span></div></div>`);
  return `<header class="hero">
  <div class="chevrons" aria-hidden="true"></div>
  <div class="wrap">
    <p class="kicker">${md(d.kicker)}</p>
    <h1><small>${esc(d.cycle)}</small>${esc(d.name)}</h1>
    <div class="versus">${sides}
    </div>
  </div>
</header>
`;
}

const HOME = '<li><a class="home" href="index.html" aria-label="Campaign"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 7.5 8 2.5l6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.8 6.4V13.5h3V10h2.4v3.5h3V6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="home-t">Campaign</span></a></li>';

// items: [{href, text, class?}] | {br:true} | {round:n}
export function nav(items) {
  const li = join(items, it => {
    if (it.br) return '\n    <li class="nav-br" aria-hidden="true"></li>';
    if (it.round) return `\n    <li><a class="round-link" href="#round-${it.round}" aria-label="Round ${it.round}"><span class="tab-w">Round&nbsp;</span><span class="tab-n">R</span>${it.round}</a></li>`;
    return `\n    <li${it.class ? ` class="${it.class}"` : ''}><a href="${attr(it.href)}">${esc(it.text)}</a></li>`;
  });
  return `<nav class="jump" aria-label="Report sections">
  <ul class="wrap">
    ${HOME}${li}
  </ul>
</nav>
`;
}
