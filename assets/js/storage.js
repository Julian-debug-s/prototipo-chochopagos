/**
 * Preferencias y sesiones guardadas en este navegador.
 * Los datos de negocio (pedidos, saldos, chat) viven en el backend; aquí solo
 * quedan los tokens de sesión de cada rol, el ingreso con rostro y preferencias.
 */
window.ChochoStorage = (function () {
  var KEY = 'chochopagos-app-v2';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  return {
    session: function (role) { return (read().sessions || {})[role] || null; },
    setSession: function (role, value) {
      var d = read(); d.sessions = d.sessions || {};
      if (value) d.sessions[role] = value; else delete d.sessions[role];
      write(d);
    },

    /** Rostro: vector simple + foto + token para entrar sin PIN (demo, no biometría real). */
    face: function (key) { return (read().faces || {})[key] || null; },
    setFace: function (key, value) {
      var d = read(); d.faces = d.faces || {};
      d.faces[key] = value;
      write(d);
    },

    pref: function (name, fallback) { var p = read().prefs || {}; return p[name] === undefined ? fallback : p[name]; },
    setPref: function (name, value) { var d = read(); d.prefs = d.prefs || {}; d.prefs[name] = value; write(d); },

    clear: function () { try { localStorage.removeItem(KEY); localStorage.removeItem('chochopagos-demo-v1'); } catch (e) {} },
  };
})();
