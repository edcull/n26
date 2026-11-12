"""Convert the hand-written HTML pages into JSON under data/.

Run from the repo root:  python3 tools/convert.py 2.1 [1.1 ...]
Anything the converter does not model yet is kept as raw HTML ({"html": ...})
so the rendered page still matches; tools/convert.py --report lists those.
"""
import json, os, re, subprocess, sys
from bs4 import BeautifulSoup, NavigableString, Tag
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import maps as mapconv
BOARD = {}
MAPS = []

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_REV = '0f622e9'   # last commit where the pages were hand-written HTML


def source(page):
    return subprocess.run(['git', 'show', f'{SRC_REV}:{page}.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def write_shell(page, kind, src):
    """Replace <page>.html with a thin shell; page-specific CSS goes to css/pages/<page>.css."""
    html = source(page)
    head = html[html.index('<head>') + 6:html.index('</head>')]
    css = ''.join(re.findall(r'<style>(.*?)</style>', head, re.S)).strip('\r\n')
    head = re.sub(r'<style>.*?</style>\s*', '', head, flags=re.S).strip('\r\n').replace('\r\n', '\n')
    if css:
        os.makedirs(os.path.join(ROOT, 'css', 'pages'), exist_ok=True)
        css = re.sub(r'url\((["\']?)(images|fonts)/', r'url(\1../../\2/', css)
        open(os.path.join(ROOT, 'css', 'pages', page + '.css'), 'w').write(css.replace('\r\n', '\n') + '\n')
        head += f'\n<link rel="stylesheet" href="css/pages/{page}.css">'
    shell = f'<!doctype html>\n<html lang="en">\n<head>\n{head}\n<script type="module" src="js/main.js"></script>\n</head>\n<body data-page="{kind}" data-src="{src}">\n</body>\n</html>\n'
    open(os.path.join(ROOT, page + '.html'), 'w').write(shell)
RULES_FN = os.path.join(ROOT, 'data', 'rules.json')
rules = json.load(open(RULES_FN)) if os.path.exists(RULES_FN) else {}
raw_count = {}

DICE = {
    'Firepower dice showing 1 bullet': 'f1', 'Firepower dice showing 1 bullet and an ammo symbol': 'f1a',
    'Firepower dice showing 2 bullets': 'f2', 'Firepower dice showing 3 bullets': 'f3',
    'Injury dice showing a Flesh Wound cross': 'fw', 'Injury dice showing a Serious Injury broken bone': 'si',
    'Injury dice showing an Out of Action skull': 'ooa',
}
for n in range(1, 7):
    DICE[f'Dice showing a {n}'] = str(n)


def cls(t):
    return t.get('class') or []


def raw(t, why):
    raw_count[why] = raw_count.get(why, 0) + 1
    return {'html': str(t)}


def tip_key(label, tip):
    """Register a tooltip text under its label; a different text for the same label gets ' #2' etc."""
    key, n = label, 2
    while key in rules and rules[key] != tip:
        key = f'{label} #{n}'; n += 1
    rules[key] = tip
    return key


def inner(t):
    return ''.join(str(c) if isinstance(c, Tag) else escape_text(str(c)) for c in t.children)


def escape_text(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline(t):
    """Inner HTML of t, with fighter links and gang names turned into {@id|text} and {p:text} markup."""
    out = []
    for c in t.children:
        if isinstance(c, NavigableString):
            out.append(escape_text(str(c)))
        elif c.name == 'button' and 'fname' in cls(c) and len(c.contents) == 1 and isinstance(c.contents[0], NavigableString):
            fid = c['popovertarget'][3:]
            out.append('{@' + fid + '|' + c.get_text() + '}')
        elif c.name == 'span' and cls(c) in (['p'], ['t']) and not c.find(True):
            out.append('{' + cls(c)[0] + ':' + c.get_text() + '}')
        elif c.name == 'span' and 'sk' in cls(c) and cls(c)[-1] == 'sk' and c.get('data-tip') is not None and not c.find(True) and c.get('tabindex') == '0' and len(c.attrs) == 3:
            mod = ''.join('.' + x for x in cls(c)[:-1])
            out.append('{tip' + mod + ':' + tip_key(c.get_text(), c['data-tip']) + '}')
        else:
            out.append(str(c))
    return ''.join(out)


def kids(t):
    return [c for c in t.children if isinstance(c, Tag)]


# ---------------------------------------------------------------- fighters
STAT_CLS = {'Ld': 'm', 'Cl': 'm', 'Wil': 'm', 'Int': 'm', 'XP': 'x'}


def fighter(art):
    f = {}
    fh = art.find('div', class_='fh')
    img = fh.find('img', class_='roundel')
    h4 = fh.find('h4')
    f['name'] = h4.get_text()
    if cls(h4): f['nameClass'] = ' '.join(cls(h4))
    f['portrait'] = img['src']
    f['type'] = inline(fh.find('h4').find_next_sibling('p'))
    extra = [c for c in kids(fh.find('h4').parent) if c.name not in ('h4',) and c is not fh.find('h4').find_next_sibling('p')]
    if extra: f['typeExtra'] = ''.join(str(e) for e in extra)
    cost = fh.find('div', class_='cost')
    f['cost'] = cost.find('b').decode_contents()
    if cost.find('span').get_text() != 'credits': f['costLabel'] = cost.find('span').decode_contents()
    stats = art.find('div', class_='stats')
    f['stats'] = {}
    hl = {}
    for c in kids(stats):
        k = c.find('span').get_text(); v = c.find('b').decode_contents()
        if c.name == 'button' and 'xp-btn' in cls(c):
            want = {'class', 'popovertarget', 'aria-label'} | ({'type'} if c.get('type') else set())
            if set(c.attrs) != want or c['aria-label'] != f['name'] + ' XP breakdown' or c.get('type', 'button') != 'button':
                raise ValueError('xp button')
            f['xpPop'] = c['popovertarget'][3:]
            if c.get('type'): f['xpPopType'] = True
            c = BeautifulSoup('<div class="%s">%s</div>' % (' '.join(x for x in cls(c) if x != 'xp-btn'), c.decode_contents()), 'html.parser').div
        f['stats'][k] = v
        extra = [x for x in cls(c) if x not in ('c', 'm', 'x')]
        if [x for x in cls(c) if x in ('m', 'x')] != ([STAT_CLS[k]] if k in STAT_CLS else []):
            raise ValueError('stat class ' + str(cls(c)))
        if extra: hl[k] = ' '.join(extra)
        if len(kids(c)) != 2 or c.name != 'div': raise ValueError('stat shape')
    if hl: f['statClass'] = hl
    if stats.get('aria-label') != f['name'] + ' characteristics': raise ValueError('stats label')
    w = art.find('div', class_='weapons')
    if w:
        f['weapons'] = []
        rows = kids(w)
        if rows[0].get_text('|') != 'Weapon|SR|LR|Str|AP|L': raise ValueError('weapon head')
        for r in rows[1:]:
            ws = {}
            cells = kids(r)
            wn = cells[0]
            if 'wp' not in cls(r) or 'wn' not in cls(wn): raise ValueError('weapon row')
            rc = [x for x in cls(r) if x != 'wp']
            if rc: ws['class'] = ' '.join(rc)
            ws['name'] = inline(wn)
            nc = [x for x in cls(wn) if x != 'wn']
            if nc: ws['nameClass'] = ' '.join(nc)
            vals = [c for c in cells[1:] if 'wv' in cls(c)]
            if vals:
                ws['profile'] = [v.decode_contents() for v in vals]
                vc = [' '.join(x for x in cls(v) if x != 'wv') for v in vals]
                if any(vc): ws['profileClass'] = vc
            rest = cells[1 + len(vals):]
            if cells[1:1 + len(vals)] != vals: raise ValueError('weapon cell order')
            if rest:
                wt = rest[0]
                if cls(wt) != ['wt'] or len(rest) > 1: raise ValueError('weapon traits')
                ws['traits'] = inline(wt)
            f['weapons'].append(ws)
    foot = art.find('div', class_='foot')
    if foot:
        f['foot'] = []
        for p in kids(foot):
            b = p.find('b')
            if p.name == 'p' and b is p.contents[0] and not cls(b) and isinstance(p.contents[1], NavigableString) and p.contents[1].startswith(' '):
                rest = BeautifulSoup('<p>' + ''.join(str(x) for x in p.contents[1:]) + '</p>', 'html.parser').p
                txt = inline(rest)
                f['foot'].append({'label': b.get_text(), 'text': txt[1:]})
            else:
                f['foot'].append({'html': inline(p)})
    expected = {'fh', 'stats', 'weapons', 'foot'}
    for c in kids(art):
        if not set(cls(c)) & expected: raise ValueError('fighter part ' + str(cls(c)))
    return f


# ---------------------------------------------------------------- rolls
def roll(d):
    r = {}
    s = d.find('summary')
    m = re.fullmatch(r'--n:(\d+)', d.get('style', ''))
    n = int(m.group(1)) if m else None
    parts = kids(s)
    face = [c for c in parts if 'r-face' in cls(c)]
    if face:
        fc = cls(face[0]); r['side'] = fc[1]; r['face'] = fc[2][5:]
        if len(fc) != 3 or face[0].get('aria-hidden') != 'true': raise ValueError('face')
    name = s.find('span', class_='r-name'); res = s.find('span', class_='r-res')
    r['name'] = inline(name)
    r['result'] = inline(res)
    rc = [x for x in cls(res) if x != 'r-res']
    if rc: r['resultClass'] = ' '.join(rc)
    if len(parts) != len(face) + 2: raise ValueError('summary parts')
    body = d.find('div', class_='roll-body')
    items = []
    maxd = 0
    for c in kids(body):
        if c.name == 'div' and cls(c) == ['roll-row']:
            ch = kids(c)
            label, dice, res2 = ch[0], ch[1], ch[2]
            if len(ch) != 3 or label.name != 'span' or cls(dice) != ['dice']: raise ValueError('row')
            codes = []
            for dd in kids(dice):
                if dd.name == 'svg':
                    codes.append(DICE[dd['aria-label']])
                else:
                    codes.append({'html': str(dd)})
            maxd = max(maxd, len(codes))
            row = {'label': inline(label), 'dice': ' '.join(codes) if all(isinstance(x, str) for x in codes) else codes, 'result': inline(res2)}
            if res2.name != 'strong': row['resultTag'] = res2.name
            if cls(res2): row['resultClass'] = ' '.join(cls(res2))
            if label.attrs: raise ValueError('label attrs')
            items.append(row)
        elif c.name == 'p' and cls(c) == ['roll-note']:
            items.append({'note': inline(c)})
        elif c.name == 'h6' and not c.attrs:
            items.append({'h6': inline(c)})
        else:
            items.append(raw(c, 'roll-body item'))
    r['rows'] = items
    if n != maxd:
        r['n'] = n
    return r


# ---------------------------------------------------------------- blocks
def photo(fig):
    img = fig.find('img')
    p = {'src': img['src'], 'alt': img.get('alt', '')}
    if cls(img) != ['whole']: p['imgClass'] = ' '.join(cls(img))
    extra = [x for x in cls(fig) if x != 'shot']
    if extra: p['class'] = ' '.join(extra)
    cap = fig.find('figcaption')
    if cap is not None: p['caption'] = inline(cap)
    if len(kids(fig)) != (2 if cap is not None else 1) or 'shot' not in cls(fig): raise ValueError('photo')
    return p


def text_items(div):
    out = []
    for c in kids(div):
        if c.name == 'p' and not c.attrs:
            out.append(inline(c))
        elif c.name == 'p' and list(c.attrs) == ['class']:
            out.append({'p': inline(c), 'class': ' '.join(cls(c))})
        elif c.name == 'details' and cls(c) == ['roll']:
            try:
                out.append({'roll': roll(c)})
            except Exception as e:
                out.append(raw(c, 'roll: ' + str(e)))
        else:
            out.append(raw(c, f'text item {c.name}.{".".join(cls(c))}'))
    return out


def round_block(c):
    k = cls(c)
    if c.name == 'div' and 'round-split' in k:
        b = {'split': [x for x in k if x != 'round-split']}
        ch = kids(c)
        if cls(ch[0]) != ['round-text']: return raw(c, 'split shape')
        b['text'] = text_items(ch[0])
        if len(ch) > 1:
            if len(ch) != 2 or cls(ch[1]) != ['ports']: return raw(c, 'split ports')
            b['ports'] = [photo(f) for f in kids(ch[1])]
        return b
    if c.name == 'div' and k == ['round-text']:
        return {'text': text_items(c)}
    if c.name == 'div' and k[:1] == ['ends']:
        b = {'ends': [photo(f) for f in kids(c)]}
        if k[1:]: b['class'] = ' '.join(k[1:])
        return b
    if c.name == 'figure' and 'shot' in k:
        return {'photo': photo(c)}
    if c.name == 'figure' and k == ['map']:
        svg = c.find('svg'); cap = c.find('figcaption')
        mp = mapconv.parse(str(svg))
        if mp: MAPS.append(mp)
        b = {'map': mp if mp else {'svg': str(svg)}}
        if mp is None: raw_count['map svg'] = raw_count.get('map svg', 0) + 1
        if cap is not None: b['map']['caption'] = map_caption(cap)
        if len(kids(c)) != (2 if cap is not None else 1): return raw(c, 'map shape')
        return b
    if c.name == 'p' and k == ['vp']:
        return {'vp': inline(c)}
    if c.name == 'p' and k == ['todo']:
        return {'todo': inline(c)}
    if c.name == 'h4' and k == ['ends-head']:
        return {'endsHead': inline(c)}
    if c.name == 'details' and k == ['roll']:
        return {'roll': roll(c)}
    return raw(c, f'round block {c.name}.{".".join(k)}')


def map_caption(cap):
    ch = kids(cap)
    ul = [x for x in ch if x.name == 'ul' and cls(x) == ['b-key']]
    ps = [x for x in ch if x.name == 'p' and not x.attrs]
    if len(ch) != len(ul) + len(ps) or len(ul) > 1 or len(ps) > 1 or (ul and ch[-1] is not ul[0]):
        return inline(cap)
    out = {}
    if ps: out['text'] = inline(ps[0])
    if ul:
        key = []
        for li in kids(ul[0]):
            sp = li.find('span'); label = ''.join(str(x) for x in li.contents[1:])
            if cls(sp)[:1] == ['b'] and len(cls(sp)) == 2:
                key.append([cls(sp)[1][2:], sp.get_text(), label])
            elif cls(sp) == ['ooa-k']:
                key.append(['ooa', sp.get_text(), label])
            else:
                return inline(cap)
        out['key'] = key
    return out


def rnd(art):
    r = {'id': art['id']}
    ch = kids(art)
    no, body = ch
    r['no'] = no.get_text()
    bk = kids(body)
    head = bk[0]
    if head.name != 'div' or head.attrs or len(kids(head)) != 1 or kids(head)[0].name != 'h3':
        raise ValueError('round head')
    r['title'] = inline(kids(head)[0])
    r['blocks'] = [round_block(c) for c in bk[1:]]
    return r


# ---------------------------------------------------------------- gangs
def dl_pairs(dl):
    out = []
    for d in kids(dl):
        dt, dd = kids(d)
        out.append([inline(dt), inline(dd)])
    return out


def chips(dd):
    out = []
    for s in kids(dd):
        if s.name != 'span' or 'chip' not in cls(s) or 'sk' not in cls(s): return None
        c = {'tip': tip_key(s.get_text(), s['data-tip'])}
        if 'used' in cls(s):
            c['used'] = True
            svg = s.find('svg')
            if svg is None or svg.get('aria-label') not in ('Picked', 'Used'): return None
            c['usedLabel'] = svg['aria-label']
        if set(cls(s)) - {'chip', 'sk', 'used'}: return None
        out.append(c)
    return out


def gang_block(g):
    out = {'class': [x for x in cls(g) if x != 'gang'][0]}
    blocks = []
    for c in kids(g):
        k = cls(c)
        if k == ['gang-head']:
            img = c.find('img', class_='portrait')
            out['portrait'] = img['src']
            out['name'] = c.find('h3').get_text(); out['house'] = c.find('p', class_='house').get_text()
        elif c.name == 'figure':
            blocks.append({'photo': photo(c)})
        elif c.name == 'dl' and 'sheet' in k:
            blocks.append({'sheet': dl_pairs(c), 'class': ' '.join(x for x in k if x != 'sheet')})
        elif c.name == 'dl' and k == ['assets']:
            a = []
            for d in kids(c):
                dt, dd = kids(d)
                ch = chips(dd)
                a.append({'label': dt.get_text(), 'chips': ch} if ch is not None else {'label': dt.get_text(), 'html': inline(dd)})
            blocks.append({'assets': a})
        elif c.name == 'details' and 'bench-panel' in k:
            fs = []
            for art in c.find('div', class_='fighters').find_all('article', recursive=False):
                fs.append(fighter_ref(art))
            blocks.append({'panel': c.find('summary').get_text(), 'class': ' '.join(x for x in k if x != 'bench-panel'), 'fighters': fs})
        else:
            blocks.append(raw(c, 'gang block ' + c.name))
    out['blocks'] = blocks
    return out


FIGHTERS = {}


def fid_for(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def fighter_ref(art):
    f = fighter(art)
    fid = fid_for(f['name'])
    if fid in FIGHTERS and FIGHTERS[fid] != f:
        raise ValueError('fighter differs ' + fid)
    FIGHTERS[fid] = f
    ref = {'id': fid}
    extra = [x for x in cls(art) if x != 'fighter']
    if extra: ref['class'] = ' '.join(extra)
    return ref


# ---------------------------------------------------------------- page
def battle(page):
    FIGHTERS.clear(); BOARD.clear(); MAPS.clear()
    html = source(page)
    s = BeautifulSoup(html, 'lxml')
    d = {'page': 'battle', 'id': page, 'title': s.title.get_text()}
    hero = s.find('header', class_='hero')
    d['kicker'] = inline(hero.find('p', class_='kicker'))
    h1 = hero.find('h1'); d['cycle'] = h1.find('small').get_text(); d['name'] = h1.contents[-1]
    d['sides'] = []
    for sd in hero.select('.versus .side'):
        d['sides'].append({'img': sd.find('img')['src'], 'name': sd.find('strong').get_text(), 'note': sd.find('span').get_text()})
    main = s.find('main')
    for sec in main.find_all('section', recursive=False):
        sid = sec['id']
        ch = kids(sec)
        if ch[0].name != 'h2': raise ValueError('section head')
        if sid == 'intro':
            d['intro'] = [inline(p) for p in kids(ch[1])]
            d['introHeading'] = ch[0].get_text()
        elif sid == 'setup':
            st = ch[1]
            d['setup'] = {'facts': dl_pairs(st.find('dl', class_='facts')), 'blocks': [round_block(x) for x in kids(st)[1:]]}
            d['setupAfter'] = [round_block(x) for x in ch[2:]]
        elif sid == 'gangs':
            d['gangs'] = [gang_block(g) for g in kids(ch[1])]
        elif sid == 'turns':
            rounds = ch[1] if len(ch) > 1 and cls(ch[1]) == ['rounds'] else None
            d['rounds'] = [rnd(a) for a in kids(rounds)] if rounds else []
            if not rounds: d['turnsBlocks'] = [round_block(x) for x in ch[1:]]
        elif sid == 'aftermath':
            d['aftermath'] = [aftermath_block(x) for x in ch[1:]]
        else:
            raise ValueError('section ' + sid)
    d['popovers'] = []
    for pop in s.find_all('div', class_='fc-pop', recursive=False) or s.body.find_all('div', class_='fc-pop', recursive=False):
        art = pop.find('article')
        fid = pop['id'][3:]
        f = fighter(art)
        if FIGHTERS.get(fid) != f: raise ValueError('popover differs ' + fid)
        d['popovers'].append(fid)
    d['fighters'] = dict(FIGHTERS)
    if MAPS: mapconv.finish(MAPS, BOARD)
    if BOARD: d['board'] = dict(BOARD)
    return d


def table_block(div):
    """table-scroll > table.ledger: keep head/body cells with classes."""
    t = div.find('table')
    out = {'label': div.get('aria-label'), 'class': ' '.join(cls(t)), 'head': [], 'rows': []}
    for th in t.find('thead').find_all('th'):
        out['head'].append({'html': inline(th), **({'class': ' '.join(cls(th))} if cls(th) else {})})
    for tr in t.find('tbody').find_all('tr', recursive=False):
        row = {'cells': []}
        if cls(tr): row['class'] = ' '.join(cls(tr))
        for td in tr.find_all('td', recursive=False):
            row['cells'].append({'html': inline(td), **({'class': ' '.join(cls(td))} if cls(td) else {})})
        out['rows'].append(row)
    return out


def aftermath_block(c):
    k = cls(c)
    if c.name == 'p' and k == ['result']:
        return {'result': inline(c)}
    if c.name == 'div' and k == ['prose']:
        return {'prose': [inline(p) for p in kids(c)]}
    if c.name == 'div' and k == ['table-scroll']:
        return {'table': table_block(c)}
    if c.name == 'h3':
        return {'h3': inline(c), 'class': ' '.join(k)}
    if c.name == 'div' and k == ['xp-grid']:
        out = []
        for g in kids(c):
            h4, tb = kids(g)
            out.append({'title': inline(h4), 'class': ' '.join(cls(h4)), 'table': table_block(BeautifulSoup('<div>' + str(tb) + '</div>', 'html.parser').div)})
        return {'xp': out}
    if c.name == 'figure':
        return {'photo': photo(c)}
    if c.name == 'p' and k == ['todo']:
        return {'todo': inline(c)}
    if c.name == 'div' and k == ['capt'] and all(x.name == 'details' for x in kids(c)):
        return {'captures': [roll(x) for x in kids(c)]}
    return raw(c, 'aftermath ' + c.name + '.' + '.'.join(k))


def main():
    pages = [a for a in sys.argv[1:] if not a.startswith('--')]
    os.makedirs(os.path.join(ROOT, 'data', 'battles'), exist_ok=True)
    for p in pages:
        d = battle(p)
        with open(os.path.join(ROOT, 'data', 'battles', p + '.json'), 'w') as fh:
            json.dump(d, fh, indent=1, ensure_ascii=False)
        write_shell(p, 'battle', f'data/battles/{p}.json')
        print(p, 'ok', len(d['fighters']), 'fighters', len(d['rounds']), 'rounds')
    with open(RULES_FN, 'w') as fh:
        json.dump(dict(sorted(rules.items())), fh, indent=1, ensure_ascii=False)
    print('rules', len(rules), 'raw blocks', raw_count)


if __name__ == '__main__':
    main()
