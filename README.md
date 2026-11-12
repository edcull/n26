# Ash and Shadow

Battle reports for a two-gang Necromunda campaign, served by GitHub Pages at
https://edcull.github.io/n26/.

Every page is a small HTML shell. The content lives in JSON under `data/`, and
shared JavaScript templates in `js/` build the page in the browser.

## Layout

| Path | What it holds |
|---|---|
| `index.html`, `1.1.html` … | Page shells. Each names a template and a data file: `<body data-page="battle" data-src="data/battles/2.1.json">` |
| `data/battles/<id>.json` | One battle report: setup, gangs and fighters, rounds, maps, aftermath |
| `data/pages/<id>.json` | Home, status, setup and post-cycle pages |
| `data/rules.json` | Tooltip text for skills, wargear, weapon traits, territories and tactics, written once and shared |
| `js/` | Templates: `main.js` (loader), `pages/battle.js`, `pages/report.js`, plus shared parts (`fighter.js`, `blocks.js`, `map.js`, `dice.js`, `hero.js`, `lib.js`) |
| `css/site.css`, `css/fonts.css` | Shared styles; `css/pages/<id>.css` holds a page's own extra rules |
| `images/` | Photos (`images/<page>/`), fighter portraits (`images/fighters/`), gang portraits (`images/gangs/`), home page cards (`images/index/`) |
| `fonts/` | Web fonts |
| `tools/` | One-off scripts that converted the original hand-written pages to this format |

## Previewing locally

The pages load JSON, which browsers block from `file://`. Serve the folder instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Text markup

Any text field can use:

| Markup | Shows as |
|---|---|
| `{@mordecai\|Mordecai}` | A fighter's name that opens their card. The id is the card's id in the battle's `fighters`; the text after `\|` is what is shown, so `{@deus-and-amen\|Amen}` works |
| `{p:The Carrion Psalm}` / `{t:The Midnight Theatre}` | Text in the Psalm or Theatre colour |
| `{tip:Nerves of Steel}` | A term with a tooltip, using that key in `data/rules.json`. Keys ending in ` #2` are a second wording of the same term |

Anything else is plain HTML (`<b>`, `<br>` …).

## Battle report (`data/battles/<id>.json`)

- `title`, `kicker`, `cycle`, `name`: browser title and page header
- `sides`: the two gangs in the header, `[{img, name, note}]`
- `intro`: paragraphs
- `setup.facts`: `[[label, text], …]`; `setup.blocks`: photos and the like
- `fighters`: every fighter card on the page, keyed by id. Each one is a snapshot of the fighter going into this battle:
  - `name`, `type`, `portrait`, `cost`
  - `stats`: `{M, WS, …, XP}`
  - `weapons`: `[{name, profile:[SR, LR, Str, AP, L], traits}]`
  - `foot`: `[{label, text}]`, the wargear, skills and injuries lines
  - `statClass`: optional highlights, such as `{"XP": "new"}`
- `gangs`: each gang's panel. `blocks` holds the photo, the stats sheet, the assets (territories and tactics as tooltip chips) and the crew and reinforcement panels, which list fighter ids
- `popovers`: fighter ids that get a pop-up card when their name is clicked
- `rounds`: `[{id, no, title, blocks}]`, where `id` is `deployment` or `round-N`. Blocks include:
  - `{split: ["tall", "two"], text: [...], ports: [photos]}`: text with photos beside it
  - `{text: [...]}`, `{photo}`, `{ends: [photos]}`, `{endsHead}`, `{vp}`, `{map}`
  - Text items are paragraphs (strings), `{roll}` callouts, or `{p, class}`
- `aftermath`: `{result}`, `{prose}`, `{table}`, `{xp}` blocks
- `board` and maps: see below

### Roll callouts

```json
{"roll": {"side": "p", "face": "ezekiel", "name": "Ezekiel Crows - Cleaver",
  "result": "Rumpus seriously injured",
  "rows": [
    {"note": "Initiative 3 +2"},
    {"label": "To Hit (3+)", "dice": "3 2 6", "result": "One hit", "resultClass": "ammo"},
    {"label": "Injury", "dice": "fw si", "result": "Serious Injury"}
  ]}}
```

- **`dice`:** space-separated codes.
  - `1`–`6`: an ordinary D6.
  - `f1`, `f1a`, `f2`, `f3`: Firepower dice. The `a` means the ammo symbol.
  - `fw`, `si`, `ooa`: Injury dice for Flesh Wound, Serious Injury and Out of Action.
- **`side`:** `p` or `t`. Together with `face`, it picks the round portrait.
- **`resultClass`:** colours the result. `ammo` is yellow and `sup` is suppressed.

### Maps

A battle's `board` holds named runs of SVG elements that every map shares, such as the terrain, labels and scale. Each map then lists, in drawing order:

- `{board: "terrain"}`: a shared run
- `{clip: [...]}`: items clipped to the table edge
- `{tok: {s: "p", x, y, t: "DA", r?}}`: a fighter token. `r` is the radius, 12.5 by default
- `{b: {k: "w", x, y, t: "W"}}`: a status badge. `k` is the colour: `s` suppressed, `w` wounded, `i` injured, `a` out of ammo, `v` Perfect Void …
- `{ooa: [x, y]}`: an Out of Action skull
- `{el: [tag, attrs, text]}`: any other SVG element

Coordinates run from 0 to 600 across the 24" table, so 25 units is one inch. `caption` holds the line under the map and the badge key.

## Other pages (`data/pages/<id>.json`)

- `hero`: `{kicker, cycle?, name, sides? | gangs?}`
- `nav`: section links
- `main`: a tree of blocks
  - Layout containers: `{tag, class, attrs, children}`
  - Content blocks: `{table}`, `{prose}`, `{photo}`, `{sheet}`, `{assets}`, `{fighters: [ids]}`, `{gangHead}`, `{card}` (home page battle cards), `{tcard}` (territory cards), `{xppop}` (XP breakdown pop-ups), and `{h2|h3|h4|p}`

Fighters work as in battle reports.

## Adding a battle

1. Copy the newest battle's JSON to `data/battles/<new id>.json` and edit it. The fighters carry over as a starting point.
2. Copy its shell, for example `2.2.html`, to `<new id>.html`. Change `data-src`, and the `<title>` used before the page loads. Add a `css/pages/<id>.css` link only if the page needs its own styles.
3. Put the photos in `images/<new id>/`.
4. Add a card for it under the right cycle in `data/pages/index.json`.
