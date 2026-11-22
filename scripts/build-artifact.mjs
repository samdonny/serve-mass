// Builds artifact/index.html: the same app as one self-contained page for claude.ai.
// The publish skeleton supplies doctype/html/head/body, so this file starts with <title>.
// No manifest or service worker (they don't work inside Claude); ai.js lights up the Claude features.
// Fr Z's excerpt (private, never committed): ffmpeg -ss 1510 -to 2000 -i <his mp3> -c:a libmp3lame -b:a 64k artifact/frz-foot.mp3
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = f => readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
const js = f => `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`;

const page = `<title>Serve the Low Mass</title>
<style>${css}</style>
<div class="wrap" id="app"><p>Loading…</p></div>
<nav class="tab" id="tabs"></nav>
${js('content.js')}
${js('audio/index.js')}
${js('audio/frz.js')}
${existsSync(path.join(ROOT, 'artifact', 'frz-foot.mp3')) ? '<script>window.FRZ.bundled = { src: "frz-foot.mp3", offset: 1510 };</script>' : ''}
${js('app.js')}
${js('ai.js')}
`;
mkdirSync(path.join(ROOT, 'artifact'), { recursive: true });
writeFileSync(path.join(ROOT, 'artifact', 'index.html'), page);
console.log('artifact/index.html', (page.length / 1024).toFixed(0) + ' KB');
