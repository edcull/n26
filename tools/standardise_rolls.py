"""Standardise roll-callout wording, colours and labels in data/battles/*.json.

  python3 tools/standardise_rolls.py          # list the changes
  python3 tools/standardise_rolls.py --apply  # write them
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS = {'1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six'}

RESULT = [  # exact rewrites, applied before the pattern rules
    ('Misses', 'Miss'), ('Missed', 'Miss'), ('Misses!', 'Miss'), ('Hits', 'Hit'), ('Wounds', 'Wound'),
    ('Serious Injury', 'Serious injury'), ('Seriously Injured', 'Serious injury'),
    ('Still Seriously Injured', 'Still seriously injured'),
    ('One wound caused', 'One wound'), ('Causes one wound', 'One wound'), ('Takes one wound', 'One wound'),
    ('Takes a wound', 'One wound'), ('Two wounds caused', 'Two wounds'), ('Takes three wounds', 'Three wounds'),
    ('Causes one wound and Suppressed', 'One wound, suppressed'), ('Causes two wounds and Suppressed', 'Two wounds, suppressed'),
    ('Takes one wound and Suppressed', 'One wound, suppressed'), ('Takes a wound and is suppressed', 'One wound, suppressed'),
    ('One wound caused, Suppressed and activation interrupted', 'One wound, suppressed, activation interrupted'),
    ('Saved, Suppressed', 'Saved, suppressed'), ('Injured and Suppressed', 'Injured, suppressed'),
    ('Out of ammo', 'Out of Ammo'), ('Hits, out of ammo', 'Hit, Out of Ammo'), ('Hits, Out of Ammo', 'Hit, Out of Ammo'),
    ('Misses, out of ammo', 'Miss, Out of Ammo'), ('Miss, Out of Ammo', 'Miss, Out of Ammo'), ('One hit, out of ammo', 'One hit, Out of Ammo'),
    ('Maintained', 'Maintains'), ('Fails to hit!', 'Miss'), ('1" short!', '1" short'),
]
RESULT = dict(RESULT)

RED = re.compile(r'wound|injur|Out of Action|out of action|Perils|Warp|Unstable|Bottle|Executed|Stays down|Grievous|No save|Void drops', re.I)
YELLOW = re.compile(r'suppress|Insanity|webbed|break free', re.I)
NEUTRAL = re.compile(r'not suppressed|^(One|Two|Three|Four|Five|Six) hits?\b|^Hits?\b|^(Misses and )?fails to (wound|hit)(, fails to (wound|hit))?$', re.I)


def colour(text):
    """'' = red (wounds, injuries, bad outcomes), 'sup' = yellow (conditions such as suppressed), 'ammo' = neutral."""
    if not text: return None
    if NEUTRAL.search(text): return 'ammo'
    if YELLOW.search(text): return 'sup'
    if RED.search(text): return ''
    return 'ammo'


def num_mods(s):
    """'+1 cover AP -2' -> [(+1, 'cover'), (-2, 'AP')]; words without a number are kept as (None, word)."""
    out = []
    ap = re.search(r'AP (-\d+)', s)
    if ap: s = (s[:ap.start()] + s[ap.end():]).strip()
    for tok in re.split(r',\s*|\s+(?=[+-]\d)', s.strip()):
        tok = tok.strip()
        if not tok: continue
        m = re.fullmatch(r'([+-]\d+) (.+)', tok)
        out.append((int(m.group(1)), m.group(2).strip()) if m else (None, tok))
    if ap: out.append((int(ap.group(1)), 'AP'))
    return out


def label(l):
    m = re.fullmatch(r'(To Hit|To Wound|Save) \((\d)\+,? ?(.*)\)', l)
    if m:
        kind, base, rest = m.group(1), int(m.group(2)), m.group(3)
        mods = num_mods(rest) if rest else []
        parts = []
        for v, name in mods:
            if name == 'aimed shot': name = 'aim'
            parts.append(name if v is None else f'AP {v}' if name == 'AP' else f'{v:+d} {name}')
        # positive modifiers lower the number needed, negative ones raise it; AP -n makes a save n worse
        total = base
        for v, name in mods:
            if v is None: continue
            total += abs(v) if name == 'AP' else -v
        tgt = 'none' if kind == 'Save' and total > 6 else f'{max(total, 2)}+'
        return f'{kind} ({", ".join([tgt] + parts)})'
    m = re.fullmatch(r'([A-Z][\w ]+?) \((Leadership|Cool|Str|Strength) (\d+)\)', l)
    if m:
        who, stat, n = m.groups()
        return f'{who}: {"Strength" if stat == "Str" else stat} {n}'
    m = re.fullmatch(r'([A-Z][\w ]+?): (Str|Strength) (\d+)', l)
    if m: return f'{m.group(1)}: Strength {m.group(3)}'
    if l == 'Injury roll': return 'Injury'
    return l


def fix_note(n):
    if n.startswith(('Note:', 'Rules note:', 'Initiative')): 
        return re.sub(r'^Note: ([a-z])', lambda m: 'Note: ' + m.group(1).upper(), n)
    return 'Note: ' + n


def process(apply):
    changes = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
        d = json.load(open(f))
        def walk(n):
            if isinstance(n, dict):
                if isinstance(n.get('roll'), dict): yield n['roll']
                yield from n.get('captures', [])
                for v in n.values(): yield from walk(v)
            elif isinstance(n, list):
                for v in n: yield from walk(v)
        for r in walk(d):
            def log(what, a, b):
                nonlocal changes
                if a != b:
                    changes += 1
                    print(f'{d["id"]:4} {r["name"][:34]:34} {what:7} {a!r} -> {b!r}')
            for target, key, ckey in [(r, 'result', 'resultClass')] + [(x, 'result', 'resultClass') for x in r['rows'] if 'label' in x]:
                old, oldc = target[key], target.get(ckey, '')
                new = RESULT.get(old, old)
                newc = colour(new)
                log('result', old, new)
                log('colour', oldc or '(red)', ('(none)' if newc is None else newc or '(red)') if new else '(none)')
                target[key] = new
                if not new or newc == '': target.pop(ckey, None)
                else: target[ckey] = newc
            for x in r['rows']:
                if 'label' in x:
                    nl = label(x['label']); log('label', x['label'], nl); x['label'] = nl
                    if nl.startswith('Save (none') and x.get('dice'):
                        log('dice', x['dice'], ''); x['dice'] = ''   # no save possible, so no save die
                if 'note' in x:
                    nn = fix_note(x['note']); log('note', x['note'][:50], nn[:50]); x['note'] = nn
            nn = r['name'].replace('Coup de Grace', 'Coup de Grâce')
            log('name', r['name'], nn); r['name'] = nn
        if apply:
            json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False)
    print(changes, 'changes')


if __name__ == '__main__':
    # One-off: labels are recalculated from base to total, so running it twice would shift them again.
    if any('Save (none' in open(f).read() for f in glob.glob(os.path.join(ROOT, 'data/battles/*.json'))):
        sys.exit('Already applied: the battle data uses the standardised labels.')
    process('--apply' in sys.argv)
