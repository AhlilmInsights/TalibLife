/* Muraja'ah: spaced review of memorized pages and mutūn sections. */
(function () {
  'use strict';
  const HF = window.HF;
  const $ = HF.$;
  const R = () => HF.state.review;
  const INTERVALS = [1, 2, 4, 7, 14, 30]; // days until next review, by strength 0–5

  HF.addToReview = (key, strength = 1, meta = null) => {
    const items = R().items;
    if (!items[key]) items[key] = { strength, due: HF.addDays(HF.todayKey(), INTERVALS[strength]), last: HF.todayKey(), reps: 0, lapses: 0, ...(meta ? { meta } : {}) };
    HF.save();
  };
  function dueItems() {
    const today = HF.todayKey();
    return Object.entries(R().items)
      .filter(([, v]) => v.due <= today)
      .map(([k, v]) => ({ key: k, ...v, overdue: HF.daysBetween(v.due, today) }))
      .sort((a, b) => b.overdue - a.overdue || a.strength - b.strength || a.key.localeCompare(b.key));
  }
  HF.dueCount = () => dueItems().length;

  function itemTitle(key) {
    if (key.startsWith('q:')) {
      const p = +key.slice(2); const d = HF.quran.data;
      if (d && d.pages[p - 1]) {
        const ay = d.pages[p - 1].filter((l) => l[0] === 2);
        const a = ay[0], z = ay[ay.length - 1];
        const s1 = d.surahs[a[2] - 1], s2 = d.surahs[z[4] - 1];
        return { t: `Page ${p}`, sub: a[2] === z[4] ? `${s1.en} ${a[3]}–${z[5]}` : `${s1.en} ${a[3]} – ${s2.en} ${z[5]}` };
      }
      return { t: `Page ${p}`, sub: '' };
    }
    const [, book, pi] = key.split(':');
    const info = (HF.books.index || []).find((b) => b.id === book);
    const it = R().items[key] || {};
    const printed = (it.meta && it.meta.printed) || (+pi + 1);
    return { t: info ? info.title : book, sub: `page ${printed}`, ar: true };
  }
  const bars = (n) => `<span class="strength" aria-label="strength ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

  let showAll = false;
  function renderReview() {
    const s = HF.state; const due = dueItems();
    $('reviewDot').hidden = !due.length;
    // seed card for pages already memorized before using the app
    const seed = $('seedCard');
    const backFrom = Math.ceil(605 - s.backPages), frontTo = Math.floor(1 + s.frontPages);
    if (!R().seeded && (s.backPages >= 1 || s.frontPages >= 1)) {
      const parts = [];
      if (s.backPages >= 1) parts.push(`pages ${backFrom}–604 from the back`);
      if (s.frontPages >= 1) parts.push(`pages 2–${frontTo} from the front`);
      seed.innerHTML = `<div class="notice"><p>You've logged ${parts.join(' and ')}. Add them to your review cycle so they come back on schedule?</p>
        <div class="row" style="margin-top:8px"><button class="btn small primary" data-act="seedReview">Add them</button><button class="btn small ghost" data-act="seedSkip">Not now</button></div></div>`;
    } else seed.innerHTML = '';

    $('dueCount').textContent = due.length ? `${due.length} due` : '';
    const list = showAll ? due : due.slice(0, R().perDay);
    $('dueList').innerHTML = list.length ? list.map((it) => {
      const ti = itemTitle(it.key);
      return `<div class="due-item"><div><div class="t ${ti.ar ? 'ar' : ''}" ${ti.ar ? 'style="font-size:18px"' : ''}>${HF.esc(ti.t)}</div>
        <div class="faint">${HF.esc(ti.sub)} · ${bars(+it.strength || 0)}${it.overdue > 0 ? ` · ${it.overdue} day${it.overdue > 1 ? 's' : ''} late` : ''}</div></div>
        <div class="rate"><button class="btn small" data-act="openItem" data-key="${HF.esc(it.key)}">Open</button>
          <button class="btn small warn" data-act="rate" data-key="${HF.esc(it.key)}" data-g="0" title="Comes back tomorrow">Weak</button>
          <button class="btn small" data-act="rate" data-key="${HF.esc(it.key)}" data-g="1">OK</button>
          <button class="btn small good" data-act="rate" data-key="${HF.esc(it.key)}" data-g="2">Strong</button></div></div>`;
    }).join('') + (due.length > list.length ? `<div><button class="btn small ghost" data-act="showAllDue">Show all ${due.length}</button></div>` : '')
      : `<p class="faint" style="padding:8px 0">${Object.keys(R().items).length ? 'Nothing due — you are up to date.' : 'Pages and sections you complete in the Studio appear here. You can also add pages you already know below.'}</p>`;

    // heat map of 604 pages, one row per juzʾ (pages 2–21 = juzʾ 1, then 20 pages each)
    const items = R().items; const today = HF.todayKey();
    let known = 0;
    const rows = [];
    for (let j = 1; j <= 30; j++) {
      const from = j === 1 ? 1 : 2 + (j - 1) * 20, to = j === 30 ? 604 : 1 + j * 20;
      const cells = [];
      for (let p = from; p <= to; p++) {
        const it = items['q:' + p];
        if (it) known++;
        cells.push(`<i class="${it ? 's' + Math.max(1, it.strength) : ''} ${it && it.due <= today ? 'due' : ''}" title="Page ${p}${it ? ` · strength ${it.strength}` : ''}" data-act="openPage" data-p="${p}" role="button" aria-label="Page ${p}"></i>`);
      }
      rows.push(`<div class="heat-row"><span class="jz num">${j}</span><div class="heat-cells">${cells.join('')}</div></div>`);
    }
    $('heat').innerHTML = rows.join('');
    $('heatLegend').textContent = `${known} of 604 pages in review · rows are juzʾ 1–30`;

    // dual front + mutūn
    $('backTxt').textContent = `${s.backPages} / 98`;
    $('backBar').style.width = Math.min(100, (s.backPages / 98) * 100) + '%';
    $('frontTxt').textContent = `${s.frontPages} / 505`;
    $('frontBar').style.width = Math.min(100, (s.frontPages / 505) * 100) + '%';
    const idx = HF.books.index || [];
    const total = idx.reduce((a, b) => a + (b.lines || 0) + (s.studio.masail[b.id] ? (b.masail || 0) : 0), 0);
    const done = Object.values(s.studio.mprog).reduce((a, book) => a + Object.values(book).reduce((x, pg) => x + Object.entries(pg).filter(([k, v]) => k !== '__done' && v && v.m).length, 0), 0);
    $('mutunTxt').textContent = total ? `${done} / ${total} lines` : `${done} lines`;
    $('mutunProgBar').style.width = total ? (done / total) * 100 + '%' : '0';
    // load titles we need, then refresh once
    if (!HF.books.index) HF.loadBookIndex().then(renderReview).catch(() => {});
    if (!HF.quran.data && list.some((i) => i.key.startsWith('q:'))) HF.loadQuran(s.studio.layout).then(renderReview).catch(() => {});
  }
  HF.renders.review = renderReview;

  HF.act.rate = (el) => {
    const it = R().items[el.dataset.key]; if (!it) return;
    const g = +el.dataset.g;
    if (g === 0) { it.strength = Math.max(0, it.strength - 1); it.lapses++; it.due = HF.addDays(HF.todayKey(), 1); }
    else { if (g === 2) it.strength = Math.min(5, it.strength + 1); else it.strength = Math.max(1, it.strength); it.due = HF.addDays(HF.todayKey(), INTERVALS[it.strength]); }
    it.last = HF.todayKey(); it.reps++;
    // reviewing counts toward today's muraja'ah habit
    HF.setDone('quran-murajaah', HF.todayKey(), true);
    HF.chime(g === 0 ? 392 : 587.33, g === 0 ? 370 : 880, 0.05);
    HF.save(); HF.render('review', 'habits', 'today');
    HF.toast(g === 0 ? 'Back tomorrow.' : `Next review in ${INTERVALS[it.strength]} day${INTERVALS[it.strength] > 1 ? 's' : ''}.`);
  };
  HF.act.openItem = (el) => {
    const k = el.dataset.key;
    if (k.startsWith('q:')) HF.goPage(+k.slice(2));
    else { const [, book, pi] = k.split(':'); HF.goMutunPage(book, +pi); }
    HF.showTab('studio');
  };
  HF.act.openPage = (el) => { HF.goPage(+el.dataset.p); HF.showTab('studio'); };
  HF.act.showAllDue = () => { showAll = true; renderReview(); };
  HF.act.seedReview = () => {
    const s = HF.state;
    const add = (from, to) => { for (let p = from; p <= to; p++) HF.addToReview('q:' + p, 2); };
    if (s.backPages >= 1) add(Math.ceil(605 - s.backPages), 604);
    if (s.frontPages >= 1) add(2, Math.floor(1 + s.frontPages));
    // spread the first reviews over the coming days instead of all at once
    const keys = Object.keys(R().items).filter((k) => k.startsWith('q:')).sort((a, b) => +b.slice(2) - +a.slice(2));
    keys.forEach((k, i) => { R().items[k].due = HF.addDays(HF.todayKey(), Math.floor(i / R().perDay)); });
    R().seeded = true; HF.save(); renderReview(); HF.toast(`${keys.length} pages added, spread over the coming days.`);
  };
  HF.act.seedSkip = () => { R().seeded = true; HF.save(); renderReview(); };
  HF.act.addRange = () => {
    let a = parseInt($('addFrom').value, 10), b = parseInt($('addTo').value, 10);
    if (!a) { HF.toast('Enter the first page.'); return; }
    if (!b) b = a;
    if (a > b) [a, b] = [b, a];
    a = HF.clamp(a, 1, 604); b = HF.clamp(b, 1, 604);
    let n = 0; for (let p = a; p <= b; p++) if (!R().items['q:' + p]) { HF.addToReview('q:' + p, 2); n++; }
    HF.save(); renderReview(); HF.toast(n ? `Added ${n} page${n > 1 ? 's' : ''}.` : 'Those pages are already in your review.');
  };

  // ---------------------------------------------------------------- session log (check-in)
  HF.act.openCheckin = () => { renderCheckins(); HF.openSheet('checkin'); };
  function renderCheckins() {
    const list = HF.state.checkinHistory.slice(0, 30);
    $('ciList').innerHTML = list.length ? list.map((c) => `<div class="spread"><div><b>${HF.esc(c.date)}</b>${c.pages ? ` · +${+c.pages || 0} p (${HF.esc(c.track || '')})` : ''}
      ${c.review ? `<div class="faint">Reviewed: ${HF.esc(c.review)}</div>` : ''}${c.fresh ? `<div class="faint">Memorized: ${HF.esc(c.fresh)}</div>` : ''}</div>
      <button class="btn small ghost" data-act="delCheckin" data-id="${HF.esc(c.id)}" aria-label="Delete">✕</button></div>`).join('') : '<p class="faint">No sessions logged yet.</p>';
  }
  HF.act.saveCheckin = () => {
    const s = HF.state; const key = HF.todayKey();
    const review = $('ciReview').value.trim(), fresh = $('ciNew').value.trim();
    const track = $('ciTrack').value; const pages = Math.max(0, parseFloat($('ciPages').value) || 0);
    if (!review && !fresh && !pages) { HF.toast('Write what you reviewed or memorized first.'); return; }
    if (pages && track === 'back') s.backPages = Math.min(98, s.backPages + pages);
    if (pages && track === 'front') s.frontPages = Math.min(505, s.frontPages + pages);
    s.checkinHistory.unshift({ id: 'c' + Date.now(), date: key, review, fresh, track, pages: track === 'none' ? 0 : pages });
    s.checkinHistory = s.checkinHistory.slice(0, 400);
    if (review) HF.setDone('quran-murajaah', key, true);
    if (fresh || pages) HF.setDone('quran-hifdh', key, true);
    $('ciReview').value = ''; $('ciNew').value = ''; $('ciPages').value = '';
    HF.save(); renderCheckins(); HF.render('review', 'habits', 'today'); HF.toast('Session saved.');
  };
  HF.act.delCheckin = (el) => { HF.state.checkinHistory = HF.state.checkinHistory.filter((c) => c.id !== el.dataset.id); HF.save(); renderCheckins(); };
})();
