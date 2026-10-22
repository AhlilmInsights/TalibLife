/* Studio: Muṣḥaf page / matn page (Shaykh al-Qāsim's edition), line-by-line counter, audio, record & compare. */
(function () {
  'use strict';
  const HF = window.HF;
  const $ = HF.$;
  const st = () => HF.state.studio;

  // ================================================================ data
  HF.quran = { layout: null, data: null, loading: null, ayahStart: [] };
  HF.loadQuran = (layout) => {
    if (HF.quran.layout === layout && HF.quran.data) return Promise.resolve(HF.quran.data);
    if (HF.quran.loading && HF.quran.loadingLayout === layout) return HF.quran.loading;
    HF.quran.loadingLayout = layout;
    const pr = fetch(`./data/quran-${layout}.json`).then((r) => {
      if (!r.ok) throw new Error('Could not load the Muṣḥaf (' + r.status + ')');
      return r.json();
    }).then((d) => {
      HF.quran.data = d; HF.quran.layout = layout;
      let acc = 0; HF.quran.ayahStart = [0];
      d.surahs.forEach((s) => { HF.quran.ayahStart.push(acc); acc += s.ayahs; });
      return d;
    }).finally(() => { if (HF.quran.loading === pr) HF.quran.loading = null; });
    HF.quran.loading = pr;
    return pr;
  };
  HF.globalAyah = (s, a) => HF.quran.ayahStart[s] + a;
  HF.LAYOUTS = { '1441': '1440–1441 print', '1421': '1421 print', '1405': '1405 print' };

  HF.books = { index: null, cache: {}, loading: {} };
  let indexP = null;
  HF.loadBookIndex = () => {
    if (HF.books.index) return Promise.resolve(HF.books.index);
    if (!indexP) indexP = fetch('./data/mutun/index.json').then((r) => { if (!r.ok) throw new Error('index'); return r.json(); })
      .then((x) => (HF.books.index = x)).catch((e) => { indexP = null; throw e; });
    return indexP;
  };
  HF.loadBook = (id) => {
    if (id === 'mine') return Promise.resolve(myTextsBook());
    if (HF.books.cache[id]) return Promise.resolve(HF.books.cache[id]);
    if (!HF.books.loading[id]) {
      HF.books.loading[id] = fetch(`./data/mutun/${id}.json`).then((r) => { if (!r.ok) throw new Error('Could not load the book'); return r.json(); })
        .then((b) => { prepBook(b); HF.books.cache[id] = b; return b; })
        .finally(() => { delete HF.books.loading[id]; });
    }
    return HF.books.loading[id];
  };
  // book-wide crop (same width on every page, like a printed column) + a flat timeline for follow-along
  function prepBook(b) {
    let x0 = 1e9, x1 = 0;
    b.pages.forEach((pg) => pg.l.forEach((r) => { if (r[4] !== 'x') { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[2]); } }));
    b.crop = [Math.max(0, x0 - 8), Math.min((b.pdf && b.pdf.w) || x1 + 8, x1 + 8)];
    b.timeline = [];
    b.pages.forEach((pg, pi) => pg.l.forEach((r, li) => { if (r.length > 6) b.timeline.push([r[5], r[6], pi, li]); }));
    b.timeline.sort((a, c) => a[0] - c[0]);
    b.hasTiming = b.timeline.length > 0;
  }
  function myTextsBook() {
    const pages = st().myTexts.map((t, i) => {
      const lines = splitLines(t.text);
      return { p: i + 1, l: lines.map(() => [0, 0, 0, 0, 't']), t: lines, title: t.title };
    });
    const b = { id: 'mine', title: 'نصوصي', titleEn: 'My texts', author: '', pages, sections: pages.map((p, i) => ({ t: p.title || `Text ${i + 1}`, p: i, l: 0 })), pdf: null, audio: null };
    prepBook(b); b.textOnly = true;
    return b;
  }
  function splitLines(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean); const out = []; let cur = [];
    words.forEach((w, i) => {
      cur.push(w);
      if ((cur.length >= 8 && /[.،؛:﴾»]$/.test(w)) || cur.length >= 13) { if (words.length - i - 1 > 2) { out.push(cur.join(' ')); cur = []; } }
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }

  // ================================================================ reciters (Qur'an)
  HF.QARIS = [
    { id: 'husary', name: 'al-Ḥuṣarī', ed: 'ar.husary', folder: 'Husary_128kbps' },
    { id: 'husary_muallim', name: 'al-Ḥuṣarī — teaching (muʿallim)', ed: null, folder: 'Husary_Muallim_128kbps' },
    { id: 'hudhaify', name: 'ʿAlī al-Ḥudhayfī', ed: 'ar.hudhaify', folder: 'Hudhaify_128kbps' },
    { id: 'minshawi', name: 'al-Minshāwī (murattal)', ed: 'ar.minshawi', folder: 'Minshawy_Murattal_128kbps' },
    { id: 'alafasy', name: 'Mishārī al-ʿAfāsī', ed: 'ar.alafasy', folder: 'Alafasy_128kbps' }
  ];
  function ayahSources(s, a) {
    const q = HF.QARIS.find((x) => x.id === st().qari) || HF.QARIS[0];
    const g = HF.globalAyah(s, a);
    const ss = String(s).padStart(3, '0'), aa = String(a).padStart(3, '0');
    const list = [];
    if (q.ed) list.push(`https://cdn.islamic.network/quran/audio/128/${q.ed}/${g}.mp3`, `https://cdn.islamic.network/quran/audio/64/${q.ed}/${g}.mp3`);
    list.push(`https://everyayah.com/data/${q.folder}/${ss}${aa}.mp3`);
    return list;
  }

  // ================================================================ unit model (shared by Qur'an + mutūn)
  const blank = () => ({ l: 0, b: 0, k: 0, m: false });
  const isQ = () => st().mode === 'quran';
  function qPage() { const d = HF.quran.data; return d ? d.pages[st().page - 1] : null; }
  function curBook() { return HF.books.cache[st().book] || (st().book === 'mine' ? myTextsBook() : null); }
  function mpos() { const s = st(); s.mpos[s.book] = s.mpos[s.book] || { p: 0, l: null }; return s.mpos[s.book]; }
  function curPage() { const b = curBook(); return b ? b.pages[HF.clamp(mpos().p, 0, b.pages.length - 1)] : null; }
  const masailOn = () => !!st().masail[st().book];
  // Text view (no PDF on this device, or chosen): lines with no text can't be practised there
  function textView() {
    const b = curBook(); if (!b) return false;
    return !!b.textOnly || st().mview !== 'print' || !(b.pdf && HF.files.has(b.pdf.name));
  }
  const isTrackKind = (k) => k === 't' || k === 'h' || (k === 'q' && masailOn());
  function trackable() {
    if (isQ()) {
      const p = qPage(); if (!p) return [];
      return p.map((l, i) => (l[0] === 2 ? i : -1)).filter((i) => i >= 0);
    }
    const pg = curPage(); if (!pg) return [];
    const tv = textView();
    return pg.l.map((r, i) => (isTrackKind(r[4]) && !(tv && !pg.t[i]) ? i : -1)).filter((i) => i >= 0);
  }
  function progStore(create) {
    const s = st();
    if (isQ()) {
      if (create) { s.qprog[s.layout] = s.qprog[s.layout] || {}; s.qprog[s.layout][s.page] = s.qprog[s.layout][s.page] || {}; }
      return (s.qprog[s.layout] || {})[s.page] || {};
    }
    const p = mpos().p;
    if (create) { s.mprog[s.book] = s.mprog[s.book] || {}; s.mprog[s.book][p] = s.mprog[s.book][p] || {}; }
    return (s.mprog[s.book] || {})[p] || {};
  }
  function unitIndex() {
    const t = trackable();
    if (!t.length) return null;
    let idx = isQ() ? st().line : mpos().l;
    if (idx == null || !t.includes(idx)) idx = t.find((i) => !(progStore(false)[i] || {}).m) ?? t[0];
    return idx;
  }
  function setUnitIndex(i) { if (isQ()) st().line = i; else mpos().l = i; }
  function unit(create) {
    const i = unitIndex(); if (i == null) return null;
    const store = progStore(create);
    if (create && !store[i]) store[i] = blank();
    return store[i] || blank();
  }
  function isFirstTrackable(i) { return trackable()[0] === i; }
  function phaseFor(u, i) {
    const T = st().targets;
    if (!u) return 'look';
    if (u.l < T.look) return 'look';
    if (u.b < T.blind) return 'blind';
    if (T.link > 0 && !isFirstTrackable(i) && u.k < T.link) return 'link';
    return 'look';
  }
  HF.studioUnitLabel = () => isQ() ? `Page ${st().page}` : (curBook() ? `${curBook().titleEn} p. ${(curPage() || {}).p}` : '');

  // ================================================================ rendering
  let peekUntil = 0;
  function hiddenSet(phase, cur, t) {
    const set = new Set();
    if (Date.now() <= peekUntil) return set;
    if (phase === 'blind') set.add(cur);
    if (phase === 'link') t.filter((i) => i <= cur).forEach((i) => set.add(i));
    return set;
  }
  function renderStudio() {
    const s = st();
    $('modeQuran').setAttribute('aria-pressed', s.mode === 'quran');
    $('modeMutun').setAttribute('aria-pressed', s.mode === 'mutun');
    $('quranPager').hidden = s.mode !== 'quran';
    $('mutunPager').hidden = s.mode !== 'mutun';
    $('mutunTools').hidden = s.mode !== 'mutun';
    $('mutunAudio').hidden = s.mode !== 'mutun';
    $('mutunBar').hidden = s.mode !== 'mutun';
    $('bookBtn').hidden = s.mode !== 'mutun';
    $('qariSelect').closest('label').hidden = s.mode !== 'quran';
    $('tLook').value = s.targets.look; $('tBlind').value = s.targets.blind; $('tLink').value = s.targets.link;
    $('repeatSelect').value = String(s.repeat || 1);
    if (s.mode === 'quran') renderQuran(); else renderMutun();
  }
  HF.renders.studio = renderStudio;

  // ---------------- Qur'an
  function renderQuran() {
    const s = st();
    const card = $('pageCard');
    card.className = 'mushaf';
    card.removeAttribute('data-key');
    $('pageInput').value = s.page;
    if (!HF.quran.data || HF.quran.layout !== s.layout) {
      card.innerHTML = '<p class="loading">Loading the Muṣḥaf…</p>';
      HF.loadQuran(s.layout).then(renderStudio).catch((e) => { card.innerHTML = `<p class="loading">${HF.esc(e.message)}. Check your connection and reload.</p>`; });
      return;
    }
    const d = HF.quran.data; const page = d.pages[s.page - 1];
    const prog = progStore(false); const cur = unitIndex(); const u = unit(false);
    const phase = s.phase || phaseFor(u, cur);
    const t = trackable();
    const hide = hiddenSet(phase, cur, t);
    const surahsHere = [...new Set(page.filter((l) => l[0] === 2).flatMap((l) => [l[2], l[4]]))];
    const firstAyah = page.find((l) => l[0] === 2);
    const juz = juzOf(firstAyah[2], firstAyah[3]);
    const head = `<div class="mushaf-head"><span>${surahsHere.map((n) => 'سورة ' + HF.esc(d.surahs[n - 1].ar)).join(' · ')}</span><span>الجزء ${HF.arNum(juz)}</span></div>`;
    const lines = page.map((l, i) => {
      if (l[0] === 0) return `<div class="mline surah"><span>سُورَةُ ${HF.esc(d.surahs[l[1] - 1].ar)}</span></div>`;
      if (l[0] === 1) return `<div class="mline basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>`;
      const pr = prog[i] || {};
      const cls = ['mline', i === cur ? 'active' : '', pr.m ? 'mastered' : (pr.l ? 'started' : ''), hide.has(i) ? 'hidden-text' : ''].join(' ');
      return `<div class="${cls}" data-act="line" data-i="${i}" role="button" tabindex="0" aria-label="Line ${t.indexOf(i) + 1}${pr.m ? ', mastered' : ''}">${formatAyahText(l[1])}</div>`;
    }).join('');
    card.innerHTML = head + lines + `<div class="mushaf-foot">${HF.arNum(s.page)}</div>`;
    if (s.page <= 2) card.classList.add('center');
    fitPage(card);
    const sur = d.surahs[firstAyah[2] - 1];
    $('pageMeta').innerHTML = `<span class="ar">${HF.esc(sur.ar)}</span> · ${HF.esc(sur.en)} ${firstAyah[2]}:${firstAyah[3]} · Juzʾ ${juz} · ${HF.LAYOUTS[s.layout]}`;
    $('pageHint').textContent = 'Tap a line to work on it; swipe to turn the page.';
    renderDock(cur, u, phase, t, prog);
    renderZoom(cur, hide.has(cur));
  }
  function juzOf(s, a) {
    const js = HF.quran.data.juzStarts; let j = 1;
    for (let i = 0; i < js.length; i++) if (s > js[i][0] || (s === js[i][0] && a >= js[i][1])) j = i + 1;
    return j;
  }
  // Āyah numbers become the round end-of-āyah sign (U+06DD) that Amiri Quran draws around the digits
  function formatAyahText(text) {
    return HF.esc(text).replace(/(^|\s)([٠-٩]+)(?=\s|$)/g, (m, sp, n) => `${sp}<span class="ayah-num">۝${n}</span>`);
  }
  // Shrink the font until the longest line fits the page width (lines never wrap, like print)
  // the largest font size at which every line of the page fits; measured once per page and width
  const fitCache = new Map();
  function fitPage(card) {
    const lines = [...card.querySelectorAll('.mline:not(.surah)')];
    if (!lines.length) return;
    const w = card.clientWidth - 32;
    const key = `${st().layout}:${st().page}:${w}`;
    if (fitCache.has(key)) { card.style.fontSize = fitCache.get(key) + 'px'; return; }
    let size = HF.clamp(Math.floor(w / 15.5), 16, 34);
    card.style.fontSize = size + 'px';
    // one measurement: scale by the widest line, then fine-tune at most a couple of steps
    const worst = Math.max(...lines.map((el) => el.scrollWidth / Math.max(1, el.clientWidth)));
    if (worst > 1.001) { size = Math.max(13, Math.floor(size / worst)); card.style.fontSize = size + 'px'; }
    for (let n = 0; n < 4 && size > 13 && lines.some((el) => el.scrollWidth > el.clientWidth + 1); n++) { size -= 1; card.style.fontSize = size + 'px'; }
    if (fitCache.size > 200) fitCache.clear();
    fitCache.set(key, size);
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { fitCache.clear(); if (isQ() && $('pageCard')) fitPage($('pageCard')); });
  let fitRaf = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => { if (isQ()) fitPage($('pageCard')); else if ($('pageCard').dataset.key) { $('pageCard').removeAttribute('data-key'); renderStudio(); } });
  });

  // ---------------- mutūn
  function renderMutun() {
    const s = st();
    const card = $('pageCard');
    if (!HF.books.index) {
      card.className = 'mushaf matn-page'; card.removeAttribute('data-key');
      card.innerHTML = '<p class="loading">Loading the books…</p>';
      HF.loadBookIndex().then(renderStudio).catch(() => { card.innerHTML = '<p class="loading">Could not load the book list. Check your connection and reload.</p>'; });
      return;
    }
    renderBookList();
    const b = curBook();
    if (!b) {
      card.className = 'mushaf matn-page'; card.removeAttribute('data-key');
      card.innerHTML = '<p class="loading">Loading the matn…</p>';
      HF.loadBook(s.book).then(renderStudio).catch((e) => { card.innerHTML = `<p class="loading">${HF.esc(e.message)}. Check your connection and reload.</p>`; });
      return;
    }
    if (!b.pages.length) { card.innerHTML = '<p class="loading">No texts here yet.</p>'; return; }
    const mp = mpos(); mp.p = HF.clamp(mp.p, 0, b.pages.length - 1);
    const pg = b.pages[mp.p];
    // section select (built once per book)
    const sel = $('sectionSelect');
    if (sel.dataset.book !== s.book + (b.textOnly ? 'T' : '')) {
      let lastK = null;
      sel.innerHTML = b.sections.map((x, i) => {
        let pre = '';
        if (x.k && x.k !== lastK) { pre = `<option disabled>— ${HF.esc(x.k)}</option>`; lastK = x.k; }
        return pre + `<option value="${i}">${HF.esc(x.t.length > 70 ? x.t.slice(0, 68) + '…' : x.t)}</option>`;
      }).join('');
      sel.dataset.book = s.book + (b.textOnly ? 'T' : '');
    }
    const secIdx = sectionAt(b, mp.p, unitIndex() ?? 0);
    sel.value = String(secIdx);
    $('mPageInput').value = pg.p;
    $('mPageInput').setAttribute('aria-label', `Printed page (${b.pages[0].p}–${b.pages[b.pages.length - 1].p})`);

    $('masailBtn').hidden = s.book !== 'tawhid';
    $('masailBtn').setAttribute('aria-pressed', !!s.masail[s.book]);
    $('masailBtn').textContent = s.masail[s.book] ? 'فيه مسائل: included' : 'فيه مسائل: skipped';
    const hasPdf = !b.textOnly && b.pdf && HF.files.has(b.pdf.name);
    const view = b.textOnly ? 'text' : (s.mview === 'print' && hasPdf ? 'print' : 'text');
    document.querySelectorAll('[data-act="mview"]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === view));
    $('mviewSeg').hidden = !!b.textOnly;

    const t = trackable(); const prog = progStore(false); const cur = unitIndex(); const u = unit(false);
    const phase = s.phase || phaseFor(u, cur);
    const hide = hiddenSet(phase, cur, t);
    if (view === 'print') renderPrint(b, pg, mp.p, cur, prog, hide);
    else renderText(b, pg, mp.p, cur, prog, hide, hasPdf);

    const sec = b.sections[secIdx];
    const info = HF.books.index.find((x) => x.id === s.book) || {};
    $('bookBtnTitle').textContent = b.title;
    $('bookBtnSub').textContent = [b.titleEn, info.groupEn].filter(Boolean).join(' · ');
    $('pageMeta').innerHTML = `<div class="meta-en">Page ${pg.p} of ${b.pages[b.pages.length - 1].p} · ${t.length} line${t.length === 1 ? '' : 's'} to learn</div>`;
    $('pageHint').innerHTML = view === 'print'
      ? 'The Shaykh\'s printed page. Tap a line to work on it; swipe to turn the page.'
      : (b.textOnly ? 'Your own text.' : `Text view: the text on the Shaykh's printed lines.${hasPdf ? '' : ' <button class="linklike" data-act="openFiles">Add the PDF</button> to see the exact printed page.'}`);
    renderDock(cur, u, phase, t, prog);
    renderZoom(cur, hide.has(cur));
    renderMutunAudio(b);
  }
  function sectionAt(b, pi, li) {
    let k = 0;
    for (let i = 0; i < b.sections.length; i++) {
      const x = b.sections[i];
      if (x.p < pi || (x.p === pi && x.l <= li)) k = i; else break;
    }
    return k;
  }
  function lineClasses(i, cur, prog, hide, kind) {
    const pr = prog[i] || {};
    return ['mline', i === cur ? 'active' : '', pr.m ? 'mastered' : (pr.l ? 'started' : ''), hide.has(i) ? 'hidden-text' : '',
      kind === 'h' ? 'head' : '', kind === 'q' ? (masailOn() ? 'masail' : 'masail off') : '', (kind === 'o' || kind === 'x') ? 'deco' : '',
      speaking && speaking[0] === mpos().p && speaking[1] === i ? 'speaking' : ''].join(' ');
  }
  function renderText(b, pg, pi, cur, prog, hide) {
    const card = $('pageCard');
    card.className = 'mushaf matn-page';
    card.removeAttribute('data-key');
    let n = 0;
    const rows = pg.l.map((r, i) => {
      const kind = r[4];
      if (kind === 'o' || kind === 'x') return '';
      const track = isTrackKind(kind);
      const txt = pg.t[i];
      if (!txt) return `<div class="mline notext-row"><span class="notext">— a line only in the printed page —</span></div>`;
      const tr = track && pg.t[i];
      if (tr) n++;
      return `<div class="${lineClasses(i, cur, prog, hide, kind)}" ${tr ? `data-act="line" data-i="${i}" role="button" tabindex="0"` : ''}>${tr ? `<span class="ln">${n}</span>` : ''}<span class="tx">${HF.esc(txt)}</span></div>`;
    }).join('');
    card.innerHTML = `<div class="mushaf-head"><span>${HF.esc(b.title)}</span><span>${HF.arNum(pg.p)}</span></div>${rows}`;
    card.style.fontSize = '';
    // one printed line = one line here: shrink a long line instead of wrapping it
    card.querySelectorAll('.mline .tx').forEach((el) => {
      const line = el.parentElement; const room = line.clientWidth - 44;
      if (el.scrollWidth > room && room > 0) el.style.fontSize = Math.max(0.62, room / el.scrollWidth) + 'em';
    });
  }
  function renderPrint(b, pg, pi, cur, prog, hide) {
    const card = $('pageCard');
    card.className = 'mushaf print-page';
    const cs = getComputedStyle(card);
    const W = Math.floor(Math.max(220, (card.clientWidth || card.parentElement.clientWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    const lines = pg.l.filter((r) => r[4] !== 'x');
    const y0 = Math.max(0, Math.min(...pg.l.map((r) => r[1])) - 10), y1 = Math.max(...pg.l.map((r) => r[3])) + 10;
    const clip = [b.crop[0], y0, b.crop[1], y1];
    const key = `${b.id}|${pi}|${W}`;
    const scale = W / (clip[2] - clip[0]);
    if (card.dataset.key !== key) {
      card.dataset.key = key;
      card.style.fontSize = '';
      card.innerHTML = `<div class="print-wrap" style="width:${W}px;height:${Math.round((y1 - y0) * scale)}px"><div class="print-loading">Opening the page…</div></div>`;
      const wrap = card.querySelector('.print-wrap');
      HF.renderPdfClip(b.pdf.name, pg.pdf, clip, W).then((cv) => {
        if (card.dataset.key !== key) return;
        wrap.querySelector('.print-loading') && wrap.querySelector('.print-loading').remove();
        wrap.prepend(cv);
      }).catch(() => {
        if (card.dataset.key !== key) return;
        wrap.innerHTML = '<p class="loading">Couldn\'t open the PDF. Re-import it in Settings → Books & files.</p>';
      });
    }
    const wrap = card.querySelector('.print-wrap');
    wrap.querySelectorAll('.ov').forEach((x) => x.remove());
    const n = { c: 0 };
    const ov = pg.l.map((r, i) => {
      const kind = r[4];
      if (kind === 'x' || kind === 'o') return '';
      const track = isTrackKind(kind);
      if (track) n.c++;
      const st_ = `left:${(r[0] - clip[0]) * scale - 4}px;top:${(r[1] - clip[1]) * scale}px;width:${(r[2] - r[0]) * scale + 8}px;height:${(r[3] - r[1]) * scale}px`;
      return `<div class="ov ${lineClasses(i, cur, prog, hide, kind)}" style="${st_}" ${track ? `data-act="line" data-i="${i}" role="button" tabindex="0" aria-label="Line ${n.c}"` : ''}></div>`;
    }).join('');
    wrap.insertAdjacentHTML('beforeend', ov);
  }

  // magnified active line in the dock (big text on small screens)
  function renderZoom(cur, hidden) {
    const z = $('lineZoom');
    if (cur == null) { z.innerHTML = ''; return; }
    if (hidden) { z.className = 'line-zoom hidden'; z.innerHTML = '<span>Hidden — recite it from memory</span>'; return; }
    if (isQ()) {
      const l = qPage()[cur];
      z.className = 'line-zoom quran'; z.innerHTML = `<div>${formatAyahText(l[1])}</div>`;
      return;
    }
    const b = curBook(); const pg = curPage(); const r = pg.l[cur];
    const hasPdf = !b.textOnly && b.pdf && HF.files.has(b.pdf.name);
    if (hasPdf && st().mview === 'print') {
      z.className = 'line-zoom print';
      const W = Math.max(200, z.clientWidth || 320);
      const clip = [r[0] - 4, r[1], r[2] + 4, r[3]];
      const key = `${b.id}|${mpos().p}|${cur}|${W}`;
      if (z.dataset.key === key && z.querySelector('canvas')) return;
      z.dataset.key = key; z.innerHTML = '';
      const w = Math.min(W, (r[2] - r[0] + 8) * 2.6);
      HF.renderPdfClip(b.pdf.name, pg.pdf, clip, w).then((cv) => {
        if (z.dataset.key !== key) return;
        const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.style.width = cv.style.width; c2.style.height = cv.style.height;
        c2.getContext('2d').drawImage(cv, 0, 0); z.innerHTML = ''; z.appendChild(c2);
      }).catch(() => {});
    } else {
      z.className = 'line-zoom matn'; z.removeAttribute('data-key');
      z.innerHTML = pg.t[cur] ? `<div>${HF.esc(pg.t[cur])}</div>` : '<span>Only in the printed edition</span>';
    }
  }

  function renderBookList() {
    const s = st();
    const items = [...HF.books.index];
    if (s.myTexts.length) items.push({ id: 'mine', title: 'نصوصي', titleEn: 'My texts', groupEn: 'Typed in earlier', lines: 0 });
    let last = null;
    $('bookList').innerHTML = items.map((b) => {
      const prog = s.mprog[b.id] || {};
      const done = Object.values(prog).reduce((a, pg) => a + Object.entries(pg).filter(([k, v]) => k !== '__done' && v && v.m).length, 0);
      const pdfOk = b.pdfName && HF.files.has(b.pdfName);
      const head = b.groupEn !== last ? `<div class="book-group">${HF.esc(b.groupEn || '')}</div>` : '';
      last = b.groupEn;
      return head + `<button class="book" data-act="book" data-book="${b.id}" aria-pressed="${s.book === b.id}">
        <span class="t">${HF.esc(b.title)}</span>
        <span class="m">${HF.esc(b.titleEn)}${b.lines ? ` · ${done}/${b.lines} lines` : ''}${b.audio ? ' · reading' : ''}${b.pdfName ? (pdfOk ? ' · PDF ✓' : ' · no PDF yet') : ''}</span></button>`;
    }).join('');
  }

  function renderDock(cur, u, phase, t, prog) {
    const s = st(); const T = s.targets;
    u = u || blank();
    const pos = t.indexOf(cur) + 1;
    const where = isQ() ? `Page ${s.page}` : (curPage() ? `Page ${curPage().p}` : '');
    $('unitTitle').textContent = cur == null ? 'No lines on this page' : `${where} · line ${pos} of ${t.length}`;
    $('unitState').textContent = u.m ? 'Mastered' : (u.l || u.b ? 'In progress' : 'New');
    $('unitState').className = 'chip ' + (u.m ? 'good' : (u.l || u.b ? 'gilt' : ''));
    $('phLook').textContent = `${u.l}/${T.look}`;
    $('phBlind').textContent = `${u.b}/${T.blind}`;
    const noLink = T.link === 0 || isFirstTrackable(cur);
    $('phLink').textContent = noLink ? '—' : `${u.k}/${T.link}`;
    document.querySelectorAll('.phase').forEach((b) => b.setAttribute('aria-pressed', b.dataset.phase === phase));
    const cnt = phase === 'look' ? u.l : phase === 'blind' ? u.b : u.k;
    const tgt = phase === 'look' ? T.look : phase === 'blind' ? T.blind : T.link;
    $('tapCount').textContent = `${cnt}/${tgt}`;
    const what = phase === 'look' ? 'Read the line while looking at it'
      : phase === 'blind' ? 'Recite it from memory — the line is hidden'
        : `Recite from line 1 up to line ${pos} without looking`;
    $('tapWhat').textContent = what;
    const mastered = t.filter((i) => (prog[i] || {}).m).length;
    $('pageProgLabel').textContent = `${where} progress`;
    $('pageProgNum').textContent = `${mastered} / ${t.length} lines mastered`;
    $('pageProgBar').style.width = (t.length ? (mastered / t.length) * 100 : 0) + '%';
    $('compareBtn').disabled = !rec.url;
    // compact practice bar (phones)
    $('miniPhase').textContent = phase === 'look' ? 'Looking' : phase === 'blind' ? 'From memory' : 'Linking';
    $('miniCount').textContent = `${cnt}/${tgt}`;
    $('miniLine').textContent = cur == null ? '' : `${where} · L${pos}`;
    $('miniBar').dataset.phase = phase;
  }

  // ================================================================ counting
  function tap() {
    const s = st(); const i = unitIndex(); if (i == null) return;
    const u = unit(true); const T = s.targets;
    const phase = s.phase || phaseFor(u, i);
    if (phase === 'look') {
      u.l++;
      if (u.l >= T.look) { s.phase = 'blind'; HF.chime(523.25, 783.99); HF.toast(`Now recite it ${T.blind}× from memory — the line is hidden.`); } else HF.chime(440, 470, 0.04);
    } else if (phase === 'blind') {
      u.b++;
      if (u.b >= T.blind) {
        if (T.link > 0 && !isFirstTrackable(i)) { s.phase = 'link'; HF.chime(587.33, 880); HF.toast(`Link it: recite from line 1 to here ${T.link}×.`); }
        else return master();
      } else HF.chime(493.88, 520, 0.04);
    } else {
      u.k++;
      if (u.k >= T.link) return master();
      HF.chime(523.25, 560, 0.04);
    }
    HF.save();
    { const ph = s.phase || phaseFor(u, i); const c = ph === 'look' ? u.l : ph === 'blind' ? u.b : u.k; $('countLive').textContent = `${c}`; }
    ['tapBtn', 'miniTap'].forEach((id) => { const btn = $(id); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); });
    renderStudio();
  }
  function master() {
    const s = st(); const i = unitIndex(); if (i == null) return;
    const u = unit(true); u.m = true;
    HF.chime(587.33, 1046.5); HF.vibrate(40);
    const t = trackable(); const prog = progStore(true);
    const next = t.find((x) => x > i && !(prog[x] || {}).m) ?? t.find((x) => !(prog[x] || {}).m);
    s.phase = null;
    if (next == null) completeUnit();
    else { setUnitIndex(next); HF.toast('Line mastered. On to the next line.'); }
    HF.save(); HF.render('studio', 'review');
  }
  function completeUnit() {
    const s = st();
    if (isQ()) {
      HF.addToReview('q:' + s.page);
      HF.toast(`Page ${s.page} complete — added to your muraja'ah. Swipe for the next page.`, 4200);
    } else {
      const pg = curPage();
      progStore(true).__done = true;
      HF.addToReview(`mp:${s.book}:${mpos().p}`, 1, { book: s.book, printed: pg.p });
      HF.toast('Page complete — added to your muraja\'ah.', 3600);
    }
  }
  HF.act.tap = tap;
  HF.act.master = master;
  HF.act.skipPhase = () => {
    const s = st(); const i = unitIndex(); if (i == null) return; const u = unit(true);
    const ph = s.phase || phaseFor(u, i);
    if (ph === 'look') { u.l = Math.max(u.l, s.targets.look); s.phase = 'blind'; }
    else if (ph === 'blind') { u.b = Math.max(u.b, s.targets.blind); if (s.targets.link > 0 && !isFirstTrackable(i)) s.phase = 'link'; else return master(); }
    else return master();
    HF.save(); renderStudio();
  };
  HF.act.resetUnit = () => {
    const i = unitIndex(); if (i == null) return;
    const store = progStore(true); store[i] = blank(); delete store.__done; st().phase = 'look';
    HF.save(); renderStudio(); HF.toast('Line counter reset.');
  };
  HF.act.phase = (el) => { st().phase = el.dataset.phase; HF.save(); renderStudio(); };
  HF.act.line = (el) => { setUnitIndex(+el.dataset.i); const u = unit(false); st().phase = phaseFor(u, +el.dataset.i); HF.save(); renderStudio(); };
  HF.act.peek = () => { peekUntil = Date.now() + 3000; renderStudio(); setTimeout(renderStudio, 3050); };
  HF.act.mode = (el) => { st().mode = el.dataset.mode; st().phase = null; stopAudio(); HF.save(); renderStudio(); };
  HF.act.page = (el) => goPage(st().page + (+el.dataset.delta));
  function goPage(p) {
    const s = st(); p = HF.clamp(p | 0, 1, 604);
    if (p === s.page) { renderStudio(); return; }
    s.page = p; s.line = null; s.phase = null; stopAudio(); dropRecording();
    HF.save(); renderStudio(); toPageTop();
  }
  HF.goPage = (p) => { st().mode = 'quran'; goPage(p); };
  function goMPage(pi, li = null) {
    const b = curBook(); if (!b) return;
    const mp = mpos(); pi = HF.clamp(pi, 0, b.pages.length - 1);
    const changed = pi !== mp.p;
    mp.p = pi; mp.l = li; st().phase = null;
    if (changed) { if (!following) stopAudio(); dropRecording(); }
    HF.save(); renderStudio();
    if (changed && !following) toPageTop();
  }
  HF.goMutunPage = (book, pi) => { const s = st(); s.mode = 'mutun'; s.book = book; mpos().p = pi; mpos().l = null; s.phase = null; HF.save(); HF.loadBook(book).then(renderStudio).catch(renderStudio); };
  HF.act.mpage = (el) => goMPage(mpos().p + (+el.dataset.delta));
  HF.act.mview = (el) => {
    const b = curBook();
    if (el.dataset.view === 'print' && b && b.pdf && !HF.files.has(b.pdf.name)) { HF.openFilesSheet(b.id); return; }
    st().mview = el.dataset.view; HF.save(); renderStudio(); toPageTop();
  };
  HF.act.book = (el) => {
    const s = st(); s.book = el.dataset.book; s.phase = null; HF.closeSheets(); stopAudio(); HF.save(); renderStudio();
    toPageTop(true);
  };
  HF.act.pickBook = () => { if (HF.books.index) renderBookList(); HF.openSheet('books'); };
  HF.act.toDock = () => { const d = document.querySelector('.dock .controls'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  HF.act.toggleMasail = () => { const s = st(); s.masail[s.book] = !s.masail[s.book]; s.phase = null; HF.save(); renderStudio(); HF.toast(s.masail[s.book] ? 'Masāʾil lines included in your lines.' : 'Masāʾil lines skipped (aṣ-Ṣīnī does not read them).'); };
  // bring the top of the page back into view after a page, book or view change
  function toPageTop(force) {
    const head = document.querySelector('.studio-head'); if (!head) return;
    const r = $('pageCard').getBoundingClientRect();
    if (force || r.top < 0 || r.top > window.innerHeight * 0.6) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ================================================================ audio
  const player = () => $('player');
  let queue = [], qPos = 0, repeatLeft = 0, stopAt = null, playing = false, onQueueEnd = null, following = false, speaking = null;
  let playToken = 0, pendingGo = null; // a newer Listen/Stop cancels a play that is still waiting for the file
  function setListen(on, loading) {
    $('listenLabel').textContent = on ? (loading ? 'Loading…' : 'Stop') : 'Listen';
    $('listenBtn').classList.toggle('loading', !!(on && loading));
    $('miniListen').setAttribute('aria-pressed', on); $('miniListen').classList.toggle('loading', !!(on && loading));
  }
  function stopAudio() {
    const p = player(); p.pause(); queue = []; stopAt = null; playing = false; onQueueEnd = null; following = false;
    playToken++;
    if (pendingGo) { p.removeEventListener('loadedmetadata', pendingGo); pendingGo = null; }
    if (speaking) { speaking = null; if (!isQ()) refreshSpeaking(); }
    setListen(false); updateAudioButtons();
  }
  HF.stopAudio = stopAudio;
  function playSrcList(list) {
    queue = list; qPos = 0; playing = true; setListen(true, true);
    playCurrent(0);
  }
  function playCurrent(fallbackIdx) {
    const p = player(); const srcs = queue[qPos]; if (!srcs) return;
    p.src = srcs[fallbackIdx]; p.dataset.url = ''; // the mutūn reader must reload its own file afterwards
    p.dataset.fb = fallbackIdx;
    p.playbackRate = st().speed || 1;
    p.play().catch(() => {});
  }
  function attachPlayerEvents() {
    const p = player();
    p.addEventListener('error', () => {
      if (!playing) return;
      if (queue.length) {
        const fb = (+p.dataset.fb || 0) + 1;
        if (queue[qPos] && fb < queue[qPos].length) { playCurrent(fb); return; }
      }
      stopAudio(); HF.toast('Audio needs an internet connection (or this file is unavailable).');
    });
    p.addEventListener('ended', () => {
      if (!playing) return;
      if (queue.length) {
        if (qPos + 1 < queue.length) { qPos++; playCurrent(0); return; }
        if (repeatLeft > 1) { repeatLeft--; qPos = 0; playCurrent(0); return; }
      }
      const cb = onQueueEnd; stopAudio(); if (cb) cb();
    });
    p.addEventListener('playing', () => { if (playing) setListen(true, false); });
    p.addEventListener('waiting', () => { if (playing) setListen(true, true); });
    p.addEventListener('timeupdate', () => {
      if (stopAt && p.currentTime >= stopAt.end) {
        if (repeatLeft > 1) { repeatLeft--; p.currentTime = stopAt.start; return; }
        const cb = onQueueEnd; p.pause(); stopAt = null; playing = false; setListen(false); updateAudioButtons(); if (cb) cb();
        return;
      }
      if (following) follow(p.currentTime);
      updateScrub();
    });
  }
  function lineAyahs(i) {
    const l = qPage()[i]; const [, , s1, a1, s2, a2] = l; const out = [];
    let s = s1, a = a1;
    while (s < s2 || (s === s2 && a <= a2)) { out.push([s, a]); a++; if (a > HF.quran.data.surahs[s - 1].ayahs) { s++; a = 1; } }
    return out;
  }
  // ---- mutūn audio source: a file you imported (offline) > your own link > the official reading
  async function bookAudio(b) {
    const s = st();
    if (b.audio && HF.files.has(b.audio.name)) return { url: await HF.fileUrl(b.audio.name), offline: true, timed: true, label: b.audio.reader };
    if (HF.files.has('custom:' + b.id)) return { url: await HF.fileUrl('custom:' + b.id), offline: true, timed: false, label: 'Your file' };
    if (s.customAudio[b.id]) return { url: s.customAudio[b.id], offline: false, timed: false, label: 'Your link' };
    if (b.audio) return { url: b.audio.url, offline: false, timed: true, label: b.audio.reader };
    return null;
  }
  function adjKey(pi, li) { return pi + ':' + li; }
  function lineWindow(b, pi, li) {
    const r = b.pages[pi].l[li];
    if (r.length <= 6) return null;
    const a = ((st().audioAdj[b.id] || {})[adjKey(pi, li)]) || [0, 0];
    return [Math.max(0, r[5] + a[0]), Math.max(r[5] + a[0] + 0.4, r[6] + a[1])];
  }
  function markWindow(b, pi, li) { // for your own audio: start marks set by you
    const m = st().audioMarks[b.id] || {};
    const here = m[adjKey(pi, li)]; if (here == null) return null;
    // next mark after this line
    const keys = Object.keys(m).map((k) => k.split(':').map(Number)).filter(([p, l]) => p > pi || (p === pi && l > li)).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const nx = keys.length ? m[adjKey(keys[0][0], keys[0][1])] : here + 20;
    return [here, nx];
  }
  async function seekPlay(url, start, end, cb) {
    const p = player();
    queue = [];
    if (pendingGo) { p.removeEventListener('loadedmetadata', pendingGo); pendingGo = null; }
    const fresh = p.dataset.url !== url || !p.currentSrc;
    if (fresh) { p.src = url; p.dataset.url = url; }
    p.playbackRate = st().speed || 1;
    stopAt = end != null ? { start, end } : null;
    playing = true; setListen(true, true); updateAudioButtons();
    onQueueEnd = cb || null;
    const token = ++playToken;
    const go = () => {
      pendingGo = null;
      if (token !== playToken || !playing) return; // stopped (or replaced) while the file was loading
      try { p.currentTime = start; } catch (e) {}
      p.play().catch(() => { if (token === playToken) { stopAudio(); HF.toast('Audio needs an internet connection — or import the reading in Settings → Books & files.', 4200); } });
    };
    if (!fresh && p.readyState >= 1) go(); else { pendingGo = go; p.addEventListener('loadedmetadata', go, { once: true }); p.load(); }
  }
  async function listen(cb) {
    if (playing) { stopAudio(); return; }
    repeatLeft = +st().repeat || 1;
    onQueueEnd = cb || null;
    if (isQ()) {
      const i = unitIndex(); if (i == null) return;
      playSrcList(lineAyahs(i).map(([s, a]) => ayahSources(s, a)));
      onQueueEnd = cb || null;
      return;
    }
    const b = curBook(); const i = unitIndex(); if (!b || i == null) return;
    const src = await bookAudio(b);
    if (!src) { HF.toast(b.id === 'usulsunnah' ? 'No verified reading of this matn yet — add your own in the audio panel below.' : 'No reading for this text.'); return; }
    const w = src.timed ? lineWindow(b, mpos().p, i) : markWindow(b, mpos().p, i);
    if (!w) { HF.toast(src.timed ? 'This line is not in the reading (e.g. فيه مسائل).' : 'Mark where this line starts first (audio panel below).', 3600); return; }
    seekPlay(src.url, w[0], w[1], cb);
  }
  HF.act.listen = () => listen();

  // follow-along: play on from the current line and move the highlight (and page) with the reader
  HF.act.playFrom = async () => {
    const b = curBook(); if (!b) return;
    if (playing) { stopAudio(); renderMutunAudio(b); return; }
    const src = await bookAudio(b); if (!src) return;
    const i = unitIndex();
    let w = i != null ? (src.timed ? lineWindow(b, mpos().p, i) : markWindow(b, mpos().p, i)) : null;
    if (!w && src.timed) { const nx = b.timeline.find((x) => x[2] > mpos().p || (x[2] === mpos().p && x[3] >= (i || 0))); w = nx ? [nx[0]] : [0]; }
    await seekPlay(src.url, w ? w[0] : 0, null, null);
    following = src.timed;
    renderMutunAudio(b);
  };
  function follow(t) {
    const b = curBook(); if (!b || !b.hasTiming) return;
    const tl = b.timeline;
    let lo = 0, hi = tl.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (tl[mid][0] <= t + 0.05) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 0) return;
    const [, , pi, li] = tl[k];
    if (speaking && speaking[0] === pi && speaking[1] === li) return;
    speaking = [pi, li];
    if (st().follow && (pi !== mpos().p)) { mpos().p = pi; mpos().l = isTrackKind(b.pages[pi].l[li][4]) ? li : null; renderStudio(); return; }
    refreshSpeaking();
  }
  function refreshSpeaking() {
    document.querySelectorAll('#pageCard .speaking').forEach((x) => x.classList.remove('speaking'));
    if (!speaking || speaking[0] !== mpos().p) return;
    const el = document.querySelector(`#pageCard [data-i="${speaking[1]}"]`) || [...document.querySelectorAll('#pageCard .ov, #pageCard .mline')][speaking[1]];
    if (el) el.classList.add('speaking');
  }

  // ---------------- mutūn audio panel
  function fmtT(t) { t = Math.max(0, t || 0); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + s.toFixed(1).padStart(4, '0'); }
  async function renderMutunAudio(b) {
    const box = $('mutunAudio'); const s = st();
    const src = await bookAudio(b);
    if (curBook() !== b && b.id !== 'mine') return;
    const i = unitIndex();
    const pi = mpos().p;
    const w = src && i != null ? (src.timed ? lineWindow(b, pi, i) : markWindow(b, pi, i)) : null;
    const isMasail = i != null && b.pages[pi].l[i][4] === 'q';
    box.innerHTML = `
      ${src ? `<div class="spread small"><span>Reading: <b class="ar">${HF.esc(src.label)}</b> · ${src.offline ? 'saved on this device' : (navigator.onLine === false ? '<span style="color:#F0B49A">offline — add the MP3 to listen without internet</span>' : 'streams from the Shaykh\'s site')}</span>
        ${b.audio && !HF.files.has(b.audio.name) ? '<button class="btn small ghost" data-act="openFiles">Keep offline…</button>' : ''}</div>`
        : `<div class="notice">${b.id === 'usulsunnah' ? 'Shaykh ʿAbd al-ʿAzīz aṣ-Ṣīnī has no reading of this matn, and no other verified reading was found. You can add your own recording below.' : 'No reading for this text.'}</div>`}
      ${src ? `<div class="row"><button class="btn small" data-act="playFrom">${playing && following ? 'Stop' : 'Play from this line'}</button>
        <label class="check small"><input type="checkbox" id="followChk" ${s.follow ? 'checked' : ''}/> Turn pages with the reader</label></div>
        <div class="row"><input type="range" id="scrub" min="0" max="1000" value="0" class="grow" aria-label="Position" /><span class="faint num" id="scrubT"></span></div>` : ''}
      <div class="row">
        <label class="field">Speed<select id="speed">${[0.75, 0.9, 1, 1.1, 1.25].map((v) => `<option value="${v}" ${(s.speed || 1) == v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>
      </div>
      ${w && src.timed ? `<details class="timing"><summary class="small muted">Adjust this line's timing</summary>
        <p class="faint">Each line plays from the reader's pause before it to the pause after it, so no word is cut. If this line starts or stops in the wrong place, move it by half a second — your fix is remembered.</p>
        <div class="nudges"><button class="btn small" data-act="nudge" data-w="s" data-d="-0.5">Start earlier</button><button class="btn small" data-act="nudge" data-w="s" data-d="0.5">Start later</button>
          <button class="btn small" data-act="nudge" data-w="e" data-d="-0.5">End earlier</button><button class="btn small" data-act="nudge" data-w="e" data-d="0.5">End later</button></div>
        <p class="faint num">Now: ${fmtT(w[0])} – ${fmtT(w[1])}</p></details>` : ''}
      ${w && !src.timed ? `<p class="faint num">This line: ${fmtT(w[0])} – ${fmtT(w[1])}</p>` : ''}
      ${isMasail ? '<p class="faint">فيه مسائل are not part of aṣ-Ṣīnī\'s reading.</p>' : ''}
      ${!src || !src.timed ? `<details ${!src ? 'open' : ''}><summary class="small muted">Your own recording</summary>
        <div class="stack" style="gap:8px;margin-top:8px">
          <div class="row"><input type="url" id="customAudio" class="grow" placeholder="https://…/file.mp3" value="${HF.esc(s.customAudio[b.id] || '')}" /><button class="btn small" data-act="saveAudioLink">Save link</button></div>
          <div class="row"><button class="btn small" data-act="importCustomAudio">Choose an audio file…</button>${HF.files.has('custom:' + b.id) ? '<button class="btn small ghost" data-act="removeCustomAudio">Remove file</button>' : ''}</div>
          ${src ? `<button class="btn small" data-act="markLine" style="align-self:flex-start">Mark: line ${i == null ? '' : trackable().indexOf(i) + 1} starts now</button>
          <p class="faint">Play the recording and press "Mark" as each line starts; after that Listen plays single lines.</p>` : ''}
        </div></details>` : ''}`;
    const sp = $('speed'); if (sp) sp.onchange = (e) => { s.speed = +e.target.value; player().playbackRate = s.speed; HF.save(); };
    const fc = $('followChk'); if (fc) fc.onchange = (e) => { s.follow = e.target.checked; HF.save(); };
    const scrub = $('scrub');
    if (scrub) scrub.oninput = () => { const p = player(); if (p.duration) p.currentTime = (scrub.value / 1000) * p.duration; };
    updateScrub();
  }
  function updateScrub() {
    const p = player(); const sc = $('scrub'); const t = $('scrubT'); if (!sc || !t) return;
    if (p.duration && isFinite(p.duration)) { sc.value = Math.round((p.currentTime / p.duration) * 1000); t.textContent = `${fmtT(p.currentTime).replace(/\.\d$/, '')} / ${fmtT(p.duration).replace(/\.\d$/, '')}`; }
  }
  function updateAudioButtons() { const b = document.querySelector('[data-act="playFrom"]'); if (b) b.textContent = playing && following ? 'Stop' : 'Play from this line'; }
  HF.act.nudge = (el) => {
    const s = st(); const b = curBook(); const i = unitIndex(); if (!b || i == null) return;
    s.audioAdj[b.id] = s.audioAdj[b.id] || {};
    const k = adjKey(mpos().p, i); const a = s.audioAdj[b.id][k] || [0, 0];
    if (el.dataset.w === 's') a[0] = Math.round((a[0] + (+el.dataset.d)) * 10) / 10; else a[1] = Math.round((a[1] + (+el.dataset.d)) * 10) / 10;
    s.audioAdj[b.id][k] = a; HF.save(); renderMutunAudio(b);
    if (!playing) listen();
  };
  HF.act.markLine = () => {
    const s = st(); const p = player(); const b = curBook(); const i = unitIndex();
    if (!p.src || !p.duration || i == null) { HF.toast('Start "Play from this line" first, then press Mark as the line begins.'); return; }
    s.audioMarks[b.id] = s.audioMarks[b.id] || {};
    s.audioMarks[b.id][adjKey(mpos().p, i)] = Math.max(0, p.currentTime - 0.3);
    HF.save();
    const t = trackable(); const nx = t.find((x) => x > i);
    if (nx != null) setUnitIndex(nx);
    HF.toast(`Marked at ${fmtT(p.currentTime)}.`); renderStudio();
  };
  HF.act.saveAudioLink = () => {
    const v = $('customAudio').value.trim(); const s = st();
    if (v && !/^https?:\/\//.test(v)) { HF.toast('Paste a full link starting with https://'); return; }
    if (v) s.customAudio[s.book] = v; else delete s.customAudio[s.book];
    stopAudio(); HF.save(); renderStudio(); HF.toast(v ? 'Audio link saved.' : 'Audio link removed.');
  };
  HF.act.importCustomAudio = () => { const f = $('customAudioFile'); f.value = ''; f.click(); };
  HF.act.removeCustomAudio = async () => { await HF.files.remove('custom:' + st().book); stopAudio(); renderStudio(); };

  // ================================================================ record & compare
  const rec = { media: null, chunks: [], url: null, stream: null };
  function dropRecording() {
    if (rec.media && rec.media.state === 'recording') { rec.discard = true; rec.media.stop(); }
    if (rec.url) URL.revokeObjectURL(rec.url);
    rec.url = null;
  }
  HF.dropRecording = dropRecording;
  HF.act.record = async () => {
    if (rec.media && rec.media.state === 'recording') { rec.media.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { HF.toast('Recording is not supported on this browser.'); return; }
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { HF.toast('Microphone permission is needed to record.'); return; }
    stopAudio();
    rec.chunks = [];
    rec.media = new MediaRecorder(rec.stream);
    rec.media.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.discard = false;
    rec.media.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      $('recordBtn').classList.remove('rec-on'); $('recordLabel').textContent = 'Record';
      if (rec.discard) { rec.discard = false; $('compareBtn').disabled = true; return; }
      if (rec.url) URL.revokeObjectURL(rec.url);
      rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' }));
      $('recordBtn').classList.remove('rec-on'); $('recordLabel').textContent = 'Record';
      $('compareBtn').disabled = false;
      HF.toast('Recorded. Press Compare to hear the reciter, then yourself.');
    };
    rec.media.start();
    $('recordBtn').classList.add('rec-on'); $('recordLabel').textContent = 'Stop';
  };
  HF.act.compare = () => {
    if (!rec.url) return;
    const mine = $('myPlayer');
    const playMine = () => { mine.src = rec.url; mine.play().catch(() => {}); HF.toast('Now your recitation.'); };
    if (playing) stopAudio();
    const savedRepeat = st().repeat; st().repeat = 1;
    HF.toast('Reciter first…');
    listen(playMine).then(() => { st().repeat = savedRepeat; if (!playing) playMine(); });
  };

  // ================================================================ inputs
  HF.initStudio = () => {
    attachPlayerEvents();
    $('qariSelect').innerHTML = HF.QARIS.map((q) => `<option value="${q.id}">${HF.esc(q.name)}</option>`).join('');
    $('qariSelect').value = st().qari;
    $('qariSelect').onchange = (e) => { st().qari = e.target.value; stopAudio(); HF.save(); };
    $('repeatSelect').onchange = (e) => { st().repeat = +e.target.value; HF.save(); };
    $('pageInput').onchange = (e) => goPage(+e.target.value);
    $('pageInput').onkeydown = (e) => { if (e.key === 'Enter') goPage(+e.target.value); };
    const mGo = (e) => {
      const b = curBook(); if (!b) return;
      const want = +e.target.value; let k = b.pages.findIndex((x) => x.p >= want);
      if (k < 0) k = b.pages.length - 1;
      goMPage(k);
    };
    $('mPageInput').onchange = mGo;
    $('mPageInput').onkeydown = (e) => { if (e.key === 'Enter') mGo(e); };
    $('sectionSelect').onchange = (e) => { const b = curBook(); const x = b && b.sections[+e.target.value]; if (x) goMPage(x.p, x.l); };
    const tgt = (id, key, min) => { $(id).onchange = (e) => { st().targets[key] = HF.clamp(parseInt(e.target.value, 10) || min, min, 99); st().phase = null; HF.save(); renderStudio(); }; };
    tgt('tLook', 'look', 1); tgt('tBlind', 'blind', 1); tgt('tLink', 'link', 0);
    $('customAudioFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { await HF.files.put('custom:' + st().book, f); HF.toast('Audio saved on this device.'); } catch (err) { HF.toast('Not enough storage for that file.'); }
      stopAudio(); renderStudio();
    });
    // keyboard: Enter/Space on a focused line selects it
    $('pageCard').addEventListener('keydown', (e) => {
      const el = e.target.closest('[data-act="line"]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); HF.act.line(el); }
    });
    // swipe between pages (right-to-left books: swipe right = next page)
    let x0 = null, y0 = null;
    $('pageCard').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('pageCard').addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (isQ()) goPage(st().page + (dx > 0 ? 1 : -1));
        else goMPage(mpos().p + (dx > 0 ? 1 : -1));
      }
    }, { passive: true });
  };
})();
