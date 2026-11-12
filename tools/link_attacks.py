"""One-off: give every attack callout {"by", "weapons", "target", "action"} so the template can
title it "Shooter – Weapon → Target" with tooltips, and work out damage.

  python3 tools/link_attacks.py            # print the proposed links for review
  python3 tools/link_attacks.py --apply
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
camp = json.load(open(os.path.join(ROOT, 'data/campaign.json')))
gangs = [json.load(open(os.path.join(ROOT, f'data/gangs/{g}.json'))) for g in camp['gangs']]
TL = camp['timeline']
POWERS = ('Perfect Void', 'Maintain Power', 'Terrible Truths', 'Eternal Slumber', 'Perils')
ACTIONS = ('Overwatch', 'Reaction', 'Counter-attack', 'Charge', 'Coup de Grâce')

def card(fid, pt):
    for g in gangs:
        if fid in g['fighters']:
            s = {}
            for e in g['fighters'][fid]:
                if TL.index(e['at']) <= TL.index(pt):
                    for k, v in e.items():
                        if k == 'at': continue
                        if v is None: s.pop(k, None)
                        elif k in ('stats', 'statClass') and isinstance(v, dict) and k in s: s[k].update(v)
                        else: s[k] = v
            return s

NAMES = {}
for g in gangs:
    for fid, h in g['fighters'].items():
        n = h[0]['name']; NAMES[n] = fid; NAMES[n.split()[0]] = NAMES.get(n.split()[0], fid)
NAMES['Deus'] = 'deus-and-amen'; NAMES['Amen'] = 'deus-and-amen'; NAMES['Filth'] = 'blessed-filth'
GANG = {fid: g['side'] for g in gangs for fid in g['fighters']}

strip = lambda s: re.sub(r'\{tip[^:]*:([^}]*)\}', r'\1', re.sub(r'<[^>]+>', '', s or ''))
norm = lambda s: re.sub(r'^(cawdor|delaque) ', '', strip(s).lower().rstrip('*').strip())

def weapon_key(c, label):
    want = norm(label)
    for w in c.get('weapons', []):
        if norm(w['name']) == want and w.get('profile'): return strip(w['name'])
    for w in c.get('weapons', []):
        n = norm(w['name'])
        if n == want or want in n.split('/') or n.endswith(want) or n.replace('-', ' ') == want: return strip(w['name'])
    return None

def mentioned(text):
    out = []
    for m in re.finditer(r'\{@([\w-]+)\|', text or ''): out.append(m.group(1))
    for name, fid in sorted(NAMES.items(), key=lambda x: -len(x[0])):
        if re.search(r'\b' + re.escape(name) + r'\b', strip(text or '')): out.append(fid)
    return out

def attack_rolls(d):
    """(roll, text before it) for every callout with a To Hit or To Wound row."""
    out = []
    def walk(n, prev):
        if isinstance(n, list):
            p = prev
            for v in n:
                if isinstance(v, str): p = v
                walk(v, p)
                if isinstance(v, dict) and isinstance(v.get('roll'), dict): pass
        elif isinstance(n, dict):
            r = n.get('roll')
            if isinstance(r, dict) and any('check' in x and x['check']['name'] in ('To Hit', 'To Wound') for x in r['rows']):
                out.append((r, prev))
            for k, v in n.items():
                if k != 'roll': walk(v, prev)
    walk(d['rounds'], '')
    return out

def link(d, r, prev):
    who, _, rest = r['name'].partition(' - ')
    if any(p in rest for p in POWERS): return None
    by = NAMES.get(who) or NAMES.get(who.split()[0])
    c = card(by, d['id'])
    action = None
    m = re.match(r'(%s)(?::\s*|$)(.*)' % '|'.join(ACTIONS), rest)
    if m: action, rest = m.group(1), m.group(2)
    h6 = [re.sub(r'^(%s):\s*|\s*\(secondary\)$' % '|'.join(ACTIONS), '', x['h6']) for x in r['rows'] if 'h6' in x]
    h6 = [h for h in h6 if not NAMES.get(h)]          # h6 naming targets (a flamer hitting two fighters) are not weapons
    labels = h6 or ([w for w in re.split(r' and |/', rest) if w] if rest else [])
    if rest and '/' in rest and weapon_key(c, rest): labels = [rest]
    if rest == 'Pistols': labels = [x['h6'] for x in r['rows'] if 'h6' in x]
    weapons = []
    for l in labels:
        k = 'Unarmed' if norm(l) == 'unarmed' else weapon_key(c, l)
        weapons.append({'label': l, 'key': k})
    enemies = [f for f in mentioned(r['result']) + mentioned(prev) if GANG.get(f) and GANG[f] != GANG.get(by)]
    target = enemies[0] if enemies else None
    out = {'by': by, 'action': action, 'weapons': weapons, 'target': target}
    key = (d['id'], r['name'], SEEN.setdefault((d['id'], r['name']), [0])[0])
    SEEN[(d['id'], r['name'])][0] += 1
    for k, v in OVERRIDE.get(key, {}).items():
        out[k] = v if k != 'weapons' else [{'label': w, 'key': 'Unarmed' if w == 'Unarmed' else weapon_key(c, w)} for w in v]
    return out

SEEN = {}
# (battle, callout name, nth callout with that name in the battle) -> fixes worked out from the narrative
OVERRIDE = {
    ('1.1', 'Rumpleteaser - Plasma Gun', 0): {'target': 'mordecai'},
    ('1.1', 'Deus and Amen - Twin-linked Heavy Stubber', 0): {'target': None},
    ('1.1', 'Deus and Amen - Twin-linked Heavy Stubber', 2): {'target': 'macavity'},
    ('1.2', 'Demeter - Overwatch', 0): {'weapons': ['Long rifle']},
    ('1.2', 'Demeter - Overwatch', 1): {'weapons': ['Long rifle']},
    ('2.1', 'Rumpleteaser - Reaction: Unarmed', 0): {'target': 'ezekiel-crows'},
    ('2.1', 'Vermin Pyre - Flamer', 2): {'weapons': ['Flamer'], 'target': ['wit', 'jellylorum']},
    ('2.1', 'Ezekiel Crows - Reaction', 0): {'weapons': ['Cleaver'], 'target': 'rumpus'},
    ('2.1', 'Blessed Filth - Long Rifle', 0): {'target': 'vermin-pyre'},
    ('2.1', 'Mistoffelees - Reaction: Stub Gun', 0): {'target': 'mordecai'},
}
NO_TARGET_OK = {('1.1', 'Deus and Amen - Twin-linked Heavy Stubber'), ('1.1', 'Ezekiel - Autopistol'), ('1.2', 'Deus and Amen - Twin-linked Heavy Stubber')}

problems = 0
for f in sorted(glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
    d = json.load(open(f))
    for r, prev in attack_rolls(d):
        l = link(d, r, prev)
        if l is None:
            print(f'{d["id"]:4} SKIP  {r["name"]}'); continue
        bad = (not l['by']) or (not l['target'] and (d['id'], r['name']) not in NO_TARGET_OK) or any(w['key'] is None for w in l['weapons']) or not l['weapons']
        problems += bad
        print(f'{d["id"]:4} {"??" if bad else "ok"}  {r["name"][:44]:44} by={l["by"]} act={l["action"]} w={[w["key"] for w in l["weapons"]]} -> {l["target"]}   | {r["result"][:40]}')
        if '--apply' in sys.argv and not bad:
            r['by'] = l['by']; r['weapons'] = [w['key'] for w in l['weapons']]
            if l['target']: r['target'] = l['target']
            if l['action']: r['action'] = l['action']
    if '--apply' in sys.argv:
        json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
print('problems', problems)
