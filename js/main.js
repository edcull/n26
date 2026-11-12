// Entry point: every page is an empty shell whose <body data-page data-src>
// says which template to use and which JSON file to load.
import { setRules } from './lib.js';

const PAGES = {
  battle: () => import('./pages/battle.js'),
};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

(async () => {
  const { page, src } = document.body.dataset;
  try {
    const [rules, data, mod] = await Promise.all([getJSON('data/rules.json'), getJSON(src), PAGES[page]()]);
    setRules(rules);
    document.body.insertAdjacentHTML('afterbegin', mod.render(data));
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    window.__rendered = true;
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('afterbegin', `<p style="padding:2rem;color:#f88">Could not load this page: ${e.message}</p>`);
    window.__renderError = true;
  }
})();
