/* Test driver: answers whatever question is on screen, via window.__SM.
 * Load it in the page (inject a <script src="tests/drive.js">), then:
 *   await drive(maxSteps, wrongRate)   → {done, steps, seen, errs, order, txt}
 *   await runPath(wrongRate)           → runs every unfinished stop on the path
 */
window.drive = async function (maxSteps, wrongRate) {
  const sm = window.__SM, seen = {}, errs = [], order = []; let steps = 0;
  const norm = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/j/g, 'i').replace(/[^a-z]/g, '');
  const words = s => String(s).split(/\s+/).filter(w => norm(w));
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  while (steps++ < maxSteps) {
    const v = sm.view(); if (!v || !v.cur) return { done: true, steps, seen, errs, order, txt: document.querySelector('.card')?.innerText.slice(0, 200) };
    try {
      const cont = document.querySelector('[data-act=cont]'); if (cont) { click(cont); continue; }
      const q = v.cur, bad = Math.random() < wrongRate; seen[q.qt] = (seen[q.qt] || 0) + 1;
      if (q.lad && q.pos === 0) order.push(q.step);
      const isDo = q.id && sm.kindOf(q.id) === 'do', right = q.text || q.right || (q.id ? (isDo ? sm.STEP[sm.realId(q.id)].a : sm.textOf(q.id)) : null);
      if (q.qt === 'doself' || q.qt === 'explain') { click(document.querySelector('[data-act=doreveal]')); click(document.querySelector('[data-self=' + (bad ? 'bad' : 'ok') + ']')); }
      else if (q.qt === 'intro') { click(document.querySelector('[data-act=introok]')); continue; }
      else if (q.qt === 'mc' || q.qt === 'fatherMC') { const bs = [...document.querySelectorAll('.opt')]; const r = bs.find(b => norm(b.innerText) === norm(right)); if (!r) errs.push('no right opt ' + q.qt + ' ' + (q.id || q.step)); const w = bs.find(b => b !== r); click(bad ? w : (r || bs[0])); }
      else if (q.qt === 'map') { const z = sm.STEP[sm.realId(q.id)].zone; click(document.querySelector('path[data-zone=' + (bad ? 'rail' : z) + ']')); }
      else if (q.qt === 'tiles') { for (const w of words(right)) { const b = [...document.querySelectorAll('[data-build]')].find(b => b.innerText === w); click(b); } click(document.querySelector('[data-act=check]')); }
      else if (q.qt.startsWith('cloze')) { const W = words(right); document.querySelectorAll('input.blank').forEach(i => i.value = bad ? 'xx' : W[+i.dataset.bi]); click(document.querySelector('[data-act=check]')); }
      else if (q.rehearse) { click(document.querySelector('[data-act=reveal]')); click(document.querySelector('[data-self=' + (bad ? 'bad' : 'ok') + ']')); }
      else if (q.qt === 'full' || q.qt === 'initials' || q.qt === 'next') { document.querySelector('#ta').value = bad ? 'nescio' : right.replace(/a/, 'e'); click(document.querySelector('[data-act=check]')); }
      else if (q.qt === 'order') { const labs = q.items.map(x => x.label); for (let k = 0; k < labs.length; k++) { const want = labs[bad && k < 2 && labs.length > 1 ? 1 - k : k]; const b = [...document.querySelectorAll('[data-order]')].find(b => q.items[+b.dataset.order].label === want); click(b); } click(document.querySelector('[data-act=check]')); }
      else errs.push('unknown ' + q.qt);
      if (!document.querySelector('[data-act=cont]')) errs.push('no feedback after ' + q.qt + ' ' + (q.id || q.step));
    } catch (e) { errs.push(String(e) + ' @' + (v.cur && v.cur.qt)); return { steps, seen, errs }; }
  }
  return { done: false, steps, seen, errs };
};
window.runPath = async function (wrongRate, only) {
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const out = []; let total = 0;
  for (const st of window.__SM.PATH) {
    if (window.__SM.S().stops[st.id]?.done) continue;
    if (only && !only(st)) continue;
    document.querySelector('[data-tab=path]').click();
    const b = document.querySelector(`[data-stop="${st.id}"]`); if (!b || b.disabled) { out.push(st.id + ' LOCKED'); break; }
    click(b);
    if (st.kind === 'learn') { let n = 0; while (document.querySelector('[data-act=next]') && n++ < 30) { click(document.querySelector('[data-act=next]')); if (document.querySelector('[data-act=home]')) break; } continue; }
    const r = await window.drive(5000, wrongRate); total += r.steps;
    out.push(`${st.id} ${r.steps} done=${r.done} ${(r.errs || []).join('|').slice(0, 200)} :: ${(r.txt || '').split('\n')[0].slice(0, 50)}`);
    if (!r.done || (r.errs || []).length) break;
  }
  return out.join('\n') + '\nTOTAL ' + total;
};
