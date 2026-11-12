"""One-off: turn roll-row labels into structured checks.

  {"check": {"name": "To Hit", "base": 4, "mods": [[1, "Aim"]]}}
  {"check": {"name": "Save", "base": 4, "mods": [[-1, "AP"]]}}
  {"check": {"name": "Willpower", "base": 9, "mods": [[3, "Psychoteric Choir"]], "under": true}}
  {"check": {"name": "Leadership", "base": 8, "who": "Mordecai", "under": true}}

Bases come from the labels as they were before tools/standardise_rolls.py (git rev SRC).
"""
import glob, json, os, re, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = 'ca40b9b~1'
CAP = lambda s: s[:1].upper() + s[1:]


def parse(old, new):
    m = re.fullmatch(r'(To Hit|To Wound|Save) \((\d)\+,? ?(.*)\)', old)
    if m:
        name, base, rest = m.group(1), int(m.group(2)), m.group(3)
        c = {'name': name, 'base': base}
        ap = re.search(r'AP (-\d+)', rest)
        if ap: rest = (rest[:ap.start()] + rest[ap.end():]).strip()
        mods, words = [], []
        for tok in re.split(r',\s*|\s+(?=[+-]\d)', rest.strip()):
            tok = tok.strip()
            if not tok: continue
            mm = re.fullmatch(r'([+-]\d+) (.+)', tok)
            if mm: mods.append([int(mm.group(1)), CAP('aim' if mm.group(2) == 'aimed shot' else mm.group(2))])
            else: words.append(tok)
        if ap: mods.append([int(ap.group(1)), 'AP'])
        if mods: c['mods'] = mods
        if words: c['note'] = ', '.join(words)
        return c
    m = re.fullmatch(r'(Ammo|Charge|Charge move|Engage|Target|Remains|Stimm-slug) \((\d)\+\)', old)
    if m: return {'name': m.group(1), 'base': int(m.group(2))}
    m = re.fullmatch(r'(?:([A-Z][\w ]+?)(?: \(|: ))?(Leadership|Cool|Willpower|Str|Strength) (\d+)(?: \+(\d))?\)?', old)
    if m:
        who, stat, n, plus = m.groups()
        c = {'name': 'Strength' if stat == 'Str' else stat, 'base': int(n), 'under': True}
        if plus: c['mods'] = [[int(plus), 'Psychoteric Choir']]
        if who == 'Nerves of Steel': c['note'] = 'Nerves of Steel'
        elif who: c['who'] = who
        return c
    return None


def rolls(d):
    def walk(n):
        if isinstance(n, dict):
            if isinstance(n.get('roll'), dict): yield n['roll']
            yield from n.get('captures', [])
            for v in n.values(): yield from walk(v)
        elif isinstance(n, list):
            for v in n: yield from walk(v)
    return list(walk(d))


for f in sorted(glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
    rel = os.path.relpath(f, ROOT)
    old = json.loads(subprocess.run(['git', 'show', f'{SRC}:{rel}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    d = json.load(open(f))
    kept = set()
    for ro, rn in zip(rolls(old), rolls(d)):
        for xo, xn in zip(ro['rows'], rn['rows']):
            if 'label' not in xn: continue
            c = parse(xo['label'], xn['label'])
            if c:
                xn['check'] = c; del xn['label']
            else:
                kept.add(xn['label'])
    json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
    print(rel, 'labels kept as text:', sorted(kept))
