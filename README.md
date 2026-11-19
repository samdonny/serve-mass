# Serve the Low Mass

Offline learning app for serving a Traditional Latin Low Mass (1962, one server).
Plain HTML/JS, no build step. Open `index.html` directly, or host the folder (it installs as an offline PWA).

- `content.js`: every section: explanation cards, then steps (Father's cue → your Latin response, or an action).
- `app.js`: learning path, spaced revision, marking, UI.
- `sw.js`: offline cache. **Bump `VERSION` on every deploy** or phones keep the old copy.
