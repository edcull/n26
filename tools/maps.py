"""Turn battle map SVGs into board + token data (used by convert.py).

Two passes per battle: parse() every map into element lists, then finish()
works out which elements all of the battle's maps share. Each unbroken run of
shared elements is stored once under battle["board"] and referenced from the
maps as {"board": name}; what changes between maps is stored as tokens
({"tok"}), status badges ({"b"}), Out of Action skulls ({"ooa"}) or plain
elements ({"el"}).
"""
import json, re
from bs4 import BeautifulSoup, Tag


def num(v):
    f = float(v)
    return int(f) if f == int(f) and '.' not in v else f


def el(t):
    attrs = {k: (' '.join(v) if isinstance(v, list) else v) for k, v in t.attrs.items()}
    kids = [c for c in t.children if isinstance(c, Tag)]
    if kids:
        return [t.name, attrs, [el(c) for c in kids]]
    txt = t.get_text()
    return [t.name, attrs, txt] if txt else [t.name, attrs]


def key(e): return json.dumps(e, sort_keys=True)


def parse(svg_html):
    s = BeautifulSoup(svg_html, 'html.parser').svg
    if set(s.attrs) != {'viewbox', 'role', 'aria-label'} or s.get('role') != 'img':
        return None
    m = {'viewBox': s['viewbox'], 'label': s['aria-label'], 'top': []}
    for k in (c for c in s.children if isinstance(c, Tag)):
        if k.name == 'defs':
            cp = k.find('clippath'); r = cp.find('rect') if cp else None
            if cp and len(k.find_all(True)) == 2 and r.attrs == {'x': '0', 'y': '0', 'width': '600', 'height': '600'}:
                m['clip'] = cp['id']; continue
        if k.name == 'g' and m.get('clip') and k.get('clip-path') == f"url(#{m['clip']})" and len(k.attrs) == 1:
            m['top'].append(('clip', [el(c) for c in k.children if isinstance(c, Tag)])); continue
        m['top'].append(el(k))
    return m


def tok_or_badge(children, i):
    e = children[i]; nxt = children[i + 1] if i + 1 < len(children) else None
    if not isinstance(e, list): return None, 0
    c = e[1].get('class', ''); a = e[1]
    if e[0] == 'circle' and c in ('tok-p', 'tok-t') and isinstance(nxt, list) and nxt[0] == 'text' and nxt[1].get('class', '').startswith('tok-n') \
            and set(a) == {'class', 'cx', 'cy', 'r'} and set(nxt[1]) == {'class', 'x', 'y'} and nxt[1]['x'] == a['cx'] and len(nxt) == 3:
        text = nxt[2]; tok = {'s': c[-1], 'x': num(a['cx']), 'y': num(a['cy']), 't': text}
        if a['r'] != '12.5': tok['r'] = num(a['r'])
        ty = num(nxt[1]['y'])
        if round(ty - tok['y'], 2) != 5.5: tok['ty'] = ty
        if nxt[1]['class'] != ('tok-n two' if len(text) > 1 else 'tok-n'): tok['tc'] = nxt[1]['class']
        return {'tok': tok}, 2
    if e[0] == 'circle' and c.startswith('b-') and isinstance(nxt, list) and nxt[0] == 'text' and nxt[1].get('class') == 'b-t' \
            and a.get('r') == '8.5' and set(a) == {'class', 'cx', 'cy', 'r'} and nxt[1]['x'] == a['cx'] and set(nxt[1]) == {'class', 'x', 'y'}:
        b = {'k': c[2:], 'x': num(a['cx']), 'y': num(a['cy']), 't': nxt[2]}
        ty = num(nxt[1]['y'])
        if round(ty - b['y'], 2) != 3.8: b['ty'] = ty
        return {'b': b}, 2
    if e[0] == 'text' and c == 'ooa-e' and a.get('aria-label') == 'Out of Action' and len(e) == 3 and e[2] == '💀' and set(a) == {'class', 'x', 'y', 'aria-label'}:
        return {'ooa': [num(a['x']), num(a['y'])]}, 1
    return None, 0


NAMES = {'m-edge': 'edges', 'm-mat': 'mat', 'm-grid': 'grid', 'm-lab': 'labels', 'm-tick': 'ticks', 'm-centre': 'marks', 'm-obj': 'marks', 'm-turf': 'marks'}


def board_name(board, run):
    cats = [NAMES.get(e[1].get('class', '').split(' ')[0]) for e in run]
    cat = cats[0] if len(set(cats)) == 1 and cats[0] else 'terrain'
    n, name = 1, cat
    while name in board and board[name] != run:
        n += 1; name = f'{cat}-{n}'
    board[name] = run
    return name


def entries(children, common, board):
    out, i, run = [], 0, []
    def flush():
        if run:
            out.append({'board': board_name(board, list(run))}); run.clear()
    while i < len(children):
        x = children[i]
        if isinstance(x, tuple):  # clipped group
            flush(); out.append({'clip': entries(x[1], common, board)}); i += 1; continue
        got, n = tok_or_badge(children, i)
        if got:
            flush(); out.append(got); i += n; continue
        if key(x) in common:
            run.append(x)
        else:
            flush(); out.append({'el': x})
        i += 1
    flush()
    return out


def finish(maps, board):
    def flat(items):
        for x in items:
            if isinstance(x, tuple): yield from flat(x[1])
            else: yield key(x)
    sets = [set(flat(m['top'])) for m in maps]
    common = set.intersection(*sets) if len(sets) > 1 else sets[0]
    for m in maps:
        m['items'] = entries(m.pop('top'), common, board)
