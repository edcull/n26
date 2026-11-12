// Fighter card, used in gang lists and in the pop-up cards opened from fighter names.
import { esc, attr, md, cls, join } from './lib.js';

const STAT_ORDER = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Sv', 'Ld', 'Cl', 'Wil', 'Int', 'XP'];
const STAT_GROUP = { Ld: 'm', Cl: 'm', Wil: 'm', Int: 'm', XP: 'x' };

export function fighterCard(f, extraClass = '') {
  const keys = Object.keys(f.stats);
  const stats = join(keys, k => {
    const c = cls('c', STAT_GROUP[k], f.statClass?.[k]);
    const inner = `<span>${esc(k)}</span><b>${f.stats[k]}</b>`;
    if (k === 'XP' && f.xpPop) return `<button${f.xpPopType ? ' type="button"' : ''} class="${c} xp-btn" popovertarget="xp-${f.xpPop}" aria-label="${attr(f.name)} XP breakdown">${inner}</button>`;
    return `<div class="${c}">${inner}</div>`;
  });
  const weapons = f.weapons ? `\n  <div class="weapons"><div class="wp head"><div class="wn">Weapon</div><div class="wv">SR</div><div class="wv">LR</div><div class="wv">Str</div><div class="wv">AP</div><div class="wv">L</div></div>${join(f.weapons, w =>
    `<div class="${cls('wp', w.class)}"><div class="${cls('wn', w.nameClass)}">${md(w.name)}</div>` +
    join(w.profile, (v, i) => `<div class="${cls('wv', w.profileClass?.[i])}">${v}</div>`) +
    (w.traits != null ? `<div class="wt">${md(w.traits)}</div>` : '') + '</div>')}</div>` : '';
  const foot = f.foot ? `\n  <div class="foot">${join(f.foot, p => p.html != null ? `<p>${md(p.html)}</p>` : `<p><b>${esc(p.label)}</b> ${md(p.text)}</p>`)}</div>` : '';
  return `<article class="${cls('fighter', extraClass)}">
  <div class="fh"><img class="roundel" src="${attr(f.portrait)}" alt=""><div><h4${f.nameClass ? ` class="${f.nameClass}"` : ''}>${esc(f.name)}</h4><p>${md(f.type)}</p>${f.typeExtra || ''}</div><div class="cost"><b>${f.cost}</b><span>${f.costLabel ?? 'credits'}</span></div></div>
  <div class="stats" role="group" aria-label="${attr(f.name)} characteristics">${stats}</div>${weapons}${foot}
</article>`;
}

export function fighterPopover(id, f, gangClass) {
  return `<div class="fc-pop ${gangClass}" id="fc-${id}" popover><button class="fc-close" type="button" popovertarget="fc-${id}" popovertargetaction="hide" aria-label="Close">×</button>${fighterCard(f)}</div>`;
}
