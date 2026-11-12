"""One-off: turn data/pages/<n>-post.json (generic tables) into data/post/<n>.json with named fields."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACTION_STYLE = {'Recovery': 'act-rec', 'Work Territory': 'act-work'}


def kid(n, **want):
    return [c for c in n['children'] if all(c.get(k) == v for k, v in want.items())]


def cells(tbl, part='body'):
    return [[c['html'] for c in r['cells']] for r in tbl['table'][part]]


def plain_none(rows):
    return [] if len(rows) == 1 and rows[0][0] == 'None' and all(x in ('–',) for x in rows[0][1:]) else rows


def convert(src_id, out_id):
    d = json.load(open(os.path.join(ROOT, 'data/pages', src_id + '.json')))
    gangs = {g['class']: g for g in (json.load(open(os.path.join(ROOT, 'data/gangs', f + '.json'))) for f in json.load(open(os.path.join(ROOT, 'data/campaign.json')))['gangs'])}
    out = {'page': 'post', 'id': src_id, 'title': d['title'], 'hero': d['hero'], 'roster': d['roster'], 'gangs': []}
    res_sec, *gang_secs = d['main']
    tbl = res_sec['children'][1]
    out['results'] = {'label': tbl['label'], 'battles': []}
    for href_name, ch, stakes, win in cells(tbl):
        m = re.fullmatch(r'<a href="([^"]+)">(.*)</a>', href_name)
        cc = [c.get('class') for c in tbl['table']['body'][len(out['results']['battles'])]['cells']]
        out['results']['battles'].append({'href': m.group(1), 'name': m.group(2), 'challenger': cc[1], 'stakes': stakes, 'winner': cc[3]})
        assert ch == gangs[{'p': 'psalm', 't': 'theatre'}[cc[1]]]['name'] and win == gangs[{'p': 'psalm', 't': 'theatre'}[cc[3]]]['name']
    for sec in gang_secs:
        gdiv = sec['children'][0]
        cls = gdiv['class'].split()[1]
        g = gangs[cls]
        head, story, steps = gdiv['children']
        assert head['gangHead'] == {'portrait': g['portrait'], 'alt': g['name'] + ' gang portrait', 'tag': 'h2', 'name': g['name'], 'house': g['house']}
        e = {'gang': g['id'], 'section': sec['attrs']['id'], 'story': story['prose']}
        tables = {t['label'][len(g['name']) + 1:]: t for t in steps['children'] if 'table' in t}
        e['actions'] = []
        for f, inj, act in cells(tables['post-cycle actions']):
            m = re.fullmatch(r'<span class="(act-\w+)">(.*)</span>', act)
            name = m.group(2) if m else act
            assert (m.group(1) if m else None) == ACTION_STYLE.get(name), act
            e['actions'].append({'fighter': f, 'injuries': inj, 'action': name})
        rows = cells(tables['income'])
        e['income'] = []
        for src, rec, cr in rows[:-1]:
            row = {'source': src, 'credits': cr}
            if rec != '–':
                m = re.fullmatch(r'<span class="d-only">(.*)</span><span class="m-only">(.*)</span>', cr)
                assert m and m.group(2) == rec
                row['credits'] = m.group(1); row['recruitment'] = rec
            e['income'].append(row)
        assert rows[-1][:2] == ['Total credits', ''] and tables['income']['table']['body'][-1].get('class') == 'tot'
        e['incomeTotal'] = rows[-1][2]
        e['advancements'] = []
        for f, xp, rng, roll, adv, cost in cells(tables['XP advancements']):
            m = re.fullmatch(r'(.*)<span class="m-only">\. Cost (.*)</span>', adv)
            assert m and m.group(2) == cost
            e['advancements'].append({'fighter': f, 'xp': xp, 'range': rng, 'roll': roll, 'advancement': m.group(1), 'cost': cost})
        e['recruits'] = [dict(zip(['recruit', 'discount', 'cost'], r)) for r in plain_none(cells(tables['recruits']))]
        e['purchases'] = [dict(zip(['item', 'for', 'source', 'cost', 'tp'], r)) for r in plain_none(cells(tables['equipment']))]
        e['sales'] = [dict(zip(['item', 'fighter', 'credits'], r)) for r in plain_none(cells(tables['sales']))]
        tt = cells(tables['tptotal'])
        assert [r[0] for r in tt] == ['Recruit new models', 'Purchase equipment', 'Sell unwanted items', 'Total spent']
        e['tradingTotal'] = {k: r[1:] for k, r in zip(['recruit', 'purchase', 'sell', 'total'], tt)}
        sheet = [b for b in steps['children'] if 'sheet' in b][0]; assets = [b for b in steps['children'] if 'assets' in b][0]; fs = [b for b in steps['children'] if 'fighters' in b][0]
        e['roster'] = {'sheet': sheet['sheet'], 'assets': assets['assets'], 'fighters': [r['id'] for r in fs['fighters']]}
        assert sheet['class'] == 'four' and not any('class' in r for r in fs['fighters'])
        out['gangs'].append(e)
    assert d.get('navLabel') == 'Page sections' and d['nav'] == [{'href': '#results', 'text': 'Results'}] + [{'href': '#' + s['attrs']['id'], 'text': gangs[s['children'][0]['class'].split()[1]]['name']} for s in gang_secs]
    os.makedirs(os.path.join(ROOT, 'data/post'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, 'data/post', out_id + '.json'), 'w'), indent=1, ensure_ascii=False)
    os.remove(os.path.join(ROOT, 'data/pages', src_id + '.json'))
    shell = open(os.path.join(ROOT, src_id + '.html')).read().replace('data-page="report" data-src="data/pages/%s.json"' % src_id, 'data-page="post" data-src="data/post/%s.json"' % out_id)
    open(os.path.join(ROOT, src_id + '.html'), 'w').write(shell)
    print(src_id, '->', out_id, [len(g['actions']) for g in out['gangs']])


if __name__ == '__main__':
    convert('1-post', '1')
