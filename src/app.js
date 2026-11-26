/* Lumen — offline self-growth app. Vanilla JS, no network. */
(() => {
const D = window.LUMEN_DATA;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };
const today = () => dkey();
const dayIndex = () => Math.floor(Date.now() / 864e5);
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- State & storage ---------- */
const defaults = () => ({
  version: 1,
  profile: { name: '', goals: [], dailyGoal: 50, theme: 'light' },
  xp: 0, streak: { count: 0, best: 0, last: null },
  activity: {}, counts: {}, daily: {},
  skills: { memory: [], focus: [], math: [], speaking: [], knowledge: [] },
  books: {}, cards: {}, habits: [
    { id: 'h1', name: 'Read 10 minutes', icon: '📖', log: {} },
    { id: 'h2', name: 'Drink water', icon: '💧', log: {} },
  ],
  journal: [], speaking: [], achievements: {},
  premium: { active: false, plan: null, key: null, trialEnds: 0 },
});
let S = defaults();
const hasBridge = !!window.lumenStore;
async function load() {
  let data = null;
  try { data = hasBridge ? await window.lumenStore.load() : JSON.parse(localStorage.getItem('lumen') || 'null'); } catch {}
  if (data) S = Object.assign(defaults(), data, { profile: Object.assign(defaults().profile, data.profile || {}) });
}
let saveT;
function writeNow() {
  clearTimeout(saveT); saveT = null;
  try { hasBridge ? window.lumenStore.save(S) : localStorage.setItem('lumen', JSON.stringify(S)); } catch {}
}
function save() { clearTimeout(saveT); saveT = setTimeout(writeNow, 150); }
// Phones can close the app as soon as it goes to the background: write pending changes right away.
const flush = () => { if (saveT) writeNow(); };
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
// Ask the browser not to evict saved progress.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
// Remember which screen was open so reopening the app returns there.
const rememberScreen = (v) => { try { localStorage.setItem('lumen:screen', v); } catch {} };

/* ---------- Premium ---------- */
const isPremium = () => S.premium.active || S.premium.trialEnds > Date.now();
// Offline license check: LUMEN-XXXX-XXXX-CCCC where CCCC is a checksum of the body.
function keyChecksum(body) {
  let n = 0; for (let i = 0; i < body.length; i++) n = (n + body.charCodeAt(i) * (i + 7) * 31) % 1679616;
  return n.toString(36).toUpperCase().padStart(4, '0');
}
function validKey(k) {
  const m = /^LUMEN-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(k.trim().toUpperCase());
  return !!m && keyChecksum(m[1] + m[2]) === m[3];
}
function needPremium(feature) {
  if (isPremium()) return false;
  modal(`<h2>👑 ${esc(feature)} is a Premium feature</h2>
    <p class="muted">Unlock the full library, all brain games, the pace coach, unlimited habits and advanced analytics. Everything still works offline.</p>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-act="closeModal">Not now</button>
    <button class="btn gold" data-act="go" data-arg="premium">See Premium</button></div>`);
  return true;
}

/* ---------- XP, streaks, achievements ---------- */
function levelInfo(xp = S.xp) {
  let lvl = 1, need = 100;
  while (xp >= need) { xp -= need; lvl++; need = 100 + (lvl - 1) * 50; }
  return { lvl, into: xp, need };
}
function currentStreak() {
  const { last, count } = S.streak;
  return last === today() || last === dkey(addDays(-1)) ? count : 0;
}
function award(type, xp, minutes = 3) {
  const t = today();
  const a = S.activity[t] || (S.activity[t] = { xp: 0, minutes: 0 });
  a.xp += xp; a.minutes += minutes; S.xp += xp;
  S.counts[type] = (S.counts[type] || 0) + 1;
  if (S.streak.last !== t) {
    S.streak.count = S.streak.last === dkey(addDays(-1)) ? S.streak.count + 1 : 1;
    S.streak.last = t; S.streak.best = Math.max(S.streak.best, S.streak.count);
  }
  checkAchievements(); save(); renderSide();
  toast(`+${xp} XP`);
}
function checkAchievements() {
  const c = S.counts, done = Object.values(S.books).filter((b) => b.done).length;
  const habitChecks = S.habits.reduce((n, h) => n + Object.keys(h.log).length, 0);
  const games = ['math', 'memory', 'stroop', 'recall', 'reaction'].reduce((n, g) => n + (c[g] || 0), 0);
  const rules = {
    'first-step': S.xp > 0, 'streak-3': S.streak.best >= 3, 'streak-7': S.streak.best >= 7,
    reader: done >= 3, brainy: games >= 10, speaker: (c.speak || 0) >= 5, 'habit-hero': habitChecks >= 20, 'level-5': levelInfo().lvl >= 5,
  };
  for (const [id, name, , em] of D.achievements) {
    if (rules[id] && !S.achievements[id]) { S.achievements[id] = today(); setTimeout(() => toast(`${em} Achievement: ${name}`), 900); }
  }
}
function addSkill(skill, score) { S.skills[skill].push({ d: today(), s: Math.round(clamp(score, 0, 100)) }); }
function skillLevel(skill) {
  const arr = S.skills[skill].slice(-5);
  return arr.length ? Math.round(arr.reduce((n, x) => n + x.s, 0) / arr.length) : 0;
}
function markDaily(k) { (S.daily[today()] ||= {})[k] = true; save(); }

/* ---------- UI helpers ---------- */
let cleanup = null, currentView = 'today';
function setCleanup(fn) { if (cleanup) cleanup(); cleanup = fn; }
function modal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2000); }
function renderSide() {
  const l = levelInfo();
  $('#lvl').textContent = `Lv ${l.lvl}`; $('#xpText').textContent = `${l.into}/${l.need} XP`;
  $('#xpBar').style.width = `${(l.into / l.need) * 100}%`;
  $('#streakCount').textContent = currentStreak();
  document.documentElement.dataset.theme = S.profile.theme;
}
function go(view) {
  setCleanup(null); currentView = view; rememberScreen(view);
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  (views[view] || views.today)(); $('#view').scrollTop = 0;
}
const lockTag = (p) => (p && !isPremium() ? '<span class="lock">👑 PRO</span>' : '');
function ring(pct, label) {
  const r = 50, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="12"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent2)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp(pct, 0, 1))}" transform="rotate(-90 60 60)"/>
  <text x="60" y="66" text-anchor="middle" style="font-size:20px;font-weight:700;fill:var(--text)">${label}</text></svg>`;
}

/* ---------- Views ---------- */
const views = {};
const GAMES = [
  { id: 'math', name: 'Speed Math', skill: 'math', icon: '➗', desc: 'Solve as many problems as you can in 45 seconds.', premium: false },
  { id: 'memory', name: 'Pattern Memory', skill: 'memory', icon: '🔲', desc: 'Remember the lit tiles. The grid gets harder.', premium: false },
  { id: 'stroop', name: 'Color Clash', skill: 'focus', icon: '🎨', desc: 'Does the word match its ink color? Stay focused.', premium: false },
  { id: 'recall', name: 'Word Recall', skill: 'memory', icon: '📝', desc: 'Memorize 10 words, then find them among decoys.', premium: true },
  { id: 'reaction', name: 'Quick Reflex', skill: 'focus', icon: '⚡', desc: 'Click the moment the panel turns green.', premium: true },
];
const accessibleBooks = () => D.books.filter((b) => !b.premium || isPremium());

views.today = () => {
  const dly = S.daily[today()] || {};
  const book = accessibleBooks().find((b) => !(S.books[b.id] || {}).done) || accessibleBooks()[dayIndex() % accessibleBooks().length];
  const freeGames = GAMES.filter((g) => !g.premium || isPremium());
  const game = freeGames[dayIndex() % freeGames.length];
  const quote = D.quotes[dayIndex() % D.quotes.length];
  const word = D.vocabulary[dayIndex() % D.vocabulary.length];
  const due = dueCards().length;
  const tasks = [
    ['read', '📖', `Read: ${book.title}`, `${book.minutes} min summary · ${book.author}`, 'openBook', book.id],
    ['game', game.icon, `Train: ${game.name}`, game.desc, 'playGame', game.id],
    ['speak', '🎤', 'Speaking drill', 'One impromptu prompt, 60 seconds', 'go', 'speak'],
    ['journal', '🌱', 'Reflect & check habits', 'Log your mood and today\'s habits', 'go', 'grow'],
  ];
  const doneN = tasks.filter((t) => dly[t[0]]).length;
  const xpToday = (S.activity[today()] || {}).xp || 0;
  const hr = new Date().getHours();
  $('#view').innerHTML = `
  <div class="header"><div><h1>Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}${S.profile.name ? ', ' + esc(S.profile.name) : ''} 👋</h1>
    <div class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
    ${isPremium() ? '<span class="tag">👑 Premium</span>' : '<button class="btn gold" data-act="go" data-arg="premium">Try Premium free</button>'}</div>
  <div class="grid g3">
    <div class="card hero" style="grid-column:span 2"><h2>Daily plan</h2><div class="muted">${doneN}/4 complete · finish all four to grow your streak and tree.</div>
      <div class="bar" style="background:rgba(255,255,255,.25);height:10px;margin-top:14px"><i style="width:${doneN * 25}%;background:#fff"></i></div>
      <p style="margin:18px 0 0;font-size:17px">“${esc(quote[0])}” <span class="muted">— ${esc(quote[1])}</span></p></div>
    <div class="card" style="display:flex;align-items:center;gap:16px">${ring(xpToday / S.profile.dailyGoal, `${Math.min(999, xpToday)}`)}
      <div><h3>Daily goal</h3><div class="muted small">${xpToday} / ${S.profile.dailyGoal} XP</div><div class="muted small" style="margin-top:6px">🔥 ${currentStreak()} day streak</div></div></div>
  </div>
  <div class="grid g2 section">
    <div class="card"><h2>Today's tasks</h2>
      ${tasks.map(([k, ico, t, sub, act, arg]) => `<div class="task"><div class="ico">${ico}</div><div class="grow1"><b>${esc(t)}</b><div class="muted small">${esc(sub)}</div></div>
        ${dly[k] ? '<div class="check on">✓</div>' : `<button class="btn sm" data-act="${act}" data-arg="${arg}">Start</button>`}</div>`).join('')}
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="row"><h2 style="margin:0">Word of the day</h2><span class="tag">Vocabulary</span></div>
        <h3 style="margin-top:12px;font-size:22px">${word[0]}</h3><div>${word[1]}</div><div class="muted small" style="margin-top:6px"><i>"${word[2]}"</i></div></div>
      <div class="card click" data-act="go" data-arg="review"><div class="row"><div><h2 style="margin:0">Review cards</h2><div class="muted small">Spaced repetition keeps ideas in memory</div></div>
        <div class="stat">${due}</div></div></div>
      <div class="card"><h2>Skill snapshot</h2>${skillBars()}</div>
    </div>
  </div>`;
};

function skillBars() {
  const names = { memory: '🧠 Memory', focus: '🎯 Focus', math: '➗ Math', speaking: '🎤 Speaking', knowledge: '📚 Knowledge' };
  return Object.entries(names).map(([k, n]) => {
    const v = skillLevel(k);
    return `<div class="skillbar"><div class="row small"><span>${n}</span><b>${v || '—'}</b></div><div class="bar"><i style="width:${v}%"></i></div></div>`;
  }).join('');
}

/* Library */
let libFilter = 'All';
views.library = () => {
  const cats = ['All', ...new Set(D.books.map((b) => b.category))];
  const list = D.books.filter((b) => libFilter === 'All' || b.category === libFilter);
  $('#view').innerHTML = `<div class="header"><div><h1>Library</h1><div class="muted">Key ideas from timeless books, in minutes.</div></div>
    <input id="bookSearch" placeholder="Search titles or authors…" style="max-width:280px"></div>
    <div class="row" style="justify-content:flex-start;flex-wrap:wrap;margin-bottom:16px">${cats.map((c) => `<button class="btn sm ${c === libFilter ? '' : 'ghost'}" data-act="libFilter" data-arg="${c}">${c}</button>`).join('')}</div>
    <div class="grid g3" id="bookGrid">${list.map(bookCard).join('')}</div>`;
  $('#bookSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $('#bookGrid').innerHTML = list.filter((b) => (b.title + b.author).toLowerCase().includes(q)).map(bookCard).join('');
  });
};
function bookCard(b) {
  const p = S.books[b.id] || {}; const pct = p.done ? 100 : Math.round(((p.idx || 0) / b.ideas.length) * 100);
  return `<div class="card click ${b.premium && !isPremium() ? 'locked' : ''}" data-act="openBook" data-arg="${b.id}">${lockTag(b.premium)}
    <div class="cover" style="background:linear-gradient(135deg,${b.color},${b.color}aa)">${esc(b.title)}</div>
    <b>${esc(b.author)}</b><div class="muted small">${b.category} · ${b.minutes} min · ${b.ideas.length} key ideas ${p.done ? '· ✅' : ''}</div>
    <div class="progress-mini"><i style="width:${pct}%"></i></div></div>`;
}
function openBook(id) {
  const b = D.books.find((x) => x.id === id);
  if (b.premium && needPremium('Full library')) return;
  const p = S.books[id] || (S.books[id] = { idx: 0, done: false });
  if (p.idx >= b.ideas.length) p.idx = 0;
  rememberScreen('book:' + id);
  const renderIdea = () => {
    const [title, text] = b.ideas[p.idx];
    $('#view').innerHTML = `<div class="reader">
      <div class="row"><button class="btn ghost sm" data-act="go" data-arg="library">← Library</button><span class="muted small">${esc(b.title)} · ${esc(b.author)}</span></div>
      <div class="dots">${b.ideas.map((_, i) => `<i class="${i <= p.idx ? 'on' : ''}"></i>`).join('')}</div>
      <div class="card"><span class="tag">Key idea ${p.idx + 1} of ${b.ideas.length}</span><h2 style="margin-top:12px;font-size:24px">${esc(title)}</h2>
      <div class="idea">${esc(text)}</div>
      <div class="row"><button class="btn ghost sm" data-act="saveCard" data-arg="${id}:${p.idx}">${S.cards[`${id}:${p.idx}`] ? '★ Saved to review' : '☆ Save to review'}</button>
      <div class="row"><button class="btn ghost" id="prevIdea" ${p.idx === 0 ? 'disabled' : ''}>Back</button><button class="btn" id="nextIdea">${p.idx === b.ideas.length - 1 ? 'Finish & quiz' : 'Next'}</button></div></div></div></div>`;
    $('#prevIdea').onclick = () => { p.idx--; save(); renderIdea(); };
    $('#nextIdea').onclick = () => { if (p.idx < b.ideas.length - 1) { p.idx++; save(); renderIdea(); } else quiz(); };
  };
  const quiz = () => {
    const [q, opts, ans] = b.quiz[0];
    $('#view').innerHTML = `<div class="reader"><div class="card game-area"><span class="tag">Quick check</span><h2>${esc(q)}</h2>
      <div class="choices">${opts.map((o, i) => `<button class="btn ghost" data-i="${i}">${esc(o)}</button>`).join('')}</div><div id="qres"></div></div></div>`;
    document.querySelectorAll('.choices button').forEach((btn) => btn.onclick = () => {
      const right = +btn.dataset.i === ans;
      btn.style.background = right ? 'var(--accent2)' : 'var(--danger)'; btn.style.color = '#fff';
      const first = !p.done; p.done = true; p.idx = 0;
      b.ideas.forEach((_, i) => { const k = `${id}:${i}`; if (!S.cards[k]) S.cards[k] = { box: 0, due: today() }; });
      addSkill('knowledge', right ? 90 : 55);
      if (first) award('read', right ? 40 : 30, b.minutes); else award('read', 10, b.minutes);
      markDaily('read');
      $('#qres').innerHTML = `<p>${right ? '✅ Correct!' : `The answer: <b>${esc(opts[ans])}</b>`} All key ideas were added to your review deck.</p>
        <button class="btn" data-act="go" data-arg="library">Back to library</button> <button class="btn ghost" data-act="go" data-arg="review">Review now</button>`;
      document.querySelectorAll('.choices button').forEach((x) => x.disabled = true);
    });
  };
  renderIdea();
}

/* Review (spaced repetition) */
const INTERVALS = [0, 1, 3, 7, 14, 30];
const dueCards = () => Object.entries(S.cards).filter(([, c]) => c.due <= today()).map(([k]) => k);
views.review = () => {
  let queue = shuffle(dueCards()), flipped = false, reviewed = 0;
  const total = Object.keys(S.cards).length;
  const draw = () => {
    if (!queue.length) {
      $('#view').innerHTML = `<div class="header"><div><h1>Review</h1><div class="muted">${total} cards in your deck</div></div></div>
        <div class="card game-area"><div class="big">🎉</div><h2>${reviewed ? 'All caught up!' : total ? 'Nothing due right now' : 'Your deck is empty'}</h2>
        <p class="muted">${total ? 'Come back tomorrow for the next batch.' : 'Finish a summary or save ideas to build your deck.'}</p>
        <button class="btn" data-act="go" data-arg="library">Open library</button></div>`;
      if (reviewed) { award('review', 5 + reviewed * 2, Math.ceil(reviewed / 2)); }
      return;
    }
    const [bid, idx] = queue[0].split(':'); const b = D.books.find((x) => x.id === bid); const [t, txt] = b.ideas[+idx];
    $('#view').innerHTML = `<div class="header"><div><h1>Review</h1><div class="muted">${queue.length} due · ${total} total</div></div></div>
      <div class="reader"><div class="card flash" id="flash">${flipped ? `<div><span class="tag">${esc(b.title)}</span><h2 style="margin-top:10px">${esc(t)}</h2><div class="muted">${esc(txt)}</div></div>`
        : `<div><span class="tag">${esc(b.title)}</span><h2 style="margin-top:10px">${esc(t)}</h2><div class="muted small">Recall the idea, then click to reveal</div></div>`}</div>
      <div class="row" style="justify-content:center;margin-top:16px">${flipped ? '<button class="btn red" id="again">Again</button><button class="btn green" id="good">Got it</button>' : ''}</div></div>`;
    $('#flash').onclick = () => { flipped = true; draw(); };
    if (flipped) {
      $('#again').onclick = () => { const c = S.cards[queue[0]]; c.box = 0; queue.push(queue.shift()); flipped = false; save(); draw(); };
      $('#good').onclick = () => { const c = S.cards[queue[0]]; c.box = Math.min(5, c.box + 1); c.due = dkey(addDays(INTERVALS[c.box])); queue.shift(); reviewed++; flipped = false; save(); draw(); };
    }
  };
  draw();
};

/* Brain training */
views.train = () => {
  $('#view').innerHTML = `<div class="header"><div><h1>Brain Training</h1><div class="muted">Short, adaptive games for memory, focus and math.</div></div></div>
    <div class="grid g3">${GAMES.map((g) => {
      const best = Math.max(0, ...S.skills[g.skill].filter((x) => x.g === g.id).map((x) => x.s));
      return `<div class="card click ${g.premium && !isPremium() ? 'locked' : ''}" data-act="playGame" data-arg="${g.id}">${lockTag(g.premium)}
      <div style="font-size:36px">${g.icon}</div><h3>${g.name}</h3><div class="muted small">${g.desc}</div>
      <div class="row small" style="margin-top:10px"><span class="tag">${g.skill}</span><span class="muted">Played ${S.counts[g.id] || 0}× ${best ? '· best ' + best : ''}</span></div></div>`;
    }).join('')}</div>
    <div class="card section"><h2>Your skills</h2>${skillBars()}</div>`;
};
function gameShell(g, inner) {
  $('#view').innerHTML = `<div class="row" style="margin-bottom:16px"><button class="btn ghost sm" data-act="go" data-arg="train">← Games</button><b>${g.icon} ${g.name}</b><span id="ghud" class="muted"></span></div>
    <div class="card game-area" id="garea">${inner}</div>`;
}
function finishGame(g, score, detail) {
  score = Math.round(clamp(score, 0, 100));
  S.skills[g.skill].push({ d: today(), s: score, g: g.id });
  award(g.id, 10 + Math.round(score / 5), 2); markDaily('game');
  $('#garea').innerHTML = `<div class="big">${score}</div><div class="muted">${g.skill} score</div><p>${detail}</p>
    <div class="row"><button class="btn" data-act="playGame" data-arg="${g.id}">Play again</button><button class="btn ghost" data-act="go" data-arg="train">All games</button></div>`;
  $('#ghud').textContent = '';
}
function countdown(sec, onTick, onEnd) {
  let left = sec; onTick(left);
  const iv = setInterval(() => { left--; onTick(left); if (left <= 0) { clearInterval(iv); onEnd(); } }, 1000);
  return () => clearInterval(iv);
}
function playGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (g.premium && needPremium(g.name)) return;
  setCleanup(null);
  gameShell(g, `<div style="font-size:54px">${g.icon}</div><h2>${g.name}</h2><p class="muted">${g.desc}</p><button class="btn" id="gstart">Start</button>`);
  $('#gstart').onclick = () => GAME_IMPL[id](g);
}
const GAME_IMPL = {
  math(g) {
    let correct = 0, wrong = 0, q;
    const next = () => {
      const lvl = 1 + Math.floor(correct / 4), op = ['+', '−', '×'][rand(correct > 3 ? 3 : 2)];
      let a = rand(10 * lvl) + 2, b = rand(10 * lvl) + 1;
      if (op === '×') { a = rand(4 + lvl * 2) + 2; b = rand(9) + 2; }
      if (op === '−' && b > a) [a, b] = [b, a];
      q = { text: `${a} ${op} ${b}`, ans: op === '+' ? a + b : op === '−' ? a - b : a * b };
      $('#mq').textContent = q.text; $('#ma').value = ''; $('#ma').focus();
    };
    $('#garea').innerHTML = `<div class="big" id="mq"></div><input id="ma" type="number" style="max-width:200px;text-align:center;font-size:24px" autocomplete="off"><div class="muted small">Press Enter to submit</div>`;
    $('#ma').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || $('#ma').value === '') return;
      if (+$('#ma').value === q.ans) correct++; else { wrong++; $('#garea').style.boxShadow = '0 0 0 3px var(--danger)'; setTimeout(() => $('#garea') && ($('#garea').style.boxShadow = ''), 250); }
      next();
    });
    next();
    setCleanup(countdown(45, (l) => ($('#ghud').textContent = `⏱ ${l}s · ✓ ${correct}`), () => finishGame(g, correct * 6 - wrong * 3, `${correct} correct, ${wrong} wrong.`)));
  },
  memory(g) {
    let level = 3, lives = 3, maxLvl = 0, timers = [];
    const round = () => {
      const size = level <= 4 ? 4 : level <= 7 ? 5 : 6;
      const targets = new Set(shuffle([...Array(size * size).keys()]).slice(0, level));
      let found = 0, active = false;
      $('#ghud').textContent = `Level ${level - 2} · ❤️ ${lives}`;
      $('#garea').innerHTML = `<div class="muted">Memorize the tiles…</div><div class="mem-grid" style="grid-template-columns:repeat(${size},64px)">${[...Array(size * size)].map((_, i) => `<div data-i="${i}" class="${targets.has(i) ? 'show' : ''}"></div>`).join('')}</div>`;
      timers.push(setTimeout(() => {
        document.querySelectorAll('.mem-grid div').forEach((d) => d.classList.remove('show'));
        $('#garea .muted').textContent = 'Click the tiles you saw'; active = true;
      }, 900 + level * 150));
      document.querySelectorAll('.mem-grid div').forEach((d) => d.onclick = () => {
        if (!active || d.classList.contains('ok') || d.classList.contains('bad')) return;
        if (targets.has(+d.dataset.i)) {
          d.classList.add('ok'); found++;
          if (found === level) { active = false; maxLvl = Math.max(maxLvl, level - 2); level++; timers.push(setTimeout(round, 600)); }
        } else {
          d.classList.add('bad'); active = false; lives--;
          targets.forEach((t) => document.querySelector(`.mem-grid div[data-i="${t}"]`).classList.add('show'));
          if (lives <= 0) timers.push(setTimeout(() => finishGame(g, maxLvl * 11, `You reached level ${maxLvl}.`), 900));
          else { level = Math.max(3, level - 1); timers.push(setTimeout(round, 1100)); }
        }
      });
    };
    setCleanup(() => timers.forEach(clearTimeout));
    round();
  },
  stroop(g) {
    const colors = [['RED', '#e74c3c'], ['BLUE', '#3498db'], ['GREEN', '#27ae60'], ['PURPLE', '#8e44ad'], ['ORANGE', '#e67e22']];
    let right = 0, wrong = 0, cur;
    const next = () => {
      const w = rand(colors.length), match = Math.random() < 0.45, c = match ? w : (w + 1 + rand(colors.length - 1)) % colors.length;
      cur = match; $('#sw').textContent = colors[w][0]; $('#sw').style.color = colors[c][1];
    };
    $('#garea').innerHTML = `<div class="muted">Does the <b>word's meaning</b> match its <b>ink color</b>?</div><div class="big" id="sw"></div>
      <div class="row"><button class="btn red" id="sn" style="min-width:120px">No (←)</button><button class="btn green" id="sy" style="min-width:120px">Yes (→)</button></div>`;
    const answer = (yes) => { if (yes === cur) right++; else wrong++; next(); };
    $('#sy').onclick = () => answer(true); $('#sn').onclick = () => answer(false);
    const key = (e) => { if (e.key === 'ArrowRight') answer(true); if (e.key === 'ArrowLeft') answer(false); };
    document.addEventListener('keydown', key);
    next();
    const stop = countdown(40, (l) => ($('#ghud').textContent = `⏱ ${l}s · ✓ ${right}`), () => { document.removeEventListener('keydown', key); finishGame(g, right * 3.2 - wrong * 4, `${right} correct, ${wrong} wrong.`); });
    setCleanup(() => { stop(); document.removeEventListener('keydown', key); });
  },
  recall(g) {
    const pool = shuffle(D.recallWords), words = pool.slice(0, 10), options = shuffle(pool.slice(0, 20));
    $('#garea').innerHTML = `<div class="muted">Memorize these words</div><div class="choices">${words.map((w) => `<span class="tag" style="font-size:18px;padding:8px 14px">${w}</span>`).join('')}</div><button class="btn" id="rdy">I'm ready</button>`;
    let stop;
    const test = () => {
      if (stop) stop();
      const picked = new Set();
      $('#garea').innerHTML = `<div class="muted">Select the 10 words you saw</div><div class="choices">${options.map((w) => `<button class="btn ghost" data-w="${w}">${w}</button>`).join('')}</div><button class="btn" id="rsub">Submit (<span id="rc">0</span>/10)</button>`;
      document.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => {
        if (picked.has(b.dataset.w)) picked.delete(b.dataset.w); else if (picked.size < 10) picked.add(b.dataset.w);
        b.classList.toggle('sel', picked.has(b.dataset.w)); $('#rc').textContent = picked.size;
      });
      $('#rsub').onclick = () => { const hits = [...picked].filter((w) => words.includes(w)).length; finishGame(g, hits * 10 - (picked.size - hits) * 5, `${hits} of 10 recalled.`); };
    };
    $('#rdy').onclick = test;
    stop = countdown(25, (l) => ($('#ghud').textContent = `⏱ ${l}s`), test);
    setCleanup(() => stop && stop());
  },
  reaction(g) {
    let round = 0, times = [], state = 'wait', t0 = 0, tm;
    const box = () => $('#rbox');
    const start = () => {
      state = 'wait'; box().style.background = '#c0392b'; box().textContent = 'Wait for green…';
      tm = setTimeout(() => { state = 'go'; t0 = performance.now(); box().style.background = '#27ae60'; box().textContent = 'CLICK!'; }, 1200 + rand(2500));
    };
    $('#garea').innerHTML = '<div class="react-box" id="rbox"></div>';
    box().onclick = () => {
      if (state === 'wait') { clearTimeout(tm); box().textContent = 'Too soon! Restarting…'; state = 'pause'; tm = setTimeout(start, 900); return; }
      if (state !== 'go') return;
      const ms = Math.round(performance.now() - t0); times.push(ms); round++; state = 'pause';
      $('#ghud').textContent = `Round ${round}/5 · ${ms} ms`;
      if (round >= 5) { const avg = Math.round(times.reduce((a, b) => a + b) / times.length); finishGame(g, (550 - avg) / 3, `Average reaction: ${avg} ms.`); }
      else { box().style.background = '#7f8c8d'; box().textContent = `${ms} ms`; tm = setTimeout(start, 900); }
    };
    setCleanup(() => clearTimeout(tm));
    start();
  },
};

/* Speaking */
views.speak = () => {
  const word = D.vocabulary[dayIndex() % D.vocabulary.length];
  const sessions = S.speaking.slice(-5).reverse();
  $('#view').innerHTML = `<div class="header"><div><h1>Speaking Coach</h1><div class="muted">Build clear, confident speech. Recordings stay on this computer.</div></div></div>
  <div class="grid g2">
    <div class="card click" data-act="speakDrill"><div style="font-size:34px">💬</div><h3>Impromptu speaking</h3><div class="muted small">Get a random topic, speak for 60–120s, record yourself and count filler words.</div></div>
    <div class="card click" data-act="twister"><div style="font-size:34px">👅</div><h3>Articulation warm-up</h3><div class="muted small">Tongue twisters to loosen up and sharpen diction.</div></div>
    <div class="card click ${isPremium() ? '' : 'locked'}" data-act="paceCoach">${lockTag(true)}<div style="font-size:34px">⏱️</div><h3>Pace coach</h3><div class="muted small">Read a passage aloud and measure your words per minute.</div></div>
    <div class="card"><div style="font-size:34px">📘</div><h3>Word of the day: ${word[0]}</h3><div class="muted small">${word[1]}</div>
      <input id="vocabUse" placeholder="Use “${word[0]}” in your own sentence…" style="margin-top:10px"><button class="btn sm" data-act="vocabUse" style="margin-top:8px">Save sentence</button></div>
  </div>
  <div class="card section"><h2>Recent sessions</h2>${sessions.length ? `<table style="width:100%;border-collapse:collapse" class="small">
    <tr class="muted"><td>Date</td><td>Type</td><td>Duration</td><td>Fillers</td><td>Score</td></tr>
    ${sessions.map((s) => `<tr><td>${s.d}</td><td>${esc(s.type)}</td><td>${s.dur ? s.dur + 's' : '—'}</td><td>${s.fillers ?? '—'}</td><td><b>${s.score}</b></td></tr>`).join('')}</table>` : '<div class="muted">No sessions yet — try an impromptu drill.</div>'}</div>`;
};
function speakDrill() {
  let prompt = D.speakingPrompts[rand(D.speakingPrompts.length)], dur = 60;
  const setup = () => {
    $('#view').innerHTML = `<div class="row" style="margin-bottom:16px"><button class="btn ghost sm" data-act="go" data-arg="speak">← Speaking</button><b>💬 Impromptu speaking</b><span></span></div>
    <div class="card game-area"><span class="tag">Your topic</span><h2 style="font-size:24px;max-width:600px">${esc(prompt)}</h2>
      <div class="row"><button class="btn ghost sm" id="shuf">🔀 New topic</button>
      <select id="dur" style="width:auto">${[60, 90, 120].map((s) => `<option ${s === dur ? 'selected' : ''} value="${s}">${s} seconds</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="recOn" checked style="width:auto"> Record audio</label></div>
      <p class="muted small">Take 15 seconds to plan: one opening line, two points, one closing line.</p>
      <button class="btn" id="go">Start speaking</button></div>`;
    $('#shuf').onclick = () => { prompt = D.speakingPrompts[rand(D.speakingPrompts.length)]; setup(); };
    $('#dur').onchange = (e) => (dur = +e.target.value);
    $('#go').onclick = () => run($('#recOn').checked);
  };
  const run = async (record) => {
    let fillers = 0, rec = null, chunks = [], stream = null, audioUrl = null, elapsed = 0;
    if (record) {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); rec = new MediaRecorder(stream); rec.ondataavailable = (e) => chunks.push(e.data); rec.start(); }
      catch { toast('Microphone unavailable — continuing without recording'); }
    }
    $('#view').innerHTML = `<div class="row" style="margin-bottom:16px"><span></span><b>${rec ? '<span class="rec-dot"></span> Recording' : 'Speaking'}</b><span></span></div>
      <div class="card game-area"><div class="muted">${esc(prompt)}</div><div class="timer" id="tmr">0:00</div>
      <button class="counter-btn" id="fill">Tap on<br>"um / uh / like"<br><span id="fc" style="font-size:26px">0</span></button>
      <button class="btn red" id="stop">Finish</button></div>`;
    $('#fill').onclick = () => { fillers++; $('#fc').textContent = fillers; };
    const iv = setInterval(() => { elapsed++; $('#tmr').textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`; if (elapsed >= dur) end(); }, 1000);
    const stopMedia = () => { if (rec && rec.state !== 'inactive') rec.stop(); if (stream) stream.getTracks().forEach((t) => t.stop()); };
    setCleanup(() => { clearInterval(iv); stopMedia(); });
    let ended = false;
    const end = () => {
      if (ended) return; ended = true; clearInterval(iv);
      const finish = () => {
        if (chunks.length) audioUrl = URL.createObjectURL(new Blob(chunks, { type: chunks[0].type || 'audio/webm' }));
        const perMin = elapsed ? (fillers / elapsed) * 60 : 0;
        const lengthScore = clamp((elapsed / dur) * 100, 0, 100);
        const base = Math.round(lengthScore * 0.5 + clamp(100 - perMin * 15, 0, 100) * 0.5);
        $('#view').innerHTML = `<div class="card game-area"><h2>Session complete</h2>
          <div class="grid g3" style="width:100%;max-width:560px"><div><div class="stat">${elapsed}s</div><div class="muted small">spoken</div></div>
          <div><div class="stat">${fillers}</div><div class="muted small">fillers (${perMin.toFixed(1)}/min)</div></div><div><div class="stat">${base}</div><div class="muted small">fluency score</div></div></div>
          ${audioUrl ? `<audio controls src="${audioUrl}" style="width:100%;max-width:480px"></audio><div class="muted small">Listen back: notice pace, pauses and tone.</div>` : ''}
          <div><div class="muted small">How clear did you feel? (self-rating)</div><div class="moods" id="selfr" style="justify-content:center;margin-top:6px">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">${'⭐'.repeat(1)}${n}</button>`).join('')}</div></div>
          <p class="muted small">${perMin > 4 ? 'Tip: replace fillers with a short silent pause.' : perMin > 1.5 ? 'Good! Try pausing instead of filling.' : 'Excellent control of filler words.'}</p></div>`;
        document.querySelectorAll('#selfr button').forEach((b) => b.onclick = () => {
          const score = Math.round(base * 0.7 + +b.dataset.n * 6);
          S.speaking.push({ d: today(), type: 'Impromptu', dur: elapsed, fillers, score, prompt }); addSkill('speaking', score);
          award('speak', 15 + Math.round(score / 6), Math.ceil(elapsed / 60) + 1); markDaily('speak');
          $('#selfr').outerHTML = `<p>Saved · speaking score <b>${score}</b></p><div class="row" style="justify-content:center"><button class="btn" data-act="speakDrill">Another topic</button><button class="btn ghost" data-act="go" data-arg="speak">Done</button></div>`;
        });
      };
      if (rec && rec.state !== 'inactive') { rec.onstop = finish; stopMedia(); } else { stopMedia(); finish(); }
    };
    $('#stop').onclick = end;
  };
  setup();
}
function twister() {
  const list = shuffle(D.tongueTwisters).slice(0, 3); let i = 0, reps = 0;
  const draw = () => {
    $('#view').innerHTML = `<div class="row" style="margin-bottom:16px"><button class="btn ghost sm" data-act="go" data-arg="speak">← Speaking</button><b>👅 Articulation ${i + 1}/3</b><span></span></div>
      <div class="card game-area"><h2 style="font-size:28px;max-width:640px">${esc(list[i])}</h2><p class="muted">Say it 3 times: slowly, then normal, then fast — without slurring.</p>
      <div class="dots" style="width:200px">${[0, 1, 2].map((r) => `<i class="${r < reps ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn" id="rep">${reps < 3 ? `Said it (${reps}/3)` : i < 2 ? 'Next twister' : 'Finish'}</button></div>`;
    $('#rep').onclick = () => {
      if (reps < 3) { reps++; return draw(); }
      if (i < 2) { i++; reps = 0; return draw(); }
      S.speaking.push({ d: today(), type: 'Articulation', score: 70 }); addSkill('speaking', 70); award('speak', 15, 3); markDaily('speak');
      $('#view').innerHTML = '<div class="card game-area"><div class="big">👏</div><h2>Warm-up complete</h2><button class="btn" data-act="go" data-arg="speak">Back</button></div>';
    };
  };
  draw();
}
function paceCoach() {
  if (needPremium('Pace coach')) return;
  const text = D.readingPassages[rand(D.readingPassages.length)], words = text.split(/\s+/).length; let t0 = 0;
  $('#view').innerHTML = `<div class="row" style="margin-bottom:16px"><button class="btn ghost sm" data-act="go" data-arg="speak">← Speaking</button><b>⏱️ Pace coach</b><span></span></div>
    <div class="card reader"><p class="muted small">Press start, read aloud naturally, then press stop. Ideal conversational pace is 130–160 words per minute.</p>
    <p style="font-size:19px;line-height:1.8">${esc(text)}</p><div class="row"><span class="muted">${words} words</span><button class="btn" id="pc">Start reading</button></div><div id="pres"></div></div>`;
  $('#pc').onclick = (e) => {
    if (!t0) { t0 = Date.now(); e.target.textContent = 'Stop'; e.target.classList.add('red'); return; }
    const sec = (Date.now() - t0) / 1000, wpm = Math.round(words / (sec / 60));
    const score = Math.round(clamp(100 - Math.abs(145 - wpm) * 1.2, 0, 100));
    S.speaking.push({ d: today(), type: 'Pace', dur: Math.round(sec), score }); addSkill('speaking', score); award('speak', 20, 2); markDaily('speak');
    $('#pres').innerHTML = `<div class="card" style="margin-top:14px;text-align:center"><div class="stat">${wpm} WPM</div><div class="muted">${wpm < 120 ? 'A bit slow — add energy.' : wpm > 170 ? 'Too fast — add pauses.' : 'Great pace!'} · score ${score}</div></div>`;
    e.target.disabled = true;
  };
}

/* Grow: habits, mood journal, growth tree */
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function growthPoints() {
  return S.habits.reduce((n, h) => n + Object.keys(h.log).length, 0) + S.journal.length * 2 + Math.floor(S.xp / 40);
}
function treeSVG(points) {
  const stage = points < 5 ? 0 : points < 15 ? 1 : points < 35 ? 2 : points < 70 ? 3 : points < 120 ? 4 : 5;
  const h = [20, 50, 80, 105, 125, 140][stage], leaves = [0, 2, 4, 7, 10, 14][stage];
  const crown = Array.from({ length: leaves }, (_, i) => {
    const a = (i / leaves) * Math.PI * 2, r = 20 + stage * 9;
    return `<circle cx="${110 + Math.cos(a) * r * 0.9}" cy="${190 - h + Math.sin(a) * r * 0.6}" r="${14 + stage * 3}" fill="${['#2fb48a', '#5bbf5f', '#27ae60'][i % 3]}" opacity=".9"/>`;
  }).join('');
  const fruit = stage >= 5 ? [0, 1, 2, 3].map((i) => `<circle cx="${80 + i * 20}" cy="${190 - h + (i % 2) * 18}" r="5" fill="#e74c3c"/>`).join('') : '';
  return `<svg viewBox="0 0 220 230" width="230" height="240"><ellipse cx="110" cy="205" rx="80" ry="12" fill="#8d6e63" opacity=".35"/>
    <rect x="${106 - stage}" y="${200 - h}" width="${8 + stage * 2}" height="${h}" rx="4" fill="#8d6e63"/>
    ${stage === 0 ? '<path d="M110 182 q-14 -10 -18 -2 q10 6 18 2 M110 182 q14 -12 18 -3 q-10 7 -18 3" fill="#5bbf5f"/>' : ''}
    ${crown}${fruit}</svg><div style="text-align:center"><b>${['Seed', 'Sprout', 'Sapling', 'Young tree', 'Strong tree', 'Blooming tree'][stage]}</b><div class="muted small">${points} growth points</div></div>`;
}
views.grow = () => {
  const days = [...Array(7)].map((_, i) => addDays(i - 6));
  const todayEntry = S.journal.find((j) => j.d === today());
  $('#view').innerHTML = `<div class="header"><div><h1>Grow</h1><div class="muted">Habits, reflection and a tree that grows with you.</div></div></div>
  <div class="grid g3">
    <div class="card tree-wrap" style="flex-direction:column;align-items:center">${treeSVG(growthPoints())}</div>
    <div class="card" style="grid-column:span 2"><div class="row"><h2 style="margin:0">Habits</h2><span class="muted small">${isPremium() ? 'Unlimited' : `${S.habits.length}/3 free`}</span></div>
      ${S.habits.map((h) => `<div class="habit"><span style="font-size:22px">${h.icon}</span><div style="flex:1"><b>${esc(h.name)}</b><div class="muted small">🔥 ${habitStreak(h)} day streak</div></div>
        <div class="days">${days.map((d) => `<span class="${h.log[dkey(d)] ? 'on' : ''}">${'SMTWTFS'[d.getDay()]}</span>`).join('')}</div>
        <button class="btn sm ${h.log[today()] ? 'green' : 'ghost'}" data-act="toggleHabit" data-arg="${h.id}">${h.log[today()] ? '✓ Done' : 'Check in'}</button>
        <button class="btn sm ghost" data-act="delHabit" data-arg="${h.id}" title="Delete">✕</button></div>`).join('')}
      <div class="row" style="margin-top:12px"><input id="hIcon" value="⭐" style="width:60px;text-align:center"><input id="hName" placeholder="New habit, e.g. Meditate 5 minutes"><button class="btn" data-act="addHabit">Add</button></div></div>
  </div>
  <div class="grid g2 section">
    <div class="card"><h2>Daily reflection</h2>
      <div class="muted small">How are you feeling?</div><div class="moods" id="moods" style="margin:8px 0 12px">${MOODS.map((m, i) => `<button data-m="${i}" class="${todayEntry && todayEntry.mood === i ? 'sel' : ''}">${m}</button>`).join('')}</div>
      <textarea id="jText" placeholder="What went well today? What did you learn?">${todayEntry ? esc(todayEntry.text) : ''}</textarea>
      <input id="jGrat" placeholder="One thing I'm grateful for…" style="margin-top:8px" value="${todayEntry ? esc(todayEntry.grat || '') : ''}">
      <button class="btn" data-act="saveJournal" style="margin-top:10px">${todayEntry ? 'Update entry' : 'Save entry'}</button></div>
    <div class="card"><h2>Mood over time</h2>${moodChart()}<h3 style="margin-top:14px">Past entries</h3>
      ${S.journal.slice(-4).reverse().map((j) => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><b>${MOODS[j.mood]} ${j.d}</b><div class="muted small">${esc(j.text).slice(0, 140) || '—'}</div></div>`).join('') || '<div class="muted">No entries yet.</div>'}</div>
  </div>`;
  let mood = todayEntry ? todayEntry.mood : null;
  document.querySelectorAll('#moods button').forEach((b) => b.onclick = () => { mood = +b.dataset.m; document.querySelectorAll('#moods button').forEach((x) => x.classList.toggle('sel', x === b)); });
  actions.saveJournal = () => {
    if (mood === null) return toast('Pick a mood first');
    const entry = { d: today(), mood, text: $('#jText').value.trim(), grat: $('#jGrat').value.trim() };
    const i = S.journal.findIndex((j) => j.d === today());
    if (i >= 0) { S.journal[i] = entry; save(); toast('Entry updated'); } else { S.journal.push(entry); award('journal', 15, 3); }
    markDaily('journal'); views.grow();
  };
};
function habitStreak(h) { let n = 0, d = new Date(); if (!h.log[dkey(d)]) d = addDays(-1); while (h.log[dkey(d)]) { n++; d = addDays(-1, d); } return n; }
function moodChart() {
  const pts = S.journal.slice(-14); if (pts.length < 2) return '<div class="muted small">Log at least two days to see your trend.</div>';
  const W = 460, H = 120, x = (i) => 20 + (i / (pts.length - 1)) * (W - 40), y = (m) => H - 15 - (m / 4) * (H - 30);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${pts.map((p, i) => `${x(i)},${y(p.mood)}`).join(' ')}"/>
    ${pts.map((p, i) => `<text x="${x(i)}" y="${y(p.mood) - 6}" text-anchor="middle" style="font-size:14px">${MOODS[p.mood]}</text>`).join('')}</svg>`;
}

/* Progress */
views.progress = () => {
  const totalMin = Object.values(S.activity).reduce((n, a) => n + a.minutes, 0);
  const booksDone = Object.values(S.books).filter((b) => b.done).length;
  const games = GAMES.reduce((n, g) => n + (S.counts[g.id] || 0), 0);
  $('#view').innerHTML = `<div class="header"><div><h1>Progress</h1><div class="muted">Every session counts. Here's your journey.</div></div></div>
  <div class="grid g4">
    <div class="card"><div class="muted small">Level</div><div class="stat">${levelInfo().lvl}</div><div class="muted small">${S.xp} total XP</div></div>
    <div class="card"><div class="muted small">Current streak</div><div class="stat">🔥 ${currentStreak()}</div><div class="muted small">Best: ${S.streak.best} days</div></div>
    <div class="card"><div class="muted small">Time invested</div><div class="stat">${totalMin}<span class="small"> min</span></div><div class="muted small">${Object.keys(S.activity).length} active days</div></div>
    <div class="card"><div class="muted small">Completed</div><div class="stat">${booksDone} 📚 ${games} 🧠</div><div class="muted small">${S.speaking.length} speaking drills</div></div>
  </div>
  <div class="grid g2 section">
    <div class="card"><h2>Activity — last 20 weeks</h2>${heatmap()}<div class="row small muted" style="justify-content:flex-end;margin-top:8px">Less <span class="heat" style="display:flex;gap:3px"><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></span> More</div></div>
    <div class="card"><h2>XP this week</h2>${weekChart()}</div>
  </div>
  <div class="grid g2 section">
    <div class="card"><h2>Skills</h2>${skillBars()}</div>
    <div class="card">${lockTag(true)}<h2>Skill trends & insights</h2>${isPremium() ? trendChart() + insights() : `<div class="muted" style="filter:blur(3px);user-select:none">${trendChart()}</div><button class="btn gold" data-act="go" data-arg="premium">Unlock advanced analytics</button>`}</div>
  </div>
  <div class="card section"><h2>Achievements</h2><div class="grid g4">${D.achievements.map(([id, n, desc, em]) =>
    `<div class="badge ${S.achievements[id] ? '' : 'off'}"><div class="em">${em}</div><b>${n}</b><div class="muted small">${desc}</div></div>`).join('')}</div></div>`;
};
function heatmap() {
  const start = addDays(-(20 * 7 - 1) - new Date().getDay()); let cells = '';
  for (let i = 0; i < 20 * 7 + new Date().getDay() + 1; i++) {
    const k = dkey(addDays(i, start)), xp = (S.activity[k] || {}).xp || 0;
    cells += `<i title="${k}: ${xp} XP" class="${xp ? 'l' + (xp < 20 ? 1 : xp < 50 ? 2 : xp < 100 ? 3 : 4) : ''}"></i>`;
  }
  return `<div class="heat">${cells}</div>`;
}
function weekChart() {
  const days = [...Array(7)].map((_, i) => addDays(i - 6)), vals = days.map((d) => (S.activity[dkey(d)] || {}).xp || 0), max = Math.max(S.profile.dailyGoal, ...vals);
  const W = 420, H = 170;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <line x1="0" x2="${W}" y1="${140 - (S.profile.dailyGoal / max) * 120}" y2="${140 - (S.profile.dailyGoal / max) * 120}" stroke="var(--warn)" stroke-dasharray="4 4"/>
    ${vals.map((v, i) => `<rect x="${15 + i * 58}" y="${140 - (v / max) * 120}" width="38" height="${(v / max) * 120}" rx="6" fill="var(--accent)"/>
      <text x="${34 + i * 58}" y="158" text-anchor="middle">${days[i].toLocaleDateString(undefined, { weekday: 'short' })}</text>
      <text x="${34 + i * 58}" y="${134 - (v / max) * 120}" text-anchor="middle">${v || ''}</text>`).join('')}</svg>`;
}
function trendChart() {
  const colors = { memory: '#6c5ce7', focus: '#00b894', math: '#e17055', speaking: '#fdcb6e', knowledge: '#0984e3' };
  const W = 460, H = 160;
  const lines = Object.entries(colors).map(([k, c]) => {
    const arr = S.skills[k].slice(-12); if (arr.length < 2) return '';
    return `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${arr.map((p, i) => `${20 + (i / (arr.length - 1)) * (W - 40)},${H - 20 - (p.s / 100) * (H - 40)}`).join(' ')}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${lines || `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Play a few games to see trends</text>`}</svg>
    <div class="row small" style="justify-content:flex-start;flex-wrap:wrap">${Object.entries(colors).map(([k, c]) => `<span><span style="color:${c}">●</span> ${k}</span>`).join('')}</div>`;
}
function insights() {
  const byDow = Array(7).fill(0); Object.entries(S.activity).forEach(([k, a]) => (byDow[new Date(k + 'T12:00').getDay()] += a.xp));
  const best = byDow.indexOf(Math.max(...byDow));
  const sk = Object.keys(S.skills).map((k) => [k, skillLevel(k)]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  const fillers = S.speaking.filter((s) => s.fillers != null);
  return `<ul class="feature-list small" style="margin-top:10px">
    <li>📅 Your most productive day is <b>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][best]}</b>.</li>
    ${sk.length ? `<li>💪 Strongest skill: <b>${sk[0][0]}</b> (${sk[0][1]}). Focus area: <b>${sk[sk.length - 1][0]}</b> (${sk[sk.length - 1][1]}).</li>` : ''}
    ${fillers.length >= 2 ? `<li>🎤 Filler words: first session ${fillers[0].fillers}, latest ${fillers[fillers.length - 1].fillers}.</li>` : ''}
    <li>🃏 ${Object.values(S.cards).filter((c) => c.box >= 3).length} ideas are now in long-term memory.</li></ul>`;
}

/* Premium */
views.premium = () => {
  const p = S.premium, trialLeft = Math.ceil((p.trialEnds - Date.now()) / 864e5);
  const feats = [['Book summaries', '3 titles', 'Full library'], ['Brain games', '3 games', 'All 5 games'], ['Speaking coach', 'Impromptu + warm-ups', '+ Pace coach (WPM)'],
    ['Habits', 'Up to 3', 'Unlimited'], ['Analytics', 'Basic stats', 'Skill trends & insights'], ['Offline use', '✓', '✓'], ['Spaced-repetition review', '✓', '✓']];
  $('#view').innerHTML = `<div class="header"><div><h1>👑 Lumen Premium</h1><div class="muted">Unlock your full potential — works 100% offline.</div></div></div>
  ${isPremium() ? `<div class="card hero"><h2>You're Premium ✨</h2><div class="muted">${p.active ? `Plan: ${esc(p.plan)} · License ${esc(p.key || '')}` : `Free trial: ${trialLeft} day(s) left`}</div></div>` : ''}
  <div class="grid g3 section">
    ${[['Monthly', '$9.99', '/month', ''], ['Yearly', '$59.99', '/year', 'Save 50%'], ['Lifetime', '$149', 'one-time', '']].map(([n, pr, per, tag]) =>
      `<div class="card plan ${tag ? 'best' : ''}">${tag ? `<span class="lock">${tag}</span>` : ''}<h3>${n}</h3><div class="price">${pr}</div><div class="muted small">${per}</div>
      <button class="btn ${tag ? 'gold' : ''}" style="margin-top:12px;width:100%" data-act="buy" data-arg="${n}">Choose ${n}</button></div>`).join('')}
  </div>
  <div class="grid g2 section">
    <div class="card"><h2>Free vs Premium</h2><table class="small" style="width:100%;border-collapse:collapse">
      <tr class="muted"><td></td><td>Free</td><td><b>Premium</b></td></tr>${feats.map(([f, a, b]) => `<tr style="border-top:1px solid var(--border)"><td style="padding:7px 0">${f}</td><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</table></div>
    <div class="card"><h2>Activate</h2>
      ${!p.trialEnds && !p.active ? '<button class="btn gold" data-act="trial" style="width:100%">Start 7-day free trial</button><div class="muted small" style="margin:8px 0 16px;text-align:center">No account or internet needed</div>' : ''}
      <div class="muted small">Have a license key?</div><div class="row" style="margin-top:6px"><input id="lic" placeholder="LUMEN-XXXX-XXXX-XXXX"><button class="btn" data-act="activate">Activate</button></div>
      ${p.active ? '<button class="btn ghost sm" data-act="deactivate" style="margin-top:12px">Deactivate license</button>' : ''}</div>
  </div>`;
};

/* Settings */
views.settings = () => {
  $('#view').innerHTML = `<div class="header"><div><h1>Settings</h1><div class="muted">Your data is stored only on this computer.</div></div></div>
  <div class="grid g2"><div class="card"><h2>Profile</h2>
    <label class="small muted">Name</label><input id="sName" value="${esc(S.profile.name)}">
    <label class="small muted" style="display:block;margin-top:10px">Daily XP goal</label>
    <select id="sGoal">${[30, 50, 80, 120].map((g) => `<option ${g === S.profile.dailyGoal ? 'selected' : ''} value="${g}">${g} XP · ${{ 30: 'Casual', 50: 'Regular', 80: 'Serious', 120: 'Intense' }[g]}</option>`).join('')}</select>
    <label class="small muted" style="display:block;margin-top:10px">Theme</label>
    <select id="sTheme"><option value="light">Light</option><option value="dark" ${S.profile.theme === 'dark' ? 'selected' : ''}>Dark</option></select>
    <button class="btn" data-act="saveSettings" style="margin-top:14px">Save</button></div>
  <div class="card"><h2>Data</h2><p class="muted small">Back up or move your progress between computers.</p>
    <div class="row" style="justify-content:flex-start"><button class="btn ghost" data-act="exportData">Export backup</button><button class="btn ghost" data-act="importData">Import backup</button></div>
    <h3 style="margin-top:20px">Danger zone</h3><button class="btn red sm" data-act="resetAll">Reset all progress</button></div></div>`;
};

/* Onboarding */
function onboarding() {
  const goals = ['📚 Read more', '🧠 Sharpen memory', '🎤 Speak confidently', '🌱 Build habits', '🎯 Improve focus'];
  modal(`<h2>Welcome to Lumen ✦</h2><p class="muted">Your offline space to learn, train your brain, speak better and grow every day.</p>
    <label class="small muted">What should we call you?</label><input id="obName" placeholder="Your name">
    <div class="small muted" style="margin-top:14px">What do you want to work on?</div>
    <div class="choices" id="obGoals" style="justify-content:flex-start;margin-top:8px">${goals.map((g) => `<button class="btn ghost sm">${g}</button>`).join('')}</div>
    <div class="small muted" style="margin-top:14px">Daily commitment</div>
    <select id="obGoal"><option value="30">5 min/day · Casual</option><option value="50" selected>10 min/day · Regular</option><option value="80">15 min/day · Serious</option><option value="120">20+ min/day · Intense</option></select>
    <button class="btn" id="obGo" style="width:100%;margin-top:18px">Start my journey</button>`);
  document.querySelectorAll('#obGoals button').forEach((b) => b.onclick = () => b.classList.toggle('sel'));
  $('#obGo').onclick = () => {
    S.profile.name = $('#obName').value.trim() || 'Friend';
    S.profile.goals = [...document.querySelectorAll('#obGoals .sel')].map((b) => b.textContent);
    S.profile.dailyGoal = +$('#obGoal').value; save(); closeModal(); go('today');
  };
}

/* ---------- Actions (event delegation; CSP forbids inline handlers) ---------- */
const actions = {
  go, openBook, playGame, speakDrill, twister, paceCoach, closeModal,
  libFilter: (c) => { libFilter = c; views.library(); },
  saveCard: (k) => { if (S.cards[k]) delete S.cards[k]; else S.cards[k] = { box: 0, due: today() }; save(); const [b] = k.split(':'); openBook(b); },
  vocabUse: () => { const v = $('#vocabUse').value.trim(); if (v.split(/\s+/).length < 4) return toast('Write a full sentence'); addSkill('speaking', 60); award('vocab', 8, 1); $('#vocabUse').value = ''; },
  toggleHabit: (id) => {
    const h = S.habits.find((x) => x.id === id);
    if (h.log[today()]) { delete h.log[today()]; save(); } else { h.log[today()] = true; award('habit', 5, 1); }
    views.grow();
  },
  addHabit: () => {
    const name = $('#hName').value.trim(); if (!name) return;
    if (S.habits.length >= 3 && needPremium('Unlimited habits')) return;
    S.habits.push({ id: 'h' + Date.now(), name, icon: $('#hIcon').value.trim() || '⭐', log: {} }); save(); views.grow();
  },
  delHabit: (id) => { if (!confirm('Delete this habit and its history?')) return; S.habits = S.habits.filter((h) => h.id !== id); save(); views.grow(); },
  trial: () => { S.premium.trialEnds = Date.now() + 7 * 864e5; save(); toast('👑 Trial started — enjoy Premium!'); go('premium'); },
  buy: (plan) => modal(`<h2>${esc(plan)} plan</h2><p class="muted">Purchases are completed on the Lumen website. You'll receive a license key you can activate here — offline, forever on this device.</p>
    <p class="small muted">(Payment checkout isn't connected in this build. Use the key generator in <code>tools/genkey.js</code> to create test keys.)</p>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Close</button></div>`),
  activate: () => {
    const k = $('#lic').value.trim().toUpperCase();
    if (!validKey(k)) return toast('Invalid license key');
    Object.assign(S.premium, { active: true, key: k, plan: 'Licensed' }); save(); toast('👑 Premium activated!'); go('premium');
  },
  deactivate: () => { Object.assign(S.premium, { active: false, key: null, plan: null }); save(); go('premium'); },
  saveSettings: () => { S.profile.name = $('#sName').value.trim(); S.profile.dailyGoal = +$('#sGoal').value; S.profile.theme = $('#sTheme').value; save(); renderSide(); toast('Saved'); },
  exportData: async () => {
    if (hasBridge) { if (await window.lumenStore.exportData(S)) toast('Backup saved'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = 'lumen-backup.json'; a.click();
  },
  importData: async () => {
    const apply = (d) => { if (!d || !d.profile) return toast('Not a Lumen backup'); S = Object.assign(defaults(), d); save(); renderSide(); go('today'); toast('Backup restored'); };
    if (hasBridge) return apply(await window.lumenStore.importData());
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => { try { apply(JSON.parse(await inp.files[0].text())); } catch { toast('Could not read file'); } }; inp.click();
  },
  resetAll: () => { if (!confirm('Erase ALL progress? This cannot be undone.')) return; S = defaults(); save(); renderSide(); onboarding(); },
};
document.addEventListener('click', (e) => {
  const nav = e.target.closest('#nav button'); if (nav) return go(nav.dataset.view);
  const el = e.target.closest('[data-act]'); if (el && actions[el.dataset.act]) actions[el.dataset.act](el.dataset.arg, el);
  if (e.target.id === 'modal') closeModal();
});

/* ---------- Boot ---------- */
load().then(() => {
  renderSide();
  let last = 'today';
  try { last = localStorage.getItem('lumen:screen') || 'today'; } catch {}
  if (!S.profile.name) { go('today'); onboarding(); }
  else if (last.startsWith('book:') && D.books.some((b) => b.id === last.slice(5))) { go('library'); openBook(last.slice(5)); }
  else go(views[last] ? last : 'today');
});
})();

/* ---------- PWA: offline cache + install button ---------- */
(() => {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
  let deferred;
  const btn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.classList.remove('hidden'); });
  btn.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; btn.classList.add('hidden'); });
  const net = () => { document.getElementById('netStatus').textContent = navigator.onLine ? '● Offline-ready' : '● Offline mode'; };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
})();
