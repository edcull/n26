"""One-off: move @font-face rules into css/fonts.css and the CSS blocks every
report page shares into css/site.css; page-specific rules stay inline."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['setup', '1.1', '1.2', '1-post', '2.1', '2.2', '2-post', 'status']

def blocks(css):
    """Top-level blocks (rules, @media groups) with the comment text before them."""
    out, depth, start = [], 0, 0
    i = 0
    while i < len(css):
        if css.startswith('/*', i):
            i = css.index('*/', i) + 2; continue
        ch = css[i]
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                out.append(css[start:i + 1]); start = i + 1
        i += 1
    return out, css[start:]

def key(b):
    return re.sub(r'\s+', ' ', re.sub(r'/\*.*?\*/', '', b, flags=re.S)).strip()

def styles(t):
    return re.findall(r'<style>(.*?)</style>', t, re.S)

texts = {p: open(os.path.join(ROOT, p + '.html'), newline='').read() for p in PAGES + ['index']}
parsed = {}
for p, t in texts.items():
    parsed[p] = [b for s in styles(t) for b in blocks(s)[0]]

fonts = [b for b in parsed['1.1'] if key(b).startswith('@font-face')]
common = set(key(b) for b in parsed['1.1'] if not key(b).startswith('@font-face'))
for p in PAGES:
    common &= set(key(b) for b in parsed[p])
site = [b.strip('\r\n') for b in parsed['1.1'] if key(b) in common]

os.makedirs(os.path.join(ROOT, 'css'), exist_ok=True)
with open(os.path.join(ROOT, 'css/fonts.css'), 'w') as fh:
    fh.write('\n'.join(key(b) for b in fonts) + '\n')
with open(os.path.join(ROOT, 'css/site.css'), 'w') as fh:
    fh.write('\n'.join(b.replace('\r\n', '\n') for b in site) + '\n')

for p in PAGES + ['index']:
    t = texts[p]
    nl = '\r\n' if '\r\n' in t else '\n'
    keep = []
    for s in styles(t):
        bl, tail = blocks(s)
        rest = [b for b in bl if not key(b).startswith('@font-face') and (p == 'index' or key(b) not in common)]
        if rest:
            keep.append(''.join(rest) + tail)
    links = '<link rel="stylesheet" href="css/fonts.css">' + nl
    if p != 'index':
        links += '<link rel="stylesheet" href="css/site.css">' + nl
    first = t.index('<style>')
    last = t.rindex('</style>') + len('</style>')
    inline = ''.join(f'<style>{k}</style>' for k in keep)
    t = t[:first] + links + inline + t[last:]
    with open(os.path.join(ROOT, p + '.html'), 'w', newline='') as fh:
        fh.write(t)
    print(p, 'inline blocks left:', sum(len(blocks(k)[0]) for k in keep))
print('fonts', len(fonts), 'site blocks', len(site))
