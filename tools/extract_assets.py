"""One-off: move every embedded (base64) font and image out of the HTML pages
into files under fonts/ and images/, deduplicated by content."""
import base64, hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index', 'setup', '1.1', '1.2', '1-post', '2.1', '2.2', '2-post', 'status']
EXT = {'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp', 'gif': 'gif', 'svg+xml': 'svg', 'woff2': 'woff2', 'woff': 'woff'}
seen = {}      # sha1 -> relative path
used = set()   # relative paths already taken

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'img'

def save(kind, b64, want):
    data = base64.b64decode(b64)
    h = hashlib.sha1(data).hexdigest()
    if h in seen:
        return seen[h]
    base, ext = want.rsplit('.', 1)
    path, n = want, 2
    while path in used:
        path = f'{base}-{n}.{ext}'; n += 1
    os.makedirs(os.path.join(ROOT, os.path.dirname(path)), exist_ok=True)
    with open(os.path.join(ROOT, path), 'wb') as fh:
        fh.write(data)
    seen[h] = path; used.add(path)
    return path

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)

for page in PAGES:
    fn = os.path.join(ROOT, page + '.html')
    t = open(fn, newline='').read()
    photo_n = [0]

    # fonts in @font-face
    def font(m):
        fam = re.search(r'font-family:"([^"]+)";font-weight:(\d+)', t[max(0, m.start() - 200):m.start()])
        name = f"fonts/{slug(fam.group(1))}-{fam.group(2)}.{EXT[m.group(1)]}" if fam else f"fonts/font.{EXT[m.group(1)]}"
        return 'url(' + save('font', m.group(2), name) + ')'
    t = re.sub(r'url\(data:font/(woff2|woff);base64,([A-Za-z0-9+/=]+)\)', font, t)

    # css background images (.face-xxx portraits on roll callouts)
    def cssimg(m):
        sel = re.findall(r'\.(face-[\w-]+)', t[max(0, m.start() - 120):m.start()])
        name = f"images/faces/{sel[-1][5:]}.{EXT[m.group(2)]}" if sel else f"images/css/{page}.{EXT[m.group(2)]}"
        return f'url({m.group(1)}{save("img", m.group(3), name)}{m.group(1)})'
    t = re.sub(r'url\((["\']?)data:image/([\w+]+);base64,([A-Za-z0-9+/=]+)\1\)', cssimg, t)

    # <img> elements
    def img(m):
        pre, typ, b64, post = m.group(1), m.group(2), m.group(3), m.group(4)
        attrs = pre + post
        cls = re.search(r'class="([^"]*)"', attrs); cls = cls.group(1) if cls else ''
        alt = re.search(r'alt="([^"]*)"', attrs); alt = alt.group(1) if alt else ''
        after = strip_tags(t[m.end():m.end() + 400])
        ext = EXT[typ]
        if 'roundel' in cls:
            h4 = re.search(r'<h4[^>]*>([^<]+)</h4>', t[m.end():m.end() + 300])
            name = f'images/fighters/{slug(h4.group(1)) if h4 else "fighter"}.{ext}'
        elif 'portrait' in cls:
            name = f'images/gangs/{slug(alt.replace(" gang portrait", ""))}.{ext}'
        elif not cls and not alt:
            g = re.search(r'(The Carrion Psalm|The Midnight Theatre)', after)
            name = f'images/gangs/{slug(g.group(1)) if g else "badge"}-badge.{ext}'
        elif page == 'index':
            href = re.findall(r'href="([^"]+)\.html"', t[max(0, m.start() - 300):m.start()])
            name = f'images/index/{href[-1] if href else "map"}.{ext}'
        else:
            photo_n[0] += 1
            name = f'images/{page}/photo-{photo_n[0]:02d}.{ext}'
        return f'<img {pre}src="{save("img", b64, name)}"{post}>'
    t = re.sub(r'<img ([^>]*?)src="data:image/([\w+]+);base64,([A-Za-z0-9+/=]+)"([^>]*)>', img, t)

    left = len(re.findall(r'data:(image|font)/', t))
    with open(fn, 'w', newline='') as fh:
        fh.write(t)
    print(f'{page}: {os.path.getsize(fn):>9,} bytes, {left} embedded left')

print(len(seen), 'files written')
