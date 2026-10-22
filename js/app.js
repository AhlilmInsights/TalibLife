/* App shell: tabs, sheets, event dispatch, settings, books & files, backup, start-up. */
(function () {
  'use strict';
  const HF = window.HF;
  const $ = HF.$;
  const S = () => HF.state;

  // ---------------------------------------------------------------- tabs
  const TABS = ['studio', 'today', 'review', 'habits', 'more'];
  HF.showTab = (name) => {
    if (!TABS.includes(name)) name = 'studio';
    TABS.forEach((t) => {
      $('view-' + t).classList.toggle('active', t === name);
      const b = document.querySelector(`.tab[data-tab="${t}"]`);
      if (t === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.body.dataset.tab = name;
    try { sessionStorage.setItem('hf_tab', name); } catch (e) {}
    HF.render(name === 'more' ? 'settings' : name);
    window.scrollTo(0, 0);
  };
  HF.act.tab = (el) => HF.showTab(el.dataset.tab);

  // ---------------------------------------------------------------- sheets
  let lastFocus = null;
  HF.openSheet = (name) => {
    lastFocus = document.activeElement;
    const el = $('sheet-' + name); el.classList.add('open');
    const f = el.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button');
    setTimeout(() => f && f.focus(), 30);
  };
  HF.closeSheets = () => {
    document.querySelectorAll('.sheet-backdrop.open').forEach((s) => s.classList.remove('open'));
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  HF.act.close = HF.closeSheets;
  document.querySelectorAll('.sheet-backdrop').forEach((b) => b.addEventListener('click', (e) => { if (e.target === b) HF.closeSheets(); }));

  // ---------------------------------------------------------------- one click handler for everything
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = HF.act[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' && el.getAttribute('href')) return; // real links keep working
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.sheet-backdrop.open')) { HF.closeSheets(); return; }
    if (e.code !== 'Space' || e.repeat) return;
    if (document.querySelector('.sheet-backdrop.open')) return;
    if (!$('view-studio').classList.contains('active')) return;
    const t = e.target; const tag = (t.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'a'].includes(tag) || t.isContentEditable) return;
    if (t.closest && t.closest('[data-act="line"]')) return; // handled by the line itself
    e.preventDefault();
    HF.act.tap();
  });

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const p = S().prayer;
    const opts = HF.CITY_GROUPS.map(([g, cc]) => `<optgroup label="${g}">${Object.entries(HF.CITIES).filter(([, c]) => c[4] === cc)
      .map(([k, c]) => `<option value="${k}" ${p.city === k ? 'selected' : ''}>${HF.esc(c[0])}</option>`).join('')}</optgroup>`).join('');
    $('cityPreset').innerHTML = opts + (p.city === 'geo' ? `<option value="geo" selected>My location (${(+p.lat).toFixed(2)}, ${(+p.lng).toFixed(2)})</option>` : '');
    const t = HF.prayerTimes(HF.todayKey());
    $('adjustGrid').innerHTML = HF.PRAYERS.map((x) => `<label class="field"><span>${x.name} <b class="num">${t[x.id]}</b></span>
      <span class="stepper"><button class="btn small icon" data-act="adj" data-p="${x.id}" data-d="-1" aria-label="${x.name} one minute earlier">−</button>
      <input type="number" min="-30" max="30" data-adjust="${x.id}" value="${+p.adjust[x.id] || 0}" aria-label="${x.name} adjustment in minutes" />
      <button class="btn small icon" data-act="adj" data-p="${x.id}" data-d="1" aria-label="${x.name} one minute later">+</button></span></label>`).join('');
    document.querySelectorAll('[data-act="layout"]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.layout === S().studio.layout));
    $('remOn').checked = !!S().reminders.on;
    $('remMin').value = S().reminders.min;
    $('remNote').textContent = HF.isNative()
      ? 'Phone notifications are scheduled for the next 7 days and refresh each time you open the app.'
      : 'On the website, reminders only appear while this page is open. Install the Android app for reminders with the app closed.';
    renderFilesSummary();
    renderSources();
  }
  HF.renders.settings = renderSettings;

  function prayerChanged() { HF.clearPrayerCache(); HF.save(); renderSettings(); HF.render('today'); HF.tickClockNow(); HF.scheduleReminders(); }
  HF.act.geo = () => {
    if (!navigator.geolocation) { HF.toast('Location is not available on this device.'); return; }
    HF.toast('Finding your location…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const inSaudi = lat > 16 && lat < 32.5 && lng > 34.5 && lng < 55.7;
      Object.assign(S().prayer, { city: 'geo', label: 'My location', lat, lng, tz: HF.deviceTZ(), country: inSaudi ? 'SA' : '' });
      prayerChanged(); HF.toast('Prayer times set for your location (Umm al-Qura).');
    }, () => HF.toast('Location permission was refused.'), { timeout: 15000, maximumAge: 3600000 });
  };
  HF.act.adj = (el) => {
    const a = S().prayer.adjust; const k = el.dataset.p;
    a[k] = HF.clamp((+a[k] || 0) + (+el.dataset.d), -30, 30); prayerChanged();
  };
  HF.act.resetAdjust = () => { Object.keys(S().prayer.adjust).forEach((k) => { S().prayer.adjust[k] = 0; }); prayerChanged(); };
  HF.act.layout = (el) => {
    S().studio.layout = el.dataset.layout; S().studio.line = null; S().studio.phase = null;
    HF.save(); renderSettings(); HF.toast(`Using the ${HF.LAYOUTS[el.dataset.layout]} line layout.`);
  };
  HF.act.testReminder = async () => {
    const ok = await HF.ensureNotifyPermission();
    if (!ok) { HF.toast('Notifications are blocked. Allow them in your phone or browser settings.', 4200); return; }
    await HF.notifyAt(new Date(Date.now() + 5000), 'HabitFlow reminder', 'This is how session reminders will look.', 9100);
    HF.toast('A test reminder arrives in 5 seconds.');
  };

  // ---------------------------------------------------------------- books & files
  const fmtMB = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0.1, b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB';
  async function renderFilesSheet() {
    await HF.files.ready; await HF.loadBookIndex().catch(() => []);
    const idx = HF.books.index || [];
    const pdfs = {};
    idx.forEach((b) => { (pdfs[b.pdfName] = pdfs[b.pdfName] || []).push(b); });
    $('filesList').innerHTML = Object.entries(pdfs).map(([name, books]) => {
      const has = HF.files.has(name);
      const audios = books.filter((b) => b.audioName);
      return `<div class="file-row">
        <div class="grow"><div class="ar t">${books.map((b) => HF.esc(b.title)).join(' · ')}</div>
          <div class="faint">${HF.esc(books[0].groupEn)} · PDF ${fmtMB(books[0].pdfBytes)}</div>
          <div class="fname" title="${HF.esc(name)}">${HF.esc(name)}</div>
          ${audios.map((b) => `<div class="faint">Reading of <span class="ar">${HF.esc(b.title)}</span>: ${HF.files.has(b.audioName) ? `<span class="ok">saved</span> <button class="linklike" data-act="removeFile" data-name="${HF.esc(b.audioName)}">remove</button>` : `streams · ${fmtMB(b.audioBytes || 0)} to save`}</div>`).join('')}
          ${books.some((b) => b.id === 'usulsunnah') ? '<div class="faint">No verified reading of Uṣūl as-Sunnah — add your own in the Studio.</div>' : ''}
        </div>
        <div class="file-side">${has ? `<span class="chip good">PDF ✓</span><button class="btn small ghost" data-act="removeFile" data-name="${HF.esc(name)}" aria-label="Remove ${HF.esc(name)}">Remove</button>` : '<span class="chip">No PDF</span>'}</div>
      </div>`;
    }).join('');
    const u = await HF.files.usage();
    const mine = Object.values(HF.files.index).reduce((a, f) => a + (f.size || 0), 0);
    $('filesUsage').textContent = `Stored on this device: ${fmtMB(mine)}${u && u.quota ? ` · space available: ${fmtMB(u.quota - (u.usage || 0))}` : ''}. Choose several files at once — the app recognises each book.`;
  }
  async function renderFilesSummary() {
    await HF.files.ready; await HF.loadBookIndex().catch(() => []);
    const idx = HF.books.index || [];
    const names = [...new Set(idx.map((b) => b.pdfName))];
    const have = names.filter((n) => HF.files.has(n)).length;
    const aud = idx.filter((b) => b.audioName && HF.files.has(b.audioName)).length;
    $('filesSummary').textContent = `${idx.length} mutūn on Shaykh al-Qāsim's lines. Printed pages: ${have} of ${names.length} PDFs added. Readings: ${aud ? `${aud} kept offline, the rest stream` : 'streaming from the Shaykh\'s website'}.`;
  }
  HF.openFilesSheet = () => { renderFilesSheet(); HF.openSheet('files'); };
  HF.act.openFiles = () => HF.openFilesSheet();
  HF.act.importBooks = () => { const f = $('importBooks'); f.value = ''; f.click(); };
  HF.act.removeFile = async (el) => {
    if (!confirm(`Remove ${el.dataset.name} from this device?`)) return;
    await HF.files.remove(el.dataset.name); HF.clearRenderCache(); HF.stopAudio();
    renderFilesSheet(); renderFilesSummary(); HF.render('studio');
  };
  async function onImport(e) {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    HF.toast(`Adding ${files.length} file${files.length > 1 ? 's' : ''}…`, 8000);
    const res = await HF.importFiles(files);
    const ok = res.filter((r) => r.ok), bad = res.filter((r) => !r.ok);
    HF.toast(ok.length ? `Added ${ok.length} file${ok.length > 1 ? 's' : ''}.${bad.length ? ` ${bad.length} skipped.` : ''}` : 'Nothing added.', 4200);
    document.querySelectorAll('#sheet-files .import-warn').forEach((x) => x.remove());
    if (bad.length) $('filesUsage').insertAdjacentHTML('beforebegin', `<div class="notice warn small import-warn">${bad.map((b) => `${HF.esc(b.file)}: ${HF.esc(b.why)}`).join('<br>')}</div>`);
    if (ok.some((r) => /\.pdf$/i.test(r.as))) S().studio.mview = 'print';
    HF.save(); HF.clearRenderCache(); HF.stopAudio();
    renderFilesSheet(); renderFilesSummary(); HF.render('studio');
    if (ok.length && !bad.length) {
      const pdfN = ok.filter((r) => /\.pdf$/i.test(r.as)).length, mp3N = ok.length - pdfN;
      HF.closeSheets();
      HF.toast([pdfN ? `${pdfN} PDF${pdfN > 1 ? 's' : ''} added — showing the printed pages` : '', mp3N ? `${mp3N} reading${mp3N > 1 ? 's' : ''} saved for offline` : ''].filter(Boolean).join(' · ') + '.', 4200);
    }
  }

  // ---------------------------------------------------------------- backup
  HF.act.export = async () => {
    HF.saveNow();
    const json = JSON.stringify({ app: 'HabitFlow', version: 8, exportedAt: new Date().toISOString(), state: S() }, null, 1);
    const name = `habitflow-backup-${HF.todayKey()}.json`;
    if (HF.isNative()) {
      try {
        const { Filesystem, Share } = window.Capacitor.Plugins;
        const w = await Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
        await Share.share({ title: 'HabitFlow backup', files: [w.uri] });
        return;
      } catch (e) {
        try { await navigator.clipboard.writeText(json); HF.toast('Backup copied — paste it into a note or chat to keep it.', 4200); return; } catch (e2) {}
      }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    HF.toast('Backup downloaded. (PDFs and recordings are not in the backup — add them again on a new phone.)', 4200);
  };
  HF.act.import = () => $('importFile').click();
  function importFile(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        const data = parsed && parsed.state ? parsed.state : parsed;
        if (!data || !Array.isArray(data.habits)) throw new Error('not a backup');
        if (!confirm('Replace everything in the app with this backup?')) return;
        HF.state = HF.migrate(data); convertManual(); HF.saveNow(); HF.clearPrayerCache();
        HF.render(); HF.tickClockNow(); HF.scheduleReminders(); HF.toast('Backup restored.');
      } catch (err) { HF.toast("That file isn't a HabitFlow backup."); }
    };
    r.readAsText(f);
  }
  // a hand-entered timetable from older versions becomes minute adjustments on Umm al-Qura
  function convertManual() {
    const p = S().prayer;
    if (!p.pendingManual) return;
    const save = p.adjust; p.adjust = { fajr: 0, shuruuq: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
    HF.clearPrayerCache();
    const base = HF.prayerTimes(HF.todayKey());
    for (const k of Object.keys(p.adjust)) {
      const m = p.pendingManual[k];
      p.adjust[k] = m ? HF.clamp(HF.toMin(m) - HF.toMin(base[k]), -30, 30) : (+save[k] || 0);
    }
    delete p.pendingManual; HF.clearPrayerCache();
  }

  // ---------------------------------------------------------------- sources & licences
  function renderSources() {
    const books = HF.books.index || [];
    $('sources').innerHTML = `
      <p><b>Qur'an:</b> Uthmani Ḥafṣ text, checked letter by letter against the King Fahd Complex Ḥafṣ text (all 6,236 āyāt). Page and line layout of the King Fahd Complex Madinah Muṣḥaf: 1440–1441 print from <a href="https://github.com/MohamadHajjRabee/quran-qcf4" target="_blank" rel="noopener">quran-qcf4</a>; 1421 and 1405 prints from the Quranic Universal Library via <a href="https://github.com/zonetecde/mushaf-layout" target="_blank" rel="noopener">mushaf-layout</a>.</p>
      <p style="margin-top:8px"><b>Recitation:</b> per-āyah audio from <a href="https://alquran.cloud/cdn" target="_blank" rel="noopener">Islamic Network CDN</a> and <a href="https://everyayah.com" target="_blank" rel="noopener">EveryAyah</a>.</p>
      <p style="margin-top:8px"><b>Mutūn:</b> lines follow the printed editions of Shaykh ʿAbd al-Muḥsin al-Qāsim (<a href="https://books.a-alqasim.com/mutoon" target="_blank" rel="noopener">a-alqasim.com</a>; Uṣūl as-Sunnah: ed. Dr. Muḥammad Hishām Ṭāhirī). The PDFs you add stay on your device. Readings by ʿAbd al-ʿAzīz aṣ-Ṣīnī stream from <a href="https://a-alqasim.com/sounds-explain-cats/mutoon_audio/" target="_blank" rel="noopener">the Shaykh's site</a>; line timings were matched to his pauses. Text view (reference text on the same lines):</p>
      <ul style="margin:4px 0 0 18px">${books.map((b) => `<li><span class="ar">${HF.esc(b.title)}</span> — ${HF.esc(b.textSource || 'al-Shāmila via OpenITI')}</li>`).join('')}</ul>
      <p style="margin-top:8px"><b>Prayer times:</b> Umm al-Qura calculation with <a href="https://github.com/batoulapps/adhan-js" target="_blank" rel="noopener">adhan-js</a> (MIT).</p>
      <p style="margin-top:8px"><b>PDF display:</b> <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener">pdf.js</a> (Apache 2.0). <b>Fonts:</b> Amiri Quran, Amiri, IBM Plex Sans Arabic (SIL Open Font License).</p>`;
  }

  // ---------------------------------------------------------------- start-up
  HF.tickClockNow = () => { HF.resetClock(); HF.tickClock(); };
  function init() {
    convertManual();
    HF.initStudio();
    HF.initToday();
    $('importFile').addEventListener('change', importFile);
    $('importBooks').addEventListener('change', onImport);
    $('cityPreset').onchange = (e) => {
      const c = HF.CITIES[e.target.value]; if (!c) return;
      Object.assign(S().prayer, { city: e.target.value, label: c[0], lat: c[1], lng: c[2], tz: c[3], country: c[4] }); prayerChanged();
    };
    $('adjustGrid').addEventListener('change', (e) => {
      const k = e.target.dataset.adjust; if (!k) return;
      S().prayer.adjust[k] = HF.clamp(parseInt(e.target.value, 10) || 0, -30, 30); prayerChanged();
    });
    $('remOn').onchange = async (e) => {
      if (e.target.checked && !(await HF.ensureNotifyPermission())) { e.target.checked = false; HF.toast('Notifications are blocked. Allow them in settings first.', 4200); return; }
      S().reminders.on = e.target.checked; HF.save(); HF.scheduleReminders(); renderSettings();
      if (e.target.checked) HF.toast('Reminders on.');
    };
    $('remMin').onchange = (e) => { S().reminders.min = HF.clamp(parseInt(e.target.value, 10) || 0, 0, 120); HF.save(); HF.scheduleReminders(); };

    let tab = 'studio'; try { tab = sessionStorage.getItem('hf_tab') || 'studio'; } catch (e) {}
    HF.loadBookIndex().catch(() => {});
    HF.tickClock();
    setInterval(HF.tickClock, 1000);
    HF.showTab(tab);
    HF.files.ready.then(() => { if (S().studio.mode === 'mutun') HF.render('studio'); });
    HF.render('review'); // sets the review badge
    HF.scheduleReminders();
    const notes = [];
    if (S().migratedFrom) notes.push('Updated: lines now match the real Muṣḥaf, so line counters start fresh. Your habits and history are kept.');
    if (S().mutunReset) notes.push('Mutūn now follow Shaykh al-Qāsim\'s printed lines, so mutūn line counters start fresh.');
    if (S().prayerNote) notes.push('Prayer times now use the Umm al-Qura method only — adjust by minutes in Settings if needed.');
    if (notes.length) { HF.toast(notes.join(' '), 8000); delete S().migratedFrom; delete S().mutunReset; delete S().prayerNote; HF.save(); }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !HF.isNative()) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }
  init();
})();
