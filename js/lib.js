// Shared helpers: escaping and the inline text markup used throughout data/*.json
//   {@fighter-id|Text}  -> fighter name button that opens their card
//   {p:Text} / {t:Text} -> text in the Psalm (orange) / Theatre (purple) colour
//   {tip:Rule name}     -> dotted-underline term with a tooltip from data/rules.json
//   {tip.new-i:Name}    -> the same with extra classes (new-i = new this cycle)
// Anything else is passed through as HTML.

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const attr = s => esc(s).replace(/"/g, '&quot;');

let RULES = {};
export const setRules = r => { RULES = r || {}; };
export const rule = key => RULES[key];
export const ruleLabel = key => key.replace(/ #\d+$/, '');

export function tip(key, extraClass = '', inner = null) {
  const c = extraClass ? `${extraClass} sk` : 'sk';
  return `<span class="${c}" tabindex="0" data-tip="${attr(RULES[key] ?? '')}">${inner ?? esc(ruleLabel(key))}</span>`;
}

export function md(s) {
  if (s == null) return '';
  return String(s).replace(/\{@([\w-]+)\|([^{}]*)\}|\{([pt]):([^{}]*)\}|\{tip((?:\.[\w-]+)*):([^{}]*)\}/g, (m, id, text, side, gtext, mods, key) => {
    if (id) return `<button type="button" class="fname" popovertarget="fc-${id}">${text}</button>`;
    if (side) return `<span class="${side}">${gtext}</span>`;
    return tip(key, mods ? mods.slice(1).split('.').join(' ') : '');
  });
}

export const cls = (...xs) => xs.flat().filter(Boolean).join(' ');
export const join = (xs, f) => (xs || []).map(f).join('');

// Every page is index.html; ?p=<page id> picks which one (ids are listed in data/campaign.json).
export const pageHref = id => (id === 'index' ? './' : `./?p=${encodeURIComponent(id)}`);
