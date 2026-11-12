"""One-off: turn each battle's hand-drawn board into placed pieces from data/terrain.json.
  python3 tools/build_terrain.py
Reads the boards as they were (battle.board runs of SVG elements) and writes
  data/terrain.json            the piece library, each piece drawn at its own origin
  data/battles/<id>.json       battle.terrain (placements and loose SVG), board runs using {pieces} / {labels}
Pieces used on more than one board (the round platform, manufactorum, rendering vats, containers) are
matched across boards, turned as needed.
"""
import json, math, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = lambda b: os.path.join(ROOT, f'data/battles/{b}.json')

def num(v): return float(v)
def fmt(v):
    v = round(v, 3)
    return str(int(v)) if v == int(v) else f'{v:.3f}'.rstrip('0').rstrip('.')
def pts(s): return [tuple(map(float, p.split(','))) for p in s.split()]
def unpts(P): return ' '.join(f'{fmt(x)},{fmt(y)}' for x, y in P)

# ---- geometry helpers on [tag, attrs, body] elements
def points_of(e):
    t, a = e[0], e[1]
    if 'points' in a: return pts(a['points'])
    if t == 'rect': x, y, w, h = (num(a[k]) for k in ('x', 'y', 'width', 'height')); return [(x, y), (x + w, y + h)]
    if t == 'circle': c, r = (num(a['cx']), num(a['cy'])), num(a['r']); return [(c[0] - r, c[1] - r), (c[0] + r, c[1] + r)]
    if t == 'text': return [(num(a['x']), num(a['y']))]
    return []
def mapxy(e, f):
    """Apply a point map f to an element (translate / rotate by multiples of 90)."""
    t, a = e[0], dict(e[1])
    if 'points' in a: a['points'] = unpts([f(p) for p in pts(a['points'])])
    elif t == 'circle': a['cx'], a['cy'] = map(fmt, f((num(a['cx']), num(a['cy']))))
    elif t == 'text': a['x'], a['y'] = map(fmt, f((num(a['x']), num(a['y']))))
    elif t == 'rect':
        x, y, w, h = (num(a[k]) for k in ('x', 'y', 'width', 'height'))
        c = [f(p) for p in ((x, y), (x + w, y + h))]
        a['x'], a['y'] = fmt(min(p[0] for p in c)), fmt(min(p[1] for p in c))
        a['width'], a['height'] = fmt(abs(c[1][0] - c[0][0])), fmt(abs(c[1][1] - c[0][1]))
    elif t == 'path': return e      # grids and deployment zones only, left as they are
    return [t, a] + e[2:]
def bbox_min(els):
    P = [p for e in els for p in points_of(e)]
    return (min(p[0] for p in P), min(p[1] for p in P))
def rot(turn):
    a = math.radians(turn); c, s = round(math.cos(a), 12), round(math.sin(a), 12)
    return lambda p: (p[0] * c - p[1] * s, p[0] * s + p[1] * c)

lib = {}
def define(pid, els, origin, label=None, label_xy=None, name=None):
    ox, oy = origin
    lib[pid] = {'name': name or (label if isinstance(label, str) else ' '.join(label or [])) or pid,
                'els': [mapxy(e, lambda p: (p[0] - ox, p[1] - oy)) for e in els]}
    if label: lib[pid]['label'] = label
    if label_xy: lib[pid]['labelAt'] = [round(label_xy[0] - ox, 1), round(label_xy[1] - oy, 1)]

def place(pid, at, turn=0, label=None, label_xy=None):
    p = {'piece': pid, 'at': [round(at[0], 2), round(at[1], 2)]}
    if turn: p['turn'] = turn
    piece = lib[pid]
    if label is not None and label != piece.get('label'): p['label'] = label
    if label is None and piece.get('label'): p['label'] = False
    if label and label_xy:
        dx, dy = piece.get('labelAt', [0, 0]); a = math.radians(turn)
        spot = (at[0] + dx * math.cos(a) - dy * math.sin(a), at[1] + dx * math.sin(a) + dy * math.cos(a))
        if abs(spot[0] - label_xy[0]) > 0.15 or abs(spot[1] - label_xy[1]) > 0.15: p['labelAt'] = [round(label_xy[0], 2), round(label_xy[1], 2)]
    return p

def match(pid, els):
    """Find the turn (0/90/180/270) and origin that lay library piece pid over els."""
    want = sorted((round(x, 1), round(y, 1)) for e in els for x, y in points_of(e))
    for turn in (0, 90, 180, 270):
        moved = [mapxy(e, rot(turn)) for e in lib[pid]['els']]
        got = [p for e in moved for p in points_of(e)]
        mx, my = min(p[0] for p in got), min(p[1] for p in got)
        wx, wy = min(p[0] for p in want), min(p[1] for p in want)
        shifted = sorted((round(x - mx + wx, 1), round(y - my + wy, 1)) for x, y in got)
        if len(shifted) == len(want) and all(abs(a[0] - b[0]) + abs(a[1] - b[1]) < 0.6 for a, b in zip(shifted, want)):
            return turn, (wx - mx, wy - my)
    raise SystemExit(f'{pid}: no turn matches')

def labels_by_text(els):
    return {e[2]: (num(e[1]['x']), num(e[1]['y'])) for e in els if e[0] == 'text' and e[1].get('class') == 'm-lab'}

def build(board_id, run, spec, labels, raw_keep):
    """spec: list of (indices, pid or None, label text/list or None). Unlisted indices stay loose, in order."""
    els = run
    used = {i for idx, _, _ in spec for i in idx}
    first = {min(idx): (idx, pid, lab) for idx, pid, lab in spec}
    out = []
    for i, e in enumerate(els):
        if i in raw_keep: continue
        if i in first:
            idx, pid, lab = first[i]
            group = [els[j] for j in idx]
            lxy = None
            if isinstance(lab, tuple): lab, lxy = lab      # (text, [x, y]) where two labels share a name
            elif lab: lxy = labels[lab if isinstance(lab, str) else lab[0]]
            if pid in lib:
                turn, at = match(pid, group)
                out.append(place(pid, at, turn, lab, lxy))
            else:
                origin = tuple(round(v, 1) for v in bbox_min(group))
                define(pid, group, origin, lab, lxy)
                out.append(place(pid, origin, 0, lab, lxy))
        elif i not in used:
            out.append(e)
    return out

# ---------------------------------------------------------------- the boards
def load(b): return json.load(open(B(b)))
if 'terrain' in load('2.1'): raise SystemExit('Already converted: the boards use data/terrain.json')
def save(b, d): open(B(b), 'w').write(json.dumps(d, indent=1, ensure_ascii=False) + '\n')

# 2.1 first: its pieces are the shared ones
d = load('2.1'); bd = d['board']; t2 = bd['terrain-2']; labs = labels_by_text(bd['terrain-3'])
# the containers are drawn as one standard container and lid, placed
define('container', [['rect', {'class': 'm-solid', 'x': '0', 'y': '0', 'width': '105', 'height': '50'}]], (0, 0), name='Container')
define('container-lid', [['rect', {'class': 'm-top', 'x': '0', 'y': '0', 'width': '107.5', 'height': '50'}]], (0, 0), name='Container lid')
spec21 = [([3, 4], 'round-platform', 'Smoke stack'), ([12], 'tank', 'Tank'),
          ([13, 14, 15, 16], 'ruin-west', 'Ruin'), ([17, 18, 19], 'gothic-ruin', 'Gothic ruin'),
          ([20, 21, 22, 23], 'manufactorum', 'Manufactorum'), ([24, 25, 26, 27], 'rendering-vats', 'Rendering vats'),
          ([30, 31, 32, 33, 34], 'starch-silo', 'Starch silo'), (list(range(35, 45)), 'bone-yard', 'Bone yard')]
# the round platform's origin is its centre
define('round-platform', [t2[3], t2[4]], (93.5, 101.2), 'Smoke stack', labs['Smoke stack'], name='Round platform')
ter = build('2.1', t2, spec21, labs, raw_keep={0, 1, 2, 9, 10, 11})
ci = ter.index(next(e for e in ter if isinstance(e, list) and e[1].get('class') == 'm-wall' and e[1]['points'].startswith('319')))
ter[ci + 1:ci + 1] = [place('container', (460.9, 13.8)), place('container', (462.6, 96.9)),
                      dict(place('container-lid', (540.9, 26.2), 90), label='Containers', labelAt=list(labs['Containers']))]
lib['round-platform']['name'] = 'Round platform'
d['terrain'] = ter
bd['terrain-2'] = t2[:3] + [{'pieces': True}]
bd['terrain-3'] = [e for e in bd['terrain-3'] if not (e[0] == 'text' and e[1].get('class') == 'm-lab')] + [{'labels': True}]
save('2.1', d)

# 2.2 reuses round platform, manufactorum, rendering vats (turned) and containers
d = load('2.2'); bd = d['board']; t2 = bd['terrain-2']; t3 = bd['terrain-3']; labs = labels_by_text(t3)
spec22 = [([5, 6, 7, 8], 'rendering-vats', 'Casting hall'), ([12, 13, 14, 15], 'manufactorum', 'Shell works'),
          ([19, 20], 'magazine', 'Magazine'), ([24, 25], 'quench-house', 'Quench house'),
          ([26, 27], 'round-platform', 'Furnace'), ([30, 31, 32, 33], 'anvil', 'Anvil')]
ter = build('2.2', t2, spec22, labs, raw_keep={0, 1, 2, 3, 4, 9, 10, 11})
ci = ter.index(next(e for e in ter if isinstance(e, dict) and e['piece'] == 'rendering-vats')) + 1
ter[ci:ci] = [place('container', (220, 107.2), 30), place('container', (270, 20.6), 30),
              dict(place('container-lid', (229.4, 145.8), -60), label='Containers', labelAt=list(labs['Containers']))]
d['terrain'] = ter
bd['terrain-2'] = t2[:5] + [{'pieces': True}]
bd['terrain-3'] = [{'labels': True}] + [e for e in t3 if not (e[0] == 'text' and e[1].get('class') == 'm-lab')]
save('2.2', d)

# 1.1: its own (earlier) drawings, one piece per labelled feature
d = load('1.1'); bd = d['board']; t = bd['terrain']; labs = labels_by_text(t)
spec11 = [([4, 19], 'v1-ruined-floor', 'Ruined floor'), ([6], 'v1-tank', 'Tank'),
          ([10, 11, 14, 15], 'v1-ruined-tower', ['Ruined', 'tower']), ([21], 'v1-gothic-ruin-west', ('Gothic ruin', (62.5, 190))),
          ([23], 'v1-walled-yard', 'Walled yard'), ([26], 'v1-gothic-ruin-east', ('Gothic ruin', (472.5, 87.5))),
          ([29, 30, 31, 32], 'v1-containers', 'Containers'), ([36, 37, 38], 'v1-stairs', 'Stairs'),
          ([40, 41, 42, 43, 44], 'v1-hex-tower', None)   # named Hex tower in the library afterwards]
textidx = {i for i, e in enumerate(t) if e[0] == 'text' and e[1].get('class') == 'm-lab'}
ter = build('1.1', t, spec11, labs, raw_keep={0, 1, 2, 3} | textidx)
d['terrain'] = ter
bd['terrain'] = t[:4] + [{'pieces': True}, {'labels': True}]
save('1.1', d)

# 1.2: the terrain was drawn turned 180° in one group; turn it back to plain coordinates
d = load('1.2'); bd = d['board']; t = bd['terrain']
g = next(e for e in t if e[0] == 'g')
flip = lambda p: (600 - p[0], 600 - p[1])
inner = [mapxy(e, flip) for e in g[2]]
labs = labels_by_text(t)
spec12 = [([1, 2, 3, 4], 'v1-ruined-tower-b', 'Ruined tower'), ([5, 6, 7], 'v1-containers-b', 'Containers'),
          ([9], 'v1-gothic-ruin-b', 'Gothic ruin'), ([12], 'v1-still', 'Still'),
          ([20, 21, 22, 23, 24], 'v1-ruined-stills', 'Ruined stills'), ([25, 26, 27], 'v1-stairs-b', 'Stairs'),
          ([28, 29, 30], 'v1-sealed-vent', 'Sealed vent')]
ter = build('1.2', inner, spec12, labs, raw_keep={0, 31, 32})
d['terrain'] = ter
gi = t.index(g)
bd['terrain'] = t[:gi] + [inner[0], {'pieces': True}, inner[31], inner[32]] + \
    [e for e in t[gi + 1:] if not (e[0] == 'text' and e[1].get('class') == 'm-lab')] + [{'labels': True}]
save('1.2', d)

open(os.path.join(ROOT, 'data/terrain.json'), 'w').write(json.dumps({
    '_about': 'Terrain pieces, each drawn at its own origin. Battles place them in battle.terrain: {piece, at:[x,y], turn, label, labelAt}. 600 units = 24".',
    'pieces': lib}, indent=1, ensure_ascii=False) + '\n')
print('pieces:', ', '.join(lib))
