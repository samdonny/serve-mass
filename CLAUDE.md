# Serve the Low Mass — offline learning app

Sam's app for learning to serve a Traditional Latin Low Mass (1962 Missal, one server, FSSP priest).
Live (offline PWA): https://samdonny.github.io/serve-mass/ — repo samdonny/serve-mass (public, GitHub Pages from `main`).

- No build step. `content.js` holds all teaching content; `app.js` the engine; `sw.js` the offline cache.
- **Bump `VERSION` in `sw.js` on every change you push**, or installed phones keep the old cached copy.
- Learning model follows ~/Code/Latin: explain before testing; ladder MC → tiles → cloze → first letters → full recall; stops ~5 min; a stop once done stays done; spaced revision (10 min, 1 h, 5 h, 20 h, 2 d, 4 d, 9 d, 20 d) in warm-ups.
- Marking is forgiving by design (Sam: the goal is saying it, not spelling it).
- Points where practice varies are tagged `father:` and collected into the "Ask Father" list. Don't present a varying custom as fixed.
- Extras (sacristy/candles, Leonine prayers) are optional and must not affect main progress.
- Test: serve the folder (`python3 -m http.server`), open it, and drive stops; `window.__SM` exposes state for scripted runs.
