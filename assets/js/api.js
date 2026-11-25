/**
 * Cliente HTTP del backend de ChochoPagos.
 * Si la app se abre desde el mismo servidor (npm start en backend/), usa el mismo origen.
 * Si se abre con otro servidor estático, usa http://localhost:3000 (configurable con
 * localStorage "chocho-api").
 */
window.ChochoApi = (function () {
  var stored = null;
  try { stored = localStorage.getItem('chocho-api'); } catch (e) {}
  var sameOrigin = location.protocol.indexOf('http') === 0 && location.port !== '8000' && location.port !== '5500';
  var BASE = stored || (sameOrigin ? '' : 'http://localhost:3000');

  function ApiError(message, status, code) {
    var e = new Error(message);
    e.status = status;
    e.code = code;
    return e;
  }

  async function request(method, path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    var body;
    if (opts.blob) { headers['Content-Type'] = opts.blob.type || 'image/jpeg'; body = opts.blob; }
    else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    var res;
    try {
      res = await fetch(BASE + '/api' + path, { method: method, headers: headers, body: body });
    } catch (e) {
      throw ApiError('No hay conexión con el servidor de ChochoPagos.', 0, 'NETWORK');
    }
    var data = null;
    if ((res.headers.get('content-type') || '').indexOf('json') >= 0) data = await res.json();
    if (!res.ok) throw ApiError((data && data.error && data.error.message) || ('Error ' + res.status), res.status, data && data.error && data.error.code);
    return data;
  }

  /** Las fotos requieren sesión: se descargan con el token y se cachean como URL local. */
  var mediaCache = {};
  async function media(token, name) {
    if (!name) return null;
    if (mediaCache[name]) return mediaCache[name];
    var res = await fetch(BASE + '/api/media/' + encodeURIComponent(name), { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    mediaCache[name] = URL.createObjectURL(await res.blob());
    return mediaCache[name];
  }

  return {
    base: BASE,
    get: function (path, token) { return request('GET', path, { token: token }); },
    post: function (path, token, body) { return request('POST', path, { token: token, body: body || {} }); },
    upload: function (token, blob) { return request('POST', '/uploads', { token: token, blob: blob }); },
    devReset: function () { return fetch(BASE + '/dev/reset', { method: 'POST' }).then(function (r) { if (!r.ok) throw new Error('No se pudo reiniciar'); }); },
    media: media,
    cached: function (name) { return mediaCache[name] || null; },
    rememberMedia: function (name, url) { mediaCache[name] = url; },
  };
})();
