// XP breakdowns, built from the campaign itself:
//   Starting XP       - the fighter's first roster entry (campaign setup, or the post-cycle phase they were recruited in)
//   Cycle <id>: <name> - the Experience table in each battle's aftermath (data/battles/<id>.json)
//   Cycle <n> post-cycle - "Train (+N XP)" actions on the post-cycle page (data/post/<n>.json)
// up to the roster point the page shows. Each becomes a {xppop} block for the report template.
const num = s => parseInt(String(s).replace(/<[^>]*>/g, '').replace(/^\+/, ''), 10) || 0;
const row = (src, why, v) => ({ cells: [{ html: `<span class="xp-src">${src}</span><span class="xp-why">${why}</span>` }, { html: v, class: 'num' }] });

export async function xpPops(campaign, gangs, point, getJSON) {
  const upto = campaign.timeline.slice(0, campaign.timeline.indexOf(point) + 1);
  const steps = [];   // [{ label, rows: Map(fighter name -> [why, xp]) }] in timeline order
  for (const key of upto) {
    const cfg = campaign.pages[key];
    if (!cfg) continue;
    if (cfg.template === 'battle') {
      const b = await getJSON(cfg.data);
      const rows = new Map();
      for (const blk of b.aftermath || []) for (const t of blk.xp || []) for (const r of t.table.rows) rows.set(r.cells[0].html, [r.cells[1].html, num(r.cells[2].html)]);
      steps.push({ label: `Cycle ${b.id}: ${b.name}`, rows });
    } else if (cfg.template === 'post') {
      const p = await getJSON(cfg.data);
      const rows = new Map();
      for (const g of p.gangs || []) for (const a of g.actions || []) {
        const m = /^Train \(\+(\d+) XP\)$/.exec(a.action || '');
        if (m) rows.set(a.fighter, ['Train', +m[1]]);
      }
      steps.push({ label: `Cycle ${key.split('-')[0]} post-cycle`, rows });
    }
  }
  const pops = [];
  for (const g of gangs) for (const [id, history] of Object.entries(g.fighters)) {
    const first = history[0], name = first.name;
    if (upto.indexOf(first.at) < 0) continue;
    const start = num(history.find(e => e.stats?.XP != null).stats.XP);
    const why = first.at === 'setup' ? 'Campaign setup' : `Recruited in the Cycle ${first.at.split('-')[0]} post-cycle phase`;
    const body = [row('Starting XP', why, String(start))];
    let total = start;
    for (const s of steps) {
      const r = s.rows.get(name);
      if (!r) continue;
      body.push(row(s.label, r[0], `+${r[1]}`));
      total += r[1];
    }
    pops.push({ xppop: { id, title: `${name}: XP`, table: { body, foot: [{ cells: [{ html: 'Total' }, { html: String(total), class: 'num' }] }] } } });
  }
  return pops;
}
