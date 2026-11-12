"""Audit every roll callout for conformity, clarity and traceability.
  python3 tools/audit_callouts.py            # findings, one per line
Exit code 1 if anything is found, so it can be run after edits.
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(ROOT, 'tools/link_attacks.py')).read().split('def weapon_key')[0])

NUMW = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8}
FIRE = {'f1': 1, 'f1a': 1, 'f2': 2, 'f3': 3}
INJ_RANK = {'fw': 1, 'si': 2, 'ooa': 3}
INJ_WORD = {1: 'Injured', 2: 'Serious injury', 3: 'Out of Action'}
ALLOWED_NOTE = re.compile(r'^(Note: [A-Z+"\d]|Initiative \d|Rules note: )')
findings = []

def flag(kind, where, msg): findings.append((kind, where, msg))

def total(c):
    s = sum(v for v, _ in c.get('mods', []))
    return c['base'] + s if c.get('under') else c['base'] - s

def lead_count(text):
    t = text.lower()
    m = re.match(r'(one|two|three|four|five|six|seven|eight) (hits?|wounds?|damage)', t)
    if m: return NUMW[m.group(1)], m.group(2)
    if re.match(r'(hit|wound)\b', t): return 1, t.split()[0].rstrip(',')
    return None, None

def colour_ok(res, cls):
    if not res: return cls is None
    if re.search(r'damage', res, re.I): return cls is None
    if res == '-': return cls == 'ammo'
    if re.search(r'not suppressed', res, re.I): return cls == 'ammo'
    if re.match(r'(One|Two|Three|Four|Five|Six) hits?\b|Hits?\b', res) or re.match(r'^(missed|fails to wound)(, (missed|fails to wound))?$', res, re.I): return cls == 'ammo'
    if re.search(r'wound|injur|Out of Action|out of action|Perils|Warp|Unstable|Bottle|Executed|Stays down|Grievous|No save|Void drops', res, re.I): return cls is None   # harm is red even with a condition after it
    if re.search(r'suppress|Insanity|webbed|break free', res, re.I): return cls == 'sup'
    return cls == 'ammo'

for f in sorted(glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
    d = json.load(open(f))
    def walk(n, rnd):
        if isinstance(n, dict):
            if 'id' in n and str(n.get('id', '')).startswith(('round-', 'deployment')): rnd = n['id']
            r = n.get('roll')
            if isinstance(r, dict): yield r, rnd
            for x in n.get('captures', []): yield x, rnd
            for v in n.values(): yield from walk(v, rnd)
        elif isinstance(n, list):
            for v in n: yield from walk(v, rnd)
    for r, rnd in walk(d, ''):
        title = r.get('name') or f"{r['by']} - {'/'.join(r['weapons'])}"
        W = f"{d['id']} {rnd} | {strip(title)[:46]}"
        # ---------- conformity
        if not r.get('by') and ' - ' not in r.get('name', ''): flag('conformity', W, 'title not "Fighter - Action"')
        allnotes = ' '.join(x.get('note', '') for x in r['rows'])
        for word, trait in (('Knockback', 'Knockback'), ('auto wound', 'Shock')):
            if any(word in str(x.get('result', '')) for x in r['rows']) and trait not in allnotes: flag('clarity', W, f'{word} with no {trait} note')
        if r.get('by'):   # suppression goes on the last row of each weapon's chain (To Wound, Save or Injury)
            secs = [[]]
            for x in r['rows']:
                if 'h6' in x: secs.append([])
                secs[-1].append(x)
            for sec in secs:
                chain = [x for x in sec if (x.get('check') or {}).get('name') in ('To Hit', 'To Wound', 'Save', 'Strength', 'Cool') or x.get('label') == 'Injury']
                for i, x in enumerate(chain[:-1]):
                    if re.search(r'(?<!not )suppressed', str(x.get('result', '')), re.I) and (chain[-1].get('check') or {}).get('name') != 'Cool':
                        flag('conformity', W, f'suppressed on {(x.get("check") or {}).get("name") or x.get("label")}, not the last row')
        for k in r.get('weapons', []):   # a combi weapon names the profile used (Autogun when shooting, Polearm in melee)
            if '/' in k: flag('conformity', W, f'combi weapon {k!r}: name the profile used')
        if not colour_ok(r['result'], r.get('resultClass') or None): flag('conformity', W, f'summary colour {r.get("resultClass") or "red"} for {r["result"]!r}')
        for x in r['rows']:
            if 'note' in x and not ALLOWED_NOTE.match(x['note']): flag('conformity', W, f'note style: {x["note"][:50]!r}')
            if 'result' in x and not colour_ok(x['result'], x.get('resultClass')): flag('conformity', W, f'row colour {x.get("resultClass") or "red"} for {x["result"]!r}')
            if 'label' in x and re.search(r'\d', x['label']): flag('conformity', W, f'numbered label not a check: {x["label"]!r}')
            if x.get('result', None) == '' : flag('clarity', W, f'empty result on {(x.get("check") or {}).get("name") or x.get("label")}')
        if not r['result']: flag('clarity', W, 'empty summary')
        # ---------- traceability per section
        sections, cur = [], []
        for x in r['rows']:
            if 'h6' in x and cur: sections.append(cur); cur = []
            cur.append(x)
        sections.append(cur)
        attacker = card(r['by'], d['id']) if r.get('by') else None
        for sec in sections:
            hits = wounds = unsaved = None; auto = 0
            if any((x.get('check') or {}).get('name') == 'To Wound' and re.match(r'(One|Two|Three|Four|Five|Six) wounds?|Wound\b', x.get('result', '')) for x in sec) \
                    and not any((x.get('check') or {}).get('name') == 'Save' for x in sec):
                flag('traceability', W, 'wounds caused but no Save row')
            for x in sec:
                c = x.get('check'); dice = x.get('dice', '')
                ds = dice.split() if isinstance(dice, str) else []
                if c and c['name'] == 'To Hit' and ds:
                    t = total(c); d6 = [int(v) for v in ds if v.isdigit()]; fp = [FIRE[v] for v in ds if v in FIRE]
                    succ = sum(1 for v in d6 if v >= t)
                    expect = sum(fp) if succ and fp else succ
                    n, _ = lead_count(x['result'])
                    if x['result'].startswith('Miss') and succ: flag('traceability', W, f'To Hit {t}+ rolled {dice}: has a success but says {x["result"]!r}')
                    elif n is not None and n != expect: flag('traceability', W, f'To Hit {t}+ rolled {dice}: expected {expect} hits, says {x["result"]!r}')
                    hits = n if n is not None else (None if 'Unstable' in x['result'] else 0 if x['result'].startswith('Miss') else None)   # Unstable: the wound roll is on the firer
                    auto = 1 if 'auto wound' in x['result'] else 0
                if c and c['name'] == 'To Wound' and ds:
                    t = total(c); succ = sum(1 for v in ds if v.isdigit() and int(v) >= t)
                    n, _ = lead_count(x['result'])
                    said = n if n is not None else 0
                    if 'webbed' in x['result'].lower(): said = succ
                    if said != succ + auto: flag('traceability', W, f'To Wound {t}+ rolled {dice}: {succ} succeed but says {x["result"]!r}')
                    if hits is not None and len(ds) != hits - auto: flag('traceability', W, f'{hits} hit(s) but {len(ds)} To Wound dice')
                    wounds = succ + auto
                    if c.get('s') is not None:
                        S, T = c['s'], c['t']; need = 2 if S >= 2*T else 3 if S > T else 4 if S == T else 6 if 2*S <= T else 5
                        if need != c['base']: flag('traceability', W, f'S{S}/T{T} needs {need}+ but base is {c["base"]}+')
                if c and c['name'] == 'Save':
                    t = total(c); saved = sum(1 for v in ds if v.isdigit() and t <= 6 and int(v) >= t)
                    if t > 6 and ds: flag('traceability', W, 'save is none but dice are shown')
                    if wounds is not None and ds and len(ds) != wounds: flag('traceability', W, f'{wounds} wound(s) but {len(ds)} save dice')
                    n, kind = lead_count(x['result'])
                    if wounds is not None:
                        uns = wounds - saved
                        if kind == 'damage' and attacker:
                            D = 1
                            for k in r['weapons']:
                                mm = re.search(r'Damage \((\d+)\)', strip(next((w.get('traits', '') for w in attacker.get('weapons', []) if strip(w['name']).lower().rstrip('*') == strip(k).lower().rstrip('*')), '')))
                                if mm: D = int(mm.group(1))
                            if n != uns * D: flag('traceability', W, f'{uns} unsaved x Damage {D} = {uns*D}, says {x["result"]!r}')
                        elif uns > 0 and kind != 'damage': flag('conformity', W, f'{uns} unsaved but save row says {x["result"]!r}')
                        elif uns <= 0 and kind == 'damage': flag('traceability', W, f'all saved but says {x["result"]!r}')
                        unsaved = uns
                if x.get('label') == 'Injury' and ds:
                    # A Flesh Wound means Injured only if the fighter is at 0 wounds; otherwise the result can be just Suppressed
                    worst = max(INJ_RANK.get(v, 0) for v in ds)
                    if worst == 1: continue
                    if worst and not x['result'].startswith(INJ_WORD[worst].split(',')[0]) and not x['result'].lower().startswith('still '): flag('traceability', W, f'injury dice {dice} -> {INJ_WORD[worst]} but says {x["result"]!r}')
                if c and c['name'] == 'Ammo' and ds:
                    t = total(c); v = int(ds[0])
                    if v >= t and 'Out of Ammo' in x['result']: flag('traceability', W, f'Ammo {t}+ rolled {v} (passes) but says Out of Ammo')
                    if v < t and 'Out of Ammo' not in x['result'] and 'jam' not in x['result'].lower(): flag('traceability', W, f'Ammo {t}+ rolled {v} (fails) but says {x["result"]!r}')
                if c and c['name'] == 'Strength' and r.get('name', '').endswith('Grâce') and ds and x['result'] != str(c['base'] + int(ds[0])):
                    flag('traceability', W, f'Coup de Grâce total should be {c["base"] + int(ds[0])}, says {x["result"]!r}')
                if c and c.get('under') and c['name'] in ('Cool', 'Leadership', 'Willpower') and len(ds) == 2 and all(v.isdigit() for v in ds):
                    s = sum(map(int, ds)); passed = s <= total(c)
                    res = x['result'].lower()
                    fails = bool(re.search(r'fail|suppressed$|bottle|subject to insanity|drops', res)) and 'not suppressed' not in res
                    if passed == fails: flag('traceability', W, f'{c["name"]} {total(c)} rolled {dice} = {s} ({"pass" if passed else "fail"}) but says {x["result"]!r}')

order = {'traceability': 0, 'clarity': 1, 'conformity': 2}
for k, w, m in sorted(findings, key=lambda x: (order[x[0]], x[1])):
    print(f'{k:12} {w:60} {m}')
print(len(findings), 'findings')
sys.exit(1 if findings else 0)
