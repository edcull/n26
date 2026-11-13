// The whole site is index.html. ?p=<page id> picks a page from data/campaign.json
// ("pages"), which says which template draws it, which JSON it reads and which
// stylesheets it needs. With no ?p the campaign's home page is shown.
import { setRules, esc, pageHref } from './lib.js';
import { fightersAt } from './roster.js';
import { xpPops } from './xp.js';

const TEMPLATES = {
  battle: () => import('./pages/battle.js'),
  post: () => import('./pages/post.js'),
  report: () => import('./pages/report.js'),
};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function loadCss(hrefs) {
  return Promise.all(hrefs.map(href => new Promise(resolve => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = l.onerror = resolve;
    document.head.appendChild(l);
  })));
}

(async () => {
  try {
    const campaign = await getJSON('data/campaign.json');
    const id = new URLSearchParams(location.search).get('p') || campaign.home;
    const cfg = campaign.pages[id];
    if (!cfg) {
      document.title = 'Page not found';
      document.body.insertAdjacentHTML('afterbegin', `<p style="padding:2rem">No page called “${esc(id)}”. <a href="${pageHref(campaign.home)}">Back to the campaign</a>.</p>`);
      window.__rendered = true;
      return;
    }
    document.title = cfg.title;
    const [rules, data, mod] = await Promise.all([getJSON('data/rules.json'), getJSON(cfg.data), TEMPLATES[cfg.template](), loadCss(cfg.css)]);
    setRules(rules);
    if (data.roster) {
      const gangs = await Promise.all(campaign.gangs.map(g => getJSON(`data/gangs/${g}.json`)));
      data.fighters = fightersAt(campaign, gangs, data.roster);
      data.gangInfo = Object.fromEntries(gangs.map(g => [g.id, g]));
      if (data.xpButtons) {   // an XP breakdown for each fighter card on the page
        const shown = new Set();
        JSON.stringify(data.main, (k, v) => { if (k === 'fighters' && Array.isArray(v)) v.forEach(f => shown.add(f.id)); return v; });
        data.after = [...(data.after || []), ...(await xpPops(campaign, gangs, data.roster, getJSON)).filter(p => shown.has(p.xppop.id))];
      }
    }
    if (data.terrain) data.pieces = (await getJSON('data/terrain.json')).pieces;
    document.body.insertAdjacentHTML('afterbegin', mod.render(data));
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    window.__rendered = true;
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('afterbegin', `<p style="padding:2rem;color:#f88">Could not load this page: ${esc(e.message)}</p>`);
    window.__renderError = true;
  }
})();
