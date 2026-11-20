/* Claude-connected features. Active only inside the claude.ai artifact version, where
 * window.claude exists; in the offline PWA everything here stays off and the app works as before.
 *   sample    → judge spoken answers, mark "what do I do?" answers, write memory hooks, Ask Claude
 *   dictation → the mic on the Mac (the iPhone uses the phone's own speech recognition)
 *   db        → progress saved to Sam's Claude account (doc progress/main), so it survives and can be read back
 */
(function () {
  'use strict';
  const AI = window.AI = { on: {}, sample: null, dict: null, db: null, onSave: null };
  const SM = () => window.__SM;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COPY = { not_granted: 'Claude wasn\'t allowed for this page, so the Claude features are off for now.', rate_limited: 'Claude is busy or you\'ve hit a usage limit — try again in a little while.', session_expired: 'Your Claude sign-in expired — reload the page.', sampling_disabled: 'Claude isn\'t available on this account.' };
  const off = e => { if (e && /not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed/.test(e.code)) { AI.on.sample = false; SM() && SM().rerender(); } };

  const RULES = `You are a patient, precise tutor helping Sam learn to serve a Traditional Latin Low Mass (1962 Missal) as the only server, for a priest of the FSSP (Priestly Fraternity of St Peter). Sam is learning the Latin responses by heart and every movement (where to kneel, the missal, cruets, bells, paten). Use ecclesiastical (Italianate) pronunciation. Where practice genuinely varies between priests or churches, say so plainly and suggest he ask Father, rather than presenting one custom as fixed. Be concise: short paragraphs, plain words, no headings.`;

  // ── spoken answers: did he say the line, given a messy Italian speech-recogniser transcript?
  AI.judge = (latin, heard, english) => AI.sample.json(
    `${RULES}\n\nTask: mark a spoken response. A speech recogniser set to Italian transcribed what Sam said aloud; it mangles Latin (Italian spellings, merged or split words, dropped final letters, homophones). Decide whether Sam most likely said the expected Latin, every word, in order. Forgive anything that is plausibly the recogniser's fault; do NOT forgive missing, extra or wrong words that change the line, or a different line altogether.\n\nExpected Latin: ${latin}\nMeaning: ${english}\nRecogniser heard: ${heard}\n\nReply with only JSON: {"verdict":"ok"|"close"|"bad","missing":["latin words that seem missing or wrong"],"note":"one short sentence to Sam"}`,
    { modelTier: 'quick' }).catch(e => { off(e); throw e; });

  // ── "what do I do?" in his own words
  AI.gradeExplain = (id, answer, context) => {
    const st = SM().STEP[SM().realId(id)];
    return AI.sample.json(
      `${RULES}\n\nTask: mark Sam's answer to a question about the server's movements.\n\nThe moment: ${st.when}\nQuestion: ${st.q}\nCorrect answer (model): ${st.a}\n${st.father ? 'This varies by priest: ' + st.father + '\n' : ''}Background:\n${context}\n\nSam wrote (may be dictated, so ignore spelling): """${answer}"""\n\nMarking: "ok" if he has the essential actions of the model answer, in the right order (paraphrase is fine, extra correct detail is fine); "close" if one essential element is missing or slightly off; "bad" if key actions are missing, wrong, or out of order. Don't penalise a custom that varies by priest. Reply with only JSON: {"verdict":"ok"|"close"|"bad","missed":["short phrase per missing or wrong point"],"feedback":"one or two sentences to Sam, second person, concrete"}`)
      .catch(e => { off(e); throw e; });
  };

  // ── personal memory hooks, built from his actual mistakes
  AI.hook = o => AI.sample.json(
    `${RULES}\n\nTask: write ONE memory hook to help Sam say this Latin response by heart. Make it vivid and specific to the words (sound-alikes in English, the meaning, the structure or rhythm), and aim it at what he actually gets wrong. At most 35 words.\n\nFather says: ${o.cue}\nSam answers: ${o.latin}\nMeaning: ${o.english}\nPronunciation: ${o.say}\n${o.wrong.length ? 'His recent wrong attempts: ' + o.wrong.map(w => '"' + w + '"').join(', ') : ''}\n\nReply with only JSON: {"hook":"..."}`,
    { cache: false }).then(r => { if (!r || !r.hook) throw { code: 'invalid_json' }; return String(r.hook).slice(0, 400); }).catch(e => { off(e); throw e; });

  // ── Ask Claude: a small chat sheet over the page, seeded with where he is
  AI.ask = context => {
    if (!AI.on.sample) return;
    document.querySelector('.askp')?.remove();
    const turns = [{ role: 'user', content: `${RULES}\n\nSam is looking at this in his learning app:\n${context}\n\nAnswer his questions about it. If he asks to be quizzed, quiz him one question at a time.` }];
    const el = document.createElement('div'); el.className = 'askp';
    el.innerHTML = `<div class="box" role="dialog" aria-label="Ask Claude"><div class="row"><b style="flex:1">💬 Ask Claude</b><button class="ghost" data-x>Close</button></div>
      <div class="msgs"><div class="m a">Ask anything about this part of the Mass — why it's done, what a word means, what to do if something goes wrong.</div></div>
      <textarea placeholder="e.g. Why do I kiss the cruets?"></textarea><div class="row"><button class="pri" data-send>Send</button><button data-stop disabled>Stop</button></div></div>`;
    document.body.appendChild(el);
    const msgs = el.querySelector('.msgs'), ta = el.querySelector('textarea'), send = el.querySelector('[data-send]'), stop = el.querySelector('[data-stop]');
    let ctl = null;
    const add = (cls, t) => { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = t; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; };
    el.addEventListener('click', async e => {
      if (e.target === el || e.target.closest('[data-x]')) { ctl && ctl.abort(); el.remove(); return; }
      if (e.target.closest('[data-stop]')) { ctl && ctl.abort(); return; }
      if (!e.target.closest('[data-send]')) return;
      const q = ta.value.trim(); if (!q) return;
      ta.value = ''; add('u', q); turns.push({ role: 'user', content: q });
      const out = add('a', 'Thinking…'); send.disabled = true; stop.disabled = false; ctl = new AbortController();
      try {
        const { text } = await AI.sample([turns[0]].concat(turns.slice(1).slice(-12)), { cache: false, signal: ctl.signal, onText: ({ text }) => { out.textContent = text; msgs.scrollTop = msgs.scrollHeight; } });
        turns.push({ role: 'assistant', content: text });
      } catch (err) {
        out.textContent = err && err.text ? err.text : '';
        if (!err || err.code !== 'cancelled') add('a', COPY[err && err.code] || 'That didn\'t work — try again.');
        if (!out.textContent) out.remove();
        turns.pop(); off(err);
      } finally { send.disabled = false; stop.disabled = true; ctl = null; }
    });
    ta.focus();
  };

  // ── progress kept in the Claude account (the artifact's db), mirrored to this browser
  let doc = null, writing = Promise.resolve(), timer = null, lastSent = '';
  const push = () => {
    if (!doc || !SM()) return;
    const state = JSON.stringify(SM().S()); if (state === lastSent) return;
    lastSent = state;
    writing = writing.then(() => doc.set({ state, updated: Date.now() })).catch(e => { if (e && e.code === 'quota_exceeded') console.warn('progress too large to save to Claude'); });
  };
  AI.onSave = () => { if (!doc) return; clearTimeout(timer); timer = setTimeout(push, 4000); };
  async function syncProgress() {
    try {
      doc = AI.db.doc('progress/main');
      const snap = await doc.get();
      const local = SM().S(), remote = snap.exists ? JSON.parse(snap.data().state || 'null') : null;
      const score = o => o ? (o.lastActive || 0) : -1;
      if (remote && score(remote) > score(local)) { lastSent = JSON.stringify(remote); SM().replaceState(remote); }
      else push();
    } catch (e) { doc = null; console.warn('progress sync unavailable', e && e.code); }
  }

  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return; // the offline PWA
    const [sample, dict, db] = await Promise.all(['sample', 'dictation', 'db'].map(n => window.claude.use(n).catch(() => null)));
    AI.sample = sample; AI.dict = dict; AI.db = db;
    AI.on = { sample: !!sample, dict: !!dict, db: !!db };
    if (db) await syncProgress();
    SM() && SM().rerender();
  }
  init();
})();
