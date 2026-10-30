/* Home widgets: prayer times (computed offline), current weather (Open-Meteo, cached), a rain radar shown only
   when rain is nearby (RainViewer) and the clock format. ES5. */
(function () {
  'use strict';
  var KEY = 'cleanframe.widgets.v1', WEATHER_MS = 30 * 60000, RAIN_MS = 10 * 60000, RADAR_MS = 10 * 60000, RETRY_MS = 5 * 60000, LOCATE_MS = 24 * 3600000;
  /* Fallback when automatic location is unavailable, and the manual choices offered in Settings. */
  var PLACES = [
    { id: 'taif', city: 'Taif', lat: 21.2703, lng: 40.4158 }, { id: 'makkah', city: 'Makkah', lat: 21.4225, lng: 39.8262 },
    { id: 'jeddah', city: 'Jeddah', lat: 21.4858, lng: 39.1925 }, { id: 'madinah', city: 'Madinah', lat: 24.4672, lng: 39.6024 },
    { id: 'riyadh', city: 'Riyadh', lat: 24.7136, lng: 46.6753 }, { id: 'dammam', city: 'Dammam', lat: 26.4207, lng: 50.0888 },
    { id: 'abha', city: 'Abha', lat: 18.2164, lng: 42.5053 }
  ];
  /* Location order: the TV's own position service (if it offers one), then IP lookups, then Taif.
     IP lookups return the network provider's city, which can be a different city from the TV. */
  var LOCATORS = [
    { url: 'https://ipapi.co/json/', read: function (d) { return { lat: d.latitude, lng: d.longitude, city: d.city }; } },
    { url: 'https://ipwho.is/', read: function (d) { return d.success === false ? null : { lat: d.latitude, lng: d.longitude, city: d.city }; } }
  ];
  /* Umm al-Qura: Fajr 18.5°, Isha 90 minutes after Maghrib (120 in Ramadan), Asr shadow factor 1. */
  var DEFAULTS = { place: 'auto', hours: 12, fajr: 18.5, ishaMin: 90, asr: 1, weather: true, prayer: true, radar: true, dock: 'standard' };
  var NAMES = [['fajr', 'Fajr'], ['sunrise', 'Sunrise'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']];
  var SHOWN = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  var saved = readSaved(), config = settings(saved), detected = readDetected(saved), weather = readWeather(saved);
  var fetching = false, retryAt = 0, locating = false, locateRetryAt = 0, listeners = [];

  function readSaved() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; }
    catch (e) { return {}; }
  }
  function place(id) { for (var i = 0; i < PLACES.length; i++) if (PLACES[i].id === id) return PLACES[i]; return null; }
  function validPoint(p) { return !!p && isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 66 && Math.abs(p.lng) <= 180; }
  function settings(s) {
    var c = {}, k, from = s.config && typeof s.config === 'object' ? s.config : {};
    for (k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) c[k] = typeof from[k] === typeof DEFAULTS[k] ? from[k] : DEFAULTS[k];
    if (c.place !== 'auto' && !place(c.place)) c.place = 'auto';
    if (c.hours !== 12 && c.hours !== 24) c.hours = 12;
    if (c.dock !== 'lower') c.dock = 'standard';
    return c;
  }
  function readDetected(s) {
    var d = s.detected;
    return d && validPoint(d) && typeof d.city === 'string' && isFinite(d.at) ? { lat: d.lat, lng: d.lng, city: d.city.slice(0, 60), at: d.at, method: d.method === 'device' ? 'device' : 'network' } : null;
  }
  /* A partial saved weather would otherwise render "undefined\u00b0" until the next fetch; drop it so the first fetch self-heals. */
  function readWeather(s) {
    var w = s.weather;
    return w && typeof w === 'object' && isFinite(w.at) && isFinite(w.temp)
      ? { at: w.at, lat: w.lat, lng: w.lng, temp: w.temp, code: w.code, rain: !!w.rain, hi: isFinite(w.hi) ? w.hi : null, lo: isFinite(w.lo) ? w.lo : null }
      : null;
  }
  function writeSaved() {
    try { localStorage.setItem(KEY, JSON.stringify({ version: 2, config: config, detected: detected, weather: weather })); } catch (e) { /* preferences stay in memory */ }
  }
  function here() {
    if (config.place !== 'auto') { var p = place(config.place); return { lat: p.lat, lng: p.lng, city: p.city, source: 'manual' }; }
    if (detected) return { lat: detected.lat, lng: detected.lng, city: detected.city || PLACES[0].city, source: 'auto', method: detected.method };
    return { lat: PLACES[0].lat, lng: PLACES[0].lng, city: PLACES[0].city, source: 'fallback' };
  }

  /* ---------- Automatic location ---------- */
  function get(url, done) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 10000;
      xhr.onload = function () {
        var data = null;
        try { if (xhr.status === 200) data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        done(data);
      };
      xhr.onerror = xhr.ontimeout = function () { done(null); };
      xhr.send();
    } catch (e) { done(null); }
  }
  function nearest(p) {
    var best = null, bestKm = 60;
    PLACES.forEach(function (c) {
      var km = Math.sqrt(Math.pow((c.lat - p.lat) * 111, 2) + Math.pow((c.lng - p.lng) * 111 * Math.cos(p.lat * RAD), 2));
      if (km < bestKm) { best = c; bestKm = km; }
    });
    return best;
  }
  function found(p, method) {
    var moved = !detected || Math.abs(detected.lat - p.lat) > 0.05 || Math.abs(detected.lng - p.lng) > 0.05, near = nearest(p);
    detected = { lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4, method: method, at: Date.now(),
      city: near ? near.city : typeof p.city === 'string' && p.city ? p.city.slice(0, 60) : 'Current location' };
    locating = false;
    if (moved) { weather = null; retryAt = 0; }
    writeSaved(); notify();
  }
  function fromDevice(next) {
    var geo = window.navigator && navigator.geolocation, done = false;
    function finish(p) { if (done) return; done = true; if (validPoint(p)) found(p, 'device'); else next(); }
    if (!geo) { next(); return; }
    setTimeout(function () { finish(null); }, 12000);
    try {
      geo.getCurrentPosition(function (pos) { finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function () { finish(null); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: LOCATE_MS });
    } catch (e) { finish(null); }
  }
  function locate(force) {
    var i = 0, now = Date.now();
    if (config.place !== 'auto' || locating) return;
    if (!force && detected && now - detected.at < LOCATE_MS) return;
    if (!force && now < locateRetryAt) return;
    locating = true;
    fromDevice(function attempt() {
      if (i >= LOCATORS.length) { locating = false; locateRetryAt = Date.now() + RETRY_MS * 6; notify(); return; }
      var locator = LOCATORS[i++];
      get(locator.url, function (data) {
        var p = null;
        try { p = data && locator.read(data); } catch (e) { p = null; }
        if (!validPoint(p)) { attempt(); return; }
        found(p, 'network');
      });
    });
  }

  /* ---------- Prayer times (PrayTimes-style astronomy, two refinement passes) ---------- */
  var RAD = Math.PI / 180;
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    var D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD), 360), e = 23.439 - 0.00000036 * D;
    var RA = fix(Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD / 15, 24);
    return { decl: Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD, eqt: q / 15 - RA };
  }
  function prayerTimes(date, at) {
    at = at || here();
    var lat = at.lat, lng = at.lng, tz = -date.getTimezoneOffset() / 60;
    var jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
    function noon(t) { return fix(12 - sun(jd + t / 24).eqt, 24); }
    function angleTime(angle, t, ccw) {
      var s = sun(jd + t / 24), n = noon(t);
      var cos = (-Math.sin(angle * RAD) - Math.sin(s.decl * RAD) * Math.sin(lat * RAD)) / (Math.cos(s.decl * RAD) * Math.cos(lat * RAD));
      if (cos > 1 || cos < -1) return NaN;
      var h = Math.acos(cos) / RAD / 15;
      return n + (ccw ? -h : h);
    }
    function asrTime(t) {
      var s = sun(jd + t / 24), angle = -Math.atan(1 / (config.asr + Math.tan(Math.abs(lat - s.decl) * RAD))) / RAD;
      return angleTime(angle, t, false);
    }
    var t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 }, i;
    for (i = 0; i < 2; i++) {
      t = { fajr: angleTime(config.fajr, t.fajr, true), sunrise: angleTime(0.833, t.sunrise, true), dhuhr: noon(t.dhuhr),
        asr: asrTime(t.asr), maghrib: angleTime(0.833, t.maghrib, false) };
    }
    t.isha = t.maghrib + (ramadan(date) ? 120 : config.ishaMin) / 60;
    var out = {}, base = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    NAMES.forEach(function (n) {
      var hours = t[n[0]] + tz - lng / 15;
      out[n[0]] = isFinite(hours) ? new Date(base + Math.round(hours * 60) * 60000) : null;
    });
    return out;
  }
  function ramadan(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).formatToParts(date);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'month') return Number(parts[i].value) === 9;
    } catch (e) { /* calendar unavailable: use the normal Isha interval */ }
    return false;
  }
  function clockParts(d) {
    var h = d.getHours(), m = d.getMinutes();
    if (config.hours === 24) return { time: (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m, meridiem: '' };
    return { time: (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m, meridiem: h < 12 ? 'AM' : 'PM' };
  }
  function clock(d) {
    var p = clockParts(d);
    return p.time + (p.meridiem ? ' ' + p.meridiem : '');
  }
  function untilText(ms) {
    var m = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60) + 'm' : m + 'm';
  }
  function prayers(now) {
    now = now || new Date();
    var today = prayerTimes(now), list = [], next = null;
    SHOWN.forEach(function (id) {
      var at = today[id];
      list.push({ id: id, name: nameOf(id), time: at ? clock(at) : '--', at: at });
      if (!next && at && at.getTime() > now.getTime()) next = list[list.length - 1];
    });
    if (!next) {
      var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12), fajr = prayerTimes(tomorrow).fajr;
      if (fajr) next = { id: 'fajr', name: 'Fajr', time: clock(fajr), at: fajr, tomorrow: true };
    }
    if (next) next.until = untilText(next.at.getTime() - now.getTime());
    return { list: list, next: next };
  }
  function nameOf(id) { for (var i = 0; i < NAMES.length; i++) if (NAMES[i][0] === id) return NAMES[i][1]; return id; }

  /* ---------- Weather ---------- */
  /* One request covers the location and four points about 45 km away, so "rain nearby" needs no image analysis. */
  var RING = [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.45], [0, -0.45]], WET = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  function dayNum(arr) { var v = arr && arr[0]; return v != null && isFinite(v) ? Math.round(v) : null; }
  function wet(point) {
    var cur = point && point.current, hourly = point && point.hourly && point.hourly.precipitation, i;
    if (!cur) return false;
    if (cur.precipitation > 0 || WET.indexOf(cur.weather_code) >= 0) return true;
    if (hourly) for (i = 0; i < hourly.length; i++) if (hourly[i] >= 0.1) return true;
    return false;
  }
  function refreshWeather(force) {
    var now = Date.now(), at = here(), lats, lngs;
    if (!config.weather || fetching) return;
    if (weather && (Math.abs(weather.lat - at.lat) > 0.01 || Math.abs(weather.lng - at.lng) > 0.01)) { weather = null; radar = null; }
    if (!force && weather && now - weather.at < (weather.rain ? RAIN_MS : WEATHER_MS)) return;
    if (!force && now < retryAt) return;
    fetching = true;
    lats = RING.map(function (d) { return (at.lat + d[0]).toFixed(4); }).join(',');
    lngs = RING.map(function (d) { return (at.lng + d[1]).toFixed(4); }).join(',');
    get('https://api.open-meteo.com/v1/forecast?latitude=' + lats + '&longitude=' + lngs
      + '&current=temperature_2m,weather_code,precipitation&hourly=precipitation&forecast_hours=2'
      + '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1', function (data) {
      fetching = false;
      var points = Array.isArray(data) ? data : data ? [data] : [], first = points[0], cur = first && first.current, day = first && first.daily;
      if (!cur || !isFinite(cur.temperature_2m)) { retryAt = Date.now() + RETRY_MS; notify(); return; }
      weather = { at: Date.now(), lat: at.lat, lng: at.lng, temp: Math.round(cur.temperature_2m), code: cur.weather_code, rain: points.some(wet),
        hi: dayNum(day && day.temperature_2m_max), lo: dayNum(day && day.temperature_2m_min) };
      writeSaved(); notify();
      if (weather.rain) refreshRadar(true);
    });
  }
  function weatherState(at) {
    if (!config.weather || !weather) return null;
    return { temp: weather.temp, text: WMO.hasOwnProperty(weather.code) ? WMO[weather.code] : '', hi: weather.hi, lo: weather.lo,
      stale: Date.now() - weather.at > 3 * WEATHER_MS, city: at.city, rain: !!weather.rain };
  }

  /* ---------- Rain radar (RainViewer public radar tiles over Esri's dark grey base map; neither needs a key) ---------- */
  var RADAR_ZOOM = 7, TILE = 256, RADAR_W = 400, RADAR_H = 220, radar = null, radarFetching = false, radarRetryAt = 0;
  function refreshRadar(force) {
    var now = Date.now();
    if (!config.radar || radarFetching || !weather || !weather.rain) return;
    if (!force && radar && now - radar.checked < RADAR_MS) return;
    if (!force && now < radarRetryAt) return;
    radarFetching = true;
    get('https://api.rainviewer.com/public/weather-maps.json', function (data) {
      radarFetching = false;
      var past = data && data.radar && data.radar.past, last = past && past[past.length - 1];
      if (!last || typeof data.host !== 'string' || typeof last.path !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(data.host)) { radarRetryAt = Date.now() + RETRY_MS; return; }
      radar = { checked: Date.now(), host: data.host, path: last.path, time: last.time * 1000 };
      notify();
    });
  }
  function radarState() {
    var at = here(), n, cx, cy, x0, y0, x1, y1, tiles = [], x, y, wrap;
    refreshRadar(false);
    if (!config.radar || !weather || !weather.rain || !radar) return null;
    n = Math.pow(2, RADAR_ZOOM);
    cx = (at.lng + 180) / 360 * n * TILE;
    cy = (1 - Math.log(Math.tan(at.lat * RAD) + 1 / Math.cos(at.lat * RAD)) / Math.PI) / 2 * n * TILE;
    x0 = Math.floor((cx - RADAR_W / 2) / TILE); x1 = Math.floor((cx + RADAR_W / 2) / TILE);
    y0 = Math.floor((cy - RADAR_H / 2) / TILE); y1 = Math.floor((cy + RADAR_H / 2) / TILE);
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      wrap = ((x % n) + n) % n;
      tiles.push({ left: Math.round(x * TILE - cx + RADAR_W / 2), top: Math.round(y * TILE - cy + RADAR_H / 2),
        base: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/' + RADAR_ZOOM + '/' + y + '/' + wrap,
        rain: radar.host + radar.path + '/' + TILE + '/' + RADAR_ZOOM + '/' + wrap + '/' + y + '/2/1_1.png' });
    }
    return { city: at.city, time: clock(new Date(radar.time)), width: RADAR_W, height: RADAR_H, tiles: tiles };
  }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* listener errors stay local */ } }); }

  window.CleanFrameWidgets = {
    state: function (now) {
      var at;
      locate(false);
      at = here();
      refreshWeather(false);
      return { city: at.city, source: at.source, prayer: config.prayer ? prayers(now) : null, weather: weatherState(at), radar: radarState() };
    },
    clock: function (d) { return clock(d || new Date()); },
    clockParts: function (d) { return clockParts(d || new Date()); },
    places: function () { return PLACES.map(function (p) { return { id: p.id, city: p.city }; }); },
    location: function () { return here(); },
    prayerTimes: function (date, at) { return prayerTimes(date || new Date(), at); },
    onChange: function (fn) { listeners.push(fn); },
    configure: function (patch) {
      var k, before = config.place;
      for (k in patch) if (patch.hasOwnProperty(k) && DEFAULTS.hasOwnProperty(k) && typeof patch[k] === typeof DEFAULTS[k]) config[k] = patch[k];
      config = settings({ config: config });
      if (config.place !== before) { weather = null; retryAt = 0; if (config.place === 'auto') locate(true); }
      writeSaved(); refreshWeather(false); notify();
      return JSON.parse(JSON.stringify(config));
    },
    config: function () { return JSON.parse(JSON.stringify(config)); }
  };
}());
