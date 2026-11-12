"""One-off: express unsaved wounds as damage on attack callouts.

The save row (or the To Wound row when there is no save row) of each weapon
section gets "<N> damage", where N = unsaved wounds x the weapon's Damage.
Prints every change and any result whose old number does not fit.
  python3 tools/damage_results.py [--apply]
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(ROOT, 'tools/link_attacks.py')).read().split('def weapon_key')[0])
WORD = {1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten'}
NUM = {'one': 1, 'a': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6}

def wrows(c, key):
    ws = c.get('weapons', [])
    k = lambda s: strip(s).lower().rstrip('*').strip()
    for i, w in enumerate(ws):
        if k(w['name']) == k(key):
            if w.get('profile'): return w
            return ws[i + 1] if i + 1 < len(ws) else w
    return {}

def damage_of(c, key):
    if key == 'Unarmed': return 1
    m = re.search(r'Damage \((\d+)\)', strip(wrows(c, key).get('traits', '')))
    return int(m.group(1)) if m else 1

def count(text):
    t = text.lower()
    if re.match(r'(saved|no effect|fails to wound|suppressed$)', t): return 0
    m = re.match(r'(one|two|three|four|five|six|a) (wound|hit)', t)
    if m: return NUM[m.group(1)]
    if re.match(r'wound\b', t): return 1
    return None

def target_of(check):
    s = sum(v for v, _ in check.get('mods', []))
    return check['base'] - s

def process(apply):
    issues = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
        d = json.load(open(f))
        def walk(n):
            if isinstance(n, dict):
                if isinstance(n.get('roll'), dict) and 'by' in n['roll']: yield n['roll']
                for v in n.values(): yield from walk(v)
            elif isinstance(n, list):
                for v in n: yield from walk(v)
        for r in walk(d):
            c = card(r['by'], d['id'])
            # split rows into weapon sections at each h6
            sections, cur = [], []
            for x in r['rows']:
                if 'h6' in x and cur: sections.append(cur); cur = []
                cur.append(x)
            sections.append(cur)
            wi = 0
            for sec in sections:
                h6 = [x['h6'] for x in sec if 'h6' in x]
                if h6 and len(r['weapons']) > 1:
                    key = next((w for w in r['weapons'] if strip(w).lower().rstrip('*').split('/')[-1] in h6[0].lower()), r['weapons'][min(wi, len(r['weapons']) - 1)])
                else:
                    key = r['weapons'][0]
                wi += 1
                D = damage_of(c, key)
                wound = [x for x in sec if x.get('check', {}).get('name') == 'To Wound']
                save = [x for x in sec if x.get('check', {}).get('name') == 'Save']
                if not wound or not save: continue
                w, sv = wound[-1], save[-1]
                n_w = count(w['result'])
                if n_w is None or n_w == 0: continue
                tgt = target_of(sv['check'])
                dice = [int(x) for x in sv['dice'].split()] if sv['dice'] else []
                saved = sum(1 for x in dice if tgt <= 6 and x >= tgt) if dice else 0
                unsaved = n_w - saved
                old = sv['result']
                suffix = ''.join(re.findall(r'(, suppressed.*|, Out of Ammo)$', old))
                if unsaved <= 0:
                    continue
                dmg = unsaved * D
                new = f'{WORD[dmg]} damage{suffix}'
                oldn = count(old) if count(old) is not None else (n_w if old.lower().startswith('no save') else None)
                ok = oldn in (unsaved, dmg) or old == '1 saved'
                if not ok: issues += 1
                print(f'{d["id"]:4} {"  " if ok else "??"} {strip(key):26} D{D} wounds {n_w} save {sv["dice"] or "-":6} unsaved {unsaved}  {old!r} -> {new!r}')
                if apply and ok: sv['result'] = new
        if apply: json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
    print('issues', issues)

process('--apply' in sys.argv)
