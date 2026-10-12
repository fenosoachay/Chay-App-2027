/* Diagnostic de démarrage : JS classique, indépendant de React et de ses imports. */
(function () {
  if (window.__chayStartup) return;
  var started = Date.now(), logs = [], ready = false, panel, output, timer, probing = false;
  var dbPath = '/data/dictionaries/dictionnaire_westphal.db';
  var dictionary = 'Non vérifié : aucun résultat de lecture reçu.';
  var originalFetch = window.fetch;
  function exact(error) {
    if (error instanceof Error) return error.toString() + (error.stack ? '\n' + error.stack : '');
    if (typeof error === 'string') return error;
    if (error && error.message) return (error.name || 'Error') + ': ' + error.message;
    return String(error);
  }
  function url(value) {
    try {
      var u = new URL(String(value), location.href);
      u.hash = '';
      u.searchParams.forEach(function (_, key) {
        if (/token|secret|password|authorization|api.?key|code/i.test(key)) u.searchParams.set(key, '[masqué]');
      });
      return u.href + (u.origin === location.origin ? ' [même origine / embarqué si APK]' : ' [EXTERNE]');
    } catch (_) { return String(value); }
  }
  function text() {
    return 'DIAGNOSTIC DE DÉMARRAGE CHAY\n\nPage : ' + location.origin + location.pathname +
      '\nRéseau déclaré : ' + (navigator.onLine ? 'en ligne' : 'hors ligne') +
      '\nInterface principale : ' + (ready ? 'rendue' : 'pas encore rendue') +
      '\n\nDICTIONNAIRE\nChemin demandé : ' + new URL(dbPath, location.href).href +
      '\n' + dictionary + '\n\nERREURS ET REQUÊTES (sans corps ni en-têtes)\n' + logs.join('\n');
  }
  function refresh() { if (output) output.textContent = text(); }
  function log(kind, value) {
    logs.push('+' + ((Date.now() - started) / 1000).toFixed(2) + 's [' + kind + '] ' + exact(value));
    if (logs.length > 250) logs.shift();
    refresh();
  }
  function db(status) { dictionary = status; log('DB', status); }
  function show(error) {
    if (error) log('ERREUR', error);
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { show(); }, { once: true }); return; }
    if (!panel) {
      panel = document.createElement('section');
      panel.setAttribute('role', 'alert');
      panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#9b111e;color:#fff;padding:calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom));font:14px/1.5 Gilroy,Arial,sans-serif;user-select:text;-webkit-user-select:text;';
      var actions = document.createElement('div');
      function button(label, action) {
        var b = document.createElement('button'); b.textContent = label;
        b.style.cssText = 'background:#fff;color:#9b111e;padding:12px;margin:0 8px 12px 0;border:0;border-radius:8px;font:inherit;';
        b.onclick = action; actions.appendChild(b);
      }
      button('Copier les logs', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(text()).catch(function (e) { log('COPIE', e); });
        else { var range = document.createRange(); range.selectNodeContents(output); var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
      });
      button('Recharger', function () { location.reload(); });
      button('Fermer', function () { panel.remove(); panel = null; output = null; });
      output = document.createElement('pre');
      output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;user-select:text;-webkit-user-select:text;';
      panel.appendChild(actions); panel.appendChild(output); document.body.appendChild(panel);
      // Le splash natif ne doit pas masquer le diagnostic si React ne monte pas.
      try { if (window.Capacitor && window.Capacitor.nativePromise) window.Capacitor.nativePromise('SplashScreen', 'hide', {}).catch(function () {}); } catch (_) {}
    }
    refresh(); probe();
  }
  function probe() {
    if (probing || !originalFetch) return;
    probing = true;
    log('VÉRIFICATION DB', url(dbPath));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = setTimeout(function () { db('Vérification locale sans réponse après 8 secondes.'); if (controller) controller.abort(); }, 8000);
    originalFetch.call(window, dbPath, controller ? { signal: controller.signal } : {}).then(function (res) {
      if (!res.ok) throw new Error('File not found / HTTP ' + res.status + ' : ' + dbPath);
      return res.arrayBuffer();
    }).then(function (bytes) {
      var header = String.fromCharCode.apply(null, new Uint8Array(bytes).slice(0, 15));
      db(header === 'SQLite format 3' ? 'Fichier TROUVÉ, SQLite valide, ' + bytes.byteLength + ' octets.' : 'Réponse trouvée mais PAS une base SQLite : ' + header);
    }).catch(function (e) { db('Lecture locale ÉCHOUÉE : ' + exact(e)); }).finally(function () { clearTimeout(timeout); });
  }
  if (originalFetch) window.fetch = function (input, options) {
    var target = input && input.url ? input.url : input;
    var method = (options && options.method) || (input && input.method) || 'GET';
    log('FETCH ' + method, url(target));
    try {
      return originalFetch.apply(this, arguments).then(function (res) {
        log('FETCH RÉPONSE', res.status + ' ' + url(res.url || target)); return res;
      }, function (error) { log('FETCH ÉCHEC', url(target) + '\n' + exact(error)); throw error; });
    } catch (error) { log('FETCH ÉCHEC', exact(error)); throw error; }
  };
  var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, target) {
    this.__chayRequest = method + ' ' + url(target); return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this; log('XHR', xhr.__chayRequest);
    xhr.addEventListener('loadend', function () { log('XHR RÉSULTAT', xhr.status + ' ' + xhr.__chayRequest); });
    ['error', 'timeout', 'abort'].forEach(function (type) { xhr.addEventListener(type, function () { log('XHR ' + type, xhr.__chayRequest); }); });
    try { return send.apply(this, arguments); } catch (error) { log('XHR ÉCHEC', error); throw error; }
  };
  ['error', 'warn'].forEach(function (level) {
    var original = console[level]; console[level] = function () {
      log('CONSOLE ' + level, Array.prototype.map.call(arguments, exact).join('\n')); return original.apply(console, arguments);
    };
  });
  window.__chayStartup = { log: log, fail: show, dictionary: db, ready: function () { if (!ready) { ready = true; clearTimeout(timer); log('INTERFACE', 'Contenu principal rendu.'); } } };
  window.addEventListener('error', function (event) {
    var element = event.target;
    if (element && element !== window && (element.src || element.href)) {
      log('RESSOURCE ÉCHOUÉE', url(element.src || element.href));
      if (element.tagName === 'SCRIPT') show(new Error('Script non chargé : ' + url(element.src)));
    } else show(event.error || event.message || 'Erreur JavaScript sans message');
  }, true);
  window.addEventListener('unhandledrejection', function (event) { show(event.reason); });
  function observe() {
    var root = document.getElementById('root');
    if (!root) return;
    function check() {
      var content = root.querySelectorAll('h1, h2, main');
      for (var i = 0; i < content.length; i++) if (!content[i].closest('[data-chay-splash], [data-chay-loading]')) { window.__chayStartup.ready(); observer.disconnect(); break; }
    }
    var observer = new MutationObserver(check); observer.observe(root, { childList: true, subtree: true }); check();
  }
  document.addEventListener('DOMContentLoaded', observe, { once: true });
  timer = setTimeout(function () { if (!ready) show(new Error('StartupTimeout: aucun contenu principal rendu après 15 secondes. Consulter les requêtes et la dernière étape ci-dessous.')); }, 15000);
  log('DÉMARRAGE', 'Diagnostic chargé avant les modules React.');
})();
