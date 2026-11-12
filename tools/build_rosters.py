"""One-off: pull the fighter snapshots out of every page into data/gangs/<gang>.json.

Each fighter is stored once, as a list of entries along the campaign timeline
(data/campaign.json). The first entry is the full card; later entries hold only
the fields that changed (dict fields such as stats are merged key by key; null
removes a field or key). A page names its point in the timeline with "roster".
"""
import json, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMELINE = ['setup', '1.1', '1.2', '1-post', '2.1', 'status', '2.2']
GANGS = {
    'p': {'id': 'the-carrion-psalm', 'name': 'The Carrion Psalm', 'house': 'House Cawdor', 'side': 'p', 'class': 'psalm',
          'portrait': 'images/gangs/the-carrion-psalm.jpg', 'thumb': 'images/gangs/the-carrion-psalm-thumb.jpg'},
    't': {'id': 'the-midnight-theatre', 'name': 'The Midnight Theatre', 'house': 'House Delaque', 'side': 't', 'class': 'theatre',
          'portrait': 'images/gangs/the-midnight-theatre.jpg', 'thumb': 'images/gangs/the-midnight-theatre-thumb.jpg'},
}
MERGE = {'stats', 'statClass'}

pages = {}
for f in glob.glob(os.path.join(ROOT, 'data/battles/*.json')) + glob.glob(os.path.join(ROOT, 'data/pages/*.json')):
    d = json.load(open(f)); pages[d['id']] = (f, d)

owner = {}
def walk(n, ctx):
    if isinstance(n, dict):
        k = (n.get('class') or '') + ' ' + str((n.get('attrs') or {}).get('id', ''))
        c = 'p' if 'psalm' in k else 't' if 'theatre' in k else ctx
        if isinstance(n.get('fighters'), list):
            for r in n['fighters']: owner[r['id']] = c
        for v in n.values(): walk(v, c)
    elif isinstance(n, list):
        for v in n: walk(v, ctx)
for pid, (f, d) in pages.items():
    if d['page'] == 'battle':
        for g in d['gangs']:
            for b in g['blocks']:
                for r in b.get('fighters', []): owner[r['id']] = {'psalm': 'p', 'theatre': 't'}[g['class']]
    else:
        walk(d.get('main'), None)

def diff(prev, cur):
    out = {}
    for k in list(prev) + [k for k in cur if k not in prev]:
        a, b = prev.get(k), cur.get(k)
        if a == b: continue
        if k in MERGE and isinstance(a, dict) and isinstance(b, dict) and list(b) == list(a) + [x for x in b if x not in a]:
            out[k] = {x: b.get(x) for x in list(a) + [x for x in b if x not in a] if a.get(x) != b.get(x)}
        else:
            out[k] = b
    return out

def apply(state, entry):
    s = json.loads(json.dumps(state))
    for k, v in entry.items():
        if k == 'at': continue
        if v is None: s.pop(k, None)
        elif k in MERGE and isinstance(v, dict) and isinstance(s.get(k), dict):
            for x, y in v.items():
                if y is None: s[k].pop(x, None)
                else: s[k][x] = y
        else: s[k] = v
    return s

gangs = {s: dict(g, fighters={}) for s, g in GANGS.items()}
for pid in TIMELINE:
    f, d = pages[pid]
    for fid, card in d.get('fighters', {}).items():
        if card.pop('xpPop', None):
            assert card.pop('xpPopType', None) and True
            d['xpButtons'] = True
        g = gangs[owner[fid]]
        hist = g['fighters'].setdefault(fid, [])
        state = {}
        for e in hist: state = apply(state, e)
        dd = diff(state, card) if hist else card
        if dd: hist.append({'at': pid, **dd})
        assert apply(state, {'at': pid, **dd}) == card, (fid, pid)

os.makedirs(os.path.join(ROOT, 'data/gangs'), exist_ok=True)
for g in gangs.values():
    json.dump(g, open(os.path.join(ROOT, 'data/gangs', g['id'] + '.json'), 'w'), indent=1, ensure_ascii=False)
json.dump({'name': 'Ash and Shadow', 'gangs': [g['id'] for g in gangs.values()], 'timeline': TIMELINE},
          open(os.path.join(ROOT, 'data/campaign.json'), 'w'), indent=1, ensure_ascii=False)
for pid, (f, d) in pages.items():
    if 'fighters' in d:
        if d['fighters']: d['roster'] = pid
        del d['fighters']
        json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
print({g['id']: (len(g['fighters']), sum(len(h) for h in g['fighters'].values())) for g in gangs.values()})
