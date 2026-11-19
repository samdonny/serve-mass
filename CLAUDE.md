# Serve the Low Mass — offline learning app

Sam's app for learning to serve a Traditional Latin Low Mass (1962 Missal, one server, FSSP priest).
Live (offline PWA): https://samdonny.github.io/serve-mass/ — repo samdonny/serve-mass (public, GitHub Pages from `main`).

- No build step. `content.js` holds all teaching content; `app.js` the engine; `sw.js` the offline cache.
- **Bump `VERSION` in `sw.js` on every change you push**, or installed phones keep the old cached copy.
- Learning model (v2, after Sam's plane feedback 20 Nov 2026): practice goes **one Latin line at a time, in Mass order**; each line runs its whole ladder back-to-back (intro → MC → tiles → cloze → first letters → full ×2, English meaning shown until the final full rungs), then a Father's-line question and a "from the top" recall of every line so far. Every question shows a context strip (section, your line N of M, what came just before). Checkpoints add "your lines in order", "what's your next line?" and Father's-line cloze. Revision is in Mass order, mostly Latin (movements ≤ ~25%). Spaced gaps: 10 min, 1 h, 5 h, 20 h, 2 d, 4 d, 9 d, 20 d.
- Progress lives in localStorage key `servemass-v1` (never rename it). `S.v` is the schema version; migrations run in `load` section of app.js.
- Marking is forgiving by design (Sam: the goal is saying it, not spelling it).
- Points where practice varies are tagged `father:` and collected into the "Ask Father" list. Don't present a varying custom as fixed.
- Extras (sacristy/candles, Leonine prayers) are optional and must not affect main progress.
- Test: serve the folder (`python3 -m http.server`), open it, and drive stops; `window.__SM` exposes state for scripted runs.
