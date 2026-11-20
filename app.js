/* Serve the Low Mass — learning engine + UI. Vanilla JS, works offline from file:// or as a PWA. */
(function () {
'use strict';
const M = window.MASS;
const CORE = M.sections, EXTRA = M.extras, ALLSEC = CORE.concat(EXTRA);
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// Spaced-review gaps, compressed for a weekend but continuing for weeks after.
const INT = [10 * MIN, 1 * HOUR, 5 * HOUR, 20 * HOUR, 2 * DAY, 4 * DAY, 9 * DAY, 20 * DAY];

// ───────── index the content
const STEP = {}, SEC_OF = {}, WHOLE = {};
ALLSEC.forEach(sec => {
  sec.steps.forEach(st => { STEP[st.id] = st; SEC_OF[st.id] = sec; });
  (sec.wholes || []).forEach(w => { WHOLE[w.id] = w; SEC_OF[w.id] = sec; });
});
const realId = id => (STEP[id] && STEP[id].alias) || id;
const isWhole = id => !!WHOLE[id];
function textOf(id) {
  id = realId(id);
  if (isWhole(id)) return WHOLE[id].of.map(p => STEP[p].s).join(' ');
  return STEP[id].s;
}
const kindOf = id => isWhole(realId(id)) ? 'whole' : STEP[realId(id)].type;
const itemsOfSec = sec => sec.steps.filter(s => !s.alias).map(s => s.id).concat((sec.wholes || []).map(w => w.id));
const CORE_ITEMS = [].concat(...CORE.map(itemsOfSec));
const EXTRA_ITEMS = [].concat(...EXTRA.map(itemsOfSec));
const isExtraId = id => !!SEC_OF[realId(id)] && !!SEC_OF[realId(id)].optional;

// ───────── stops (the path)
function groupSteps(sec) {
  const groups = []; let cur = [], w = 0;
  sec.steps.forEach((st, i) => {
    cur.push(i);
    if (!st.alias) w += st.type === 'do' ? 0.4 : (words(st.s).length >= 10 ? 2 : 1);
    if (w >= 3.5) { groups.push(cur); cur = []; w = 0; }
  });
  if (cur.length) { if (groups.length && w < 1) groups[groups.length - 1].push(...cur); else groups.push(cur); }
  return groups;
}
function buildStops(secs, withRuns) {
  const out = [];
  secs.forEach((sec, si) => {
    out.push({ id: sec.id + ':learn', kind: 'learn', sec: sec.id, title: 'Learn: ' + sec.title });
    const gs = groupSteps(sec);
    gs.forEach((g, gi) => out.push({ id: sec.id + ':p' + gi, kind: 'practice', sec: sec.id, range: g, title: `Practise: ${sec.short} (${gi + 1}/${gs.length})` }));
    out.push({ id: sec.id + ':check', kind: 'check', sec: sec.id, title: 'Checkpoint: ' + sec.short });
    if (withRuns) RUNS.filter(r => r.after === sec.id).forEach(r => out.push(Object.assign({ kind: 'run' }, r)));
  });
  return out;
}
const RUNS = [
  { id: 'run:A', after: 'foot', from: 'entr', to: 'foot', level: 'guided', title: 'Run-through: entrance → going up (guided)' },
  { id: 'run:B', after: 'offer', from: 'kyrie', to: 'offer', level: 'guided', title: 'Run-through: Kyrie → Offertory (guided)' },
  { id: 'run:H1', after: 'offer', from: 'entr', to: 'offer', level: 'full', title: 'Big run: first half of Mass, from memory' },
  { id: 'run:C', after: 'comm', from: 'pref', to: 'comm', level: 'guided', title: 'Run-through: Preface → Communion (guided)' },
  { id: 'run:D', after: 'end', from: 'ablu', to: 'end', level: 'guided', title: 'Run-through: Ablutions → leaving (guided)' },
  { id: 'run:H2', after: 'end', from: 'pref', to: 'end', level: 'full', title: 'Big run: second half of Mass, from memory' },
  { id: 'run:ALL', after: 'end', from: 'entr', to: 'end', level: 'full', title: 'FINAL: the whole Low Mass from memory' },
];
const PATH = buildStops(CORE, true);
const XPATH = buildStops(EXTRA, false);
const STOP = {}; PATH.concat(XPATH).forEach(s => STOP[s.id] = s);

// ───────── storage
const KEY = 'servemass-v1';
let S;
function blank() { return { v: 2, items: {}, stops: {}, lastActive: 0, prevActive: 0, studyMs: 0, days: {}, settings: { offset: 0, theme: '' } }; }
function load() { try { S = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { S = blank(); } S.settings = Object.assign(blank().settings, S.settings || {}); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } if (window.AI && AI.onSave) AI.onSave(); }
const now = () => Date.now() + (S.settings.offset || 0);
load();
if (S.settings.theme) document.documentElement.dataset.theme = S.settings.theme;
S.prevActive = S.lastActive;
// v1 → v2: practice stops were regrouped. Learned lines and their revision schedule are untouched;
// a new practice stop counts as done when everything in it was already learned.
if ((S.v || 1) < 2) {
  const had = Object.keys(S.stops).length > 0;
  PATH.concat(XPATH).filter(st => st.kind === 'practice').forEach(st => {
    const sec = ALLSEC.find(x => x.id === st.sec);
    const ids = st.range.map(i => sec.steps[i]).filter(x => !x.alias).map(x => x.id);
    if (ids.every(id => S.items[id] && S.items[id].learned)) S.stops[st.id] = { done: true, at: now(), migrated: true };
    else delete S.stops[st.id];
  });
  S.v = 2; S.whatsNew = had;
}
save();

function rec(id) { id = realId(id); return S.items[id] || (S.items[id] = { st: 0, due: 0, n: 0, ok: 0, lapses: 0, last: 0, learned: false }); }
const learned = id => !!(S.items[realId(id)] && S.items[realId(id)].learned);
const jit = () => 0.9 + Math.random() * 0.2;
function markLearned(id) {
  const r = rec(id); const t = now();
  if (!r.learned) { r.learned = true; r.st = 1; r.due = t + INT[0] * jit(); }
  else r.due = Math.max(r.due, t + INT[Math.max(0, r.st - 1)] * 0.5);
  r.last = t;
}
function grade(id, res) {
  const r = rec(id), t = now();
  r.n++; if (res === 'ok') r.ok++;
  if (!r.learned) { if (res === 'ok') { r.learned = true; r.st = 1; r.due = t + INT[0] * jit(); } r.last = t; return; }
  const ivl = INT[r.st - 1] || INT[0];
  if (res === 'ok') {
    if (t - r.last >= 0.5 * ivl || t >= r.due) { r.st = Math.min(r.st + 1, INT.length); r.due = t + INT[r.st - 1] * jit(); }
  } else if (res === 'close') { r.due = t + INT[Math.max(0, r.st - 2)] * jit(); }
  else { r.lapses++; r.st = Math.max(1, r.st - 2); r.due = t + 5 * MIN; }
  r.last = t;
}
function hold(id) {
  const r = S.items[realId(id)]; if (!r || !r.learned) return 0;
  const base = Math.min(1, r.st / 5), t = now();
  if (t <= r.due) return base;
  return base * Math.max(0.3, Math.exp(-(t - r.due) / (INT[r.st - 1] || INT[0])));
}
const memPct = ids => ids.length ? Math.round(100 * ids.reduce((a, id) => a + hold(id), 0) / ids.length) : 0;
const due = ids => ids.filter(id => { const r = S.items[id]; return r && r.learned && r.due <= now(); });
function tick() { const t = now(); if (S.lastActive && t - S.lastActive < 2 * MIN) S.studyMs += t - S.lastActive; const d = new Date(t).toDateString(); S.days[d] = (S.days[d] || 0) + 1; S.lastActive = t; }
const stopDone = id => !!(S.stops[id] && S.stops[id].done);
const nextStop = path => path.find(s => !stopDone(s.id));
function unlocked(stop, path) { if (stop.kind === 'learn') return true; const i = path.indexOf(stop); return path.slice(0, i).every(s => stopDone(s.id)); }

// ───────── text & marking
function norm(w) { return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/[^a-z]/g, ''); }
function words(s) { return String(s || '').split(/\s+/).filter(w => norm(w)); }
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
const tol = n => n <= 2 ? 0 : n <= 7 ? 1 : 2;
function wmatch(e, g) { if (e === g) return 2; return lev(e, g) <= tol(e.length) ? 1 : 0; }
// Sound-alike spelling, so a speech recogniser's Italian spelling of Latin still lines up:
// "chi letifica" ≈ "qui laetificat", "spirito" ≈ "spiritu", "ecclesie" ≈ "Ecclesiae".
function phon(w) {
  return norm(w).replace(/ae|oe/g, 'e').replace(/ph/g, 'f').replace(/ch/g, 'k').replace(/qu|cu(?=[aeio])/g, 'k')
    .replace(/sc(?=[ei])/g, 'S').replace(/c(?=[eiy])/g, 'C').replace(/c/g, 'k').replace(/gn/g, 'N').replace(/g(?=[ei])/g, 'J')
    .replace(/t(?=i[aeiou])/g, 'Z').replace(/z/g, 'Z').replace(/x/g, 'ks').replace(/y/g, 'i').replace(/h/g, '')
    .replace(/(.)\1+/g, '$1').replace(/u(?=$)/, 'o').replace(/m$/, '');
}
const tolS = n => n <= 2 ? 0 : n <= 4 ? 1 : n <= 7 ? 2 : 3;
function wmatchS(e, g) { if (e === g) return 2; return lev(e, g) <= tolS(e.length) ? 1 : 0; }
// Align expected words with what was given; returns per-expected-word status and a verdict.
// spoken: compare sound-alike forms, forgive recogniser noise and extra words.
function mark(expected, given, spoken) {
  const f = spoken ? phon : norm, eq = spoken ? wmatchS : wmatch;
  const E = words(expected), en = E.map(f), gn = (spoken ? splitRun(given) : words(given)).map(f).filter(Boolean);
  const m = en.length, n = gn.length, D = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) { const q = eq(en[i], gn[j]); D[i][j] = Math.max(D[i + 1][j], D[i][j + 1], q ? D[i + 1][j + 1] + q : 0); }
  const st = new Array(m).fill('miss'); let i = 0, j = 0, matched = 0;
  while (i < m && j < n) { const q = eq(en[i], gn[j]); if (q && D[i][j] === D[i + 1][j + 1] + q) { st[i] = q === 2 ? 'ok' : 'typo'; matched++; i++; j++; } else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++; }
  const extra = n - matched, ratio = m ? matched / m : 0;
  let v = 'bad';
  if (spoken) { if (matched === m || (m >= 5 && ratio >= 0.85)) v = 'ok'; else if (ratio >= 0.6) v = 'close'; }
  else if (matched === m && extra <= 1) v = 'ok';
  else if (m >= 8 && ratio >= 0.9 && extra <= 2) v = 'ok';
  else if (ratio >= 0.7) v = 'close';
  return { v, ratio, html: E.map((w, k) => `<span class="w-${st[k]}">${esc(w)}</span>`).join(' '), typos: st.filter(x => x === 'typo').length, missing: st.filter(x => x === 'miss').length };
}
// Recognisers sometimes glue words ("etcum") or split them; give the aligner both chances.
function splitRun(s) { return words(s); }

// ───────── speech (device Italian voice ≈ Church Latin; offline on iOS/macOS)
let VOICE = null;
function pickVoice() { if (!('speechSynthesis' in window)) return; const vs = speechSynthesis.getVoices(); VOICE = vs.find(v => /^it/i.test(v.lang) && /alice|federica|luca|paola/i.test(v.name)) || vs.find(v => /^it/i.test(v.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\(.*?\)/g, '').replace(/j/g, 'i').replace(/J/g, 'I').replace(/ae/g, 'e').replace(/æ/g, 'e'));
  u.lang = 'it-IT'; if (VOICE) u.voice = VOICE; u.rate = 0.82; speechSynthesis.speak(u);
}
const spk = t => `<button class="sp" data-say="${esc(t)}" aria-label="Hear it">🔊</button>`;

// ───────── visuals
const ZG = { // zone geometry on the sanctuary plan
  altarG: 'M92,30h48v30h-48z', altarC: 'M140,30h80v30h-80z', altarE: 'M220,30h48v30h-48z',
  foot: 'M188,64h46v26h-46z', stepG: 'M62,109h62v16h-62z', stepE: 'M236,109h62v16h-62z',
  footG: 'M138,130h34v24h-34z', floorC: 'M160,158h40v28h-40z', floorG: 'M30,136h80v52h-80z', floorE: 'M250,136h80v52h-80z',
  credence: 'M312,58h40v42h-40z', sedilia: 'M312,222h40v52h-40z', rail: 'M16,284h328v16h-328z',
};
const ZC = { altarG: [116, 45], altarC: [180, 45], altarE: [244, 45], foot: [211, 77], stepG: [93, 117], stepE: [267, 117], footG: [155, 142], floorC: [180, 172], floorG: [70, 162], floorE: [290, 162], credence: [332, 79], sedilia: [332, 248], rail: [180, 292] };
function mapSVG(o) {
  o = o || {};
  const cls = z => { let c = 'zone'; if (o.tap) c += ' tap'; if ((o.hi || []).includes(z)) c += ' hi'; if ((o.hi2 || []).includes(z)) c += ' hi2'; if (o.right === z) c += ' right'; if (o.wrong === z) c += ' wrongz'; return c; };
  let path = '';
  if (o.path && o.path.length) {
    const pts = o.path.map(z => ZC[z]);
    path = `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-dasharray="5 4" marker-end="url(#arr)"/>` +
      pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="var(--acc)"/><text x="${p[0]}" y="${p[1] + 4}" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">${i + 1}</text>`).join('');
  }
  return `<div class="map"><svg viewBox="0 0 360 330" role="img" aria-label="Sanctuary plan">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--acc)"/></marker></defs>
  <rect x="0" y="0" width="360" height="330" fill="var(--bg)"/>
  <rect x="60" y="108" width="240" height="18" fill="var(--line)" stroke="var(--mute)" stroke-width=".5"/>
  <rect x="70" y="90" width="220" height="18" fill="var(--line)" stroke="var(--mute)" stroke-width=".5" opacity=".8"/>
  <rect x="80" y="62" width="200" height="28" fill="var(--card)" stroke="var(--mute)" stroke-width=".7"/>
  <rect x="92" y="30" width="176" height="30" fill="var(--card)" stroke="var(--ink)" stroke-width="1.2"/>
  <rect x="170" y="18" width="20" height="14" fill="var(--acc2)" opacity=".7"/><text x="180" y="14" font-size="8" text-anchor="middle" fill="var(--mute)">tabernacle / cross</text>
  <rect x="312" y="58" width="40" height="42" fill="var(--card)" stroke="var(--mute)"/><rect x="312" y="222" width="40" height="52" fill="var(--card)" stroke="var(--mute)"/>
  <rect x="16" y="284" width="328" height="16" fill="var(--card)" stroke="var(--mute)"/>
  ${Object.keys(ZG).map(z => `<path class="${cls(z)}" data-zone="${z}" d="${ZG[z]}"/>`).join('')}
  <g font-size="8.5" fill="var(--ink)" text-anchor="middle" pointer-events="none">
   <text x="180" y="49">ALTAR</text><text x="116" y="49" font-size="7">Gospel corner</text><text x="244" y="49" font-size="7">Epistle corner</text>
   <text x="130" y="80" font-size="7.5">footpace (predella)</text><text x="211" y="80" font-size="7">by Father</text>
   <text x="180" y="102" font-size="7" fill="var(--mute)">middle step</text><text x="180" y="120" font-size="7" fill="var(--mute)">lowest step</text>
   <text x="93" y="120" font-size="7">kneel (G)</text><text x="267" y="120" font-size="7">kneel (E)</text>
   <text x="155" y="145" font-size="6.5">at foot</text><text x="180" y="176" font-size="7">centre</text>
   <text x="332" y="76" font-size="7">credence</text><text x="332" y="86" font-size="6.5">cruets, bell</text>
   <text x="332" y="250" font-size="7">sedilia</text><text x="180" y="295" font-size="7.5">communion rail</text>
   <text x="70" y="206" font-size="9" font-weight="700" fill="var(--acc)">GOSPEL SIDE</text><text x="290" y="206" font-size="9" font-weight="700" fill="var(--acc)">EPISTLE SIDE</text>
   <text x="70" y="216" font-size="7" fill="var(--mute)">(left)</text><text x="290" y="216" font-size="7" fill="var(--mute)">(right)</text>
   <text x="180" y="320" font-size="8" fill="var(--mute)">↓ nave — the people (you are looking at the altar)</text>
  </g>${path}</svg></div>`;
}
function fig(x, y, s, extra) { // simple person
  return `<g transform="translate(${x},${y}) scale(${s || 1})" stroke="var(--ink)" stroke-width="2" fill="none" stroke-linecap="round"><circle cx="0" cy="-34" r="7" fill="var(--card)"/>${extra || ''}</g>`;
}
const PICS = {
  cruetsOffer: `<svg viewBox="0 0 320 170"><text x="10" y="18" font-size="12" fill="var(--mute)">OFFERTORY — Father takes them</text>
    <g transform="translate(70,40)"><path d="M10,10h20v12l8,10v60h-36v-60l8-10z" fill="#8c2b3a" opacity=".85"/><path d="M38,40c18,0 18,30 0,30" stroke="var(--ink)" stroke-width="4" fill="none"/><text x="-10" y="112" font-size="12" fill="var(--ink)">WINE · right hand</text></g>
    <g transform="translate(190,40)"><path d="M10,10h20v12l8,10v60h-36v-60l8-10z" fill="#9cc6e8" opacity=".9"/><path d="M38,40c18,0 18,30 0,30" stroke="var(--ink)" stroke-width="4" fill="none"/><text x="-10" y="112" font-size="12" fill="var(--ink)">WATER · left hand</text></g>
    <text x="300" y="80" font-size="13" text-anchor="end" fill="var(--acc)" font-weight="700">handles →</text><text x="300" y="96" font-size="12" text-anchor="end" fill="var(--acc)">toward Father</text>
    <text x="10" y="166" font-size="11" fill="var(--mute)">Hold by the body. Wine handed first.</text></svg>`,
  cruetsAblu: `<svg viewBox="0 0 320 170"><text x="10" y="18" font-size="12" fill="var(--mute)">ABLUTIONS — you pour</text>
    <g transform="translate(80,40)"><path d="M10,10h20v12l8,10v60h-36v-60l8-10z" fill="#8c2b3a" opacity=".85"/><path d="M2,40c-18,0 -18,30 0,30" stroke="var(--acc)" stroke-width="6" fill="none"/><text x="-30" y="112" font-size="12" fill="var(--ink)">grip the handle</text></g>
    <g transform="translate(200,40)"><path d="M10,10h20v12l8,10v60h-36v-60l8-10z" fill="#9cc6e8" opacity=".9"/><path d="M2,40c-18,0 -18,30 0,30" stroke="var(--acc)" stroke-width="6" fill="none"/></g>
    <text x="10" y="166" font-size="11" fill="var(--mute)">1st: wine into chalice. 2nd: a little wine, then water, over fingers.</text></svg>`,
  lavabo: `<svg viewBox="0 0 320 150"><text x="10" y="18" font-size="12" fill="var(--mute)">LAVABO</text>
    <rect x="30" y="60" width="110" height="14" rx="6" fill="var(--hi2)"/><path d="M40,74v40M130,74v30" stroke="var(--hi2)" stroke-width="10"/><text x="30" y="52" font-size="11">towel over LEFT forearm</text>
    <ellipse cx="85" cy="128" rx="40" ry="8" fill="none" stroke="var(--ink)" stroke-width="2"/><text x="40" y="146" font-size="11">dish in LEFT hand</text>
    <g transform="translate(210,40)"><path d="M10,10h20v12l8,10v60h-36v-60l8-10z" fill="#9cc6e8"/><text x="-10" y="110" font-size="11">water · RIGHT hand</text></g>
    <text x="300" y="30" font-size="11" text-anchor="end" fill="var(--acc)">pour slowly over fingertips</text></svg>`,
  hem: `<svg viewBox="0 0 320 160"><text x="10" y="18" font-size="12" fill="var(--mute)">Going up the steps</text>
    <path d="M40,140h80v-20h60v-20h60v-20h60" stroke="var(--mute)" stroke-width="3" fill="none"/>
    ${fig(180, 92, 1, '<path d="M0,-27v40M0,-20l-12,14M0,-20l12,14"/><path d="M-14,13l14,-30l14,30z" fill="var(--card)"/>')}
    ${fig(128, 118, 0.9, '<path d="M0,-27v30M0,-18l22,18M0,-18l-10,16M0,3l-8,20M0,3l8,20"/>')}
    <path d="M150,104c10,4 16,4 24,2" stroke="var(--acc)" stroke-width="3" fill="none"/>
    <text x="10" y="40" font-size="11" fill="var(--acc)">lift the FRONT hem of the alb</text><text x="10" y="54" font-size="11" fill="var(--acc)">a little, so Father doesn't tread on it</text></svg>`,
  chasuble: `<svg viewBox="0 0 320 170"><text x="10" y="18" font-size="12" fill="var(--mute)">Elevation (from behind)</text>
    ${fig(170, 80, 1.1, '<path d="M0,-27v30M0,-24l-14,-22M0,-24l14,-22"/><path d="M-22,-24h44l6,60h-56z" fill="var(--acc)" opacity=".35"/>')}
    ${fig(235, 130, 0.9, '<path d="M0,-27v24M0,-20l-34,-6M0,-20l14,10M0,-3l-14,6l0,14M0,-3l10,20"/>')}
    <circle cx="252" cy="122" r="6" fill="var(--acc2)"/><text x="262" y="126" font-size="11">bell (right)</text>
    <text x="10" y="150" font-size="11" fill="var(--acc)">kneel at Father's right · LEFT hand lifts the</text><text x="10" y="164" font-size="11" fill="var(--acc)">back hem of the chasuble · bells 1 – 3 – 1</text></svg>`,
  bell: `<svg viewBox="0 0 320 110"><path d="M40,80c0,-40 10,-55 30,-55s30,15 30,55z" fill="var(--acc2)"/><circle cx="70" cy="86" r="6" fill="var(--acc2)"/><path d="M70,25v-14" stroke="var(--ink)" stroke-width="5"/>
    <text x="120" y="35" font-size="12">Sanctus — 3</text><text x="120" y="52" font-size="12">Hanc igitur — 1 (warning)</text><text x="120" y="69" font-size="12">Each elevation — 1 · 3 · 1</text><text x="120" y="86" font-size="12">Domine non sum dignus — 1, 1, 1</text></svg>`,
  paten: `<svg viewBox="0 0 320 130"><text x="10" y="18" font-size="12" fill="var(--mute)">Communion paten</text>
    ${fig(90, 80, 1, '<path d="M0,-27v40"/>')}<path d="M60,66h46" stroke="var(--acc2)" stroke-width="5"/><path d="M106,66h40" stroke="var(--ink)" stroke-width="3"/>
    <text x="160" y="60" font-size="11">flat, steady, by the handle,</text><text x="160" y="75" font-size="11">just under the chin</text><text x="160" y="90" font-size="11">walk on Father's RIGHT</text></svg>`,
  bow: `<svg viewBox="0 0 320 110"><path d="M20,98h280" stroke="var(--mute)"/>
    ${fig(70, 86, 1, '<path d="M0,-27l18,18l0,12M18,-9l-8,20"/>')}<text x="20" y="20" font-size="11">kneeling upright — while</text><text x="20" y="33" font-size="11">Father says his Confiteor</text>
    <g transform="translate(200,86)" stroke="var(--ink)" stroke-width="2" fill="none"><circle cx="30" cy="-12" r="7" fill="var(--card)"/><path d="M24,-14l-24,-6l0,20"/></g><text x="180" y="20" font-size="11" fill="var(--acc)">profound bow — your</text><text x="180" y="33" font-size="11" fill="var(--acc)">Misereatur & Confiteor</text></svg>`,
  crosses: `<svg viewBox="0 0 320 80"><text x="10" y="20" font-size="12">Before each Gospel, with your right thumb:</text><text x="10" y="45" font-size="13" fill="var(--acc)">✚ forehead   ✚ lips   ✚ breast</text><text x="10" y="68" font-size="11" fill="var(--mute)">then "Gloria tibi, Domine"</text></svg>`,
};

// ───────── UI shell
let TAB = 'home', VIEW = null; // VIEW = active session or reader
const TABS = [['home', '⛪', 'Home'], ['path', '🪜', 'Path'], ['card', '📜', 'Card'], ['map', '🗺️', 'Map'], ['extras', '➕', 'Extras'], ['more', '⚙️', 'More']];
function renderTabs() { $('#tabs').innerHTML = TABS.map(([k, ic, l]) => `<button data-tab="${k}" class="${TAB === k && !VIEW ? 'on' : ''}"><span class="ic">${ic}</span>${l}</button>`).join(''); }
function go(tab) { TAB = tab; VIEW = null; render(); window.scrollTo(0, 0); }
function render() {
  renderTabs();
  const el = $('#app');
  if (VIEW) { el.innerHTML = VIEW.render(); VIEW.after && VIEW.after(); return; }
  el.innerHTML = ({ home: homeHTML, path: pathHTML, card: cardHTML, map: mapTabHTML, extras: extrasHTML, more: moreHTML })[TAB]();
}
function ago(ms) { if (ms < HOUR) return Math.max(1, Math.round(ms / MIN)) + ' min'; if (ms < 2 * DAY) return Math.round(ms / HOUR) + ' h'; return Math.round(ms / DAY) + ' days'; }

function homeHTML() {
  const done = PATH.filter(s => stopDone(s.id)).length, nx = nextStop(PATH), d = due(CORE_ITEMS);
  const gap = S.prevActive ? now() - S.prevActive : 0, mem = memPct(CORE_ITEMS);
  let welcome = !S.prevActive ? `<p>Welcome. Start at the top: everything is <b>explained before you're asked about it</b>. Each stop is about 5 minutes. Come back whenever — the app tracks what's fading and revises it first.</p>`
    : `<p>Last session: <b>${ago(gap)} ago</b>. ${d.length ? `<b>${d.length}</b> thing${d.length > 1 ? 's are' : ' is'} due for revision — they come first.` : 'Nothing is due yet — straight on to new material.'}</p>`;
  if (gap > 20 * HOUR && done) welcome += `<p class="note">It's been a while — consider a 3-minute skim of the <b>Server's card</b> (📜) before you continue.</p>`;
  const news = S.whatsNew ? `<div class="card" style="border-color:var(--acc2)"><b>New in this version</b><ul style="margin:6px 0;padding-left:20px">
    <li>Practice now goes <b>one Latin line at a time, in order</b> — each line is drilled until you can write it twice from memory, then you say <b>everything so far from the top</b>.</li>
    <li>New lines start with the <b>English meaning shown</b>; the help is taken away step by step.</li>
    <li>Every question shows <b>where you are</b> in the Mass and what came just before.</li>
    <li>New questions on <b>Father's lines</b>, <b>"what's your next line?"</b> and <b>putting your lines in order</b>.</li>
    <li>Revision comes in Mass order and is mostly Latin.</li></ul>
    <small class="mute">Your progress is kept. Practice stops were regrouped: ones where you'd already learned everything are ticked; the rest are open. To go over a finished section the new way, use Redo on the Path tab.</small>
    <button class="wide" data-act="dismissNew">Got it</button></div>` : '';
  const weak = weakList();
  const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const storage = ios && !standalone && /^https?:/.test(location.protocol) && !window.claude && !S.storageNoteSeen ? `<div class="note">You're in Safari. <b>Progress here is separate from the home-screen app</b> — use the home-screen icon (or move progress with More → Copy / Paste). <button class="ghost" data-act="dismissStorage">OK</button></div>` : '';
  const ai = AIon() ? `<p class="mute" style="margin:4px 0"><small>✨ Claude is connected: spoken answers are double-checked, "what do I do?" answers are marked by Claude, memory hooks and 💬 Ask Claude are on. Progress is saved to your Claude account.</small></p>` : '';
  return `<h1>Serve the Low Mass</h1>${storage}${ai}${news}
  <div class="card">${welcome}
    <button class="pri wide" data-act="continue">${d.length ? `Revise ${Math.min(d.length, 12)}${nx ? ' → then ' : ''}` : ''}${nx ? (d.length ? esc(nx.title) : 'Continue: ' + esc(nx.title)) : d.length ? '' : 'All stops done — come back later for revision'}</button>
    ${d.length ? `<button class="wide" data-act="review">Only revise (${d.length} due)</button>` : ''}
    <div class="row"><button data-act="rehearse">🎭 Rehearse</button>${weak.length ? `<button data-act="drill">🎯 Drill weakest ${Math.min(8, weak.length)}</button>` : ''}</div>
  </div>
  ${weak.length ? `<div class="card"><b>Weak spots</b> <small class="mute">(missed in the last few days)</small><ol style="margin:6px 0;padding-left:20px">${weak.slice(0, 5).map(id => `<li><span class="${kindOf(id) === 'do' ? '' : 'lat'}">${esc(weakLabel(id))}</span> <small class="mute">×${trouble(id)}</small>${myHook(id) ? `<br><small>💡 ${esc(myHook(id))}</small>` : AIon() && kindOf(id) !== 'do' ? `<br><button class="ghost" data-act="hook" data-id="${esc(id)}">✨ Memory hook</button>` : ''}</li>`).join('')}</ol></div>` : ''}
  <div class="stats">
    <div class="card stat"><span class="mute">Path</span><b>${done}/${PATH.length}</b><div class="bar"><i style="width:${100 * done / PATH.length}%"></i></div><small class="mute">stops done</small></div>
    <div class="card stat"><span class="mute">Memory</span><b>${mem}%</b><div class="bar gold"><i style="width:${mem}%"></i></div><small class="mute">how well it's holding (grows over days)</small></div>
  </div>
  <div class="card"><b>The Mass, section by section</b>
    <div class="timeline">${CORE.map(sec => `<i title="${esc(sec.short)}"><b style="width:${memPct(itemsOfSec(sec))}%"></b></i>`).join('')}</div>
    ${CORE.map(sec => { const st = PATH.filter(s => s.sec === sec.id), dn = st.filter(s => stopDone(s.id)).length; return `<div class="stop"><div class="t">${esc(sec.title)}<br><small class="mute">${dn}/${st.length} stops · memory ${memPct(itemsOfSec(sec))}%</small></div></div>`; }).join('')}
  </div>
  <p class="mute"><small>Studied ${Math.round(S.studyMs / MIN)} min in total. ${offlineNote()}</small></p>`;
}
let SW_READY = false;
function offlineNote() { if (IN_CLAUDE) return 'Claude version — needs internet. For the plane, use the home-screen app (move progress with More → Copy / Paste).'; if (location.protocol === 'file:') return 'Running from a file on this device — works offline.'; return SW_READY ? '✅ Ready for offline use.' : '⏳ Saving for offline use… (keep this open a moment while online)'; }

function stopRow(s, path) {
  const dn = stopDone(s.id), un = unlocked(s, path), nx = nextStop(path) === s, sc = S.stops[s.id];
  return `<div class="stop"><div class="t">${dn ? '<span class="pill done">✓</span>' : nx ? '<span class="pill next">next</span>' : ''}${esc(s.title)}${sc && sc.score != null ? ` <small class="mute">best ${sc.score}%</small>` : ''}</div>
    <button data-stop="${s.id}" ${un ? '' : 'disabled'}>${dn ? 'Redo' : s.kind === 'learn' ? 'Read' : 'Start'}</button></div>`;
}
function pathHTML() {
  return `<h1>The path</h1><p class="mute">Learn → practise in small pieces → checkpoint → longer run-throughs. A stop once done stays done; fading things come back in revision. You can read any "Learn" page ahead of time.</p>` +
    CORE.map(sec => `<div class="card"><h3>${esc(sec.title)}</h3>${PATH.filter(s => s.sec === sec.id || (s.kind === 'run' && s.after === sec.id)).map(s => stopRow(s, PATH)).join('')}</div>`).join('');
}
function extrasHTML() {
  const d = due(EXTRA_ITEMS);
  return `<h1>Extras</h1><p class="mute">Optional — these don't count toward your main progress or revision.</p>
  ${d.length ? `<button class="pri wide" data-act="xreview">Revise extras (${d.length} due)</button>` : ''}` +
    EXTRA.map(sec => `<div class="card"><h3>${esc(sec.title)}</h3><small class="mute">memory ${memPct(itemsOfSec(sec))}%</small>${XPATH.filter(s => s.sec === sec.id).map(s => stopRow(s, XPATH.filter(x => x.sec === sec.id))).join('')}</div>`).join('');
}
let COVER = false;
function cardHTML() {
  const line = st => {
    if (st.type === 'do') return `<div style="margin:6px 0">▸ <b>${esc(st.label)}</b> <small class="mute">— ${esc(st.a)}</small></div>`;
    const t = textOf(st.id);
    return `<div style="margin:8px 0"><div class="cue">${esc(st.cue)}</div><div class="ans ${COVER ? 'cover' : ''}" data-reveal>${esc(t)} ${COVER ? '' : spk(t)}</div><small class="mute">${esc(st.en)}</small></div>`;
  };
  return `<h1>Server's card</h1><p class="mute">The whole Low Mass in order: Father's cue, your answer, and what you do. Turn on <b>cover</b> to test yourself — tap a hidden line to reveal it.</p>
  <button class="wide" data-act="cover">${COVER ? 'Show all answers' : 'Cover my answers (self-test)'}</button>` +
    CORE.map(sec => `<div class="card"><h3>${esc(sec.title)}</h3>${sec.steps.map(line).join('')}</div>`).join('') +
    `<div class="card"><h3>Ask Father before Mass</h3>${fatherList()}</div>`;
}
function fatherList() {
  const qs = new Set(); ALLSEC.forEach(sec => { sec.explain.forEach(c => c.father && qs.add(c.father)); sec.steps.forEach(s => s.father && qs.add(s.father)); });
  qs.add('Second Confiteor before Communion: do you want it? (Learned as standard here.)');
  return `<ol>${[...qs].map(q => `<li>${esc(q)}</li>`).join('')}</ol>`;
}
let MAPSEL = null;
function mapTabHTML() {
  const info = { altarG: 'Missal goes here for the Gospel (angled in). Last Gospel is read here.', altarC: 'Father stands here; tabernacle behind.', altarE: 'Missal at the start and end of Mass. You collect the veil & present cruets here; ablutions here.', foot: 'You kneel here (with the bell) for the Consecration, and with the paten before Communion.', stepG: 'Your kneeling place while the missal is on the Epistle side: after the prayers at the foot until the Epistle, and after the ablutions to the end.', stepE: 'Your kneeling place while the missal is on the Gospel side: after the Gospel until Communion.', footG: 'Prayers at the foot: kneel on the floor at Father\'s left.', floorC: 'Genuflect here every time you cross. Carry the missal through here.', floorG: 'Wait here for the Gospel after moving the missal.', floorE: 'Wait here for the missal after the Epistle; stand here for the rest of the Gospel and the Last Gospel.', credence: 'Cruets, lavabo dish & towel, bell, paten.', sedilia: 'Father\'s biretta goes here. Sermon seat.', rail: 'Hold the paten for the people\'s Communion.' };
  return `<h1>Sanctuary map</h1><p class="mute">Tap a place to see what happens there.</p>${mapSVG({ tap: true, hi: MAPSEL ? [MAPSEL] : [] })}
  <div class="card">${MAPSEL ? `<b>${esc(M.Z[MAPSEL])}</b><br>${esc(info[MAPSEL])}` : 'Tap a highlighted area.'}</div>`;
}
function moreHTML() {
  return `<h1>More</h1>
  <div class="card"><h3>Ask Father before Mass</h3>${fatherList()}</div>
  <div class="card"><h3>Appearance</h3><div class="row"><button data-theme="">Auto</button><button data-theme="light">Light</button><button data-theme="dark">Dark</button></div></div>
  <div class="card"><h3>Voice</h3><p class="mute">🔊 uses your device's Italian voice (${VOICE ? esc(VOICE.name) : 'none found yet'}) — close to Church Latin, works offline.</p><button data-say="Ad Deum qui laetificat juventutem meam.">Test voice</button></div>
  <div class="card"><h3>Move progress between devices</h3><p class="mute">Copy this code on one device and paste it on the other.</p>
    <div class="row"><button data-act="copyprog">📋 Copy progress</button><button data-act="pasteprog">📥 Paste from clipboard</button></div>
    <p class="mute"><small>Before the flight: in the Claude version tap Copy, then in the home-screen app tap Paste. Same the other way.</small></p>
    <button class="wide" data-act="export">Show my progress code</button><textarea id="io" placeholder="Paste a progress code here"></textarea><button class="wide" data-act="import">Load pasted code</button></div>
  <div class="card"><h3>Reset</h3><button class="wide" data-act="reset">Erase all progress</button></div>
  <details class="card"><summary>Testing tools</summary><p class="mute">Shift the clock to check spaced revision. Offset now: ${Math.round((S.settings.offset || 0) / HOUR)} h.</p>
    <div class="row"><button data-shift="${HOUR}">+1 h</button><button data-shift="${DAY}">+1 day</button><button data-shift="0">Reset clock</button></div></details>
  <p class="mute"><small>Sources: the 1962 Ordo Missae; Low Mass one-server guide (ICC, Omaha); Fortescue–O'Connell practice. Local customs vary — the "Ask Father" list collects every point that does.</small></p>`;
}

// ───────── Reader (Learn stop)
function startLearn(stop) {
  const sec = ALLSEC.find(s => s.id === stop.sec);
  const pages = sec.explain.length + 1; let p = 0;
  VIEW = {
    render() {
      const top = `<div class="topbar"><button class="ghost" data-act="exit">✕</button><div class="bar"><i style="width:${100 * (p + 1) / pages}%"></i></div><small>${p + 1}/${pages}</small></div><h1>${esc(sec.title)}</h1>`;
      let body;
      if (p < sec.explain.length) {
        const c = sec.explain[p];
        body = `<div class="card"><h2>${esc(c.title)}</h2>${c.map ? mapSVG(c.map) : ''}${c.pic ? `<div class="pic">${PICS[c.pic]}</div>` : ''}<div>${c.body}</div>${c.father ? `<p class="note">❓ Ask Father: ${esc(c.father)}</p>` : ''}${AIon() ? `<button class="ghost" data-act="ask" data-ctx="card:${sec.id}:${p}">💬 Ask Claude about this</button>` : ''}</div>`;
      } else {
        body = `<div class="card"><h2>Read it through</h2><p class="mute">Read every line <b>aloud</b>, twice. Tap 🔊 to hear it. No questions yet — practice comes next.</p>` +
          sec.steps.map(st => st.type === 'do' ? `<div style="margin:8px 0">▸ <b>${esc(st.label)}</b><br><small class="mute">${esc(st.when)} → ${esc(st.a)}</small></div>`
            : `<div style="margin:12px 0"><div class="cue">${esc(st.cue)} <small class="mute">${esc(st.cueEn)}</small></div><div class="ans">${esc(textOf(st.id))} ${spk(textOf(st.id))}</div><small>${esc(st.en)}</small>${st.say ? `<br><small class="mute">say: ${esc(st.say)}</small>` : ''}${st.gloss ? `<br><small class="mute">${esc(st.gloss)}</small>` : ''}${st.hook ? `<br><small>💡 ${esc(st.hook)}</small>` : ''}${st.note ? `<br><small>📝 ${esc(st.note)}</small>` : ''}</div>`).join('') + '</div>';
      }
      return top + body + `<div class="row">${p ? '<button data-act="prev">← Back</button>' : ''}<button class="pri" data-act="next">${p < pages - 1 ? 'Next →' : 'Done — I\'ve read it'}</button></div>`;
    },
    act(a) {
      if (a === 'prev') p--;
      else if (a === 'next') { if (p < pages - 1) p++; else { S.stops[stop.id] = { done: true, at: now() }; tick(); save(); finishView(`You've read “${sec.title}”.`, stop); return; } }
      render(); window.scrollTo(0, 0);
    },
  };
  render(); window.scrollTo(0, 0);
}

// ───────── Questions
// v2: help is removed rung by rung; the English meaning shows until the last two rungs,
// which must both be answered in full, from memory, in a row.
function ladderFor(id) {
  id = realId(id);
  if (isWhole(id)) return ['initials', 'full'];
  const st = STEP[id];
  if (st.type === 'do') return ['mc'];
  const n = words(st.s).length;
  if (n <= 2) return ['intro', 'mc', 'full', 'full'];
  if (n <= 4) return ['intro', 'mc', 'cloze2', 'full', 'full'];
  if (n <= 9) return ['intro', 'mc', 'tiles', 'cloze2', 'initials', 'full', 'full'];
  return ['intro', 'mc', 'tiles', 'cloze1', 'cloze2', 'initials', 'full', 'full'];
}
const hintOn = (lad, pos) => pos < lad.indexOf('full');
// Father's spoken Latin for a step, without stage directions; null when the cue isn't his words.
function fatherLatin(st) {
  if (!st || st.type !== 'say' || /\(continue/i.test(st.cue)) return null;
  const t = st.cue.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return words(t).length ? t : null;
}
const ORDER = {}; ALLSEC.forEach((sec, si) => sec.steps.forEach((st, i) => ORDER[st.id] = si * 1000 + i));
const sayStepsOf = sec => sec.steps.filter(s => s.type === 'say');
function contextStrip(stepId, noPrev) {
  const st = STEP[stepId]; if (!st) return '';
  const sec = SEC_OF[stepId], i = sec.steps.indexOf(st), prev = sec.steps[i - 1];
  const mine = sayStepsOf(sec), k = mine.indexOf(st);
  let p = '<i>start of this section</i>';
  if (prev) p = prev.type === 'do' ? `▸ ${esc(prev.label)}` : `${fatherLatin(prev) ? `Father: <i>${esc(fatherLatin(prev))}</i><br>` : ''}You: <span class="lat">${esc(textOf(prev.id))}</span>`;
  return `<div class="ctx"><small><b>${esc(sec.short)}</b>${k >= 0 ? ` · your line ${k + 1} of ${mine.length}` : ''}</small>${noPrev ? '' : `<div><small class="mute">Just before:</small><br><small>${p}</small></div>`}</div>`;
}
function prevMine(stepId) { // your previous Latin line in the section (different text)
  const sec = SEC_OF[stepId], mine = sayStepsOf(sec), k = mine.indexOf(STEP[stepId]);
  for (let j = k - 1; j >= 0; j--) if (norm(textOf(mine[j].id)) !== norm(textOf(stepId))) return mine[j];
  return null;
}
function fatherOpts(stepId) {
  const sec = SEC_OF[stepId], right = fatherLatin(STEP[stepId]);
  const pool = [...new Set(sec.steps.map(fatherLatin).filter(t => t && norm(t) !== norm(right)))];
  const extra = [...new Set(CORE.flatMap(s => s.steps.map(fatherLatin)).filter(t => t && norm(t) !== norm(right) && !pool.includes(t)))];
  return shuffle([right].concat(shuffle(pool).slice(0, 3), shuffle(extra)).slice(0, 4));
}
function fatherMCQ(stepId, tag) { return { qt: 'fatherMC', step: stepId, id: null, fopts: fatherOpts(stepId), right: fatherLatin(STEP[stepId]), tag: tag || "Father's line" }; }
function fatherClozeQ(stepId, tag) { const t = fatherLatin(STEP[stepId]); return { qt: 'cloze1', step: stepId, id: null, text: t, father: true, rate: Math.min(0.5, 3 / Math.max(3, words(t).length)), tag: tag || "Father's line" }; }
function nextQ(stepId, hint, tag) { return { qt: 'next', step: stepId, id: realId(stepId), prev: prevMine(stepId).id, hint, tag: tag || 'what comes next' }; }
function myOrderQ(sec) {
  const seen = new Set(), ids = [];
  sayStepsOf(sec).forEach(s => { const t = norm(textOf(s.id)); if (!seen.has(t) && words(textOf(s.id)).length <= 24) { seen.add(t); ids.push(s.id); } });
  if (ids.length < 3) return [];
  return windows(ids, 8).map((w, i, a) => {
    const items = w.map(id => ({ id, label: textOf(id) }));
    return { qt: 'order', items, shuf: shuffle(items.map((x, j) => j)), title: `Put YOUR Latin lines in order${a.length > 1 ? ` (part ${i + 1} of ${a.length})` : ''}.`, tag: 'your lines in order', lat: true };
  });
}
function reviewType(id) {
  const r = rec(id), k = kindOf(id);
  if (k === 'do') return AIon() && r.st >= 2 && Math.random() < 0.5 ? 'explain' : STEP[realId(id)].zone && Math.random() < 0.5 ? 'map' : 'mc';
  if (r.st <= 1 && words(textOf(id)).length >= 6) return 'initials';
  return 'full';
}
function cueStep(q) { return STEP[q.step] || null; }
function sayOptions(id) {
  const ans = textOf(id), n = words(ans).length, sec = SEC_OF[realId(id)];
  const pool = [...new Set(Object.values(STEP).filter(s => s.type === 'say' && !s.alias && s.s && norm(s.s) !== norm(ans) && !!SEC_OF[s.id].optional === !!sec.optional).map(s => s.s))];
  const scored = shuffle(pool).map(t => ({ t, d: Math.abs(words(t).length - n) + (Math.random() * 3) })).sort((a, b) => a.d - b.d);
  return shuffle([ans].concat(scored.slice(0, 3).map(x => x.t)));
}
function qHeader(q) {
  const st = cueStep(q), id = q.id;
  if (q.qt === 'order') return '';
  if (q.qt === 'fatherMC') { const s = STEP[q.step]; return contextStrip(q.step, true) + `<p class="mute" style="margin:0">Your line:</p><div class="ans">${esc(textOf(q.step))}</div><p><b>What does Father say just before it?</b></p>`; }
  if (q.father) { const s = STEP[q.step]; return contextStrip(q.step) + `<p><b>Father's line — fill the gaps.</b></p>${s.cueEn ? `<small class="mute">${esc(s.cueEn)}</small>` : ''}`; }
  if (q.qt === 'next') { const p = STEP[q.prev]; return `<div class="ctx"><small><b>${esc(SEC_OF[q.step].short)}</b></small></div><p class="mute" style="margin:0">Your previous line was:</p><div class="ans" style="font-weight:400">${esc(textOf(p.id))}</div><p><b>What is your NEXT line?</b> <small class="mute">(Father says something in between — you give your answer.)</small></p>${q.hint ? `<small class="mute">Meaning: ${esc(STEP[realId(q.id)].en || '')}</small>` : ''}`; }
  if (kindOf(id) === 'do') { const s = STEP[realId(id)]; const t = st && st.id !== realId(id) ? st : s; return contextStrip(t.id) + `<div class="cue" style="font-style:normal">${esc(t.when)}</div>`; }
  const c = st || STEP[realId(id)];
  if (isWhole(realId(id)) && (!st || st.id === id)) { const w = WHOLE[realId(id)]; return `<p><b>Say ${esc(w.title.toLowerCase())}</b>${w.joinCue ? ' <small class="mute">(just your lines, in order)</small>' : ''}</p>`; }
  const me = STEP[realId(id)];
  const hint = q.hint && q.qt !== 'intro' && me && me.en ? `<div class="hint">Your line means: <b>${esc(me.en)}</b></div>` : '';
  return contextStrip(c.id) + `<p class="mute" style="margin:0">Father says:</p><div class="cue">${esc(c.cue)}</div>${c.cueEn && c.cueEn !== (me && me.en) ? `<small class="mute">${esc(c.cueEn)}</small>` : ''}${hint}`;
}
function mcCls(q, o, right, i) { if (!q.answered) return ''; if (norm(o) === norm(right)) return ' right'; return q.picked === i ? ' wrongc' : ''; }
function blanksFor(text, rate) {
  const W = words(text); const cand = W.map((w, i) => i).filter(i => norm(W[i]).length >= 3);
  const k = Math.max(1, Math.round(W.length * rate));
  const pick = new Set(shuffle(cand.length ? cand : W.map((w, i) => i)).slice(0, k));
  return { W, pick };
}
function initialsOf(text) { return words(text).map(w => w.replace(/([A-Za-zæœÆŒ])([A-Za-zæœÆŒ]*)/, (m, a, b) => a + b.replace(/./g, '_'))).join(' '); }
function qBody(q) {
  const id = q.id;
  switch (q.qt) {
    case 'intro': {
      const st = STEP[realId(id)], t = textOf(id);
      return `<p class="mute" style="margin:6px 0 0">New line — your answer is:</p><div class="ans" style="font-size:1.3rem;margin:6px 0">${esc(t)} ${spk(t)}</div>
        <p style="margin:4px 0"><b>${esc(st.en)}</b></p>${st.say ? `<p class="mute" style="margin:4px 0"><small>say: ${esc(st.say)}</small></p>` : ''}${st.gloss ? `<p class="mute" style="margin:4px 0"><small>${esc(st.gloss)}</small></p>` : ''}${st.hook ? `<p style="margin:4px 0"><small>💡 ${esc(st.hook)}</small></p>` : ''}${st.note ? `<p style="margin:4px 0"><small>📝 ${esc(st.note)}</small></p>` : ''}
        <p class="note">Say it aloud <b>twice</b>, looking at it. Then once more looking away.</p><button class="pri wide" data-act="introok">I've said it — test me</button>`;
    }
    case 'fatherMC': return q.fopts.map((o, i) => `<button class="opt lat${mcCls(q, o, q.right, i)}" data-opt="${i}" ${q.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('');
    case 'mc': {
      if (kindOf(id) === 'do') {
        const s = STEP[realId(id)];
        q.opts = q.opts || shuffle([s.a].concat(s.wrong));
        return `<p><b>${esc(s.q)}</b></p>${q.opts.map((o, i) => `<button class="opt${mcCls(q, o, s.a, i)}" data-opt="${i}" ${q.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}`;
      }
      q.opts = q.opts || sayOptions(id);
      return `<p><b>Your answer?</b></p>${q.opts.map((o, i) => `<button class="opt lat${mcCls(q, o, textOf(id), i)}" data-opt="${i}" ${q.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}`;
    }
    case 'map': { const s = STEP[realId(id)]; return `<p><b>${esc(s.zq)}</b></p>${mapSVG({ tap: true, right: q.answered ? s.zone : null, wrong: q.answered && q.pickedZone !== s.zone ? q.pickedZone : null })}`; }
    case 'tiles': {
      q.pool = q.pool || shuffle(words(textOf(id)).map((w, i) => ({ w, i })));
      q.built = q.built || [];
      return `<p><b>Tap the words in order.</b></p><div class="built lat">${q.built.map((t, k) => `<button class="tile" data-unbuild="${k}">${esc(t.w)}</button>`).join('') || '<span class="mute"><small>…</small></span>'}</div>
        <div class="tiles lat">${q.pool.map((t, k) => q.built.includes(t) ? '' : `<button class="tile" data-build="${k}">${esc(t.w)}</button>`).join('')}</div>
        <div class="row"><button data-act="clear">Clear</button><button class="pri" data-act="check" ${q.built.length === q.pool.length ? '' : 'disabled'}>Check</button></div>`;
    }
    case 'cloze1': case 'cloze2': {
      q.bl = q.bl || blanksFor(q.text || textOf(id), q.rate || (q.qt === 'cloze1' ? 0.3 : 0.6));
      return `<p><b>Fill the missing words.</b></p><div class="lat" style="font-size:1.08rem;line-height:2.2">${q.bl.W.map((w, i) => q.bl.pick.has(i) ? `<input class="blank" type="text" data-bi="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" size="${Math.max(3, norm(w).length + 1)}">` : esc(w)).join(' ')}</div>
        <button class="pri wide" data-act="check">Check</button>`;
    }
    case 'doself': return `<p><b>What do you do now?</b> <small class="mute">Do it in your head (or for real), then check.</small></p><button class="pri wide" data-act="doreveal">Show me</button>`;
    case 'explain': return `<p><b>In your own words: what do you do, step by step?</b> <small class="mute">Claude marks it — wording doesn't matter, the actions and their order do.</small></p>
        <textarea id="ta" placeholder="e.g. I rise, go up the Epistle side…">${esc(q.draft || '')}</textarea>
        <button class="pri wide" data-act="explaincheck">Check with Claude</button>${Mic.ok() ? '<button class="wide" data-act="mic">🎤 Say it instead</button>' : ''}<button class="wide" data-act="doreveal">Just show me the answer</button>`;
    case 'initials': case 'full': case 'next': {
      if (q.rehearse) {
        const f = fatherLatin(STEP[q.step]);
        return `${f && VIEW && VIEW.audio ? '<button class="ghost" data-act="replay">🔊 Father again</button>' : ''}
          <p><b>Your answer — out loud.</b></p>${Mic.ok() ? '<button class="pri wide" data-act="mic">🎤 Answer aloud — I\'ll listen</button>' : ''}
          <button class="${Mic.ok() ? '' : 'pri '}wide" data-act="reveal">🗣 I've said it — show me</button>
          <details style="margin-top:8px"><summary class="mute">Type it instead</summary><textarea id="ta" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea><button class="wide" data-act="check">Check</button></details>`;
      }
      const hint = q.qt === 'initials' ? `<p class="lat mute" style="letter-spacing:.04em">${esc(initialsOf(textOf(id)))}</p>` : '';
      return `<p><b>${q.qt === 'initials' ? 'Write it out — first letters given.' : q.qt === 'next' ? 'Write it out.' : 'Write it out in full.'}</b> <small class="mute">Spelling is forgiven; the words and their order matter.</small></p>${hint}
        <textarea id="ta" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the Latin…"></textarea>
        <button class="pri wide" data-act="check">Check</button>
        ${Mic.ok() ? '<button class="wide" data-act="mic">🎤 Say it — I\'ll listen and mark it</button>' : micTip()}
        <button class="wide" data-act="aloud">🗣 Say it aloud, mark it myself</button>`;
    }
    case 'order': {
      q.built = q.built || [];
      return `<p><b>${esc(q.title || 'Put these in the order they happen.')}</b></p><ol class="built" style="display:block;padding-left:28px">${q.built.map((k, j) => `<li><button class="tile" style="text-align:left;font-family:inherit" data-unorder="${j}">${esc(q.items[k].label)}</button></li>`).join('') || '<span class="mute"><small>Tap below, first to last…</small></span>'}</ol>
        <div>${q.shuf.map(k => q.built.includes(k) ? '' : `<button class="opt${q.lat ? ' lat' : ''}" data-order="${k}">${esc(q.items[k].label)}</button>`).join('')}</div>
        <div class="row"><button data-act="clear">Clear</button><button class="pri" data-act="check" ${q.built.length === q.items.length ? '' : 'disabled'}>Check</button></div>`;
    }
  }
  return '';
}
function stepLabel(st) {
  if (st.type === 'do') return '▸ ' + st.label;
  const t = textOf(st.id), c = st.cue.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const short = s => { const w = words(s); return w.length > 6 ? w.slice(0, 5).join(' ') + '…' : s; };
  return `“${short(c) || '…'}” → ${short(t)}`;
}
function orderQ(stepIds, title) {
  const items = stepIds.map(id => ({ id, label: stepLabel(STEP[id]) }));
  let shuf = shuffle(items.map((x, i) => i)); if (items.length > 2 && shuf.every((x, i) => x === i)) shuf = shuf.reverse();
  return { qt: 'order', items, shuf, title };
}

// ───────── Session runner
// policy: 'ladder' (learning stop), 'test' (checkpoint/run: first try scored), 'review' (warm-up)
function Session(o) {
  const ss = Object.assign({ queue: [], phases: [], cur: null, n: 0, ok: 0, first: 0, firstOk: 0, fb: null, startT: now(), log: [] }, o);
  ss.nextQ = function () {
    ss.fb = null; Mic.stop();
    while (!ss.queue.length && ss.phases.length) ss.queue = ss.phases.shift()();
    ss.cur = ss.queue.shift() || null;
    if (!ss.cur) return ss.finish();
    if (ss.cur.lad) ss.cur.qt = ss.cur.lad[ss.cur.pos];
    ss.cur.answered = false; ss.cur.picked = null; ss.cur.opts = null; ss.cur.bl = null; ss.cur.pool = null; ss.cur.built = null;
    if (ss.cur.qt === 'order') { const sh = shuffle(ss.cur.items.map((x, i) => i)); ss.cur.shuf = sh; }
    render(); window.scrollTo(0, 0);
    const ta = $('#ta') || $('input.blank'); if (ta && matchMedia('(pointer:fine)').matches) ta.focus();
    if (ss.cur.rehearse && ss.audio && ss.cur.qt !== 'doself') { const f = fatherLatin(STEP[ss.cur.step]); if (f) setTimeout(() => speak(f), 200); }
  };
  ss.render = function () {
    const q = ss.cur; if (!q) return '';
    const total = ss.total ? ss.total() : 0;
    const top = `<div class="topbar"><button class="ghost" data-act="exit">✕</button><div class="bar"><i style="width:${Math.min(100, ss.progress())}%"></i></div><small>${ss.n} ✓${ss.ok}</small></div>
      <p class="mute" style="margin:2px 0"><small>${esc(ss.title)}${q.tag ? ' · ' + esc(q.tag) : ''}</small></p>`;
    let fb = '';
    if (ss.fb) {
      const f = ss.fb, cls = f.v;
      const words_ = !!f.html && /w-miss|w-typo/.test(f.html);
      const head = f.v === 'ok' ? (f.typos ? '✓ Right (small slips — see the underlined words)' : '✓ Right') : f.v === 'close' ? (words_ ? '≈ Nearly — look at the red words' : '≈ Nearly') : '✗ Not quite';
      fb = `<div class="fb ${cls}"><b>${head}</b>${f.html ? `<div class="lat" style="margin-top:6px">${f.html}</div>` : ''}${f.extra || ''}</div><button class="pri wide" data-act="cont">Continue →</button>`;
    }
    return top + `<div class="card">${qHeader(q)}${ss.fb && !['map', 'mc', 'fatherMC'].includes(q.qt) ? '' : qBody(q)}${fb}</div>`;
  };
  ss.progress = function () { return ss.prog ? ss.prog() : 0; };
  ss.answer = function (v, html, extra, typos) {
    const q = ss.cur; q.answered = true;
    ss.n++; if (v === 'ok') ss.ok++;
    if (q.firstTry !== false) { ss.first++; if (v === 'ok') ss.firstOk++; }
    tick(); recordMiss(q, v);
    const id = q.id;
    let more = '';
    if (id && kindOf(id) === 'do') { const s = STEP[realId(id)]; more = `<p style="margin:6px 0 0">${v === 'ok' ? '' : `Answer: <b>${esc(s.a)}</b><br>`}<small class="mute">${esc(s.when)}</small></p>${s.pic && v !== 'ok' ? `<div class="pic">${PICS[s.pic]}</div>` : ''}${s.father ? `<p class="note">❓ Varies — ask Father: ${esc(s.father)}</p>` : ''}${aiBtns(id, v)}`; }
    else if (id && q.qt !== 'order') { const t = textOf(id); const st = STEP[realId(id)] || {}; more = `<p style="margin:6px 0 0">${v !== 'ok' && !html ? `<span class="ans">${esc(t)}</span> ` : ''}${spk(t)} <small class="mute">${esc(st.en || (WHOLE[realId(id)] ? '' : ''))}</small>${st.say && v !== 'ok' ? `<br><small class="mute">say: ${esc(st.say)}</small>` : ''}${st.hook && v !== 'ok' ? `<br><small>💡 ${esc(st.hook)}</small>` : ''}${myHook(id) && v !== 'ok' ? `<br><small>💡 <b>Your hook:</b> ${esc(myHook(id))}</small>` : ''}</p>${aiBtns(id, v)}`; }
    ss.fb = { v, html, extra: (extra || '') + more, typos };
    ss.onAnswer(q, v);
    save(); render();
  };
  ss.finish = function () {
    const pct = ss.first ? Math.round(100 * ss.firstOk / ss.first) : 100;
    if (ss.onFinish) ss.onFinish(pct);
    save();
  };
  return ss;
}
function insertAt(arr, i, ...x) { arr.splice(Math.min(arr.length, i), 0, ...x); }
function qFor(id, qt, step, extra) { return Object.assign({ id, qt, step: step || id }, extra || {}); }

function chainQs(stepIds, level) { // run through steps in order
  return stepIds.map((sid, k) => {
    const st = STEP[sid];
    let qt;
    if (st.type === 'do') qt = level === 'full' && st.zone && k % 2 ? 'map' : 'mc';
    else { const n = words(textOf(sid)).length; qt = level === 'guided' ? (n >= 4 ? 'initials' : 'full') : level === 'cloze' ? (n >= 4 ? 'cloze2' : 'full') : 'full'; if (level === 'guided' && n >= 4 && n < 7) qt = 'cloze2'; }
    return qFor(realId(sid), qt, sid, { tag: `step ${k + 1} of ${stepIds.length}`, chain: true });
  });
}
function windows(ids, size) { const out = []; for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size)); if (out.length > 1 && out[out.length - 1].length < 3) { const l = out.pop(); out[out.length - 1].push(...l); } return out; }

function startPractice(stop) {
  const sec = ALLSEC.find(s => s.id === stop.sec);
  const stepIds = stop.range.map(i => sec.steps[i].id);
  const ss = Session({ title: stop.title, stop });
  const mastered = []; // say steps finished in this stop, in Mass order
  let at = 0;
  const lineQ = sid => {
    const st = STEP[sid];
    if (st.type === 'do') return { id: sid, step: sid, lad: ['mc'], pos: 0 };
    if (st.alias) { const n = words(textOf(sid)).length; return { id: realId(sid), step: sid, lad: learned(sid) ? ['full'] : n >= 6 ? ['initials', 'full'] : ['mc', 'full'], pos: 0, alias: true }; }
    return { id: sid, step: sid, lad: ladderFor(sid), pos: 0 };
  };
  // one phase per step, strictly in order; a line is drilled back-to-back until it's solid
  stepIds.forEach((sid, k) => ss.phases.push(() => { at = k; const q = lineQ(sid); q.tag = `step ${k + 1} of ${stepIds.length}`; q.hint = q.lad && hintOn(q.lad, 0); return [q]; }));
  ss.phases.push(() => { at = stepIds.length; return stepIds.length >= 3 && !sec.noOrder ? windows(stepIds, 8).map((w, i, a) => Object.assign(orderQ(w, a.length > 1 ? `Put this stretch in order (part ${i + 1}).` : 'Put this stretch in order.'), { tag: 'sequence' })) : []; });
  ss.phases.push(() => chainQs(stepIds, 'full').map(q => Object.assign(q, { tag: 'run this stretch · ' + q.tag })));
  ss.prog = () => 100 * at / (stepIds.length + 2);
  const fromTop = () => mastered.length < 2 ? [] : mastered.map((sid, j) => qFor(realId(sid), 'full', sid, { top: true, tag: `from the top · ${j + 1} of ${mastered.length}` }));
  ss.onAnswer = (q, v) => {
    if (q.lad) {
      if (v === 'ok' || (v === 'close' && (q.closes = (q.closes || 0) + 1) >= 2)) { q.closes = 0; q.pos++; }
      else if (v === 'bad') q.pos = Math.max(q.lad[0] === 'intro' ? 1 : 0, q.pos - 1);
      if (q.pos < q.lad.length) { q.hint = hintOn(q.lad, q.pos); insertAt(ss.queue, 0, q); return; }
      // line finished
      if (!q.alias || !learned(q.id)) markLearned(q.id);
      const st = STEP[q.step];
      if (st.type === 'say') {
        if (!mastered.some(m => norm(textOf(m)) === norm(textOf(q.step)))) mastered.push(q.step);
        const extra = [];
        if (fatherLatin(st) && !q.alias) extra.push(fatherMCQ(q.step));
        if (!q.alias) extra.push(...fromTop());
        ss.queue.unshift(...extra);
      }
    } else if (q.top) {
      if (v !== 'ok' && !q.retried) insertAt(ss.queue, 0, Object.assign({}, q, { qt: words(textOf(q.id)).length >= 4 ? 'initials' : 'full', hint: true, retried: true, firstTry: false, tag: 'again, with a little help' }), Object.assign({}, q, { retried: true, firstTry: false, tag: 'once more, from memory' }));
    } else if (q.qt === 'order') { if (v !== 'ok' && !q.retried) insertAt(ss.queue, 0, Object.assign({}, q, { retried: true, built: [], firstTry: false })); }
    else if (q.chain) { if (v !== 'ok') { grade(q.id, 'close'); if (!q.retried) ss.queue.push(Object.assign({}, q, { retried: true, firstTry: false, tag: 'again' })); } }
  };
  ss.onFinish = pct => { S.stops[stop.id] = { done: true, at: now(), score: Math.max(pct, (S.stops[stop.id] || {}).score || 0) }; finishView(`Stop complete. ${ss.ok} right answers.`, stop, ss); };
  VIEW = ss; ss.nextQ();
}
function startCheck(stop) {
  const sec = ALLSEC.find(s => s.id === stop.sec);
  const stepIds = sec.steps.map(s => s.id), items = itemsOfSec(sec).filter(id => !isWhole(id)), wholes = (sec.wholes || []).map(w => w.id);
  const ss = Session({ title: stop.title, stop });
  const orders = sec.noOrder ? [] : windows(stepIds, 7).map((w, i, a) => Object.assign(orderQ(w, a.length > 1 ? `Order part ${i + 1} of ${a.length} of this section.` : 'Put the whole section in order.'), { tag: 'sequence' }));
  // Latin in Mass order (with where-you-are shown); movements asked once each, map where there is one
  const recall = items.map((id, k) => qFor(id, kindOf(id) === 'do' ? (AIon() && k % 2 ? 'explain' : STEP[id].zone ? 'map' : 'mc') : 'full'));
  const mine = sayStepsOf(sec).filter(st => !st.alias && prevMine(st.id));
  const nexts = shuffle(mine).slice(0, 3).map(st => nextQ(st.id, false));
  const fathers = shuffle(sec.steps.filter(st => fatherLatin(st) && words(fatherLatin(st)).length >= 3)).slice(0, 2).map(st => fatherClozeQ(st.id));
  const wh = wholes.map(id => qFor(id, learned(id) ? 'full' : 'initials'));
  ss.queue = orders.concat(sec.noOrder ? [] : myOrderQ(sec), recall, nexts, fathers, wh);
  const total = ss.queue.length; ss.prog = () => 100 * ss.n / (total + 0.0001);
  ss.onAnswer = (q, v) => {
    if (q.qt === 'order') { if (v !== 'ok' && !q.retried) ss.queue.push(Object.assign({}, q, { retried: true, built: [], firstTry: false })); return; }
    if (!q.id || q.qt === 'next') { if (v !== 'ok' && !q.retried && q.qt === 'next') ss.queue.push(Object.assign({}, q, { retried: true, firstTry: false, hint: true })); return; }
    if (q.firstTry !== false) { if (isWhole(q.id) && v === 'ok') markLearned(q.id); else grade(q.id, v); }
    if (v !== 'ok' && !q.retried) {
      const easier = kindOf(q.id) === 'do' ? (q.qt === 'explain' ? 'mc' : 'mc') : isWhole(q.id) ? 'initials' : (words(textOf(q.id)).length >= 4 ? 'cloze2' : 'full');
      insertAt(ss.queue, 2, Object.assign({}, q, { qt: easier, retried: true, firstTry: false, tag: 'again, easier' }));
      ss.queue.push(Object.assign({}, q, { retried: true, firstTry: false, tag: 'once more' }));
    }
    if (isWhole(q.id) && q.retried && v === 'ok') markLearned(q.id);
  };
  ss.onFinish = pct => {
    const pass = pct >= 75; const prev = S.stops[stop.id] || {};
    S.stops[stop.id] = { done: prev.done || pass, at: now(), score: Math.max(pct, prev.score || 0) };
    finishView(pass ? `Checkpoint passed: ${pct}% right first time.` : `${pct}% right first time — you need 75% to pass. The ones you missed were re-taught; try the checkpoint again (or redo a practice stop first).`, stop, ss);
  };
  VIEW = ss; ss.nextQ();
}
function startRun(stop) {
  const i0 = CORE.findIndex(s => s.id === stop.from), i1 = CORE.findIndex(s => s.id === stop.to);
  const stepIds = [].concat(...CORE.slice(i0, i1 + 1).map(s => s.steps.map(x => x.id)));
  const ss = Session({ title: stop.title, stop });
  ss.queue = chainQs(stepIds, stop.level);
  const total = ss.queue.length; ss.prog = () => 100 * ss.n / total;
  ss.onAnswer = (q, v) => { if (q.firstTry !== false) grade(q.id, v); if (v !== 'ok' && !q.retried) ss.queue.push(Object.assign({}, q, { retried: true, firstTry: false, tag: 'again (missed earlier)' })); };
  ss.onFinish = pct => { const pass = pct >= 80, prev = S.stops[stop.id] || {}; S.stops[stop.id] = { done: prev.done || pass, at: now(), score: Math.max(pct, prev.score || 0) }; finishView(pass ? `Run-through passed: ${pct}% first time.` : `${pct}% first time (80% passes). The misses are now marked for revision — have another go after a short revision.`, stop, ss); };
  VIEW = ss; ss.nextQ();
}
function startReview(ids, title, then) {
  const t = now(), urg = id => { const r = rec(id); return (t - r.due) / INT[r.st - 1]; };
  const byUrg = ids.slice().sort((a, b) => urg(b) - urg(a));
  const lat = byUrg.filter(id => kindOf(id) !== 'do'), act = byUrg.filter(id => kindOf(id) === 'do');
  const nA = Math.min(act.length, lat.length >= 9 ? 3 : 12 - lat.length); // movements ≤ a quarter when Latin is due
  const pick = act.slice(0, nA).concat(lat.slice(0, 12 - nA));
  const ord = id => ORDER[id] != null ? ORDER[id] : ORDER[WHOLE[id] ? WHOLE[id].of[0] : id] || 0;
  pick.sort((a, b) => ord(a) - ord(b)); // in Mass order, so recall follows the flow
  const ss = Session({ title });
  ss.queue = [];
  pick.forEach(id => {
    ss.queue.push(qFor(id, reviewType(id), null, { tag: 'revision' }));
    const st = STEP[id];
    if (st && st.type === 'say' && Math.random() < 0.3) ss.queue.push(Math.random() < 0.5 && prevMine(id) ? nextQ(id, false, 'what comes next') : fatherLatin(st) ? fatherMCQ(id) : null);
  });
  ss.queue = ss.queue.filter(Boolean);
  const total = ss.queue.length; ss.prog = () => 100 * Math.min(ss.n, total) / total;
  ss.onAnswer = (q, v) => {
    if (!q.id || q.qt === 'next') return;
    if (q.firstTry !== false) grade(q.id, v);
    if (v !== 'ok' && !q.retried) {
      if (kindOf(q.id) !== 'do' && words(textOf(q.id)).length >= 4) insertAt(ss.queue, 0, Object.assign({}, q, { qt: 'cloze2', hint: true, retried: true, firstTry: false, tag: 're-learn' }));
      insertAt(ss.queue, kindOf(q.id) !== 'do' ? 1 : 2, Object.assign({}, q, { retried: true, firstTry: false, tag: 're-learn' }));
    }
  };
  ss.onFinish = pct => finishView(`Revision done: ${pct}% remembered first time.`, null, ss, then);
  VIEW = ss; ss.nextQ();
}
function finishView(msg, stop, ss, then) {
  save();
  const path = stop && STOP[stop.id] && XPATH.includes(stop) ? XPATH : PATH;
  const nx = then === undefined ? nextStop(path) : null;
  const d = due(path === XPATH ? EXTRA_ITEMS : CORE_ITEMS);
  VIEW = {
    render() {
      return `<h1>${stop ? esc(stop.title) : esc((ss && ss.title) || 'Revision')}</h1><div class="card"><p>${esc(msg)}</p>${ss ? `<p class="mute">${ss.n} answers, ${ss.ok} right.</p>` : ''}${ss && ss.summaryHTML ? ss.summaryHTML : ''}
        <p class="mute"><small>Memory now ${memPct(CORE_ITEMS)}%. Things you learned come back for revision in about 10 minutes, then 1 h, 5 h, a day, 2 days…</small></p></div>
        ${then ? `<button class="pri wide" data-act="then">Continue: ${esc(then.title)}</button>` : nx ? `<button class="pri wide" data-act="next">${d.length >= 6 ? `Revise ${Math.min(12, d.length)} first, then: ` : 'Next: '}${esc(nx.title)}</button>` : ''}
        ${d.length ? `<button class="wide" data-act="more">Revise more (${d.length} due)</button>` : ''}
        <button class="wide" data-act="home">Back to home</button>`;
    },
    act(a) {
      if (a === 'home') return go('home');
      if (a === 'then') return openStop(then);
      if (a === 'more') return startReview(d, 'Revision', then || null);
      if (a === 'next') { if (d.length >= 6) return startReview(d, 'Revision', nx); return openStop(nx); }
    },
  };
  render(); window.scrollTo(0, 0);
}
function openStop(stop) {
  if (stop.kind === 'learn') return startLearn(stop);
  if (stop.kind === 'practice') return startPractice(stop);
  if (stop.kind === 'check') return startCheck(stop);
  if (stop.kind === 'run') return startRun(stop);
}

// ───────── v3: mistakes, weak spots, speaking, rehearsal, Claude glue
function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 4500); }
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const AIon = () => !!(window.AI && AI.on && AI.on.sample);
const ordOf = id => ORDER[id] != null ? ORDER[id] : WHOLE[id] ? ORDER[WHOLE[id].of[0]] : 0;
function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
function importCode(text) {
  try { const o = JSON.parse(decodeURIComponent(escape(atob(String(text).trim())))); if (!o.items) throw 0; replaceState(o); go('home'); toast('Progress loaded.'); }
  catch (err) { toast('That code didn\'t work — copy the whole code and try again.'); }
}
function replaceState(o) { S = o; S.settings = Object.assign(blank().settings, S.settings || {}); S.v = Math.max(S.v || 1, 2); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } if (!VIEW || !VIEW.cur) render(); }

// what went wrong, per line: the last few wrong attempts (typed or heard)
function recordMiss(q, v) {
  if (!q.id || v === 'ok' || q.qt === 'intro' || q.qt === 'order') return;
  const r = rec(q.id);
  r.miss = (r.miss || []).concat([{ t: now(), g: String(q.given || '').slice(0, 300), qt: q.qt }]).slice(-6);
}
function trouble(id) {
  const r = S.items[id]; if (!r || !r.miss) return 0;
  const since = Math.max(r.cleared || 0, now() - 4 * DAY);
  return r.miss.filter(m => m.t > since).length;
}
function weakList() { return CORE_ITEMS.filter(id => trouble(id) >= 1).sort((a, b) => trouble(b) - trouble(a) || ordOf(a) - ordOf(b)); }
function weakLabel(id) { return kindOf(id) === 'do' ? '▸ ' + STEP[id].label : isWhole(id) ? WHOLE[id].title : textOf(id); }
const myHook = id => (S.items[realId(id)] || {}).myHook || '';

function startDrill(ids, title) {
  ids = [...new Set(ids)].slice(0, 8).sort((a, b) => ordOf(a) - ordOf(b));
  if (!ids.length) return;
  const ss = Session({ title });
  ss.queue = ids.map(id => {
    const k = kindOf(id), n = k === 'do' ? 0 : words(textOf(id)).length;
    const lad = k === 'do' ? (STEP[id].zone ? ['mc', 'map'] : ['mc']) : k === 'whole' ? ['initials', 'full'] : n <= 2 ? ['full', 'full'] : n <= 4 ? ['cloze2', 'full', 'full'] : ['cloze2', 'initials', 'full', 'full'];
    return { id, step: k === 'whole' ? id : id, lad, pos: 0, hint: hintOn(lad, 0), tag: 'drill' };
  });
  const total = ss.queue.reduce((a, q) => a + q.lad.length, 0); ss.prog = () => 100 * Math.min(ss.ok, total) / total;
  // like a practice stop: each line back-to-back until it's solid, then the next
  ss.onAnswer = (q, v) => {
    if (v === 'ok' || (v === 'close' && (q.closes = (q.closes || 0) + 1) >= 2)) { q.closes = 0; q.pos++; }
    else if (v === 'bad') { q.pos = Math.max(0, q.pos - 1); q.hadBad = true; }
    if (q.pos < q.lad.length) { q.hint = hintOn(q.lad, q.pos); insertAt(ss.queue, 0, q); return; }
    const r = rec(q.id); if (!r.learned) markLearned(q.id); else grade(q.id, q.hadBad ? 'close' : 'ok'); r.cleared = now();
  };
  ss.onFinish = () => finishView(`Drill done — ${ids.length} line${ids.length > 1 ? 's' : ''} worked until solid.`, null, ss);
  VIEW = ss; ss.nextQ();
}

// ── speaking: the phone's speech recogniser (online), or Claude's dictation on the Mac
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const Mic = {
  cur: null, blocked: false, cancelled: false,
  ok() { return !this.blocked && (!!(window.AI && AI.dict) || (!!SR && !IN_CLAUDE && navigator.onLine !== false)); },
  stop() { const c = this.cur; if (c) try { c.stop(); } catch (e) { } },
  cancel() { this.cancelled = true; this.stop(); this.cur = null; },
  start(onText, onDone, onErr) {
    this.cancelled = false;
    const finish = t => { this.cur = null; if (!this.cancelled) onDone(t); };
    if (window.AI && AI.dict) {
      const d = AI.dict; let fin = '', started = false; const offs = [];
      offs.push(d.onPartial(({ text }) => onText((fin + ' ' + text).trim())));
      offs.push(d.onFinal(({ text }) => { fin = (fin + ' ' + text).trim(); onText(fin); }));
      offs.push(d.onState(({ state, reason }) => { if (state !== 'idle') { started = true; return; } if (!started) return; offs.forEach(f => f()); if (reason && !/stopped|completed|viewer_stopped/.test(reason) && !fin) onErr(reason); else finish(fin); }));
      d.start({ language: 'it' }).catch(e => { offs.forEach(f => f()); if (e && e.code === 'not_granted') this.blocked = true; if (!(e && e.code === 'stopped')) onErr(e && e.code || 'error'); });
      this.cur = { stop: () => d.stop().catch(() => { }) };
      return;
    }
    const r = new SR(); let last = '', err = null;
    r.lang = 'it-IT'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => { let fin = '', mid = ''; for (const res of e.results) { if (res.isFinal) fin += res[0].transcript + ' '; else mid += res[0].transcript; } last = (fin + mid).trim(); onText(last); };
    r.onerror = e => { err = e.error; if (err === 'not-allowed' || err === 'service-not-allowed') this.blocked = true; };
    r.onend = () => { if (err && !last) { this.cur = null; if (!this.cancelled) onErr(err); } else finish(last); };
    try { r.start(); this.cur = r; } catch (e) { onErr('start'); }
  },
};
function micTip() { return /iPhone|iPad/.test(navigator.userAgent) || IN_CLAUDE ? '<p class="mute"><small>Tip: tap 🎤 on your keyboard to dictate into the box — answers that sound right count, even if the spelling is off.</small></p>' : ''; }
const MIC_ERR = { 'not-allowed': 'Microphone permission was refused. You can allow it in Settings → Safari → Microphone, or keep typing.', 'service-not-allowed': 'Speech recognition isn\'t allowed here (on iPhone: Settings → General → Keyboard → Enable Dictation).', network: 'Speech recognition needs internet. Type or mark it yourself instead.', 'no-speech': 'I didn\'t hear anything — try again a bit closer.', 'audio-capture': 'No microphone found.', not_granted: 'Dictation wasn\'t allowed for this page.', unavailable: 'Dictation isn\'t available here.' };
function listenFor(ss, q) {
  const card = $('.card');
  card.innerHTML = qHeader(q) + `<div class="listen"><p>🎙️ <b>Listening…</b> say it all, then tap Done.</p><div id="heard" class="lat mute">…</div>
    <button class="pri wide" data-act="micdone">Done</button><button class="wide" data-act="miccancel">Cancel</button></div>`;
  Mic.start(t => { const h = $('#heard'); if (h) h.textContent = t || '…'; },
    heard => { if (q.qt === 'explain') { q.draft = ((q.draft || '') + ' ' + heard).trim(); return render(); } spokenResult(ss, q, heard); },
    err => { render(); const c = $('.card'); if (c) c.insertAdjacentHTML('afterbegin', `<p class="note">${esc(MIC_ERR[err] || 'The microphone didn\'t work this time (' + err + '). Type it, or mark it yourself.')}</p>`); });
}
function spokenResult(ss, q, heard) {
  if (!heard) { render(); $('.card').insertAdjacentHTML('afterbegin', `<p class="note">${esc(MIC_ERR['no-speech'])}</p>`); return; }
  q.given = heard;
  const exp = textOf(q.id), m = mark(exp, heard, true);
  const heardHTML = `<p class="mute" style="margin:6px 0 0"><small>Heard: “${esc(heard)}”</small></p>`;
  q.spokenHTML = m.html;
  if (m.v === 'ok') return ss.answer('ok', m.html, heardHTML);
  if (AIon() && m.ratio >= 0.35) {
    $('.card').innerHTML = qHeader(q) + `<p>🎙️ Heard: <span class="lat">“${esc(heard)}”</span></p><p class="mute">✨ Checking with Claude…</p>`;
    const st = STEP[realId(q.id)] || {};
    return AI.judge(exp, heard, st.en || '').then(r => {
      if (VIEW !== ss || ss.cur !== q || ss.fb) return;
      if (r && r.verdict === 'ok') return ss.answer('ok', m.html, heardHTML + (r.note ? `<p><small>✨ ${esc(r.note)}</small></p>` : ''));
      selfMarkSpoken(q, m, heard, r);
    }, () => { if (VIEW === ss && ss.cur === q && !ss.fb) selfMarkSpoken(q, m, heard, null); });
  }
  selfMarkSpoken(q, m, heard, null);
}
function selfMarkSpoken(q, m, heard, r) {
  const sug = r && r.verdict ? r.verdict : m.v;
  const btn = (v, l) => `<button data-self="${v}"${sug === v ? ' class="pri"' : ''}>${l}</button>`;
  $('.card').innerHTML = qHeader(q) + `<p style="margin:6px 0 2px">🎙️ The mic heard:</p><p class="lat" style="margin:0">“${esc(heard)}”</p>
    <p style="margin:8px 0 2px">The line <small class="mute">(red = not heard)</small>:</p><div class="lat">${m.html} ${spk(textOf(q.id))}</div>
    ${r && r.note ? `<p><small>✨ Claude: ${esc(r.note)}${r.missing && r.missing.length ? ' Missing: ' + esc(r.missing.join(', ')) : ''}</small></p>` : ''}
    <p class="mute">Microphones often mishear Latin. How did you <b>actually</b> do?</p><div class="row">${btn('ok', '✓ I said it right')}${btn('close', '≈ Nearly')}${btn('bad', '✗ Missed it')}</div>`;
}

// ── Claude-marked "what do I do?"
function gradeExplain(ss, q, text) {
  $('.card').innerHTML = qHeader(q) + `<p class="lat">${esc(text)}</p><p class="mute">✨ Claude is reading your answer…</p>`;
  AI.gradeExplain(q.id, text, ctxFor(q.id)).then(r => {
    if (VIEW !== ss || ss.cur !== q || ss.fb) return;
    const v = ['ok', 'close', 'bad'].includes(r && r.verdict) ? r.verdict : 'close';
    ss.answer(v, '', `<p style="margin:6px 0 0">✨ ${esc(r.feedback || '')}</p>${r.missed && r.missed.length ? `<p style="margin:4px 0"><small>Missed: ${esc(r.missed.join('; '))}</small></p>` : ''}`);
  }, () => { if (VIEW === ss && ss.cur === q && !ss.fb) { render(); $('.card').insertAdjacentHTML('afterbegin', '<p class="note">Claude couldn\'t mark that just now — tap "Just show me the answer" and mark it yourself.</p>'); } });
}

// ── context handed to Claude for "Ask Claude" and marking
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
function ctxFor(key) {
  key = String(key || '');
  if (key.startsWith('card:')) { const [, sid, i] = key.split(':'); const sec = ALLSEC.find(x => x.id === sid), c = sec.explain[+i]; return `Section: ${sec.title}\nExplanation card "${c.title}": ${strip(c.body)}${c.father ? '\nVaries by priest: ' + c.father : ''}`; }
  if (isWhole(key)) return `The server's prayer "${WHOLE[key].title}": ${textOf(key)}`;
  const st = STEP[key]; if (!st) return '';
  const sec = SEC_OF[key], i = sec.steps.indexOf(st), around = sec.steps.slice(Math.max(0, i - 2), i + 3).map(x => x.type === 'do' ? `- (action) ${x.label}: ${x.a}` : `- Father: ${x.cue} → Server: ${textOf(x.id)}`).join('\n');
  const me = st.type === 'do' ? `Movement: when "${st.when}" — the server: ${st.a}.` : `Father says: ${st.cue} (${st.cueEn || ''})\nThe server answers: ${textOf(key)} (${st.en || ''})${st.gloss ? '\nWord by word: ' + st.gloss : ''}`;
  const r = S.items[realId(key)] || {}, wrong = (r.miss || []).filter(m => m.g).slice(-3).map(m => `"${m.g}"`).join(', ');
  return `Section: ${sec.title}\n${me}${st.father ? '\nVaries by priest: ' + st.father : ''}\nAround this point:\n${around}${wrong ? '\nThe learner\'s recent wrong attempts: ' + wrong : ''}`;
}
function makeHook(b, id) {
  if (!AIon()) return;
  b.disabled = true; b.textContent = '✨ Writing a memory hook…';
  const st = STEP[realId(id)] || {}, r = rec(id);
  AI.hook({ latin: textOf(id), english: st.en || '', say: st.say || '', cue: st.cue || '', wrong: (r.miss || []).filter(m => m.g).slice(-3).map(m => m.g) })
    .then(h => { r.myHook = h; save(); b.outerHTML = `<p style="margin:6px 0"><small>💡 <b>Your hook:</b> ${esc(h)}</small></p>`; },
      () => { b.disabled = false; b.textContent = '✨ Couldn\'t write one just now — try again'; });
}
function aiBtns(id, v) {
  if (!AIon() || !id) return '';
  const hook = v !== 'ok' && kindOf(id) !== 'do' && !myHook(id) ? `<button class="ghost" data-act="hook" data-id="${esc(realId(id))}">✨ Memory hook</button>` : '';
  return `<div class="row" style="margin-top:6px"><button class="ghost" data-act="ask" data-ctx="${esc(realId(id))}">💬 Ask Claude</button>${hook}</div>`;
}

// ── serve-along rehearsal: the Mass in order, Father's lines spoken, you answer aloud
const REH = [['entr', 'end', 'The whole Low Mass'], ['entr', 'offer', 'First half: entrance → Offertory'], ['pref', 'end', 'Second half: Preface → leaving']];
function startRehearsePicker() {
  VIEW = {
    render() {
      const audio = S.settings.rehAudio !== false;
      const opt = (a, b, l) => `<button class="opt" data-act="reh:${a}:${b}">${esc(l)}</button>`;
      return `<div class="topbar"><button class="ghost" data-act="exit">✕</button></div><h1>Rehearse (serve-along)</h1>
        <div class="card"><p>The Mass in order, like the real thing: ${audio ? 'Father\'s lines are <b>spoken</b>' : 'Father\'s lines appear on screen'}; you answer <b>out loud</b>${Mic.ok() ? ' (the mic marks it)' : ' and mark yourself'}; for each movement, picture it, then check. Misses go into your revision and weak spots.</p>
        <button class="wide" data-act="rehaudio">${audio ? '🔊 Audio on (tap for silent — e.g. on the plane)' : '🔇 Silent (tap for audio)'}</button></div>
        <div class="card">${REH.map(r => opt(...r)).join('')}<h3>One section</h3>${CORE.filter(x => x.id !== 'orient').map(x => opt(x.id, x.id, x.title)).join('')}</div>`;
    },
    act(a) {
      if (a === 'rehaudio') { S.settings.rehAudio = S.settings.rehAudio === false; save(); render(); return; }
      if (a.startsWith('reh:')) { const [, f, t] = a.split(':'); startRehearse(f, t); }
    },
  };
  render(); window.scrollTo(0, 0);
}
function startRehearse(from, to) {
  const i0 = CORE.findIndex(s => s.id === from), i1 = CORE.findIndex(s => s.id === to);
  const stepIds = [].concat(...CORE.slice(i0, i1 + 1).map(s => s.steps.map(x => x.id)));
  const title = (REH.find(r => r[0] === from && r[1] === to) || [0, 0, CORE[i0].title])[2];
  const ss = Session({ title: 'Rehearsal: ' + title, audio: S.settings.rehAudio !== false, rehearse: true });
  ss.queue = stepIds.map((sid, k) => STEP[sid].type === 'do' ? { id: sid, step: sid, qt: 'doself', rehearse: true, tag: `${k + 1} of ${stepIds.length}` } : { id: realId(sid), step: sid, qt: 'full', rehearse: true, tag: `${k + 1} of ${stepIds.length}` });
  const total = ss.queue.length, misses = []; ss.prog = () => 100 * ss.n / total;
  ss.onAnswer = (q, v) => { grade(q.id, v); if (v !== 'ok') misses.push(q.step); };
  ss.onFinish = pct => {
    const mins = Math.max(1, Math.round((now() - ss.startT) / MIN));
    ss.summaryHTML = `<p>Took about <b>${mins} min</b>.</p>` + (misses.length ? `<p><b>To work on (${misses.length}):</b></p><ol style="padding-left:20px">${misses.map(id => `<li>${esc(stepLabel(STEP[id]))}</li>`).join('')}</ol><button class="wide" data-act="drillmiss">🎯 Drill these now</button>` : '<p>🎉 Nothing missed.</p>');
    ss.missIds = [...new Set(misses.map(realId))];
    finishView(`Rehearsal finished: ${pct}% right first time.`, null, ss);
    const fv = VIEW, act = fv.act; fv.act = a => a === 'drillmiss' ? startDrill(ss.missIds, 'Drill: what you missed in the rehearsal') : act(a);
  };
  VIEW = ss; ss.nextQ();
}

// ───────── events
document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-zone], [data-reveal]'); if (!b) return;
  const d = b.dataset;
  if (d.say !== undefined) { speak(d.say); return; }
  if (d.tab) return go(d.tab);
  if (d.reveal !== undefined && b.classList.contains('cover')) { b.classList.remove('cover'); return; }
  if (d.theme !== undefined && b.tagName === 'BUTTON') { S.settings.theme = d.theme; if (d.theme) document.documentElement.dataset.theme = d.theme; else delete document.documentElement.dataset.theme; save(); return; }
  if (d.shift !== undefined) { S.settings.offset = +d.shift ? (S.settings.offset || 0) + +d.shift : 0; save(); render(); return; }
  if (d.stop) { const st = STOP[d.stop]; return openStop(st); }
  if (d.zone && !VIEW && TAB === 'map') { MAPSEL = d.zone; render(); return; }
  if (d.act === 'ask') { if (window.AI && AI.ask) AI.ask(ctxFor(d.ctx)); return; }
  if (d.act === 'hook') { makeHook(b, d.id); return; }
  if (d.act === 'dismissStorage') { S.storageNoteSeen = true; save(); render(); return; }
  const V = VIEW;
  if (d.act === 'exit') { Mic.cancel(); go(TAB); return; }
  if (V && V.act && d.act) return V.act(d.act);
  if (V && V.cur) return sessionClick(V, b, d);
  switch (d.act) {
    case 'continue': { const dd = due(CORE_ITEMS), nx = nextStop(PATH); if (dd.length) return startReview(dd, 'Warm-up: what\'s fading', nx || null); if (nx) return openStop(nx); return; }
    case 'review': return startReview(due(CORE_ITEMS), 'Revision', null);
    case 'xreview': return startReview(due(EXTRA_ITEMS), 'Revision — extras', null);
    case 'cover': COVER = !COVER; render(); return;
    case 'dismissNew': S.whatsNew = false; save(); render(); return;
    case 'export': $('#io').value = exportCode(); $('#io').select(); return;
    case 'import': return importCode($('#io').value);
    case 'copyprog': { const c = exportCode(); (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => toast('Progress copied. In the other app: More → Paste.'), () => { $('#io').value = c; $('#io').select(); toast('Couldn\'t copy automatically — the code is in the box below; copy it from there.'); }); return; }
    case 'pasteprog': (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject()).then(importCode, () => { $('#io').focus(); toast('Paste the code into the box below, then tap "Load pasted code".'); }); return;
    case 'rehearse': return startRehearsePicker();
    case 'drill': return startDrill(weakList(), 'Drill: your weakest lines');
    case 'reset': if (b.dataset.armed) { S = blank(); save(); go('home'); toast('Progress erased.'); } else { b.dataset.armed = '1'; b.textContent = 'Tap again to erase everything'; } return;
  }
});
function sessionClick(ss, b, d) {
  const q = ss.cur;
  if (d.act === 'cont') return ss.nextQ();
  if (ss.fb) return;
  if (d.act === 'mic') return listenFor(ss, q);
  if (d.act === 'micdone') { Mic.stop(); return; }
  if (d.act === 'miccancel') { Mic.cancel(); render(); return; }
  if (d.act === 'replay') { const f = fatherLatin(STEP[q.step]); if (f) speak(f); return; }
  if (d.act === 'doreveal') { const st = STEP[realId(q.id)]; $('.card').innerHTML = qHeader(q) + `<p class="ans" style="font-weight:600">${esc(st.a)}</p>${st.pic ? `<div class="pic">${PICS[st.pic]}</div>` : ''}${st.father ? `<p class="note">❓ Varies — ask Father: ${esc(st.father)}</p>` : ''}<p class="mute">Did you know it?</p><div class="row"><button data-self="ok">✓ Yes</button><button data-self="close">≈ Roughly</button><button data-self="bad">✗ No</button></div>`; return; }
  if (d.act === 'explaincheck') { const g = $('#ta').value.trim(); if (!g) return; q.given = g; q.draft = g; return gradeExplain(ss, q, g); }
  if (d.act === 'introok' && q.qt === 'intro') { tick(); ss.onAnswer(q, 'ok'); save(); return ss.nextQ(); }
  if (d.opt !== undefined && q.qt === 'fatherMC') {
    const ok = norm(q.fopts[+d.opt]) === norm(q.right); q.picked = +d.opt;
    const en = STEP[q.step].cueEn;
    return ss.answer(ok ? 'ok' : 'bad', ok ? '' : `<span class="ans">${esc(q.right)}</span>`, `${spk(q.right)} <small class="mute">${esc(en || '')}</small>`);
  }
  if (d.opt !== undefined && q.qt === 'mc') {
    const pickedTxt = q.opts[+d.opt];
    const right = kindOf(q.id) === 'do' ? STEP[realId(q.id)].a : textOf(q.id);
    const ok = norm(pickedTxt) === norm(right); q.picked = +d.opt;
    return ss.answer(ok ? 'ok' : 'bad', kindOf(q.id) === 'do' ? '' : `<span class="ans">${esc(right)}</span>`);
  }
  if (d.zone && q.qt === 'map') { const z = STEP[realId(q.id)].zone; q.pickedZone = d.zone; return ss.answer(d.zone === z ? 'ok' : 'bad', '', `<p>${d.zone === z ? '' : 'You tapped: ' + esc(M.Z[d.zone]) + '<br>'}Correct place: <b>${esc(M.Z[z])}</b></p>`); }
  if (q.qt === 'tiles') {
    if (d.build !== undefined) { q.built.push(q.pool[+d.build]); render(); return; }
    if (d.unbuild !== undefined) { q.built.splice(+d.unbuild, 1); render(); return; }
    if (d.act === 'clear') { q.built = []; render(); return; }
    if (d.act === 'check') { const giv = q.built.map(t => t.w).join(' '); const m = mark(textOf(q.id), giv); const ok = norm(giv) === norm(textOf(q.id)); return ss.answer(ok ? 'ok' : 'bad', ok ? '' : `Correct order: <span class="ans">${esc(textOf(q.id))}</span>`); }
  }
  if (q.qt === 'order') {
    if (d.order !== undefined) { q.built.push(+d.order); render(); return; }
    if (d.unorder !== undefined) { q.built.splice(+d.unorder, 1); render(); return; }
    if (d.act === 'clear') { q.built = []; render(); return; }
    if (d.act === 'check') {
      const good = i => q.items[q.built[i]].label === q.items[i].label; // identical labels are interchangeable
      const ok = q.built.every((k, i) => good(i));
      const html = '<ol style="margin:4px 0;padding-left:22px">' + q.items.map((it, i) => `<li class="${good(i) ? 'w-ok' : ''}">${esc(it.label)}${good(i) ? '' : ' <small>←</small>'}</li>`).join('') + '</ol>';
      return ss.answer(ok ? 'ok' : 'bad', ok ? '' : 'The right order:' + html);
    }
  }
  if (q.qt === 'cloze1' || q.qt === 'cloze2') {
    if (d.act === 'check') {
      let wrong = 0; const n = q.bl.pick.size;
      const vals = {}; document.querySelectorAll('input.blank').forEach(inp => vals[inp.dataset.bi] = inp.value);
      const html = q.bl.W.map((w, i) => { if (!q.bl.pick.has(i)) return esc(w); const g = norm(vals[i] || ''), e = norm(w), m = wmatch(e, g); if (!m) wrong++; return `<span class="w-${m === 2 ? 'ok' : m ? 'typo' : 'miss'}">${esc(w)}</span>${m ? '' : ` <small class="mute">(you: ${esc(vals[i] || '—')})</small>`}`; }).join(' ');
      const v = !wrong ? 'ok' : (n >= 3 && wrong === 1) ? 'close' : 'bad';
      return ss.answer(v, html);
    }
  }
  if (q.qt === 'initials' || q.qt === 'full' || q.qt === 'next') {
    if (d.act === 'check') { const g = $('#ta').value; if (!g.trim()) return; q.given = g; const m = mark(textOf(q.id), g); if (m.v !== 'ok') { const p = mark(textOf(q.id), g, true); if (p.v === 'ok') return ss.answer('ok', p.html, '<p class="mute" style="margin:4px 0"><small>Sounds right — spelling forgiven.</small></p>', 1); } return ss.answer(m.v, m.html, '', m.typos); }
    if (d.act === 'aloud') {
      ss.fb = { v: 'self', html: '' };
      $('.card').innerHTML = qHeader(q) + `<p class="mute">Say it aloud now — all of it — <b>then</b> reveal.</p><button class="pri wide" data-act="reveal">Reveal</button>`;
      ss.fb = null; ss.selfMode = true; return;
    }
  }
  if (d.act === 'reveal') {
    const t = textOf(q.id);
    $('.card').innerHTML = qHeader(q) + `<div class="ans" style="margin:8px 0">${esc(t)} ${spk(t)}</div><p class="mute">How did you do — honestly?</p><div class="row"><button data-self="ok">✓ Got it all</button><button data-self="close">≈ Nearly</button><button data-self="bad">✗ Missed it</button></div>`;
    return;
  }
  if (d.self) { ss.selfMode = false; return ss.answer(d.self, kindOf(q.id) === 'do' ? '' : (q.spokenHTML || `<span class="ans">${esc(textOf(q.id))}</span>`)); }
}
document.addEventListener('keydown', e => {
  if (!VIEW || !VIEW.cur) return;
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.tagName === 'INPUT')) { e.preventDefault(); const b = VIEW.fb ? $('[data-act="cont"]') : $('[data-act="check"]'); if (b && !b.disabled) b.click(); }
  else if (e.key === 'Enter' && VIEW.fb && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); const b = $('[data-act="cont"]'); b && b.click(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && VIEW && VIEW.fb && e.target.tagName === 'TEXTAREA') { e.preventDefault(); $('[data-act="cont"]').click(); } });

// ───────── offline
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !IN_CLAUDE) {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => caches.has('servemass-v3').then(h => { SW_READY = h; if (TAB === 'home' && !VIEW) render(); }));
}
window.__SM = { spoken: heard => VIEW && VIEW.cur && spokenResult(VIEW, VIEW.cur, heard), replaceState, rerender: () => { if (!VIEW || !VIEW.cur) render(); }, view: () => VIEW, realId, kindOf, S: () => S, PATH, mark, CORE_ITEMS, grade, STEP, textOf };
render();
})();
