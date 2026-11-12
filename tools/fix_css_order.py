"""Follow-up to extract_css.py: where a page-specific rule came before a shared
rule that overrides it, copy that shared rule back inline after it, so the
cascade order matches the original page."""
import os, re, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['setup', '1.1', '1.2', '1-post', '2.1', '2.2', '2-post', 'status']

def blocks(css):
    out, d, st = [], 0, 0
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for i, ch in enumerate(css):
        if ch == '{': d += 1
        elif ch == '}':
            d -= 1
            if d == 0: out.append(re.sub(r'\s+', ' ', css[st:i + 1]).strip()); st = i + 1
    return out

def toks(b):
    return set(re.findall(r'[.#][\w-]+', b.split('{')[0] if not b.startswith('@') else b[:b.index('{', b.index('{') + 1)])) - {'media', 'max-width', 'min-width', 'rem', 'px'}

site = blocks(open(os.path.join(ROOT, 'css/site.css')).read())
siteset = set(site)
for p in PAGES:
    orig = subprocess.run(['git', 'show', f'origin/main:{p}.html'], capture_output=True, text=True, cwd=ROOT).stdout
    orig = re.sub(r'base64,[A-Za-z0-9+/=]+', 'base64,', orig)
    allb = [b for s in re.findall(r'<style>(.*?)</style>', orig, re.S) for b in blocks(s) if not b.startswith('@font-face')]
    keys = [re.sub(r'base64,[A-Za-z0-9+/=]+', '', b) for b in allb]
    sitek = set(re.sub(r'base64,[A-Za-z0-9+/=]+', '', b) for b in site)
    page_only = [i for i, k in enumerate(keys) if k not in sitek]
    reassert = set()
    for i in page_only:
        for j in range(i + 1, len(allb)):
            if keys[j] in sitek and toks(allb[i]) & toks(allb[j]):
                reassert.add(j)
    if not reassert:
        continue
    fn = os.path.join(ROOT, p + '.html'); t = open(fn, newline='').read()
    sts = list(re.finditer(r'<style>(.*?)</style>', t, re.S))
    inline = [b for m in sts for b in blocks(m.group(1))]
    assert len(inline) == len(page_only), (p, len(inline), len(page_only))
    # walk original order; page-only blocks come from the current inline style (paths already swapped)
    it = iter(inline); out = []
    for j, k in enumerate(keys):
        if j in page_only: out.append(next(it))
        elif j in reassert: out.append(site[[re.sub(r'base64,[A-Za-z0-9+/=]+', '', b) for b in site].index(k)])
    nl = '\r\n' if '\r\n' in t else '\n'
    t = t[:sts[0].start()] + '<style>' + nl + nl.join(out) + nl + '</style>' + t[sts[-1].end():]
    open(fn, 'w', newline='').write(t)
    print(p, 'reasserted', len(reassert))
