/* Prayer times: Umm al-Qura method only, calculated on the device (works offline).
   Times can be fine-tuned per prayer in minutes to match the local mosque or al-Moṣally. */
(function () {
  'use strict';
  const HF = window.HF;
  const S = () => HF.state.prayer;

  HF.PRAYERS = [
    { id: 'fajr', name: 'Fajr', ar: 'الفجر', prayer: true },
    { id: 'shuruuq', name: 'Sunrise', ar: 'الشروق', prayer: false },
    { id: 'dhuhr', name: 'Dhuhr', ar: 'الظهر', prayer: true },
    { id: 'asr', name: 'ʿAṣr', ar: 'العصر', prayer: true },
    { id: 'maghrib', name: 'Maghrib', ar: 'المغرب', prayer: true },
    { id: 'isha', name: 'ʿIshāʾ', ar: 'العشاء', prayer: true }
  ];
  // [label, lat, lng, IANA time zone, country]
  const KSA = 'Asia/Riyadh', NL = 'Europe/Amsterdam';
  HF.CITIES = {
    hail: ["Ha'il", 27.5114, 41.7208, KSA, 'SA'], riyadh: ['Riyadh', 24.7136, 46.6753, KSA, 'SA'],
    makkah: ['Makkah', 21.4225, 39.8262, KSA, 'SA'], madinah: ['Madinah', 24.4672, 39.6111, KSA, 'SA'],
    jeddah: ['Jeddah', 21.4858, 39.1925, KSA, 'SA'], dammam: ['Dammam', 26.4207, 50.0888, KSA, 'SA'],
    buraydah: ['Buraydah (al-Qaṣīm)', 26.3592, 43.9818, KSA, 'SA'], tabuk: ['Tabuk', 28.3835, 36.5662, KSA, 'SA'],
    taif: ['Taif', 21.2703, 40.4158, KSA, 'SA'], abha: ['Abha', 18.2164, 42.5053, KSA, 'SA'],
    jazan: ['Jazan', 16.8892, 42.5511, KSA, 'SA'], najran: ['Najran', 17.5656, 44.2289, KSA, 'SA'],
    sakaka: ['Sakaka (al-Jawf)', 29.9697, 40.2064, KSA, 'SA'], arar: ['Arar', 30.9753, 41.0381, KSA, 'SA'],
    hafr: ['Hafr al-Batin', 28.4342, 45.9636, KSA, 'SA'], hofuf: ['al-Hofuf (al-Ahsa)', 25.3833, 49.5864, KSA, 'SA'],
    yanbu: ['Yanbu', 24.0895, 38.0618, KSA, 'SA'],
    gouda: ['Gouda', 52.0115, 4.7105, NL, 'NL'], utrecht: ['Utrecht', 52.0907, 5.1214, NL, 'NL'],
    rotterdam: ['Rotterdam', 51.9244, 4.4777, NL, 'NL'], denhaag: ['Den Haag', 52.0705, 4.3007, NL, 'NL'],
    amsterdam: ['Amsterdam', 52.3676, 4.9041, NL, 'NL'], eindhoven: ['Eindhoven', 51.4416, 5.4697, NL, 'NL'],
    breda: ['Breda', 51.5719, 4.7683, NL, 'NL']
  };
  HF.CITY_GROUPS = [['Saudi Arabia', 'SA'], ['Netherlands', 'NL']];

  const fmtCache = {};
  function fmt(tz) {
    if (!fmtCache[tz]) {
      try { fmtCache[tz] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); }
      catch (e) { fmtCache[tz] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }
    }
    return fmtCache[tz];
  }
  function isRamadan(date) {
    try {
      const m = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).formatToParts(date).find((p) => p.type === 'month');
      return m && +m.value === 9;
    } catch (e) { return false; }
  }
  HF.deviceTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || KSA; } catch (e) { return KSA; } };

  function uaqTimes(key) {
    if (!window.adhan) return null;
    const p = S();
    const d = HF.parseKey(key);
    const params = adhan.CalculationMethod.UmmAlQura();
    params.madhab = adhan.Madhab.Shafi; // ʿAṣr when a shadow equals its object (as in the Umm al-Qura calendar)
    const coords = new adhan.Coordinates(p.lat, p.lng);
    // far north (e.g. the Netherlands in summer) the sun never reaches the Fajr/ʿIshāʾ angle: use the recommended rule
    if (Math.abs(p.lat) > 48) params.highLatitudeRule = adhan.HighLatitudeRule.recommended(coords);
    // the official Saudi calendar puts ʿIshāʾ 120 min after Maghrib in Ramaḍān (instead of 90)
    if (p.country === 'SA' && isRamadan(d)) params.adjustments.isha = 30;
    const pt = new adhan.PrayerTimes(coords, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), params);
    const f = (x) => (x && !isNaN(x)) ? fmt(p.tz || KSA).format(x) : '--:--';
    return { fajr: f(pt.fajr), shuruuq: f(pt.sunrise), dhuhr: f(pt.dhuhr), asr: f(pt.asr), maghrib: f(pt.maghrib), isha: f(pt.isha) };
  }

  const cache = new Map();
  HF.clearPrayerCache = () => cache.clear();
  HF.prayerTimes = (key = HF.todayKey()) => {
    const p = S();
    const ck = key + '|' + [p.lat, p.lng, p.tz, p.country, JSON.stringify(p.adjust)].join('|');
    if (cache.has(ck)) return cache.get(ck);
    const t = uaqTimes(key) || { fajr: '04:53', shuruuq: '06:12', dhuhr: '12:00', asr: '15:19', maghrib: '17:47', isha: '19:17' };
    const adj = p.adjust || {};
    const out = {};
    for (const x of HF.PRAYERS) out[x.id] = t[x.id] === '--:--' ? t[x.id] : HF.fromMin(HF.toMin(t[x.id]) + (+adj[x.id] || 0));
    cache.set(ck, out);
    return out;
  };
  HF.prayerSourceLabel = () => {
    const p = S();
    const tuned = Object.values(p.adjust || {}).some((v) => +v);
    return `Umm al-Qura · ${p.label}${tuned ? ' · adjusted' : ''}`;
  };
  // Minutes since midnight on the chosen city's clock (prayer times are shown in the city's own time,
  // so the "next prayer" countdown stays right when the phone is set to another time zone).
  HF.cityNow = () => {
    const tz = S().tz || HF.deviceTZ();
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).formatToParts(new Date());
      const h = +parts.find((x) => x.type === 'hour').value % 24, m = +parts.find((x) => x.type === 'minute').value;
      return h * 60 + m;
    } catch (e) { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  };
  // minutes a time zone is ahead of UTC at a given moment
  function tzOffset(tz, date) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(date);
      const g = (t) => +parts.find((x) => x.type === t).value;
      return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - date.getTime()) / 60000);
    } catch (e) { return -date.getTimezoneOffset(); }
  }
  // the real moment of «minutes after midnight» on date key, on the chosen city's clock (DST-safe)
  HF.cityDate = (key, minutes) => {
    const tz = S().tz || HF.deviceTZ();
    const d = HF.parseKey(key);
    const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes);
    let t = guess - tzOffset(tz, new Date(guess)) * 60000;
    const off2 = tzOffset(tz, new Date(t));
    t = guess - off2 * 60000;
    return new Date(t);
  };
  // minutes the chosen city's clock is ahead of this device's clock (0 when they share a time zone)
  HF.cityOffsetMin = () => {
    const n = new Date(); let d = HF.cityNow() - (n.getHours() * 60 + n.getMinutes());
    if (d > 720) d -= 1440; if (d < -720) d += 1440;
    return d;
  };
  HF.nextPrayer = () => {
    const nowMin = HF.cityNow();
    const t = HF.prayerTimes(HF.todayKey());
    for (const p of HF.PRAYERS) if (p.prayer && t[p.id] !== '--:--' && HF.toMin(t[p.id]) > nowMin) return { ...p, time: t[p.id], inMin: HF.toMin(t[p.id]) - nowMin };
    const tm = HF.prayerTimes(HF.addDays(HF.todayKey(), 1));
    return { ...HF.PRAYERS[0], time: tm.fajr, inMin: 1440 - nowMin + HF.toMin(tm.fajr), tomorrow: true };
  };
})();
