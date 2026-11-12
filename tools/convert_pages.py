"""Convert the non-battle pages (post-cycle, status, setup, index) to data/pages/<page>.json.

These pages are a hero header, an optional section nav and a tree of blocks:
layout containers ({"tag", "class", "children"}) holding content blocks
(tables, fighter cards, territory cards, photos, prose ...).
Run from the repo root: python3 tools/convert_pages.py 1-post status ...
"""
import json, os, re, sys
from bs4 import BeautifulSoup, NavigableString, Tag, Comment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert as C

PAGE_FIGHTERS = {}


def text_ok(t):
    return all(isinstance(c, Tag) or isinstance(c, Comment) or not str(c).strip() for c in t.children)


def kids(t):
    return [c for c in t.children if isinstance(c, Tag)]


def cell(c):
    out = {'html': C.inline(c)}
    if c.name != ('th' if c.parent.parent.name == 'thead' else 'td'): out['tag'] = c.name
    if C.cls(c): out['class'] = ' '.join(C.cls(c))
    extra = {k: v for k, v in c.attrs.items() if k != 'class'}
    if extra: out['attrs'] = extra
    return out


def table(t):
    out = {}
    if C.cls(t): out['class'] = ' '.join(C.cls(t))
    for part in kids(t):
        rows = []
        for tr in kids(part):
            r = {'cells': [cell(c) for c in kids(tr)]}
            if C.cls(tr): r['class'] = ' '.join(C.cls(tr))
            rows.append(r)
        out[part.name[1:]] = rows   # head / body / foot
    return out


def battle_card(a):
    img = a.find('img', recursive=False); info = a.find('div', class_='info')
    card = {'href': a['href']}
    if img is not None:
        card['img'] = img['src']; card['alt'] = img.get('alt', '')
    else:
        ph = a.find('div', class_='ph')
        if ph is None or ph.attrs != {'class': ['ph'], 'aria-hidden': 'true'}: raise ValueError('card media')
        card['placeholder'] = ph.get_text()
    if [c.name for c in kids(a)] != ['img' if img is not None else 'div', 'div']: raise ValueError('card shape')
    card['info'] = []
    for c in kids(info):
        item = {'tag': c.name, 'html': C.inline(c)}
        if C.cls(c): item['class'] = ' '.join(C.cls(c))
        card['info'].append(item)
    return {'card': card}


def t_card(a):
    return {'tcard': {'class': ' '.join(x for x in C.cls(a) if x != 't-card'), 'parts': [{'tag': c.name, 'html': C.inline(c), **({'class': ' '.join(C.cls(c))} if C.cls(c) else {})} for c in kids(a)]}}


def xp_pop(d):
    head, tb = kids(d)
    h4, btn = kids(head)
    return {'xppop': {'id': d['id'][3:], 'title': C.inline(h4), 'table': table(tb)}}


def node(t):
    k = C.cls(t)
    if isinstance(t, Comment): return None
    if t.name == 'div' and k == ['table-scroll'] or t.name == 'div' and k == ['tri-scroll']:
        tb = kids(t)[0]
        return {'table': table(tb), 'wrap': k[0], 'label': t.get('aria-label')}
    if t.name == 'table':
        return {'table': table(t)}
    if t.name == 'div' and 'prose' in k:
        return {'prose': [C.inline(p) for p in kids(t)], **({'class': ' '.join(x for x in k if x != 'prose')} if k != ['prose'] else {})}
    if t.name == 'figure' and 'shot' in k:
        return {'photo': C.photo(t)}
    if t.name == 'dl' and 'sheet' in k:
        return {'sheet': C.dl_pairs(t), 'class': ' '.join(x for x in k if x != 'sheet')}
    if t.name == 'dl' and k == ['facts']:
        return {'facts': C.dl_pairs(t)}
    if t.name == 'dl' and k == ['assets']:
        a = []
        for d in kids(t):
            dt, dd = kids(d)
            ch = C.chips(dd)
            a.append({'label': dt.get_text(), 'chips': ch} if ch is not None else {'label': dt.get_text(), 'html': C.inline(dd)})
        return {'assets': a}
    if t.name == 'div' and k == ['fighters']:
        refs = []
        for art in kids(t):
            f = C.fighter(art)
            fid = C.fid_for(f['name'])
            if fid in PAGE_FIGHTERS and PAGE_FIGHTERS[fid] != f:
                n = 2
                while f'{fid}-{n}' in PAGE_FIGHTERS and PAGE_FIGHTERS[f'{fid}-{n}'] != f: n += 1
                fid = f'{fid}-{n}'
            PAGE_FIGHTERS[fid] = f
            r = {'id': fid}
            extra = [x for x in C.cls(art) if x != 'fighter']
            if extra: r['class'] = ' '.join(extra)
            refs.append(r)
        return {'fighters': refs}
    if t.name == 'div' and k == ['gang-head']:
        img = t.find('img'); hd = kids(kids(t)[1])
        return {'gangHead': {'portrait': img['src'], 'alt': img.get('alt', ''), 'tag': hd[0].name, 'name': hd[0].get_text(), 'house': hd[1].get_text()}}
    if t.name == 'a' and k == ['battle']:
        return battle_card(t)
    if t.name == 'article' and 't-card' in k:
        return t_card(t)
    if t.name == 'div' and k == ['xp-pop']:
        return xp_pop(t)
    if t.name in ('h2', 'h3', 'h4', 'p') and not set(t.attrs) - {'class'}:
        out = {t.name: C.inline(t)}
        if k: out['class'] = ' '.join(k)
        return out
    if t.name in ('div', 'section', 'main') and text_ok(t):
        out = {'tag': t.name}
        if k: out['class'] = ' '.join(k)
        attrs = {a: v for a, v in t.attrs.items() if a != 'class'}
        if attrs: out['attrs'] = attrs
        out['children'] = [x for x in (node(c) for c in t.children if isinstance(c, Tag)) if x]
        return out
    C.raw_count['page ' + t.name + '.' + '.'.join(k)] = C.raw_count.get('page ' + t.name + '.' + '.'.join(k), 0) + 1
    return {'html': str(t)}


def hero(h):
    w = h.find('div', class_='wrap')
    d = {'kicker': C.inline(w.find('p', class_='kicker'))}
    h1 = w.find('h1')
    sm = h1.find('small')
    if sm: d['cycle'] = sm.get_text()
    d['name'] = h1.contents[-1] if sm else h1.get_text()
    if w.find('div', class_='versus'):
        d['sides'] = [{'img': s.find('img')['src'], 'name': s.find('strong').get_text(), 'note': s.find('span').get_text()} for s in w.select('.versus .side')]
    if w.find('div', class_='gangs'):
        d['gangs'] = [{'img': g.find('img')['src'], 'name': g.find('div').contents[0], 'note': g.find('span').get_text()} for g in w.select('.gangs .gang')]
    return d


def navitems(n):
    out = []
    for li in n.find_all('li'):
        a = li.find('a')
        if 'nav-br' in C.cls(li): out.append({'br': True}); continue
        if 'home' in C.cls(a): continue
        if 'round-link' in C.cls(a): out.append({'round': a['href'][7:]}); continue
        it = {'href': a['href'], 'text': a.get_text()}
        if C.cls(li): it['class'] = ' '.join(C.cls(li))
        out.append(it)
    return out


def page(p):
    PAGE_FIGHTERS.clear()
    s = BeautifulSoup(C.source(p), 'lxml')
    d = {'page': 'report', 'id': p, 'title': s.title.get_text(), 'hero': hero(s.find('header', class_='hero'))}
    nv = s.find('nav', class_='jump')
    if nv:
        d['nav'] = navitems(nv)
        if nv.get('aria-label') != 'Report sections': d['navLabel'] = nv['aria-label']
    main = s.find('main')
    d['main'] = [x for x in (node(c) for c in main.children if isinstance(c, Tag)) if x]
    after = [c for c in s.body.children if isinstance(c, Tag) and c.name not in ('header', 'nav', 'main')]
    if after: d['after'] = [node(c) for c in after]
    d['fighters'] = dict(PAGE_FIGHTERS)
    return d


if __name__ == '__main__':
    os.makedirs(os.path.join(C.ROOT, 'data', 'pages'), exist_ok=True)
    for p in sys.argv[1:]:
        d = page(p)
        json.dump(d, open(os.path.join(C.ROOT, 'data', 'pages', p + '.json'), 'w'), indent=1, ensure_ascii=False)
        C.write_shell(p, 'report', f'data/pages/{p}.json')
        print(p, 'ok', len(d['fighters']), 'fighters')
    json.dump(dict(sorted(C.rules.items())), open(C.RULES_FN, 'w'), indent=1, ensure_ascii=False)
    print('rules', len(C.rules), 'raw', C.raw_count)
