/* Public Tizen application APIs. No Mac server, network address or credentials. */
(function () {
  'use strict';
  var IDS = {
    nuvio: 'NuvioTV001.NuvioTV', tizentube: 'xvvl3S1TT1.TizenTubeStandalone'
  };
  var STREAMING = ['MoonLightS.MoonlightWasm', 'HEPsqFNie0.tvplusstandalone', 'xvvl3S1bvH.TizenBrewStandalone', 'as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'rJeHak5zRg.Spotify', 'icp4AvUPiA.7plus'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot'];
  var EXTRA_BRANDS = {'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi'};
  var INTERNAL = ['2025ePop01.SmartTV', 'adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  var SELF = '2WypXqAbpb.CleanFrame';
  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again, or press the remote’s Home button to return to CleanFrame.' };
  }
  function bounded(done) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [];
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          var primary = !!known[a.id], stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === SELF || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({ appId: a.id, name: a.name, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : (stream ? 20 : 30) });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  /* HDMI inputs: list ports with systeminfo, then show one full screen in this app's TV window. */
  function videoSources(done) {
    if (!window.tizen || !tizen.systeminfo) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        var list = [];
        [['connected', true], ['disconnected', false]].forEach(function (group) {
          (info && info[group[0]] || []).forEach(function (s) {
            // Samsung documents only type and number; use a device name too if this firmware adds one.
            var label = s && [s.name, s.label, s.deviceName, s.connectedDeviceName].filter(function (v) { return typeof v === 'string' && v.trim(); })[0];
            if (s && s.type === 'HDMI' && s.number > 0) list.push({ port: s.number, connected: group[1], source: s, label: label ? label.trim().slice(0, 40) : '' });
          });
        });
        list.sort(function (a, b) { return a.port - b.port; });
        finish(null, list);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function showSource(port, done) {
    if (!window.tizen || !tizen.tvwindow) { unavailable(done); return; }
    videoSources(function (err, list) {
      var hit = !err && list.filter(function (s) { return s.port === port; })[0], finish = bounded(done);
      if (!hit) { finish(err || { message: 'HDMI ' + port + ' is not available on this TV.' }); return; }
      try {
        tizen.tvwindow.setSource(hit.source, function () {
          tizen.tvwindow.show(function () { finish(null); }, function (e) { finish(failure(e)); }, ['0px', '0px', '1920px', '1080px'], 'MAIN');
        }, function (e) { finish(failure(e)); }, 'MAIN');
      } catch (e) { finish(failure(e)); }
    });
  }
  function hideSource() {
    try { if (window.tizen && tizen.tvwindow) tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) { /* already hidden */ }
  }
  /* A remote button can launch CleanFrame with data 'source=hdmi2' to open that input directly.
     Also accepts ?source=hdmi2 in the browser preview. Returns 'hdmi1'..'hdmi4' or null. */
  function requestedSource() {
    try {
      var m = /[?&]source=(hdmi[1-4])/i.exec(window.location.search || '');
      if (m) return m[1].toLowerCase();
      if (window.tizen && window.tizen.application) {
        var req = tizen.application.getCurrentApplication().getRequestedAppControl();
        var data = req && req.appControl && req.appControl.data || [];
        for (var i = 0; i < data.length; i++) {
          if (data[i].key === 'source' && data[i].value && data[i].value[0]) {
            var v = String(data[i].value[0]).toLowerCase();
            if (/^hdmi[1-4]$/.test(v)) return v;
          }
        }
      }
    } catch (e) { /* no launch data */ }
    return null;
  }
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, videoSources: videoSources, showSource: showSource, hideSource: hideSource, requestedSource: requestedSource };
}());
