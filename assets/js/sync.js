/**
 * Modo "sin señal" del domiciliario.
 * Las acciones de campo (aceptar, llegué, recibir efectivo, guardar datos) se
 * guardan en una cola local y se envían en orden al recuperar la señal.
 * El pago con la app sí requiere señal, igual que en el prototipo.
 */
window.ChochoSync = (function () {
  var KEY = 'chochopagos-outbox';
  var OFFLINE_ACTIONS = ['accept', 'arrive', 'collect', 'operation'];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(q) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) {} }

  return {
    canQueue: function (action) { return OFFLINE_ACTIONS.indexOf(action) >= 0; },

    queue: function (orderId, action, body) {
      var q = load();
      q.push({ orderId: orderId, action: action, body: body || {}, at: Date.now() });
      save(q);
    },

    pending: function () { return load(); },
    pendingFor: function (orderId) { return load().filter(function (x) { return x.orderId === orderId; }); },

    label: function () {
      var n = load().length;
      return n ? n + ' operación(es) pendientes' : 'Todo sincronizado';
    },

    /** Envía la cola en orden. Si una acción falla, la descarta y avisa (el servidor tiene la última palabra). */
    flush: async function (send) {
      var q = load(), ok = 0, errors = [];
      for (var i = 0; i < q.length; i++) {
        try { await send(q[i]); ok++; }
        catch (e) { errors.push('#' + q[i].orderId + ': ' + e.message); }
      }
      save([]);
      return { ok: ok, errors: errors };
    },

    clear: function () { save([]); },
  };
})();
