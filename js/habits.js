/* Habits: weekly grid, streaks, excused days, habit editor. */
(function () {
  'use strict';
  const HF = window.HF;
  const $ = HF.$;
  const S = () => HF.state;

  function ratio(key) {
    const hs = S().habits; if (!hs.length) return 0;
    return hs.filter((h) => HF.isDone(h, key)).length / hs.length;
  }
  // Count back from today. Excused days don't add or break; today doesn't break while it's in progress.
  function streak(test) {
    let n = 0; const d = new Date();
    for (let i = 0; i < 730; i++) {
      const k = HF.dateKey(d);
      if (test(k)) n++;
      else if (!HF.isExcused(k) && i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  HF.overallStreak = () => streak((k) => ratio(k) >= 0.5);
  const habitStreak = (h) => streak((k) => HF.isDone(h, k));

  function renderHabits() {
    const s = S(); const keys = HF.weekKeys(); const today = HF.todayKey();
    const excusedWeek = keys.filter(HF.isExcused).length;
    let doneSum = 0, targetSum = 0, minutes = 0;
    s.habits.forEach((h) => {
      const done = keys.filter((k) => HF.isDone(h, k)).length;
      const target = Math.max(0, Math.min(h.target || 7, 7 - excusedWeek));
      doneSum += Math.min(done, target); targetSum += target; minutes += done * (h.minutes || 0);
    });
    const st = HF.overallStreak();
    const monthKey = today.slice(0, 7);
    const monthEx = s.monthlyExcuseLog.filter((e) => (e.dateISO || '').slice(0, 7) === monthKey).length;
    $('kpis').innerHTML = [
      [`${st} day${st === 1 ? '' : 's'}`, 'Current streak'],
      [`${targetSum ? Math.round((doneSum / targetSum) * 100) : 0}%`, 'Of this week\'s goals'],
      [HF.fmtDur(minutes), 'Study time this week'],
      [String(monthEx), 'Excused days this month']
    ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

    $('week').innerHTML = keys.map((k, i) => {
      const ex = HF.isExcused(k); const pct = Math.round(ratio(k) * 100);
      return `<button class="bar ${ex ? 'excused' : ''} ${k === today ? 'today' : ''}" data-act="pickDay" data-i="${i}" aria-pressed="${i === s.activeDay}" aria-label="${HF.DAY_NAMES[i]}: ${ex ? 'excused' : pct + '% done'}">
        <span>${ex ? 'excused' : pct + '%'}</span><span class="col"><i style="height:${ex ? 100 : pct}%"></i></span><span>${HF.DAY_SHORT[i]}</span></button>`;
    }).join('');

    const dates = HF.weekDates();
    $('matrix').innerHTML = `<thead><tr><th scope="col">Goal</th>${dates.map((d, i) => `<th scope="col" ${keys[i] === today ? 'style="color:var(--gilt)"' : ''}>${HF.DAY_SHORT[i]}<br>${d.getDate()}</th>`).join('')}<th scope="col">Streak</th><th scope="col">Week</th><th></th></tr></thead><tbody>` +
      (s.habits.length ? s.habits.map((h) => {
        const done = keys.filter((k) => HF.isDone(h, k)).length;
        const tr = h.trackKey && HF.TRACKS.find((t) => t.key === h.trackKey);
        const when = tr ? HF.fromMin(HF.sessionStart(s.activeDay, tr.key)) + ' (planner)' : (h.when || 'Any time');
        return `<tr><td><button class="hname" data-act="editHabit" data-h="${HF.esc(h.id)}" aria-label="Edit ${HF.esc(h.name)}"><b>${HF.esc(h.name)}</b></button><span>${HF.esc(when)}${h.minutes ? ` · ${+h.minutes || 0} min` : ''}</span></td>` +
          keys.map((k, i) => {
            const on = HF.isDone(h, k), ex = HF.isExcused(k), fut = k > today;
            return `<td><button class="cell ${on ? 'on' : ''} ${!on && ex ? 'ex' : ''} ${k === today ? 'today' : ''}" data-act="cell" data-h="${HF.esc(h.id)}" data-k="${k}" ${fut ? 'disabled' : ''} aria-pressed="${on}" aria-label="${HF.esc(h.name)}, ${HF.DAY_NAMES[i]}">${on ? '✓' : (ex ? '–' : '')}</button></td>`;
          }).join('') +
          `<td class="num">${habitStreak(h)}</td><td class="num" style="${done >= (+h.target || 7) ? 'color:#7FD0B1' : ''}">${done}/${+h.target || 7}</td>
          <td><button class="btn small ghost" data-act="editHabit" data-h="${HF.esc(h.id)}">Edit</button></td></tr>`;
      }).join('') : `<tr><td colspan="11" class="faint">No goals yet — add one.</td></tr>`) + '</tbody>';
    // keep today's column in view on phones
    const wrap = document.querySelector('.matrix-wrap');
    if (wrap && !wrap.dataset.scrolled && wrap.scrollWidth > wrap.clientWidth) {
      const th = $('matrix').querySelectorAll('thead th')[HF.weekdayIndex() + 1];
      const first = $('matrix').querySelector('thead th');
      if (th) { wrap.scrollLeft = Math.max(0, th.offsetLeft - (first ? first.offsetWidth : 0) - 8); wrap.dataset.scrolled = '1'; }
    }
  }
  HF.renders.habits = renderHabits;

  HF.act.pickDay = (el) => { S().activeDay = +el.dataset.i; HF.save(); HF.render('habits', 'today'); };
  HF.act.cell = (el) => {
    const h = HF.habit(el.dataset.h); const k = el.dataset.k;
    if (k > HF.todayKey()) return;
    const on = !HF.isDone(h, k);
    if (HF.setDone(h.id, k, on) && on) HF.chime();
    HF.render('habits', 'today');
  };

  // ---------------------------------------------------------------- habit editor
  function fillHabit(h) {
    $('habitTitle').textContent = h ? 'Edit goal' : 'New goal';
    $('habitId').value = h ? h.id : '';
    $('habitName').value = h ? h.name : '';
    $('habitNote').value = h ? (h.note || '') : '';
    $('habitMin').value = h ? (h.minutes || 0) : 15;
    $('habitTarget').value = h ? (h.target || 7) : 7;
    const when = $('habitWhen');
    when.disabled = !!(h && h.trackKey);
    when.value = h && !h.trackKey ? (h.when || '') : '';
    when.placeholder = h && h.trackKey ? 'Set in Today → sessions' : 'After Fajr';
    $('habitDelete').hidden = !h;
    HF.openSheet('habit');
    setTimeout(() => $('habitName').focus(), 60);
  }
  HF.act.newHabit = () => fillHabit(null);
  HF.act.editHabit = (el) => fillHabit(HF.habit(el.dataset.h));
  HF.act.saveHabit = () => {
    const name = $('habitName').value.trim();
    if (!name) { HF.toast('Give the goal a name.'); $('habitName').focus(); return; }
    const vals = { name, note: $('habitNote').value.trim(), minutes: HF.clamp(parseInt($('habitMin').value, 10) || 0, 0, 240), target: HF.clamp(parseInt($('habitTarget').value, 10) || 7, 1, 7) };
    const id = $('habitId').value;
    if (id) { const h = HF.habit(id); Object.assign(h, vals); if (!h.trackKey) h.when = $('habitWhen').value.trim(); }
    else S().habits.push({ id: 'custom-' + Date.now(), ...vals, when: $('habitWhen').value.trim() || 'Any time', log: {} });
    HF.save(); HF.closeSheets(); HF.render('habits'); HF.toast(id ? 'Goal saved.' : 'Goal added.');
  };
  HF.act.deleteHabit = () => {
    const h = HF.habit($('habitId').value); if (!h) return;
    if (!confirm(`Delete "${h.name}" and its history?`)) return;
    S().habits = S().habits.filter((x) => x.id !== h.id);
    HF.save(); HF.closeSheets(); HF.render('habits', 'today'); HF.toast('Goal deleted.');
  };

  // ---------------------------------------------------------------- excused days
  HF.act.openExcuse = () => {
    const dates = HF.weekDates();
    $('excuseDay').innerHTML = dates.map((d, i) => `<option value="${i}" ${i === S().activeDay ? 'selected' : ''}>${HF.shortDate(d)}</option>`).join('');
    renderExcuses(); HF.openSheet('excuse');
  };
  function renderExcuses() {
    const mk = HF.todayKey().slice(0, 7);
    const list = S().monthlyExcuseLog.filter((e) => (e.dateISO || '').slice(0, 7) === mk);
    $('excuseCount').textContent = `(${list.length})`;
    $('excuseList').innerHTML = list.length ? list.map((e) => `<div class="spread"><div><b>${HF.esc(e.dateISO)}</b><div class="faint">${HF.esc(e.reason)}</div></div>
      <button class="btn small ghost" data-act="delExcuse" data-k="${HF.esc(e.dateISO)}" aria-label="Remove">✕</button></div>`).join('') : '<p class="faint">None this month.</p>';
  }
  HF.act.saveExcuse = () => {
    const i = +$('excuseDay').value; const reason = $('excuseReason').value.trim();
    if (reason.length < 3) { HF.toast('Write the reason first.'); $('excuseReason').focus(); return; }
    const key = HF.weekKeys()[i];
    S().excuses[key] = reason;
    S().monthlyExcuseLog = S().monthlyExcuseLog.filter((e) => e.dateISO !== key);
    S().monthlyExcuseLog.unshift({ id: 'e' + Date.now(), dateISO: key, reason });
    $('excuseReason').value = '';
    HF.save(); renderExcuses(); HF.render('habits', 'today'); HF.toast(`${HF.DAY_NAMES[i]} excused.`);
  };
  HF.removeExcuse = (key) => {
    delete S().excuses[key];
    S().monthlyExcuseLog = S().monthlyExcuseLog.filter((e) => e.dateISO !== key);
    HF.save(); HF.render('habits', 'today'); HF.toast('Excuse removed.');
  };
  HF.act.delExcuse = (el) => { HF.removeExcuse(el.dataset.k); renderExcuses(); };
})();
