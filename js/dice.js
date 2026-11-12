// Dice faces. Data stores dice as space-separated codes, e.g. "4 f1" or "fw si":
//   1-6 = D6, f1 f1a f2 f3 = Firepower dice (a = ammo symbol), fw si ooa = Injury dice
const bullet = x => `<path class="die-m" d="M${x} 31v-13c0-5 3-8 4-10 1 2 4 5 4 10v13z"/>`;
const pip = (x, y) => `<circle class="die-m" cx="${x}" cy="${y}" r="4"/>`;
const PIPS = {
  1: [[20, 20]], 2: [[13, 13], [27, 27]], 3: [[12, 12], [20, 20], [28, 28]],
  4: [[12, 12], [28, 12], [12, 28], [28, 28]], 5: [[12, 12], [28, 12], [20, 20], [12, 28], [28, 28]],
  6: [[12, 11], [28, 11], [12, 20], [28, 20], [12, 29], [28, 29]],
};
const box = c => `<rect class="${c}" x="2" y="2" width="36" height="36" rx="7"/>`;
const FACES = {
  f1: ['Firepower dice showing 1 bullet', box('die-b') + bullet(16)],
  f1a: ['Firepower dice showing 1 bullet and an ammo symbol', box('die-b') + bullet(9) + '<rect class="die-m" x="26" y="8" width="5" height="16" rx="1.5"/><circle class="die-m" cx="28.5" cy="29" r="3"/>'],
  f2: ['Firepower dice showing 2 bullets', box('die-b') + bullet(9) + bullet(23)],
  f3: ['Firepower dice showing 3 bullets', box('die-b') + bullet(4) + bullet(16) + bullet(28)],
  fw: ['Injury dice showing a Flesh Wound cross', box('die-c') + '<rect class="die-m" x="16" y="8" width="8" height="24" rx="1.5"/><rect class="die-m" x="8" y="16" width="24" height="8" rx="1.5"/>'],
  si: ['Injury dice showing a Serious Injury broken bone', '<rect class="die-c" x="2" y="2" width="36" height="36" rx="7"/><g transform="rotate(-45 20 20)"><circle class="die-m" cx="6" cy="16.5" r="3.6"/><circle class="die-m" cx="6" cy="23.5" r="3.6"/><path class="die-m" d="M6 16.5h10l2 2-2 2 2 2-2 1H6z"/><circle class="die-m" cx="34" cy="16.5" r="3.6"/><circle class="die-m" cx="34" cy="23.5" r="3.6"/><path class="die-m" d="M34 16.5H24l-2 2 2 2-2 2 2 1h10z"/></g>'],
  ooa: ['Injury dice showing an Out of Action skull', '<rect class="die-c" x="2" y="2" width="36" height="36" rx="7"/><circle class="die-m" cx="20" cy="17" r="11"/><rect class="die-m" x="13.5" y="23" width="13" height="10" rx="2"/><circle class="die-c" cx="15.5" cy="17" r="3"/><circle class="die-c" cx="24.5" cy="17" r="3"/><rect class="die-c" x="17.5" y="28" width="1.5" height="5"/><rect class="die-c" x="21" y="28" width="1.5" height="5"/>'],
};
for (const n of [1, 2, 3, 4, 5, 6]) FACES[n] = [`Dice showing a ${n}`, box('die-a') + PIPS[n].map(([x, y]) => pip(x, y)).join('')];

export function setDiceArt(art) { for (const k in art) FACES[k][1] = art[k]; }

export function die(code) {
  const [label, body] = FACES[code];
  return `<svg class="die" viewBox="0 0 40 40" role="img" aria-label="${label}">${body}</svg>`;
}
export const diceList = s => (s ? s.split(/\s+/) : []);
