// Fighters live once in data/gangs/<gang>.json as a history along the campaign
// timeline (data/campaign.json). The first entry is the full card; each later
// entry lists only what changed at that point (stats/statClass merge key by key,
// null removes). fightersAt(point) returns every fighter's card as of that point.
const MERGE = new Set(['stats', 'statClass']);

function apply(state, entry) {
  const s = structuredClone(state);
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'at') continue;
    if (v === null) delete s[k];
    else if (MERGE.has(k) && s[k] && typeof v === 'object') {
      for (const [x, y] of Object.entries(v)) { if (y === null) delete s[k][x]; else s[k][x] = y; }
    } else s[k] = structuredClone(v);
  }
  return s;
}

export function fightersAt(campaign, gangs, point) {
  const idx = campaign.timeline.indexOf(point);
  if (idx < 0) throw new Error(`"${point}" is not in the campaign timeline`);
  const out = {};
  for (const g of gangs) {
    for (const [id, history] of Object.entries(g.fighters)) {
      let s = null;
      for (const e of history) if (campaign.timeline.indexOf(e.at) <= idx) s = apply(s || {}, e);
      if (s) { s.gang = g.class; out[id] = s; }
    }
  }
  return out;
}
