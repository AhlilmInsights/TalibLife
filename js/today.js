/* Today: prayer grid, prayer-anchored sessions, timeline, focus timer, reminders, top bar. */
(function () {
  'use strict';
  const HF = window.HF;
  const $ = HF.$;
  const S = () => HF.state;

  // ---------------------------------------------------------------- session times
  HF.sessionStart = (dayIdx, trackKey) => {
    const cfg = S().schedule[dayIdx][trackKey];
    if (cfg.anchor === 'custom') return HF.toMin(cfg.time);
    const key = HF.weekKeys()[dayIdx];
    return HF.toMin(HF.prayerTimes(key)[cfg.anchor]) + (+cfg.offset || 0);
  };
  function anchorLabel(cfg) {
    if (cfg.anchor === 'custom') return 'Fixed time';
    const name = (HF.ANCHORS.find((a) => a[0] === cfg.anchor) || [])[1];
    const o = +cfg.offset || 0;
    return o === 0 ? `At ${name}` : o > 0 ? `${o} min after ${name}` : `${-o} min before ${name}`;
  }

  // ---------------------------------------------------------------- render
  function renderToday() {
    const s = S(); const di = s.activeDay; const key = HF.weekKeys()[di];
    const dates = HF.weekDates(); const today = HF.weekdayIndex();
    $('daySelect').innerHTML = dates.map((d, i) => `<option value="${i}" ${i === di ? 'selected' : ''}>${HF.shortDate(d)}${i === today ? ' (today)' : ''}</option>`).join('');
    $('todayTitle').textContent = di === today ? 'Today' : HF.DAY_NAMES[di];

    // prayer grid
    const t = HF.prayerTimes(key);
    const np = HF.nextPrayer();
    $('prayerGrid').innerHTML = HF.PRAYERS.map((p) => `<div class="prayer ${!p.prayer ? 'sunrise' : ''} ${di === today && np.id === p.id && !np.tomorrow ? 'next' : ''}">
      <div class="n"><span>${p.name}</span><span class="ar">${p.ar}</span></div><div class="t">${t[p.id]}</div></div>`).join('');
    $('prayerSource').textContent = HF.prayerSourceLabel();

    // excused banner
    const ex = s.excuses[key];
    $('excusedNotice').hidden = !ex;
    if (ex) $('excusedNotice').innerHTML = `This day is excused: ${HF.esc(ex)}. Your streak is protected. <button class="btn small ghost" data-act="unexcuse">Remove excuse</button>`;

    // timeline
    const nowMin = HF.cityNow();
    const rows = HF.PRAYERS.map((p) => ({ type: 'p', start: HF.toMin(t[p.id]), p }));
    HF.TRACKS.forEach((tr) => rows.push({ type: 's', start: HF.sessionStart(di, tr.key), tr }));
    rows.sort((a, b) => a.start - b.start || (a.type === 'p' ? -1 : 1));
    const prayerMins = HF.PRAYERS.filter((p) => p.prayer).map((p) => ({ p, m: HF.toMin(t[p.id]) }));
    $('timeline').innerHTML = rows.map((r) => {
      if (r.type === 'p') return `<div class="ti prayer-row"><span class="time">${HF.fromMin(r.start)}</span><span class="what">${r.p.name} <span class="ar">${r.p.ar}</span></span><span></span></div>`;
      const end = r.start + r.tr.minutes;
      const h = HF.habit(r.tr.habitId); const done = HF.isDone(h, key);
      const now = di === today && nowMin >= r.start && nowMin < end;
      // clash: a prayer falls inside the session, or the session starts within 15 min after the adhan (iqāmah + prayer)
      const clash = prayerMins.find((x) => (x.m >= r.start && x.m < end) || (r.start >= x.m && r.start < x.m + 15));
      const cfg = s.schedule[di][r.tr.key];
      return `<div class="ti ${now ? 'now' : ''} ${done ? 'done' : ''}">
        <span class="time">${HF.fromMin(r.start)}</span>
        <span class="what"><b>${done ? '✓ ' : ''}${HF.esc(r.tr.title)}</b><span>${HF.esc(anchorLabel(cfg))} · lasts ${r.tr.minutes} min${clash ? ` · <span style="color:#F0B49A">overlaps ${clash.p.name}</span>` : ''}</span></span>
        <span class="acts">
          <button class="btn small" data-act="startTrack" data-track="${r.tr.key}" aria-label="Start ${HF.esc(r.tr.title)} timer">Start</button>
          <button class="btn small ${done ? 'good' : ''}" data-act="toggleTrack" data-track="${r.tr.key}" aria-pressed="${done}" aria-label="Mark ${HF.esc(r.tr.title)} done">${done ? 'Done' : '✓'}</button>
          <a class="btn small icon" href="${gcal(r.tr, key, r.start)}" target="_blank" rel="noopener" aria-label="Add to Google Calendar" title="Add to Google Calendar"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/></svg></a>
        </span></div>`;
    }).join('');

    // track editor
    $('tracks').innerHTML = HF.TRACKS.map((tr) => {
      const cfg = s.schedule[di][tr.key]; const done = HF.isDone(HF.habit(tr.habitId), key);
      const isCustom = cfg.anchor === 'custom';
      const off = +cfg.offset || 0;
      return `<div class="track ${done ? 'done' : ''}">
        <div class="spread"><b>${HF.esc(tr.title)}</b><span class="faint num">${HF.fromMin(HF.sessionStart(di, tr.key))} · ${tr.minutes} min</span></div>
        <div class="row">
          <select data-track="${tr.key}" data-field="anchor" aria-label="${HF.esc(tr.title)} anchor">${HF.ANCHORS.map(([v, n]) => `<option value="${v}" ${cfg.anchor === v ? 'selected' : ''}>${v === 'custom' ? n : n}</option>`).join('')}</select>
        </div>
        ${isCustom ? `<div class="row"><input type="time" data-track="${tr.key}" data-field="time" value="${HF.esc(cfg.time)}" aria-label="Start time" /></div>`
          : `<div class="row"><select data-track="${tr.key}" data-field="dir" aria-label="Before or after">
              <option value="1" ${off >= 0 ? 'selected' : ''}>after</option><option value="-1" ${off < 0 ? 'selected' : ''}>before</option></select>
              <input type="number" min="0" max="300" step="5" data-track="${tr.key}" data-field="offset" value="${Math.abs(off)}" aria-label="Minutes" /><span class="faint">min</span></div>`}
      </div>`;
    }).join('');
  }
  HF.renders.today = renderToday;

  function gcal(tr, key, startMin) {
    const d = HF.parseKey(key);
    const fmt = (m) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m); return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}T${String(x.getHours()).padStart(2, '0')}${String(x.getMinutes()).padStart(2, '0')}00`; };
    const tz = S().prayer.tz || HF.deviceTZ(); // session times are on the prayer city's clock
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(tr.title) +
      '&details=' + encodeURIComponent(tr.desc) + `&dates=${fmt(startMin)}/${fmt(startMin + tr.minutes)}&ctz=${encodeURIComponent(tz)}`;
  }

  // ---------------------------------------------------------------- planner actions
  HF.initToday = () => {
    $('daySelect').onchange = (e) => { S().activeDay = +e.target.value; HF.save(); HF.render('today'); };
    $('tracks').addEventListener('change', (e) => {
      const el = e.target; const k = el.dataset.track; if (!k) return;
      const cfg = S().schedule[S().activeDay][k];
      if (el.dataset.field === 'anchor') {
        if (el.value === 'custom') cfg.time = HF.fromMin(HF.sessionStart(S().activeDay, k));
        cfg.anchor = el.value;
      } else if (el.dataset.field === 'time') cfg.time = el.value || cfg.time;
      else if (el.dataset.field === 'offset') { const sign = (+cfg.offset || 0) < 0 ? -1 : 1; cfg.offset = sign * HF.clamp(parseInt(el.value, 10) || 0, 0, 300); }
      else if (el.dataset.field === 'dir') cfg.offset = Math.abs(+cfg.offset || 0) * (+el.value);
      HF.save(); HF.render('today'); HF.scheduleReminders();
    });
  };
  HF.act.preset = (el) => {
    const day = S().schedule[S().activeDay];
    if (el.dataset.preset === 'morning') {
      Object.assign(day, { murajaah: { anchor: 'shuruuq', offset: 15, time: day.murajaah.time }, hifdh: { anchor: 'shuruuq', offset: 35, time: day.hifdh.time },
        mutun: { anchor: 'shuruuq', offset: 65, time: day.mutun.time }, reading: { anchor: 'shuruuq', offset: 85, time: day.reading.time } });
      HF.toast('Morning chain: all four sessions after sunrise.');
    } else {
      Object.assign(day, { murajaah: { anchor: 'fajr', offset: 25, time: day.murajaah.time }, hifdh: { anchor: 'asr', offset: 20, time: day.hifdh.time },
        mutun: { anchor: 'maghrib', offset: 15, time: day.mutun.time }, reading: { anchor: 'isha', offset: 40, time: day.reading.time } });
      HF.toast('Spread out: after Fajr, ʿAṣr, Maghrib and ʿIshāʾ.');
    }
    HF.save(); HF.render('today'); HF.scheduleReminders();
  };
  HF.act.copyWeek = () => {
    const src = JSON.stringify(S().schedule[S().activeDay]);
    S().schedule = Array.from({ length: 7 }, () => JSON.parse(src));
    HF.save(); HF.render('today'); HF.scheduleReminders();
    HF.toast(`${HF.DAY_NAMES[S().activeDay]}'s plan now applies to every day.`);
  };
  HF.act.toggleTrack = (el) => {
    const tr = HF.TRACKS.find((t) => t.key === el.dataset.track); const key = HF.activeDateKey();
    if (key > HF.todayKey()) { HF.toast("That day hasn't come yet."); return; }
    const done = !HF.isDone(HF.habit(tr.habitId), key);
    if (HF.setDone(tr.habitId, key, done) && done) HF.chime();
    HF.render('today', 'habits');
  };
  HF.act.unexcuse = () => { HF.removeExcuse(HF.activeDateKey()); };

  // ---------------------------------------------------------------- focus timer (survives screen lock)
  const timer = { total: 20 * 60, left: 20 * 60, endAt: null, iv: null, track: 'murajaah' };
  const baseTitle = document.title;
  function renderTimer() {
    const m = Math.floor(timer.left / 60), s = timer.left % 60;
    $('timerClock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    $('timerToggle').textContent = timer.endAt ? 'Pause' : (timer.left < timer.total ? 'Resume' : 'Start');
    const tr = HF.TRACKS.find((t) => t.key === timer.track);
    $('timerTitle').textContent = tr ? tr.title : 'Focus timer';
    $('timerSub').textContent = tr ? tr.desc : '';
    if ($('timerPresets').dataset.track !== timer.track) {
      $('timerPresets').dataset.track = timer.track;
      $('timerPresets').innerHTML = HF.TRACKS.map((t) => `<button class="btn small ${t.key === timer.track ? 'primary' : ''}" data-act="timerPick" data-track="${t.key}">${HF.esc(t.title)} · ${t.minutes}m</button>`).join('');
    }
    document.title = timer.endAt ? `${$('timerClock').textContent} · ${baseTitle}` : baseTitle;
  }
  function pick(track) {
    clearInterval(timer.iv); timer.endAt = null; HF.cancelTimerNotification();
    const tr = HF.TRACKS.find((t) => t.key === track) || HF.TRACKS[0];
    timer.track = tr.key; timer.total = timer.left = tr.minutes * 60;
    renderTimer();
  }
  function tick() {
    timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    if (timer.left <= 0) { clearInterval(timer.iv); timer.endAt = null; renderTimer(); finished(); return; }
    renderTimer();
  }
  function finished() {
    HF.chime(523.25, 783.99, 0.08); setTimeout(() => HF.chime(587.33, 880, 0.08), 350); setTimeout(() => HF.chime(659.25, 1046.5, 0.08), 700);
    HF.vibrate([300, 150, 300]);
    const tr = HF.TRACKS.find((t) => t.key === timer.track);
    if (tr) { HF.setDone(tr.habitId, HF.todayKey(), true); HF.toast(`${tr.title} done — ticked for today.`, 3600); }
    HF.render('today', 'habits');
  }
  HF.act.openTimer = () => { renderTimer(); HF.openSheet('timer'); };
  HF.act.startTrack = (el) => { pick(el.dataset.track); HF.openSheet('timer'); };
  HF.act.timerPick = (el) => pick(el.dataset.track);
  HF.act.timerToggle = () => {
    if (timer.endAt) { timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000)); timer.endAt = null; clearInterval(timer.iv); HF.cancelTimerNotification(); }
    else {
      if (timer.left <= 0) timer.left = timer.total;
      timer.endAt = Date.now() + timer.left * 1000;
      HF.chime(440, 660, 0.05);
      clearInterval(timer.iv); timer.iv = setInterval(tick, 500);
      const tr = HF.TRACKS.find((t) => t.key === timer.track);
      HF.notifyAt(new Date(timer.endAt), 'Session finished', `${tr ? tr.title : 'Focus'} — well done.`, 9001, true);
    }
    renderTimer();
  };
  HF.act.timerReset = () => { clearInterval(timer.iv); timer.endAt = null; timer.left = timer.total; HF.cancelTimerNotification(); renderTimer(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer.endAt) tick(); });

  // ---------------------------------------------------------------- reminders
  // APK: real phone notifications via Capacitor LocalNotifications (work with the app closed).
  // Website: browser notifications, only while the page is open.
  const LN = () => (HF.isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  let webTimers = [], webTimerNote = null; // reminders, and the focus timer's own alert (kept apart)
  HF.notifyAt = async (date, title, body, id, isTimer) => {
    const ln = LN();
    if (ln) {
      try { await ln.schedule({ notifications: [{ id, title, body, schedule: { at: date, allowWhileIdle: true } }] }); } catch (e) {}
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      const ms = date - Date.now();
      if (ms > 0 && ms < 24 * 3600 * 1000) {
        const h = setTimeout(() => { try { new Notification(title, { body, icon: './icons/icon-192.png' }); } catch (e) {} }, ms);
        if (isTimer) { clearTimeout(webTimerNote); webTimerNote = h; } else webTimers.push(h);
      }
    }
  };
  HF.cancelTimerNotification = async () => {
    clearTimeout(webTimerNote); webTimerNote = null;
    const ln = LN(); if (ln) { try { await ln.cancel({ notifications: [{ id: 9001 }] }); } catch (e) {} }
  };
  HF.scheduleReminders = async () => {
    webTimers.forEach(clearTimeout); webTimers = [];
    const r = S().reminders; const ln = LN();
    if (ln) {
      try {
        const pending = await ln.getPending();
        const ids = (pending.notifications || []).map((n) => ({ id: n.id })).filter((n) => n.id < 9000);
        if (ids.length) await ln.cancel({ notifications: ids });
      } catch (e) {}
    }
    if (!r.on) return;
    const now = Date.now(); const list = [];
    for (let d = 0; d < (ln ? 7 : 1); d++) {
      const key = HF.addDays(HF.todayKey(), d); const di = HF.weekdayIndex(HF.parseKey(key));
      HF.TRACKS.forEach((tr, ti) => {
        const cfg = S().schedule[di][tr.key];
        const start = cfg.anchor === 'custom' ? HF.toMin(cfg.time) : HF.toMin(HF.prayerTimes(key)[cfg.anchor]) + (+cfg.offset || 0);
        // session times are on the prayer city's clock: the real moment, correct across DST changes
        const date = HF.cityDate(key, start - (+r.min || 0));
        if (date.getTime() > now) list.push({ id: d * 10 + ti + 1, title: tr.title, body: `${r.min ? `In ${r.min} min` : 'Now'} · ${tr.minutes} min · ${tr.desc}`, schedule: { at: date, allowWhileIdle: true }, date });
      });
    }
    if (ln) {
      try { if (list.length) await ln.schedule({ notifications: list.map(({ id, title, body, schedule }) => ({ id, title, body, schedule })) }); } catch (e) {}
      return;
    }
    for (const n of list) await HF.notifyAt(n.date, n.title, n.body, n.id);
  };
  HF.ensureNotifyPermission = async () => {
    const ln = LN();
    if (ln) {
      try { const p = await ln.requestPermissions(); return p.display === 'granted'; } catch (e) { return false; }
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  };

  // ---------------------------------------------------------------- top bar + clock
  let lastMinute = -1, lastDay = HF.todayKey();
  HF.resetClock = () => { lastMinute = -1; };
  HF.tickClock = () => {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (now.getMinutes() === lastMinute) return;
    lastMinute = now.getMinutes();
    if (HF.todayKey() !== lastDay) { lastDay = HF.todayKey(); S().activeDay = HF.weekdayIndex(); HF.clearPrayerCache(); HF.render(); HF.scheduleReminders(); }
    const np = HF.nextPrayer();
    $('nextPrayer').innerHTML = `${np.name} ${np.time}<span class="ar">${np.ar}</span>`;
    $('topSub').textContent = `in ${HF.fmtDur(np.inMin)} · ${HF.prayerSourceLabel()}`;
    // don't rebuild the planner under someone's fingers (an offset box being typed in)
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#view-today') && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (document.querySelector('#view-today.active') && !typing) renderToday();
  };
})();
