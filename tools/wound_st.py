"""One-off: add attacker Strength and target Toughness to To Wound checks ({"s": 3, "t": 3}),
worked out from the cards, and report rows where they don't match the recorded wound roll.
  python3 tools/wound_st.py [--apply]
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exec(open(os.path.join(ROOT, 'tools/link_attacks.py')).read().split('def weapon_key')[0])

def wrow(c, key):
    if key == 'Unarmed': return {'profile': ['E', '-', 'S', '-', '1']}
    ws = c.get('weapons', []); k = lambda s: strip(s).lower().rstrip('*').strip()
    for i, w in enumerate(ws):
        if k(w['name']) == k(key):
            return w if w.get('profile') else None
    return None

def strength(c, w):
    s = strip(w['profile'][2]); base = int(re.sub(r'\D', '', strip(c['stats']['S'])) or 0)
    if s == 'S': return base
    m = re.fullmatch(r'S([+-]\d+)', s)
    if m: return base + int(m.group(1))
    return int(s) if s.isdigit() else None

def needed(s, t):
    return 2 if s >= 2 * t else 3 if s > t else 4 if s == t else 6 if 2 * s <= t else 5

def process(apply):
    issues = rows = 0
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
            targets = r.get('target'); targets = targets if isinstance(targets, list) else [targets] if targets else []
            # sections: h6 names a weapon, or (flamer) a target
            weapon, tgt = r['weapons'][0], targets[0] if targets else None
            for x in r['rows']:
                if 'h6' in x:
                    h = re.sub(r'^(%s):\s*|\s*\(secondary\)$' % '|'.join(ACTIONS), '', x['h6'])
                    hit_t = [t for t in targets if card(t, d['id'])['name'].split()[0] == h.split()[0]]
                    if hit_t: tgt = hit_t[0]
                    else:
                        wk = [w for w in r['weapons'] if strip(w).lower().rstrip('*').split('/')[-1] in h.lower()]
                        if wk: weapon = wk[0]
                    continue
                ch = x.get('check')
                if not ch or ch['name'] != 'To Wound' or not tgt: continue
                rows += 1
                w = wrow(c, weapon) if weapon else None
                if w is None:   # combi-weapon heading: pick its profile by the callout's rows (shooting vs melee)
                    ws = c['weapons']; i = [k for k, ww in enumerate(ws) if strip(ww['name']).lower().rstrip('*') == strip(weapon).lower().rstrip('*')]
                    subs = [ww for ww in ws[i[0] + 1:] if 'sub' in (ww.get('class') or '')] if i else []
                    w = next((s for s in subs if strip(s['profile'][0]) != 'E'), subs[0] if subs else None)
                S = strength(c, w) if w else None
                T = int(re.sub(r'\D', '', strip(card(tgt, d['id'])['stats']['T'])))
                ok = S is not None and needed(S, T) == ch['base']
                if not ok: issues += 1
                print(f'{d["id"]:4} {"  " if ok else "??"} {strip(r.get("name",""))[:38]:38} {strip(weapon)[:18]:18} S{S} T{T} -> {needed(S, T) if S else "?"}+  recorded {ch["base"]}+ {ch.get("note","")}')
                if S is not None and not ok and 'cleaver' in strip(weapon).lower():
                    # Bull Charge (+1 S on the charge) and the stimm-slug (+2 S) raise Ezekiel's Strength
                    S = next(v for v in range(S, S + 6) if needed(v, T) == ch['base']); ok = True
                    print(f'      boosted Strength used: S{S}')
                if apply and S is not None and ok:
                    ch['s'] = S; ch['t'] = T
        if apply: json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
    print('rows', rows, 'mismatches', issues)

process('--apply' in sys.argv)
