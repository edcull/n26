# Ash and Shadow

Battle reports for a two-gang Necromunda campaign, served by GitHub Pages at
https://edcull.github.io/n26/.

The whole site is one page, `index.html`. `?p=<page id>` picks what it shows
(`./?p=2.1`, `./?p=status`); with no `?p` it shows the campaign home. The
content lives in JSON under `data/`, and shared JavaScript templates in `js/`
build each page in the browser. Section links work as usual: `./?p=2.1#round-3`.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | The only real page: loads `js/main.js`, which reads `data/campaign.json` to find the requested page |
| `404.html` | GitHub Pages' "not found" page. It sends old addresses such as `2.1.html#round-3` on to `./?p=2.1#round-3` |
| `data/campaign.json` | Campaign name, the gangs, the timeline of points that fighter histories hang off, and `pages`: every page id with its template (`battle`, `post` or `report`), data file, stylesheets and title |
| `data/gangs/<gang>.json` | A gang (name, house, colour, portraits) and every fighter it has had, each stored once with their history |
| `data/battles/<id>.json` | One battle report: setup, gang panels, rounds, maps, aftermath |
| `data/post/<cycle>.json` | A post-cycle phase: results, actions, income, advancements, trading post, rosters |
| `data/pages/<id>.json` | Home, status and setup pages |
| `data/rules.json` | Tooltip text for skills, wargear, weapon traits, territories and tactics, written once and shared |
| `js/` | Templates: `main.js` (loader), `pages/battle.js`, `pages/post.js`, `pages/report.js`, plus shared parts (`fighter.js`, `roster.js`, `blocks.js`, `map.js`, `dice.js`, `hero.js`, `lib.js`) |
| `css/site.css`, `css/fonts.css` | Shared styles; `css/pages/<id>.css` holds a page's own extra rules |
| `images/` | Photos (`images/<page>/`), fighter portraits (`images/fighters/`), gang portraits (`images/gangs/`), home page cards (`images/index/`) |
| `fonts/` | Web fonts |
| `tools/` | One-off scripts that converted the original hand-written pages to this format. Run in order: `convert.py`, `convert_pages.py`, `build_rosters.py`, `build_post.py` |

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
| `{tip.new-i:Mesh armour}` | The same with extra classes. `new-i` marks something new this cycle |

Anything else is plain HTML (`<b>`, `<br>` …).

## Gangs and fighters (`data/gangs/<gang>.json`)

Each fighter is stored once, under their id, as a list of entries along the campaign timeline:

```json
"mordecai": [
  {"at": "setup", "name": "Mordecai", "type": "Cawdor Word Keeper (Leader, Pious)", "portrait": "images/fighters/mordecai.jpg",
   "cost": "240", "stats": {"M": "5\"", "WS": "3+", ..., "XP": "61"}, "weapons": [...], "foot": [...]},
  {"at": "1.2", "stats": {"XP": "62"}, "foot": [...]},
  {"at": "status", "stats": {"XP": "69"}}
]
```

- **First entry:** the full card.
  - `name`, `type`, `portrait`, `cost`
  - `stats`: `{M, WS, …, XP}`
  - `weapons`: `[{name, profile: [SR, LR, Str, AP, L], traits}]`
  - `foot`: `[{label, text}]`, the wargear, skills and injuries lines
  - `statClass`: optional highlights, such as `{"XP": "new"}`
- **Later entries:** only what changed at that point.
  - `stats` and `statClass` merge key by key.
  - Any other field is replaced.
  - `null` removes a field or key.
- **The timeline:** listed in `data/campaign.json`. A page sets `"roster": "<point>"` and shows each fighter as they stood then.
- **When something changes:** add an entry for it, for example `{"at": "2.2", "stats": {"XP": "71"}}`.

## Battle report (`data/battles/<id>.json`)

- `title`, `kicker`, `cycle`, `name`: browser title and page header
- `sides`: the two gangs in the header, `[{img, name, note}]`
- `intro`: paragraphs
- `setup.facts`: `[[label, text], …]`; `setup.blocks`: photos and the like
- `roster`: the timeline point the fighter cards are drawn from (usually the battle's id)
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

### Attack callouts

An attack names who made it, with what, and at whom:

```json
{"roll": {"side": "t", "face": "rumpleteaser", "by": "rumpleteaser", "weapons": ["Plasma gun"], "target": "ezekiel-crows",
  "result": "Ezekiel seriously injured, Out of Ammo", "rows": [...]}}
```

- **The title** is drawn from these fields as "Rumpleteaser - Plasma Gun → Ezekiel Crows". The fighters' names open their full cards, which list the weapons.
- **`weapons`** are the names on the attacker's card, or `"Unarmed"`. List two for a fight with a secondary weapon.
- **`target`** is a fighter id, or a list for a weapon that hits several. Leave it out if the narrative never says who was aimed at.
- **`action`** adds a word before the weapon: `Overwatch`, `Reaction`, `Counter-attack`, `Charge`.
- **The damage note** ("Note: Damage (2), Lethality (2)") is added automatically for a weapon whose Damage or Lethality is above 1: Damage only when that weapon dealt damage, Lethality only when it led to an Injury roll. With two weapons, each weapon section (its `h6` heading) ends with its own note. Any `Note:` rows at the end of a section (or of a one-weapon callout) are merged with it into a single note.
- **Unsaved wounds** are given as damage on the save row: unsaved wounds × the weapon's Damage, e.g. `Two damage` for one unsaved plasma wound.

Other callouts (tests, recovery, powers) keep a plain `name` such as `"Wit - Nerve"`.

### Callout style

- **Tests on a roll row** are data, not text. The template shows the final number in bold, then the base and modifiers:
  - `{"check": {"name": "To Hit", "base": 4, "mods": [[1, "Aim"]]}}` shows To Hit **3+** (4+ +1 Aim)
  - `{"check": {"name": "Save", "base": 6, "mods": [[-1, "AP"]]}}` shows Save **none** (6+ -1 AP); leave `dice` empty then
  - `{"check": {"name": "Save", "base": 5, "none": true}}` shows Save **none** when a rule allows no save at all. Only use it where a save would otherwise have been rolled, and add a note saying which rule, for example "Note: The Graviton Pulse allows no save."
  - Every weapon section that causes a wound has a Save row
  - `{"check": {"name": "Willpower", "base": 9, "mods": [[3, "Maintain"]], "under": true}}` shows Willpower **12** (9 +3 Maintain)
  - `"who": "Mordecai"` puts the fighter's name first, for callouts that cover several fighters: Mordecai: Leadership **8**
  - `"s": 3, "t": 3` on a To Wound check shows the attacker's Strength against the target's Toughness: To Wound **4+** (S3/T3)
  - `"note": "Toxin"` adds a word in the brackets
- **How the final number is worked out:**
  - Rolls you need to equal or beat (To Hit, To Wound, Save, Ammo, Charge …): modifiers are added to the dice, so the template shows the lowered target. A 4+ with +1 shows **3+**.
  - `"under": true` tests (Leadership, Cool, Willpower, Strength) pass on the stat or less, so a bonus raises the number.
- **Rows with no number** keep a plain `label`: `Injury`, `Recovery`, `Perils`.
- **Results:**
  - Count words when counting, otherwise `Hit` / `Miss` / `Wound`: `Two hits`, `One wound`, `Hit`, `Miss`. To Hit rows only ever say `Miss`, `Hit` or `Two hits` (and so on), with any extra after a comma: `Hit, Out of Ammo`, `Miss, Unstable!`, `Two hits, one auto wound`
  - Unsaved wounds on the save row as damage: `One damage`, `Two damage, suppressed`
  - `Serious injury`, `Out of Action`, `Out of Ammo`
  - A To Wound row that causes no wound reads `Suppressed` for a ranged attack. It reads `-` when the target ignores suppression (Juggernaut, a passed Nerves of Steel test) and for a melee attack
  - Conditions after a comma: `One wound, suppressed`, `Saved, suppressed`, `Three hits, Knockback`. On the dice rows each part after a comma starts a new line
  - Narrative text says "seriously injured"
  - Tests: `Passes` / `Fails`; powers `Manifests` / `Maintains` (add `with Perils` where it happened); Leadership (bottle) `Holds` / `Bottles`; Cool (nerve) `Passes` / `Suppressed`; charges `Engaged` / `1" short`
- **Combi weapons** (Polearm/Autogun, Chainaxe/Exterminator, Polearm/Flamer): `weapons` names the profile used, `Autogun` or `Flamer` for a shot, `Polearm` or `Chainaxe` in melee
- **Callout names:** `Nerve Check` (`Nerve Checks` for several fighters), `Bottle Check`, `Charge` (row label `Charge`), `Engage`, `Insanity Test` with the Insanity result in a note
- **Summary lines:** `Missed`, `Fails to wound`, `Missed, Out of Ammo`; wounds by number, `Ezekiel takes 1 wound`, `Deus and Amen take 2 wounds`; nerve and bottle checks `Holds`
- **`resultClass`** sets the colour:
  - leave it out for red (wounds, damage, injuries, bad outcomes). Damage is always red, even with a condition after it (`One damage, suppressed`)
  - `sup` for yellow (suppressed and other conditions)
  - `ammo` for neutral (hits, misses, saves, passes)
- **Notes** start with `Note:`. Initiative lines in fights are written `Initiative 3 +2 charge bonus`.

### Maps

A battle's `board` holds named runs of SVG elements that every map shares, such as the terrain, labels and scale. Each map then lists, in drawing order:

- `{board: "terrain"}`: a shared run
- `{clip: [...]}`: items clipped to the table edge
- `{tok: {s: "p", x, y, t: "DA", r?}}`: a fighter token. `r` is the radius, 12.5 by default
- `{b: {k: "w", x, y, t: "W"}}`: a status badge. `k` is the colour: `s` suppressed, `w` wounded, `i` injured, `a` out of ammo, `v` Perfect Void …
- `{ooa: [x, y]}`: an Out of Action skull
- `{el: [tag, attrs, text]}`: any other SVG element

Coordinates run from 0 to 600 across the 24" table, so 25 units is one inch. `caption` holds the line under the map and the badge key.

## Post-cycle phase (`data/post/<cycle>.json`)

- `roster`: the timeline point after the cycle, for the rosters at the end
- `results`: `{label, battles: [{href, name, challenger: "p"|"t", stakes, winner: "p"|"t"}]}`
- `gangs`: one entry per gang, in page order:
  - `gang`: the gang file id; `section`: the anchor, such as `psalm`
  - `story`: paragraphs
  - `actions`: `[{fighter, injuries, action}]`. Recovery and Work Territory are coloured automatically
  - `income`: `[{source, credits, recruitment?}]`, plus `incomeTotal`
  - `advancements`: `[{fighter, xp, range, roll, advancement, cost}]`
  - `recruits`: `[{recruit, discount, cost}]`
  - `purchases`: `[{item, for, source, cost, tp}]`
  - `sales`: `[{item, fighter, credits}]`
  - Empty lists show as "None"
  - `tradingTotal`: `{recruit, purchase, sell, total}`, each `[credits, tp]`
  - `roster`: `{sheet, assets, fighters: [ids]}`
- `"todo": true` instead of `gangs`: shows the "To come" placeholder page

## Other pages (`data/pages/<id>.json`)

- `hero`: `{kicker, cycle?, name, sides? | gangs?}`
- `nav`: section links
- `main`: a tree of blocks
  - Layout containers: `{tag, class, attrs, children}`
  - Content blocks: `{table}`, `{prose}`, `{photo}`, `{sheet}`, `{assets}`, `{fighters: [ids]}`, `{gangHead}`, `{card}` (home page battle cards), `{tcard}` (territory cards), `{xppop}` (XP breakdown pop-ups), and `{h2|h3|h4|p}`

Fighters come from the gang files, as in battle reports. On the status page, `"xpButtons": true` makes each XP stat open that fighter's XP breakdown.

## Adding a battle

1. Copy the newest battle's JSON to `data/battles/<new id>.json`, set `"roster"` to the new id, and edit it.
2. In `data/campaign.json`:
   - add the id to `timeline`
   - add a `pages` entry, for example `"2.3": {"template": "battle", "data": "data/battles/2.3.json", "css": ["css/site.css"], "title": "Cycle 2.3: …"}`
   - add `css/pages/<id>.css` to `css` only if the battle needs its own styles
3. Add entries to the gang files for anything that changed since the last point.
4. Put the photos in `images/<new id>/`.
5. Add a card for it under the right cycle in `data/pages/index.json` (`{"card": {"page": "2.3", …}}`).

A post-cycle phase is the same, with `"template": "post"` and its data in `data/post/`. Links between pages use page ids (`"page": "2.3"`), never file names.
