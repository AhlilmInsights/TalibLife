/* HabitFlow core: helpers, state, storage, migration. */
(function () {
  'use strict';
  const HF = (window.HF = { act: {}, renders: {} });

  // ---------------------------------------------------------------- helpers
  HF.$ = (id) => document.getElementById(id);
  HF.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  HF.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  HF.DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  HF.DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  HF.weekdayIndex = (d = new Date()) => (d.getDay() + 6) % 7; // Monday = 0
  HF.dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  HF.todayKey = () => HF.dateKey(new Date());
  HF.parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  HF.addDays = (key, n) => { const d = HF.parseKey(key); d.setDate(d.getDate() + n); return HF.dateKey(d); };
  HF.daysBetween = (a, b) => Math.round((HF.parseKey(b) - HF.parseKey(a)) / 86400000);
  HF.weekDates = () => {
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - HF.weekdayIndex(now));
    return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  };
  HF.weekKeys = () => HF.weekDates().map(HF.dateKey);
  HF.activeDateKey = () => HF.weekKeys()[HF.state.activeDay];
  HF.toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0); };
  HF.fromMin = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  HF.fmtDur = (min) => min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`;
  HF.shortDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  HF.arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
  HF.isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // ---------------------------------------------------------------- toast + sound
  let toastTimer = null;
  HF.toast = (msg, ms = 2800) => {
    const t = HF.$('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  };
  let audioCtx = null;
  HF.chime = (f1 = 587.33, f2 = 880, vol = 0.06) => {
    try {
      if (!audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) audioCtx = new C(); }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
      o.type = 'sine';
      o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + 0.12);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.2);
    } catch (e) { /* audio is optional */ }
  };
  HF.vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---------------------------------------------------------------- tracks & defaults
  HF.TRACKS = [
    { key: 'murajaah', habitId: 'quran-murajaah', title: "Qur'an muraja'ah", minutes: 20, desc: 'Review: weak pages first, then the cycle' },
    { key: 'hifdh', habitId: 'quran-hifdh', title: "New Qur'an ḥifẓ", minutes: 30, desc: 'Line by line: look, from memory, link' },
    { key: 'mutun', habitId: 'mutun-hifdh', title: 'Mutūn ḥifẓ', minutes: 20, desc: 'Shaykh al-Qāsim edition, line by line' },
    { key: 'reading', habitId: 'daily-reading', title: 'Reading', minutes: 20, desc: 'Focused book reading' }
  ];
  HF.ANCHORS = [
    ['fajr', 'Fajr'], ['shuruuq', 'Sunrise'], ['dhuhr', 'Dhuhr'], ['asr', 'ʿAṣr'], ['maghrib', 'Maghrib'], ['isha', 'ʿIshāʾ'], ['custom', 'Fixed time']
  ];
  const defSchedule = () => ({
    murajaah: { anchor: 'shuruuq', offset: 15, time: '06:15' },
    hifdh: { anchor: 'shuruuq', offset: 35, time: '06:35' },
    mutun: { anchor: 'asr', offset: 25, time: '16:00' },
    reading: { anchor: 'isha', offset: 40, time: '21:00' }
  });
  const defHabits = () => [
    { id: 'quran-murajaah', name: "Qur'an muraja'ah", note: 'Weak pages first, then the review cycle', trackKey: 'murajaah', minutes: 20, target: 7, log: {} },
    { id: 'quran-hifdh', name: "New Qur'an ḥifẓ", note: 'Dual front: Juz\' 30 back to Muḥammad, al-Baqarah forward', trackKey: 'hifdh', minutes: 30, target: 7, log: {} },
    { id: 'mutun-hifdh', name: 'Mutūn ḥifẓ', note: 'Shaykh ʿAbd al-Muḥsin al-Qāsim edition', trackKey: 'mutun', minutes: 20, target: 6, log: {} },
    { id: 'daily-reading', name: 'Reading', note: 'Focused reading session', trackKey: 'reading', minutes: 20, target: 6, log: {} },
    { id: 'qari-listen', name: 'Listen to a reciter', note: 'Al-Ḥuṣarī, al-Minshāwī or ʿAlī al-Ḥudhayfī', when: 'Any time', minutes: 10, target: 7, log: {} },
    { id: 'five-prayers', name: 'Five prayers on time', note: 'Fajr · Dhuhr · ʿAṣr · Maghrib · ʿIshāʾ', when: 'Prayer times', minutes: 0, target: 7, log: {} }
  ];
  HF.defaultState = () => ({
    v: 8,
    activeDay: HF.weekdayIndex(),
    habits: defHabits(),
    excuses: {},
    monthlyExcuseLog: [],
    checkinHistory: [],
    schedule: Array.from({ length: 7 }, defSchedule),
    prayer: { city: 'hail', label: "Ha'il", lat: 27.5114, lng: 41.7208, tz: 'Asia/Riyadh', country: 'SA', adjust: { fajr: 0, shuruuq: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } },
    studio: {
      mode: 'quran', layout: '1441', page: 582, line: null, phase: 'look',
      targets: { look: 10, blind: 5, link: 3 }, qari: 'husary', repeat: 1, speed: 1,
      qprog: {},
      // mutūn: position, progress per printed page, view and audio settings per book
      book: 'usul', mpos: {}, mprog: {}, mview: 'print', masail: {}, audioAdj: {}, customAudio: {}, audioMarks: {}, follow: true,
      myTexts: []
    },
    review: { items: {}, seeded: false, perDay: 6 },
    reminders: { on: false, min: 10 },
    backPages: 0, frontPages: 0
  });

  // ---------------------------------------------------------------- migration
  const SLOT_TO_ANCHOR = {
    A1: ['fajr', -60], A2: ['fajr', -40], B1: ['shuruuq', 5], B2: ['shuruuq', 25], C1: ['dhuhr', 25], C2: ['dhuhr', 45],
    D1: ['maghrib', -45], D2: ['maghrib', -25], F1: ['maghrib', 35], F2: ['maghrib', 55], E1: ['isha', 40], E2: ['isha', 60],
    FAJR_POST: ['fajr', 25], ASR_POST: ['asr', 20], M1: ['shuruuq', 55], M2: ['dhuhr', 75], M3: ['maghrib', -65], M4: ['isha', 90],
    M_FAJR: ['fajr', 45], M_ASR: ['asr', 20], M_MAGHRIB: ['maghrib', 15], R1: ['shuruuq', 75], R2: ['dhuhr', 95], R3: ['maghrib', -85],
    R4: ['isha', 110], R_DHUHR: ['dhuhr', 15], R_SLEEP: ['isha', 160]
  };
  // pages whose lines differ between the 1421 and the 1440–1441 print (line progress there starts fresh)
  const REFLOWED = new Set([27, 71, 76, 77, 90, 92, 96, 104, 130, 131, 149, 150, 153, 162, 177, 207, 208, 213, 225, 226, 228, 254, 281, 283, 284, 299, 301, 302, 303, 304, 308, 319, 323, 331, 332, 336, 337, 338, 341, 342, 349, 350, 351, 364, 366, 367, 368, 371, 372, 374, 375, 376, 377, 385, 387, 393, 395, 400, 405, 413, 414, 415, 417, 418, 435, 442, 443, 444, 445, 446, 447, 448, 449, 452, 453, 454, 457, 460, 477, 482, 486, 491, 495, 496, 498, 499, 504, 506, 507, 510, 518, 519, 521, 523, 525, 526, 528, 529, 530, 531, 533, 535, 536, 544, 545, 546, 548, 549, 555, 556, 557, 558, 565, 567, 568, 569, 577, 578, 579, 582, 584, 585, 586, 587, 590, 591, 600]);

  function fromV6(old) {
    // versions before the tabbed app (single page with Mon–Sun ticks)
    const s = HF.defaultState(); s.v = 7;
    const weekKeys = HF.weekKeys();
    s.habits = old.habits.map((h) => {
      const log = (h.log && typeof h.log === 'object') ? { ...h.log } : {};
      if (Array.isArray(h.days)) h.days.forEach((d, i) => { if (d) log[weekKeys[i]] = true; });
      return { id: h.id, name: h.name, note: h.subtitle || h.note || '', trackKey: h.trackKey, when: h.fixedSlot || h.when, minutes: h.duration ?? h.minutes ?? 0, target: h.target || 7, log };
    });
    s.excuses = (old.excuses && typeof old.excuses === 'object') ? old.excuses : {};
    if (Array.isArray(old.excusedDaysOfWeek)) old.excusedDaysOfWeek.forEach((r, i) => { if (r) s.excuses[weekKeys[i]] = r; });
    s.monthlyExcuseLog = Array.isArray(old.monthlyExcuseLog) ? old.monthlyExcuseLog : [];
    s.checkinHistory = (old.checkinHistory || []).map((c) => ({ id: c.id, date: c.date, review: c.murajaah || c.review || '', fresh: c.hifdh || c.fresh || '', track: c.track, pages: c.pages || 0 }));
    s.backPages = +old.backPages || 0;
    s.frontPages = +old.frontPages || 0;
    if (Array.isArray(old.dailySchedule) && old.dailySchedule.length === 7) {
      s.schedule = old.dailySchedule.map((day) => {
        const out = defSchedule();
        for (const key of Object.keys(out)) {
          const cfg = day && day[key];
          if (!cfg) continue;
          if (cfg.slotId === 'CUSTOM') out[key] = { anchor: 'custom', offset: 0, time: cfg.customTime || out[key].time };
          else if (SLOT_TO_ANCHOR[cfg.slotId]) { const [a, o] = SLOT_TO_ANCHOR[cfg.slotId]; out[key] = { anchor: a, offset: o, time: cfg.customTime || out[key].time }; }
        }
        return out;
      });
    }
    if (old.prayerManualOverride && Array.isArray(old.prayers)) s.prayer.manual = Object.fromEntries(old.prayers.map((p) => [p.id, p.time]));
    const hs = old.hifdhStudio || {};
    if (hs.targetLook) s.studio.targets = { look: hs.targetLook, blind: hs.targetBlind || 5, link: hs.targetLink || 3 };
    if (hs.pageNumber) s.studio.page = hs.pageNumber;
    if (hs.studioMode === 'mutuun') s.studio.mode = 'mutun';
    s.studio.layout = '1421';
    const pagesProg = Object.assign({}, hs.pageProgress || {}, hs.pageNumber ? { [hs.pageNumber]: hs.lines } : {});
    for (const [p, lines] of Object.entries(pagesProg)) {
      if (Array.isArray(lines) && lines.length && lines.every((l) => l.mastered)) s.review.items['q:' + p] = { strength: 1, due: HF.todayKey(), last: null, reps: 0, lapses: 0 };
    }
    for (const book of Object.values(hs.mutuunBooksData || {})) {
      for (const sec of (book.sections || [])) if (String(sec.id || '').includes('-custom-')) s.studio.myTexts.push({ title: sec.title, text: sec.text });
    }
    s.migratedFrom = old.v || 6;
    return s;
  }

  function fromV7(st) {
    const d = HF.defaultState();
    // prayer: Umm al-Qura only now; a hand-entered timetable becomes minute adjustments
    const p = st.prayer || {};
    const city = HF_CITY_FALLBACK[p.city] || null;
    const np = { ...d.prayer, adjust: { ...d.prayer.adjust, ...(p.adjust || {}) } };
    if (p.city && p.city !== 'geo' && city) Object.assign(np, { city: p.city, label: city[0], lat: city[1], lng: city[2], tz: city[3], country: city[4] });
    else if (p.city === 'geo' && p.lat) Object.assign(np, { city: 'geo', label: 'My location', lat: p.lat, lng: p.lng, tz: deviceTZ(), country: (p.lat > 16 && p.lat < 32.5 && p.lng > 34.5 && p.lng < 55.7) ? 'SA' : '' });
    if (p.manual) np.pendingManual = p.manual; // converted once prayer.js is ready (needs the calculator)
    if (p.source === 'mawaqit' || p.source === 'manual') st.prayerNote = true;
    st.prayer = np;
    // Qur'an: the 1440–1441 print becomes the default; carry progress over on pages whose lines did not change
    const s = st.studio;
    if (s.layout === '1421' || !s.layout) {
      const old = (s.qprog && s.qprog['1421']) || {};
      s.qprog = s.qprog || {}; s.qprog['1441'] = s.qprog['1441'] || {};
      for (const [pg, prog] of Object.entries(old)) if (!REFLOWED.has(+pg)) s.qprog['1441'][pg] = prog;
      s.layout = '1441'; s.line = null; s.phase = null;
    }
    // mutūn: lines now follow the printed edition, so the old section counters can't be mapped
    const hadMutun = Object.keys(s.mprog || {}).length > 0;
    s.mprog = {}; s.mpos = {};
    for (const k of ['sec', 'mline', 'customLines', 'audioMarks', 'audioPick']) delete s[k];
    if (!d.studio.book) s.book = 'usul';
    if (!['usul', 'qawaid', 'nawaqid', 'nawawi', 'tawhid', 'wasitiyyah', 'bulugh', 'umdah', 'usulsunnah', 'mine'].includes(s.book)) s.book = 'usul';
    for (const k of Object.keys(st.review.items || {})) if (k.startsWith('m:')) delete st.review.items[k];
    if (hadMutun) st.mutunReset = true;
    st.v = 8;
    return st;
  }
  // city table needed during migration (prayer.js loads later)
  const HF_CITY_FALLBACK = {
    hail: ["Ha'il", 27.5114, 41.7208, 'Asia/Riyadh', 'SA'], riyadh: ['Riyadh', 24.7136, 46.6753, 'Asia/Riyadh', 'SA'], makkah: ['Makkah', 21.4225, 39.8262, 'Asia/Riyadh', 'SA'],
    madinah: ['Madinah', 24.4672, 39.6111, 'Asia/Riyadh', 'SA'], jeddah: ['Jeddah', 21.4858, 39.1925, 'Asia/Riyadh', 'SA'], dammam: ['Dammam', 26.4207, 50.0888, 'Asia/Riyadh', 'SA'],
    buraydah: ['Buraydah (al-Qaṣīm)', 26.3592, 43.9818, 'Asia/Riyadh', 'SA'], tabuk: ['Tabuk', 28.3835, 36.5662, 'Asia/Riyadh', 'SA'], taif: ['Taif', 21.2703, 40.4158, 'Asia/Riyadh', 'SA'],
    abha: ['Abha', 18.2164, 42.5053, 'Asia/Riyadh', 'SA'], jazan: ['Jazan', 16.8892, 42.5511, 'Asia/Riyadh', 'SA'], najran: ['Najran', 17.5656, 44.2289, 'Asia/Riyadh', 'SA'],
    sakaka: ['Sakaka (al-Jawf)', 29.9697, 40.2064, 'Asia/Riyadh', 'SA'], arar: ['Arar', 30.9753, 41.0381, 'Asia/Riyadh', 'SA'], hafr: ['Hafr al-Batin', 28.4342, 45.9636, 'Asia/Riyadh', 'SA'],
    hofuf: ['al-Hofuf (al-Ahsa)', 25.3833, 49.5864, 'Asia/Riyadh', 'SA'], yanbu: ['Yanbu', 24.0895, 38.0618, 'Asia/Riyadh', 'SA']
  };
  function deviceTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh'; } catch (e) { return 'Asia/Riyadh'; } }

  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const ANCH = ['fajr', 'shuruuq', 'dhuhr', 'asr', 'maghrib', 'isha', 'custom'];
  const TIME = /^\d{2}:\d{2}$/;
  function fillDefaults(st) {
    const d = HF.defaultState();
    // anything of the wrong shape (a hand-edited or damaged backup) falls back to the default
    for (const k of Object.keys(d)) {
      if (st[k] === undefined || st[k] === null) st[k] = d[k];
      else if (isObj(d[k]) && !isObj(st[k])) st[k] = d[k];
      else if (Array.isArray(d[k]) && !Array.isArray(st[k])) st[k] = d[k];
    }
    for (const k of ['studio', 'prayer', 'review', 'reminders']) if (!isObj(st[k])) st[k] = d[k];
    if (!isObj(st.prayer.adjust)) st.prayer.adjust = { ...d.prayer.adjust };
    for (const k of Object.keys(d.prayer.adjust)) st.prayer.adjust[k] = HF.clamp(Math.round(+st.prayer.adjust[k] || 0), -60, 60);
    if (!isObj(st.review.items)) st.review.items = {};
    for (const [k, it] of Object.entries(st.review.items)) {
      const okKey = /^q:\d{1,3}$/.test(k) ? (+k.slice(2) >= 1 && +k.slice(2) <= 604) : /^(mp|m|t):[\w:-]{1,80}$/.test(k);
      if (!isObj(it) || !okKey) { delete st.review.items[k]; continue; }
      it.strength = HF.clamp(+it.strength || 0, 0, 10);
    }
    if (!isObj(st.excuses)) st.excuses = {};
    if (!Array.isArray(st.checkinHistory)) st.checkinHistory = [];
    st.checkinHistory = st.checkinHistory.filter(isObj);
    for (const k of Object.keys(d.studio)) if (st.studio[k] === undefined) st.studio[k] = d.studio[k];
    for (const k of Object.keys(d.prayer)) if (st.prayer[k] === undefined) st.prayer[k] = d.prayer[k];
    for (const k of Object.keys(d.prayer.adjust)) if (st.prayer.adjust[k] === undefined) st.prayer.adjust[k] = 0;
    for (const k of Object.keys(d.review)) if (st.review[k] === undefined) st.review[k] = d.review[k];
    if (!Array.isArray(st.schedule) || st.schedule.length !== 7) st.schedule = d.schedule;
    st.schedule = st.schedule.map((day, i) => {
      const def = d.schedule[i]; const out = {};
      for (const t of Object.keys(def)) {
        const e = isObj(day) && isObj(day[t]) ? day[t] : {};
        out[t] = { anchor: ANCH.includes(e.anchor) ? e.anchor : def[t].anchor, offset: HF.clamp(Math.round(+e.offset || 0), -240, 600), time: TIME.test(e.time) ? e.time : def[t].time };
        if (!ANCH.includes(e.anchor)) out[t].offset = def[t].offset;
      }
      return out;
    });
    if (!Array.isArray(st.habits)) st.habits = d.habits;
    st.habits = st.habits.filter(isObj);
    st.habits.forEach((h) => {
      if (!h.log || typeof h.log !== 'object') h.log = {};
      h.id = String(h.id || ('h' + Math.random().toString(36).slice(2, 8)));
      h.name = String(h.name || 'Habit'); h.note = String(h.note || ''); if (h.when != null) h.when = String(h.when);
      h.minutes = HF.clamp(Math.round(+h.minutes || 0), 0, 600); h.target = HF.clamp(Math.round(+h.target || 7), 1, 7);
    });
    if (!['1441', '1421', '1405'].includes(st.studio.layout)) st.studio.layout = '1441';
    st.activeDay = HF.weekdayIndex();
    return st;
  }
  function migrate(old) {
    if (!isObj(old) || !Array.isArray(old.habits)) return HF.defaultState();
    let st = old;
    if (!st.v || st.v < 7) st = fromV6(st);
    if (st.v === 7) { st = fillDefaults7(st); st = fromV7(st); }
    return fillDefaults(st);
  }
  function fillDefaults7(st) {
    st.studio = st.studio || {}; st.review = st.review || { items: {} }; st.review.items = st.review.items || {};
    st.prayer = st.prayer || {};
    return st;
  }
  HF.migrate = migrate;

  // ---------------------------------------------------------------- storage
  const KEY = 'habitflow_hail_v6';
  HF.load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { console.warn('Could not read saved data', e); }
    return HF.defaultState();
  };
  let saveTimer = null;
  HF.saveNow = () => {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(HF.state));
    } catch (e) {
      try {
        Object.keys(localStorage).forEach((k) => { if (k.startsWith('mushaf_page_')) localStorage.removeItem(k); });
        localStorage.setItem(KEY, JSON.stringify(HF.state));
      } catch (e2) { HF.toast("Couldn't save — storage is full. Export a backup from Settings."); }
    }
  };
  // coalesce rapid saves (each tap) into one write
  HF.save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(HF.saveNow, 250); };
  window.addEventListener('pagehide', () => HF.saveNow());
  document.addEventListener('visibilitychange', () => { if (document.hidden) HF.saveNow(); });

  HF.state = HF.load();

  // ---------------------------------------------------------------- habits helpers used across views
  HF.habit = (id) => HF.state.habits.find((h) => h.id === id);
  HF.isDone = (h, key) => !!(h && h.log && h.log[key]);
  HF.isExcused = (key) => !!HF.state.excuses[key];
  HF.setDone = (habitId, key, done) => {
    const h = HF.habit(habitId);
    if (!h) { HF.toast('That habit was deleted. Add it again in Habits.'); return false; }
    if (done) h.log[key] = true; else delete h.log[key];
    HF.save();
    return true;
  };

  // ---------------------------------------------------------------- rendering registry
  HF.render = (...names) => {
    const list = names.length ? names : Object.keys(HF.renders);
    for (const n of list) {
      try { HF.renders[n] && HF.renders[n](); } catch (e) { console.error('render ' + n, e); }
    }
  };
})();
