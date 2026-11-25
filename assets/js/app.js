'use strict';
/*
 * ChochoPagos · app conectada al backend.
 * Misma estética y vistas del prototipo (Usuario, Domiciliario, Centro), pero:
 *  - Los datos (usuarios, pedidos, saldos) viven en el backend.
 *  - El chat de la pestaña Usuario es el MISMO asistente del bot de Telegram: comparten
 *    historial, así que lo que Rosa habla por Telegram aparece aquí y viceversa.
 * La versión 100 % local original está en assets/js/legacy/app-local.js.
 */
var API = window.ChochoApi, STORE = window.ChochoStorage, SYNC = window.ChochoSync;

/* ---------- textos del prototipo ---------- */
var MSG = ['Recibimos tu pedido. {op} te confirmará pronto.', '{op} va en camino a tu casa 🏍️', 'Recogimos tu efectivo y factura. Estamos haciendo el trámite.', '¡Trámite realizado! Te llevamos el comprobante.', 'Comprobante entregado. ¡Gracias por confiar en ChochoPagos!', 'Este pedido fue cancelado antes de recibir el efectivo.', 'El proveedor rechazó el pago. Revisa los datos o solicita ayuda.', 'El proveedor aún no confirma el pago. El Centro hará seguimiento.'];
var EXAMPLES = ['Quiero pagar la luz', 'Recargar 20 mil a mi celular', 'Pagar el SOAT', 'Pagar el agua'];
var NUM = 'maxlength="10" inputmode="numeric"', PIN = 'maxlength="4" inputmode="numeric"';

/* ---------- estado de la interfaz ---------- */
var S = {
  tab: STORE.pref('tab', 'u'), ut: 'p', dt: 'p', on: true, voice: STORE.pref('voice', true), listening: false, vmsg: '', mode: 'login',
  f: { cel: '', pin: '', pin2: '', name: '', ced: '', sector: '', dir: '', ok: false, opc: '', opp: '', cc: '', ccp: '', rcel: '', ramt: '', rok: false, ccel: '', camt: '', cok: false },
  inp: {}, cat: null, orderView: null, cfg: null, apiDown: false, vb: false,
  u: { token: null, me: null, balances: null, orders: [], ledger: [], chat: [], lastId: 0, step: 'idle', busy: false, preview: null, seen: {} },
  d: { token: null, actor: null, orders: [], summary: null, ledger: [], seen: {} },
  c: { token: null, actor: null, orders: [], dash: null, users: [], ledger: [] },
};
['u', 'd', 'c'].forEach(function (r) { var s = STORE.session(r); if (s) { S[r].token = s.token; S[r].actor = s.actor; } });

/* ---------- utilidades ---------- */
function el(i) { return document.getElementById(i); }
function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function f(x) { return '$' + Number(x || 0).toLocaleString('es-CO'); }
function hh(t) { return new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); }
function local(p) { return String(p || '').replace(/^57/, ''); }
function OP() { return (S.cfg && S.cfg.operatorName) || 'Carlos'; }
function msgFor(i) { return (MSG[i] || '').replace('{op}', OP()); }
function svcOf(code) { return S.cfg ? S.cfg.services.filter(function (s) { return s.code === code; })[0] : null; }
/** Formato del asistente (*negrita*, _cursiva_) a HTML, siempre después de escapar. */
function fmt(t) { return esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>'); }
function plain(t) { return String(t || '').replace(/[*_]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim(); }
function toast(m) { var t = el('toast'); t.textContent = m; t.className = 's'; clearTimeout(toast.h); toast.h = setTimeout(function () { t.className = ''; }, 2600); }

/* ---------- voz (igual que el prototipo) ---------- */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, voices = [];
function speak(t, force) {
  if ((!S.voice && !force) || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(plain(t)); u.lang = 'es-CO';
    var v = voices.filter(function (x) { return /^es[-_](CO|MX|US|419)/i.test(x.lang); })[0] || voices.filter(function (x) { return /^es/i.test(x.lang); })[0];
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = .95; speechSynthesis.speak(u); if (speechSynthesis.paused) speechSynthesis.resume();
  } catch (e) {}
}
if (window.speechSynthesis) { var lv = function () { voices = speechSynthesis.getVoices(); }; lv(); speechSynthesis.onvoiceschanged = lv; }
function listen() {
  if (!SR) { S.vmsg = 'Este navegador no reconoce voz (prueba Chrome o Safari). Puedes escribir abajo o usar los ejemplos.'; render(); return; }
  if (rec && S.listening) { rec.stop(); return; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  try { rec = new SR(); rec.lang = 'es-CO'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false; } catch (e) { toast('No se pudo iniciar el micrófono'); return; }
  var fin = '';
  rec.onstart = function () { S.vmsg = ''; S.listening = true; render(); var l = el('live'); if (l) l.textContent = 'Escuchando…'; };
  rec.onresult = function (e) { var tx = ''; for (var i = e.resultIndex; i < e.results.length; i++) { tx += e.results[i][0].transcript; if (e.results[i].isFinal) fin = tx; } var l = el('live'); if (l) l.textContent = '“' + tx + '”'; };
  rec.onerror = function (e) { var m = { 'not-allowed': 'El micrófono está bloqueado. Permite el micrófono o escribe abajo.', 'no-speech': 'No te escuché. Toca el micrófono e inténtalo de nuevo.', 'audio-capture': 'No se encontró un micrófono.', network: 'Se necesita internet para reconocer la voz.' }; if (e.error !== 'aborted') { S.vmsg = m[e.error] || ('Error de voz: ' + e.error); render(); } };
  rec.onend = function () { S.listening = false; if (fin) sendChat({ text: fin }); render(); };
  try { rec.start(); } catch (e) {}
}

/* ---------- sesiones y datos ---------- */
function setSession(role, session) {
  S[role].token = session ? session.token : null;
  S[role].actor = session ? session.actor : null;
  STORE.setSession(role, session ? { token: session.token, actor: session.actor } : null);
}
function handleAuthError(role, e) {
  if (e && e.status === 401) { setSession(role, null); if (role === 'u') S.u.me = null; toast('Tu sesión venció. Ingresa de nuevo.'); return true; }
  return false;
}
async function loadCatalog() {
  try { S.cfg = await API.get('/catalog'); S.apiDown = false; if (!S.f.sector) S.f.sector = S.cfg.sectors[0]; }
  catch (e) { S.apiDown = true; }
}
/**
 * Número de la consulta más reciente por rol. Si una respuesta vieja llega tarde
 * (p. ej. la actualización automática salió justo antes de un pago), se descarta
 * para no reemplazar datos nuevos por datos viejos.
 */
var SEQ = { u: 0, d: 0, c: 0 };
async function refreshCustomer() {
  var U = S.u; if (!U.token) return;
  var my = ++SEQ.u;
  try {
    var r = await Promise.all([API.get('/me', U.token), API.get('/me/orders', U.token), API.get('/me/ledger', U.token), API.get('/me/chat?after=' + U.lastId, U.token)]);
    if (my !== SEQ.u) return;
    U.me = r[0].user; U.balances = r[0].balances; U.orderCount = r[0].orderCount; U.orders = r[1]; U.ledger = r[2];
    mergeChat(r[3]);
    notifyCustomer();
  } catch (e) { if (!handleAuthError('u', e) && e.code === 'NETWORK') S.apiDown = true; }
}
function mergeChat(data) {
  var U = S.u;
  U.chat = U.chat.filter(function (m) { return !m.tmp; });
  // Sin duplicados aunque dos consultas traigan los mismos mensajes.
  var known = {}; U.chat.forEach(function (m) { known[m.id] = 1; });
  data.messages = data.messages.filter(function (m) { return !known[m.id]; });
  if (data.messages.length) { U.chat = U.chat.concat(data.messages).slice(-80); U.lastId = U.chat[U.chat.length - 1].id; S.vb = true; }
  U.step = data.step;
}
async function refreshOperator() {
  var D = S.d; if (!D.token) return;
  var my = ++SEQ.d;
  try {
    var r = await Promise.all([API.get('/orders?scope=all&limit=120', D.token), API.get('/operator/summary', D.token), API.get('/ledger', D.token)]);
    if (my !== SEQ.d) return;
    D.orders = r[0]; D.summary = r[1]; D.ledger = r[2];
    notifyOperator();
  } catch (e) { if (!handleAuthError('d', e) && e.code === 'NETWORK') S.apiDown = true; }
}
async function refreshCenter() {
  var C = S.c; if (!C.token) return;
  var my = ++SEQ.c;
  try {
    var r = await Promise.all([API.get('/orders?scope=all&limit=200', C.token), API.get('/center/dashboard', C.token), API.get('/users', C.token), API.get('/ledger', C.token)]);
    if (my !== SEQ.c) return;
    C.orders = r[0]; C.dash = r[1]; C.users = r[2]; C.ledger = r[3];
  } catch (e) { if (!handleAuthError('c', e) && e.code === 'NETWORK') S.apiDown = true; }
}
async function refresh() {
  if (!S.cfg) await loadCatalog();
  var t = S.tab, jobs = [];
  if (t === 'u' || t === 'a') jobs.push(refreshCustomer());
  if (t === 'd' || t === 'a') jobs.push(refreshOperator());
  if (t === 'c' || t === 'a') jobs.push(refreshCenter());
  await Promise.all(jobs);
}
/** Ejecuta una acción, muestra el resultado y recarga los datos. */
async function act(fn, ok) {
  try { var r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); }
  catch (e) { toast(e.message); }
  await refresh(); render();
}

/* ---------- avisos (notify / notifyOp del prototipo) ---------- */
function notifyCustomer() {
  var U = S.u;
  U.orders.forEach(function (o) {
    var prev = U.seen[o.id];
    if (prev === undefined) { U.seen[o.id] = o.statusIndex; return; }
    if (o.statusIndex !== prev) { U.seen[o.id] = o.statusIndex; if (S.tab === 'u' || S.tab === 'a') { speak(msgFor(o.statusIndex)); toast('Tu pedido #' + o.id + ': ' + o.statusLabel); } }
  });
}
function notifyOperator() {
  var D = S.d, first = !D.primed;
  D.orders.forEach(function (o) {
    if (D.seen[o.id]) return; D.seen[o.id] = 1;
    if (!first && o.status === 'REQUESTED') { if (S.tab === 'd') speak('Nuevo pedido de ' + (o.customer ? o.customer.name.split(' ')[0] : '') + ': ' + o.displayName + ', ' + o.total + ' pesos.'); toast('🏍️ Nuevo pedido #' + o.id); }
  });
  D.primed = true;
}

/* ---------- piezas visuales del prototipo ---------- */
function trk(s) { var h = '<div class="trk">', active = s >= 5 ? -1 : s; for (var i = 0; i < 5; i++) h += '<i class="' + (i <= active ? 'd' : '') + '"></i>'; return h + '</div>'; }
function pill(o) { return '<span class="pill p' + o.statusIndex + '">' + esc(o.statusLabel) + '</span>'; }
/** Si la foto ya se descargó, se pinta con su src de una vez: así no cambia la altura al redibujar. */
function img(role, name, cls, alt, style) { if (!name) return ''; var src = API.cached(name); return '<img class="' + cls + '" alt="' + esc(alt) + '" data-media="' + esc(name) + '" data-tok="' + role + '"' + (src ? ' src="' + src + '"' : '') + (style ? ' style="' + style + '"' : '') + '>'; }
function recibo(o, role) { return '<div class="recibo">' + img(role, o.receiptPhoto, 'rth', 'Recibo del trámite') + (o.receiptPhoto ? '<br>' : '') + (o.evidencePhoto ? '<b>Evidencia de entrega</b>' + img(role, o.evidencePhoto, 'rth', 'Evidencia de entrega') + '<br>' : '') + 'COMPROBANTE #' + o.id + '<br>' + esc(o.displayName) + '<br>Ref: ' + esc(o.reference || '—') + '<br>Valor: ' + f(o.amount) + ' · Comisión: ' + f(o.fee) + '<br>Domicilio: ' + f(o.deliveryFee) + '<br><b>Total: ' + f(o.total) + '</b><br>Vía: ' + esc(o.paidViaLabel) + ' · CHO-' + (2600 + o.id) + '</div>'; }
function led(rows) {
  if (!rows || !rows.length) return '<div class="card mut">Sin movimientos todavía.</div>';
  var names = { wallet: 'Saldo', payments: 'Tus pagos', cash: 'Efectivo en mano', earnings: 'Ganancias', platform: 'Saldo plataforma', till: 'Caja del Centro', commissions: 'Comisiones' };
  return '<div class="card" style="padding:4px 12px">' + rows.map(function (l) { return '<div class="mvr"><div><b>' + esc(l.concept) + '</b><div class="mut">' + hh(l.createdAt) + ' · ' + esc(names[l.account] || l.account) + '</div></div><span class="' + (l.amount < 0 ? 'neg' : 'pos') + '">' + (l.amount < 0 ? '−' : '+') + f(Math.abs(l.amount)) + '</span></div>'; }).join('') + '</div>';
}
function nav(k, cur, items) { return '<div class="nav">' + items.map(function (i) { return '<button class="' + (cur === i[0] ? 'on' : '') + '" data-a="' + k + '" data-i="' + i[0] + '">' + i[1] + '</button>'; }).join('') + '</div>'; }
function splash(sub) { return '<div class="splash"><div class="logo">💸</div><b>ChochoPagos</b><small>' + sub + '</small></div>'; }
function inp(id, label, type, ph, ex) { return '<label for="f_' + id + '">' + label + '</label><input id="f_' + id + '" data-f="' + id + '" type="' + type + '" placeholder="' + ph + '" value="' + esc(S.f[id] || '') + '" autocomplete="off" ' + (ex || '') + '>'; }

/* ---------- rostro (demo: vector simple, igual que el prototipo) ---------- */
var FC = null, TH = .6;
function faceVec(url, cb) { var im = new Image(); im.onload = function () { var N = 16, c = document.createElement('canvas'); c.width = c.height = N; var x = c.getContext('2d'); var m = Math.min(im.width, im.height); x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, N, N); var d = x.getImageData(0, 0, N, N).data, v = [], sum = 0; for (var i = 0; i < d.length; i += 4) { var g = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; v.push(g); sum += g; } var mean = sum / v.length, sd = Math.sqrt(v.reduce(function (a, g) { return a + (g - mean) * (g - mean); }, 0) / v.length) || 1; var t = document.createElement('canvas'); t.width = t.height = 96; t.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 96, 96); cb(v.map(function (g) { return (g - mean) / sd; }), t.toDataURL('image/jpeg', .7)); }; im.onerror = function () { toast('No se pudo leer la foto'); }; im.src = url; }
function faceSim(a, b) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i] * b[i]; return t / a.length; }
function processFace(file) {
  if (!file || !FC) return; var c = FC, url = URL.createObjectURL(file);
  faceVec(url, async function (v, pic) {
    if (c.mode === 'enroll') { STORE.setFace(c.key, { vec: v, pic: pic, session: STORE.session(c.r) }); toast('Rostro registrado ✅ Ya puedes entrar con tu cara'); render(); return; }
    var saved = STORE.face(c.key), sim = faceSim(v, saved.vec);
    if (sim < TH) { toast('No te reconocimos (' + Math.round(sim * 100) + '% de similitud). Intenta de nuevo o usa tu PIN.'); return; }
    toast('Rostro reconocido (' + Math.round(sim * 100) + '%)');
    setSession(c.r, saved.session);
    await refresh(); render();
  });
  var fi = el('faceIn'); if (fi) fi.value = '';
}
function faceCard(r, key) { var has = STORE.face(key); return '<div class="card"><h3>😀 Ingreso con rostro</h3>' + (has ? '<img class="rimg" style="max-height:110px;width:auto" alt="Rostro registrado" src="' + has.pic + '"><p class="mut">Activado ✅</p>' : '<p class="mut">Aún no lo activas.</p>') + '<label class="btn sec" for="faceIn" data-a="fctx" data-i="enroll" data-r="' + r + '" data-k="' + esc(key) + '">📸 ' + (has ? 'Volver a registrar mi rostro' : 'Activar con mi rostro') + '</label><p class="mut" style="margin-top:6px">Demo: compara tu selfie con una imagen simple. Un sistema real usaría reconocimiento biométrico seguro y prueba de vida.</p></div>'; }

function rechCard(r) {
  var p = r === 'd' ? ['rcel', 'ramt', 'rok'] : ['ccel', 'camt', 'cok'];
  return '<div class="card"><h3>➕ Recargar la cuenta de un usuario</h3>' + inp(p[0], 'Celular del usuario', 'tel', '3XX XXX XXXX', NUM) + '<div class="gap"></div>' + inp(p[1], 'Efectivo recibido (COP)', 'number', 'Ej: 50000', 'inputmode="numeric"') + '<label class="chk" style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" data-f="' + p[2] + '"' + (S.f[p[2]] ? ' checked' : '') + '><span>Verifiqué su identidad con la cédula</span></label><button class="btn" data-a="rch" data-r="' + r + '">Recargar cuenta</button><p class="mut" style="margin-top:6px">Solo el domiciliario o el Centro pueden recargar saldos. ' + (r === 'd' ? 'El efectivo se suma a tu efectivo en mano.' : 'El efectivo entra a la caja del Centro.') + '</p></div>';
}

/* ---------- USUARIO ---------- */
function uAuth() {
  var h = '<div class="phone">' + splash('Pagos y trámites sin salir de la vereda') + '<div class="body">';
  if (S.mode === 'login') h += '<div class="card"><h3>Ingresa a tu cuenta</h3>' + inp('cel', 'Celular', 'tel', '3XX XXX XXXX', NUM) + '<div class="gap"></div>' + inp('pin', 'PIN de 4 dígitos', 'password', '••••', PIN) + '<button class="btn" data-a="login">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="u">😀 Entrar con mi rostro</label><button class="btn sec" data-a="mode" data-i="reg">¿Primera vez? Regístrate</button></div><p class="mut" style="text-align:center">Cuenta de prueba: 3128889900 · PIN 1234<br>También puedes registrarte escribiendo al bot de ChochoPagos en Telegram' + (S.cfg && S.cfg.telegramBot ? ': <a href="https://t.me/' + esc(S.cfg.telegramBot) + '" target="_blank" rel="noopener">@' + esc(S.cfg.telegramBot) + '</a>' : '') + '.</p>';
  else h += '<div class="card"><h3>Crea tu cuenta</h3>' + inp('name', 'Nombre completo', 'text', 'Ej: María Pérez') + '<div class="gap"></div>' + inp('ced', 'Cédula', 'tel', 'Sin puntos', NUM) + '<div class="gap"></div>' + inp('cel', 'Celular', 'tel', '3XX XXX XXXX', NUM) + '<div class="gap"></div><label for="f_sector">Vereda o sector</label><select id="f_sector" data-f="sector">' + (S.cfg ? S.cfg.sectors : []).map(function (x) { return '<option' + (S.f.sector === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select><div class="gap"></div>' + inp('dir', 'Indicaciones de tu casa', 'text', 'Ej: Finca La Rosa, portón verde') + '<div class="gap"></div>' + inp('pin', 'Crea un PIN de 4 dígitos', 'password', '••••', PIN) + '<div class="gap"></div>' + inp('pin2', 'Confirma tu PIN', 'password', '••••', PIN) + '<label class="chk"><input type="checkbox" data-f="ok"' + (S.f.ok ? ' checked' : '') + '><span>Autorizo el tratamiento de mis datos para recibir el servicio.</span></label><button class="btn" data-a="reg">Crear cuenta</button><button class="btn sec" data-a="mode" data-i="login">Ya tengo cuenta</button></div>';
  return h + '</div></div>';
}
function bubble(m) {
  var msg = m.message || {}, me = m.direction === 'in';
  var media = msg.media ? img('u', msg.media, 'rth', 'Foto del recibo') : '';
  // Solo se marca lo que la persona escribió desde el bot (discreto, sin repetirlo en cada respuesta).
  // 'whatsapp' queda para el historial guardado antes del cambio a Telegram.
  var VIA = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
  var via = me && VIA[m.channel] ? '<span class="via">vía ' + VIA[m.channel] + '</span>' : '';
  return '<div class="bub' + (me ? ' me' : '') + '">' + media + fmt(msg.body) + via + '</div>';
}
/** Botones o lista del último mensaje del asistente, con la estética del prototipo. */
function chatActions(last) {
  if (!last || last.direction !== 'out' || S.u.busy) return '';
  var msg = last.message;
  if (msg.type === 'buttons') return '<div class="card">' + msg.buttons.map(function (b, i) { return '<button class="btn' + (i ? ' sec' : '') + '" data-a="reply" data-i="' + esc(b.id) + '" data-t="' + esc(b.title) + '">' + esc(b.title) + '</button>'; }).join('') + '</div>';
  if (msg.type === 'list') return '<div class="card"><h3>' + esc(msg.button) + '</h3><div class="lst">' + msg.sections.map(function (s) { return s.rows.map(function (r) { return '<button class="svc" data-a="reply" data-i="' + esc(r.id) + '" data-t="' + esc(r.title) + '"><span>' + esc(r.title) + (r.description ? '<small>' + esc(r.description) + '</small>' : '') + '</span><span class="go" aria-hidden="true">›</span></button>'; }).join(''); }).join('') + '</div></div>';
  return '';
}
var CAMERA = '<label class="btn" for="cam">📷 Tomar foto del recibo</label><input id="cam" class="vh" type="file" accept="image/*" capture="environment"><label class="btn sec" for="gal">🖼️ Elegir de la galería</label><input id="gal" class="vh" type="file" accept="image/*">';
function chatView() {
  var U = S.u, w = U.balances ? U.balances.wallet : 0, h = '';
  h += '<div class="wallet-strip"><span>👛 Mi saldo <b>' + f(w) + '</b></span><span class="mut">🏠 pagas desde casa</span></div>';
  if (!U.chat.length) h += '<div class="bub">' + fmt('Toca el botón de la cámara y mándame una foto de tu recibo: yo lo leo y se lo envío a ' + OP() + '. También puedes decirme qué trámite necesitas.') + '</div>';
  h += U.chat.map(bubble).join('');
  if (U.busy && U.preview) h += '<div class="card"><div class="pv sc"><img alt="Recibo" src="' + U.preview + '"></div><b>Leyendo tu recibo…</b></div>';
  else if (U.busy) h += '<div class="bub mut">…</div>';
  h += chatActions(U.chat[U.chat.length - 1]);
  // Los botones grandes de foto solo aparecen cuando el asistente pide la foto (como en el prototipo).
  if (!U.busy && U.step === 'photo') h += '<div class="card">' + CAMERA + '</div>';
  if (!U.busy) h += '<div class="microw"><button class="ic" data-a="vz" aria-label="Activar o silenciar la voz">' + (S.voice ? '🔊' : '🔇') + '</button><button class="mic' + (S.listening ? ' on' : '') + '" data-a="mic" aria-label="Hablar">🎤</button><button class="ic" data-a="vreset" aria-label="Empezar de nuevo">↺</button></div>' + (S.listening || S.vmsg ? '<div class="live" id="live">' + esc(S.vmsg || '') + '</div>' : '') + '<div class="tf"><label class="btn sm sec" for="quickPhoto" aria-label="Enviar foto del recibo" title="Enviar foto del recibo">📷</label><input id="quickPhoto" class="vh" type="file" accept="image/*">' + (U.step === 'pin' ? '<input id="ti" type="password" inputmode="numeric" maxlength="4" placeholder="PIN de 4 dígitos" autocomplete="off" aria-label="PIN de 4 dígitos">' : '<input id="ti" type="text" placeholder="…o escribe lo que dirías" autocomplete="off">') + '<button class="btn sm" data-a="vsend">Enviar</button></div>';
  if (!U.busy && U.step === 'idle' && S.cfg) {
    h += '<div class="chips">' + EXAMPLES.map(function (x) { return '<button class="chip" data-a="say" data-t="' + esc(x) + '">“' + esc(x) + '”</button>'; }).join('') + '<button class="chip" data-a="say" data-t="ayuda">¿Qué puedo decir?</button><button class="chip" data-a="vtest">🔊 Probar audio</button></div>';
    h += '<div class="card"><h3>O elígelo de la lista</h3><div class="chips">' + S.cfg.categories.map(function (c) { return '<button class="chip' + (S.cat === c.id ? ' on' : '') + '" data-a="cat" data-i="' + c.id + '">' + c.icon + ' ' + esc(c.name) + '</button>'; }).join('') + '</div><div class="lst">';
    S.cfg.services.filter(function (s) { return s.category === S.cat; }).forEach(function (s) {
      var value = s.fixedAmount === null ? 'Valor según tu recibo' : s.fixedAmount === 0 ? 'Sin pago a terceros' : 'Valor fijo ' + f(s.fixedAmount);
      h += '<button class="svc" data-a="reply" data-i="svc:' + s.code + '" data-t="' + esc(s.name) + '"><span>' + s.icon + ' ' + esc(s.name) + (s.selfPayable ? ' 🏠' : '') + '<small>' + value + ' · Comisión ' + f(s.fee) + '</small></span><span class="go" aria-hidden="true">›</span></button>';
    });
    h += '</div></div>';
  }
  return h;
}
/** Contenido del detalle de un pedido (va dentro de su propio recuadro). */
function orderDetail(o) {
  var h = '<div class="order-detail">' + trk(o.statusIndex) + '<div class="st">' + esc(o.statusLabel) + '</div><div class="mut">Ref: ' + esc(o.reference || '—') + '</div>';
  if (o.statusIndex === 6 || o.statusIndex === 7) h += '<p class="mut">' + esc(o.failureReason || 'El Centro está revisando esta operación.') + '</p>';
  h += '<div class="row"><span>Valor del trámite</span><span>' + f(o.amount) + '</span></div><div class="row"><span>Comisión</span><span>' + f(o.fee) + '</span></div><div class="row"><span>Domicilio</span><span>' + f(o.deliveryFee) + '</span></div><div class="row t"><span>Total</span><span>' + f(o.total) + '</span></div>';
  if (o.paidVia !== 'wallet' && o.statusIndex < 2) h += '<div class="mut" style="margin-top:6px">' + esc(OP()) + ' llega en unos ' + (10 + (o.id % 3) * 5) + ' min</div>' + (o.deliveryCode ? '<div class="recibo" style="text-align:center">Código de entrega<br><b style="font-size:26px">' + esc(o.deliveryCode) + '</b><br>Díselo a ' + esc(OP()) + ' cuando le entregues el efectivo</div>' : '') + '<button class="btn sec" data-a="cancel" data-i="' + o.id + '">Cancelar pedido</button>';
  if (o.statusIndex === 3 || o.statusIndex === 4) h += recibo(o, 'u');
  return h + '</div>';
}
function isActive(o) { return o.statusIndex < 3 || o.statusIndex === 7; }
/** Lista compacta: cada pedido se despliega en su mismo recuadro al tocar "Ver detalle". */
function orderHistory(list) {
  var hist = S.ut === 'h';
  var h = '<h4>' + (hist ? 'Historial y facturas anteriores' : 'Pedidos activos') + '</h4><p class="mut">' + (hist ? 'Toca un pedido para ver su comprobante.' : 'Toca un pedido para ver su seguimiento.') + '</p>';
  list.forEach(function (o) {
    var open = o.id === S.orderView;
    h += '<div class="card order-card' + (open ? ' open' : '') + '"><div class="history-row"><div><b>' + o.service.icon + ' ' + esc(o.displayName) + '</b><div class="mut">Pedido #' + o.id + ' · ' + f(o.total) + '</div></div>' + pill(o) + '<button class="btn sm' + (open ? ' sec' : '') + '" data-a="order" data-i="' + o.id + '" aria-expanded="' + open + '">' + (open ? 'Ocultar' : 'Ver detalle') + '</button></div>' + (open ? orderDetail(o) : '') + '</div>';
  });
  return h;
}
function vU() {
  if (!S.u.token) return uAuth();
  var U = S.u, me = U.me;
  if (!me) return '<div class="phone">' + splash('Cargando tu cuenta…') + '</div>';
  var h = '<div class="phone"><div class="bar"><div>Hola, ' + esc(me.name.split(' ')[0]) + ' 👋<br><small>' + esc(me.sector) + '</small></div><span>💬</span></div><div class="body"' + (S.ut === 'p' ? ' data-vb="1"' : '') + '>';
  if (S.ut === 'p') h += chatView();
  if (S.ut === 'o') { var act = U.orders.filter(isActive); h += act.length ? orderHistory(act) : '<div class="card mut">No tienes pedidos activos.</div>'; }
  if (S.ut === 'h') { var hist = U.orders.filter(function (o) { return !isActive(o); }); h += hist.length ? orderHistory(hist) : '<div class="card mut">Todavía no tienes comprobantes anteriores.</div>'; }
  if (S.ut === 'm') h += '<div class="card"><span class="mut">👛 Mi saldo</span><span class="big">' + f(U.balances.wallet) + '</span><button class="btn" data-a="wrech">Pedir recarga a domicilio</button><p class="mut" style="margin-top:6px">Con saldo en tu cuenta pagas tú mismo, desde casa, los trámites marcados con 🏠, sin domicilio.</p></div><div class="card"><span class="mut">Total pagado en ChochoPagos</span><span class="big">' + f(-U.ledger.filter(function (l) { return l.account === 'payments' && l.amount < 0; }).reduce(function (a, l) { return a + l.amount; }, 0)) + '</span></div><h4>Movimientos</h4>' + led(U.ledger);
  if (S.ut === 'r') {
    var ini = me.name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    h += '<div class="card" style="text-align:center"><div class="avatar">' + esc(ini) + '</div><h3>' + esc(me.name) + '</h3><div class="mut">Cliente registrado</div></div><div class="card"><div class="row"><span>Celular</span><span>' + esc(me.localPhone) + '</span></div><div class="row"><span>Cédula</span><span>•••• ' + esc(String(me.document || '').slice(-3)) + '</span></div><div class="row"><span>Sector</span><span>' + esc(me.sector) + '</span></div><div class="row"><span>Indicaciones</span><span style="text-align:right">' + esc(me.address || '—') + '</span></div><div class="row"><span>Pedidos realizados</span><span>' + (U.orderCount || 0) + '</span></div></div>' + faceCard('u', me.localPhone) + '<button class="btn sec" data-a="logout">Cerrar sesión</button>';
  }
  return h + '</div>' + nav('ut', S.ut, [['p', '➕ Pedir'], ['o', '📦 Pedidos'], ['h', '🧾 Historial'], ['m', '💰 Saldos'], ['r', '👤 Perfil']]) + '</div>';
}

/* ---------- DOMICILIARIO ---------- */
function dAuth() { return '<div class="phone">' + splash('Acceso para domiciliarios') + '<div class="body"><div class="card"><h3>Inicia tu turno</h3>' + inp('opc', 'Código de operario', 'text', 'Ej: OP-01') + '<div class="gap"></div>' + inp('opp', 'PIN', 'password', '••••', PIN) + '<button class="btn" data-a="oplogin">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="d">😀 Entrar con mi rostro</label></div><p class="mut" style="text-align:center">Los domiciliarios los registra el Centro. Prueba: OP-01 · PIN 1234</p></div></div>'; }
/** Sin señal: muestra el efecto de las acciones en cola antes de sincronizar. */
function withOffline(o) {
  var q = SYNC.pendingFor(o.id); if (!q.length) return o;
  var x = Object.assign({}, o, { queued: q.length });
  q.forEach(function (a) {
    if (a.action === 'accept') { x.status = 'ON_THE_WAY'; x.statusIndex = 1; x.statusLabel = 'En camino'; }
    if (a.action === 'arrive') x.arrived = true;
    if (a.action === 'collect') { x.status = 'CASH_COLLECTED'; x.statusIndex = 2; x.statusLabel = 'Efectivo recogido'; }
    if (a.action === 'operation') { x.operationVerified = true; x.fields = Object.assign({}, x.fields, a.body.fields); }
  });
  return x;
}
function opCard(o) {
  var cu = o.customer || {}, sv = svcOf(o.service.code), h = '<div class="card"><h3>' + o.service.icon + ' ' + esc(o.displayName) + ' #' + o.id + ' ' + pill(o) + '</h3>' + (o.queued ? '<div class="mut">⏳ ' + o.queued + ' acción(es) pendientes de sincronizar</div>' : '') + '<div class="mut">Ref: ' + esc(o.reference || '—') + '</div><div class="mut">Requisitos: ' + esc(o.service.requirements.join(' · ')) + '</div>' + img('d', o.receiptPhoto, 'rimg', 'Recibo del cliente') + '<div class="row"><span>Cliente: ' + esc(cu.name || local(o.customerPhone)) + '</span><span>Cobrar ' + f(o.total) + '</span></div><div class="row"><span>📍 ' + esc(cu.sector || '') + (cu.address ? ' · ' + esc(cu.address) : '') + '</span></div><div class="row"><span>📞 ' + esc(local(o.customerPhone)) + '</span><span>Ganas ' + f(o.deliveryFee) + '</span></div>' + trk(o.statusIndex);
  var s = o.statusIndex;
  if (s === 0) h += '<button class="btn" data-a="acc" data-i="' + o.id + '">Aceptar pedido</button>';
  if (s === 1) {
    if (!o.arrived) h += '<button class="btn" data-a="arr" data-i="' + o.id + '">📍 Llegué a la casa</button>';
    else h += '<div class="card" style="margin-top:8px;background:var(--bg)"><b>Recibir el efectivo</b><label class="chk" style="display:flex;gap:8px;margin-top:6px"><input type="checkbox" data-k="chk" data-i="' + o.id + '"' + (S.inp['chk' + o.id] ? ' checked' : '') + '><span>Verifiqué el recibo: vigente y el valor coincide</span></label><div class="gap"></div><label for="cash' + o.id + '">Efectivo contado (COP)</label><input id="cash' + o.id + '" type="number" inputmode="numeric" data-k="cash" data-i="' + o.id + '" value="' + esc(S.inp['cash' + o.id] || '') + '" placeholder="Debe ser ' + f(o.total) + '"><div class="gap"></div><label for="code' + o.id + '">Código de entrega del cliente</label><input id="code' + o.id + '" type="text" inputmode="numeric" maxlength="4" data-k="code" data-i="' + o.id + '" value="' + esc(S.inp['code' + o.id] || '') + '" placeholder="4 dígitos"><button class="btn" data-a="rec" data-i="' + o.id + '">Confirmar efectivo recibido</button></div>';
  }
  if (s === 2) {
    h += '<div class="card" style="margin-top:8px;background:var(--bg)"><b>📋 Información de la operación</b><p class="mut">Verifica la imagen o completa los datos antes de procesar el pago.</p>';
    (sv ? sv.fields : []).forEach(function (x) {
      if (x.type === 'amount') { h += '<div class="row"><span>' + esc(x.label) + '</span><b>' + f(o.amount) + '</b></div>'; return; }
      var key = 'opf' + x.key + o.id, value = S.inp[key] !== undefined ? S.inp[key] : (o.fields[x.key] || (x.key === 'reference' ? o.reference : ''));
      h += '<label for="' + key + '">' + esc(x.label) + (x.optional ? ' (opcional)' : '') + '</label><input id="' + key + '" type="text" data-k="opf' + x.key + '" data-i="' + o.id + '" value="' + esc(value) + '">';
    });
    h += '<label for="result' + o.id + '">Respuesta simulada del proveedor</label><select id="result' + o.id + '" data-k="result" data-i="' + o.id + '">' + [['approved', 'Aprobado'], ['pending', 'Pendiente de confirmación'], ['rejected', 'Rechazado']].map(function (r) { return '<option value="' + r[0] + '"' + (S.inp['result' + o.id] === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select><label class="chk"><input type="checkbox" data-k="opchk" data-i="' + o.id + '"' + (S.inp['opchk' + o.id] ? ' checked' : '') + '><span>Verifiqué los datos y el recibo contra la solicitud</span></label><button class="btn" data-a="opcomplete" data-i="' + o.id + '">Guardar información completa</button></div>';
    if (o.operationVerified) h += '<p class="st">Información completa. Puedes procesar el pago.</p>';
    h += (S.on && o.operationVerified ? '<button class="btn" data-a="payop" data-i="' + o.id + '">' + (o.service.code === 'wallet_topup' ? 'Acreditar al monedero del cliente' : 'Hacer el trámite con la app') + '</button>' : '<button class="btn" disabled>' + (!S.on ? 'Sin señal: llévalo al Centro' : 'Completa y verifica la información') + '</button>') + '<p class="mut" style="margin-top:6px">También puedes llevarlo al Centro Comunitario.</p>';
  }
  if (s === 3) h += '<label class="btn" for="evidence' + o.id + '">📸 Tomar foto de evidencia</label><input id="evidence' + o.id + '" class="vh" type="file" accept="image/*" capture="environment" data-evidence="' + o.id + '"><p class="mut" style="margin-top:6px">La entrega se completa después de guardar la evidencia.</p>';
  if (s === 6) h += '<p class="mut">' + esc(o.failureReason || '') + '</p><button class="btn" data-a="refund" data-i="' + o.id + '">Devolver el efectivo al cliente</button>';
  if (s === 7) h += '<p class="mut">El proveedor aún no confirma el pago. El Centro hará seguimiento.</p>';
  return h + '</div>';
}
function vD() {
  if (!S.d.token) return dAuth();
  var D = S.d, sum = D.summary || { cash: 0, earnings: 0, pendingSettlement: 0, platform: 0 };
  var os = D.orders.map(withOffline).filter(function (o) { return o.statusIndex < 4 || o.statusIndex === 6 || o.statusIndex === 7; }).reverse();
  var h = '<div class="phone"><div class="bar"><div>🏍️ ' + esc(OP()) + ' · ' + esc(D.actor.id) + '<br><small>' + os.length + ' pedidos activos</small></div><div style="display:flex;gap:8px;align-items:center"><button class="sw' + (S.on ? ' on' : '') + '" data-a="net" style="color:#fff"><span></span>' + (S.on ? 'Señal' : 'Sin señal') + '</button><button class="out" data-a="oplogout">Salir</button></div></div>';
  if (!S.on) h += '<div class="off">Modo offline: puedes recoger y registrar. ' + SYNC.label() + '.</div>';
  h += '<div class="body"><div class="two"><div class="card"><span class="mut">Efectivo en mano</span><b class="big" style="font-size:18px">' + f(sum.cash) + '</b></div><div class="card"><span class="mut">Ganancias</span><b class="big" style="font-size:18px">' + f(sum.earnings) + '</b></div></div>';
  if (S.dt === 'p') h += os.length ? os.map(opCard).join('') : '<div class="card mut">Sin pedidos activos. Pide uno desde la vista Usuario o por Telegram.</div>';
  else h += '<div class="card"><div class="row"><span>Pendiente de rendir al Centro</span><b>' + f(sum.pendingSettlement) + '</b></div><button class="btn" data-a="rend"' + (sum.pendingSettlement ? '' : ' disabled') + '>Rendir caja al Centro</button><p class="mut" style="margin-top:6px">Al rendir, el efectivo de los trámites pagados con la app pasa a la caja del Centro. Tu domicilio lo conservas.</p></div><div class="card"><div class="row"><span>Saldo de plataforma</span><b>' + f(sum.platform) + '</b></div><p class="mut">Para pagar con la app se necesita saldo suficiente en la plataforma y señal.</p></div>' + rechCard('d') + faceCard('d', D.actor.id) + '<h4>Movimientos</h4>' + led(D.ledger);
  return h + '</div>' + nav('dt', S.dt, [['p', '📦 Pedidos'], ['m', '💰 Caja y movimientos']]) + '</div>';
}

/* ---------- CENTRO ---------- */
function cAuth() { return '<div class="tablet">' + splash('Panel del Centro Comunitario') + '<div class="ctr"><div class="card"><h3>Acceso del punto</h3>' + inp('cc', 'Código del punto', 'text', 'Ej: CC-01') + '<div class="gap"></div>' + inp('ccp', 'PIN', 'password', '••••', PIN) + '<button class="btn" data-a="cclogin">Ingresar</button><label class="btn sec" for="faceIn" data-a="fctx" data-i="login" data-r="c">😀 Entrar con mi rostro</label></div><p class="mut" style="text-align:center;margin-top:8px">Prueba: CC-01 · PIN 1234</p></div></div>'; }
function vC() {
  if (!S.c.token) return cAuth();
  var C = S.c, d = C.dash || {}, q = C.orders.filter(function (o) { return o.statusIndex === 2 || o.statusIndex === 7; });
  var h = '<div class="tablet"><div class="bar"><div>🏪 Centro Comunitario · ' + esc(C.actor.id) + '<br><small>Tienda aliada · tablet con internet e impresora</small></div><div style="display:flex;gap:10px;align-items:center"><span>' + new Date().toLocaleDateString('es-CO') + '</span><button class="out" data-a="cclogout">Salir</button></div></div>';
  h += '<div class="kpis"><div class="card kpi"><b>' + (d.transactions || 0) + '</b><span>Transacciones realizadas</span></div><div class="card kpi"><b>' + f(d.processedAmount) + '</b><span>Monto procesado</span></div><div class="card kpi"><b>' + f(d.commissions) + '</b><span>Comisiones ganadas</span></div><div class="card kpi"><b>' + (d.averageMinutes === null || d.averageMinutes === undefined ? '—' : d.averageMinutes + ' min') + '</b><span>Tiempo promedio de atención</span></div><div class="card kpi"><b>' + (d.users || 0) + '</b><span>Usuarios registrados</span></div></div>';
  h += '<div class="pad"><div class="two"><div class="card"><h3>💰 Saldo de plataforma</h3><b class="big">' + f(d.platform) + '</b><button class="btn sm" style="margin-top:8px" data-a="rechplat">Recargar $200.000</button></div><div class="card"><h3>🗄️ Caja (efectivo)</h3><b class="big">' + f(d.till) + '</b><p class="mut">Efectivo recibido de domiciliarios</p></div><div class="card"><h3>🖨️ Papel</h3><b class="big">' + (d.paperSheets || 0) + ' hojas</b><p class="mut">' + (d.paperSheets < 30 ? '⚠️ Stock bajo, reponer' : 'Stock suficiente') + '</p></div></div>';
  h += rechCard('c') + faceCard('c', C.actor.id);
  h += '<h3>Cola de pagos en el Centro (' + q.length + ')</h3>';
  if (!q.length) h += '<div class="card mut">No hay pagos pendientes. Aquí llegan los pedidos recogidos cuando no hay señal.</div>';
  q.forEach(function (o) {
    var pend = o.statusIndex === 7, opts = pend ? [['approved', 'Aprobado'], ['rejected', 'Rechazado']] : [['approved', 'Aprobado'], ['pending', 'Pendiente'], ['rejected', 'Rechazado']];
    h += '<div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>#' + o.id + ' ' + esc(o.displayName) + '</b><div class="mut">' + esc(o.customer ? o.customer.name : '') + ' · Ref ' + esc(o.reference || '—') + ' · ' + f(o.amount) + '</div>' + pill(o) + (o.failureReason ? '<div class="mut">' + esc(o.failureReason) + '</div>' : '') + img('c', o.receiptPhoto, 'rimg', 'Recibo', 'max-height:80px;width:auto') + '</div><div><label for="cenresult' + o.id + '">Resultado</label><select id="cenresult' + o.id + '" data-k="cres" data-i="' + o.id + '">' + opts.map(function (r) { return '<option value="' + r[0] + '"' + (S.inp['cres' + o.id] === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select><button class="btn sm" data-a="paycen" data-i="' + o.id + '">' + (pend ? 'Reintentar e imprimir' : 'Procesar e imprimir') + '</button></div></div>';
  });
  h += '<h3>Transacciones</h3><div class="tw card"><table><tr><th>#</th><th>Cliente</th><th>Trámite</th><th>Valor</th><th>Comisión</th><th>Total cobrado</th><th>Estado</th><th>Vía</th><th>Recibo</th></tr>';
  C.orders.forEach(function (o) { h += '<tr><td>' + o.id + '</td><td>' + esc(o.customer ? o.customer.name.split(' ')[0] : local(o.customerPhone)) + '</td><td>' + esc(o.displayName) + '</td><td>' + f(o.amount) + '</td><td>' + f(o.fee) + '</td><td>' + f(o.total) + '</td><td>' + pill(o) + '</td><td>' + esc(o.paidViaLabel) + '</td><td>' + (o.receiptPhoto ? img('c', o.receiptPhoto, '', 'Recibo', 'width:40px;height:40px;object-fit:cover;border-radius:6px') : '—') + '</td></tr>'; });
  h += '</table></div><h3>Usuarios registrados</h3><div class="tw card"><table><tr><th>Nombre</th><th>Celular</th><th>Sector</th><th>Pedidos</th></tr>' + C.users.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.localPhone) + '</td><td>' + esc(u.sector) + '</td><td>' + u.orderCount + '</td></tr>'; }).join('') + '</table></div>';
  h += '<h3>Movimientos de saldos</h3>' + led(C.ledger);
  h += '<h3>Tarifario</h3><details class="card"><summary>Ver tarifas por trámite (editable en la versión real)</summary><div class="tw"><table><tr><th>Categoría</th><th>Trámite</th><th>Valor</th><th>Comisión</th></tr>' + (S.cfg ? S.cfg.services.map(function (s) { var cat = S.cfg.categories.filter(function (c) { return c.id === s.category; })[0]; return '<tr><td>' + esc(cat ? cat.name : '') + '</td><td>' + s.icon + ' ' + esc(s.name) + '</td><td>' + (s.fixedAmount === null ? 'Libre' : f(s.fixedAmount)) + '</td><td>' + f(s.fee) + '</td></tr>'; }).join('') + '<tr><td colspan="3">Domicilio (todos)</td><td>' + f(S.cfg.deliveryFee) + '</td></tr>' : '') + '</table></div></details>';
  return h + '</div></div>';
}

/* ---------- render ---------- */
function cap(t, x) { return '<div class="col"><div class="cap">' + t + '</div>' + x + '</div>'; }
var lastHtml = { tabs: '', stage: '' };
function render() {
  var T = [['u', '👩 Usuario'], ['d', '🏍️ Domiciliario'], ['c', '🏪 Centro Comunitario'], ['a', '👀 Ver los tres']];
  var tabs = T.map(function (t) { return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-i="' + t[0] + '">' + t[1] + '</button>'; }).join('');
  var stage = S.apiDown && !S.cfg
    ? '<div class="card" style="max-width:520px"><h3>No hay conexión con el servidor</h3><p class="mut">Inicia el backend (<b>cd backend && npm start</b>) y abre <b>http://localhost:3000</b>. Esta app ya no guarda los pedidos en el navegador: todo vive en el servidor, que también atiende el bot de Telegram.</p><button class="btn" data-a="retry">Reintentar</button></div>'
    : S.tab === 'u' ? cap('Lo que ve el usuario', vU()) : S.tab === 'd' ? cap('Lo que ve el domiciliario', vD()) : S.tab === 'c' ? cap('Lo que ve el centro', vC()) : cap('Usuario', vU()) + cap('Domiciliario', vD()) + cap('Centro Comunitario', vC());
  if (tabs !== lastHtml.tabs) { el('tabs').innerHTML = tabs; lastHtml.tabs = tabs; }
  // Si nada cambió (p. ej. en la actualización automática), no se toca la pantalla: el scroll queda quieto.
  if (stage === lastHtml.stage && !S.vb) return;
  var sc = [].map.call(document.querySelectorAll('.body'), function (b) { return b.scrollTop; });
  el('stage').innerHTML = stage; lastHtml.stage = stage;
  [].forEach.call(document.querySelectorAll('.body'), function (b, i) { if (sc[i]) b.scrollTop = sc[i]; });
  // Con mensajes nuevos, el chat se ubica en el último mensaje (y sus opciones), no al final del catálogo.
  if (S.vb) {
    [].forEach.call(document.querySelectorAll('.body[data-vb]'), function (b) {
      var bubs = b.querySelectorAll('.bub'), lastBub = bubs[bubs.length - 1];
      b.scrollTop = lastBub ? Math.max(0, lastBub.offsetTop - b.clientHeight * 0.35) : b.scrollHeight;
    });
    S.vb = false;
  }
  hydrateImages();
}
/** Las fotos requieren sesión: se cargan después de pintar. */
function hydrateImages() {
  [].forEach.call(document.querySelectorAll('img[data-media]'), function (im) {
    var tok = S[im.dataset.tok] && S[im.dataset.tok].token;
    if (!tok || im.src) return;
    API.media(tok, im.dataset.media).then(function (url) { if (url) im.src = url; });
  });
}

/* ---------- chat ---------- */
async function sendChat(payload, echo) {
  var U = S.u; if (!U.token || U.busy) return;
  U.busy = true;
  SEQ.u++; // invalida cualquier actualización automática que ya iba en camino
  var secret = U.step === 'pin' && payload.text;
  var ordersBefore = U.orders.map(function (o) { return o.id; });
  if (!payload.photo) U.chat.push({ tmp: true, direction: 'in', message: { type: 'text', body: secret ? '••••' : (echo || payload.text || payload.replyId) } });
  S.vb = true; render();
  try {
    var r = await API.post('/me/chat', U.token, payload);
    var data = await API.get('/me/chat?after=' + U.lastId, U.token);
    mergeChat(data);
    var lastText = r.replies.length ? r.replies[r.replies.length - 1].body : '';
    if (lastText) speak(lastText);
  } catch (e) { U.chat = U.chat.filter(function (m) { return !m.tmp; }); if (!handleAuthError('u', e)) toast(e.message); }
  U.busy = false; U.preview = null;
  await refreshCustomer(); S.vb = true;
  // Pagó con su saldo: se abre el Historial con ese comprobante (como vself() en el prototipo).
  var paid = U.orders.filter(function (o) { return ordersBefore.indexOf(o.id) < 0 && o.paidVia === 'wallet'; })[0];
  if (paid) { S.ut = 'h'; S.orderView = paid.id; toast('Pagado desde tu saldo'); }
  render();
}
function shrink(file, cb) { var im = new Image(), u = URL.createObjectURL(file); im.onload = function () { var M = 1280, k = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); c.toBlob(function (b) { cb(b || file, u); }, 'image/jpeg', .82); }; im.onerror = function () { cb(file, u); }; im.src = u; }
function sendPhoto(file) {
  if (!file) return;
  shrink(file, async function (blob, preview) {
    S.u.preview = preview; S.u.busy = true; S.vb = true; render();
    try {
      var up = await API.upload(S.u.token, blob);
      API.rememberMedia(up.name, preview);
      S.u.busy = false;
      await sendChat({ photo: up.name });
    } catch (e) { S.u.busy = false; S.u.preview = null; toast(e.message); render(); }
  });
}

/* ---------- acciones ---------- */
function setf(e) { var t = e.target; if (!t.dataset) return; if (t.dataset.k) S.inp[t.dataset.k + t.dataset.i] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f) S.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; }
document.addEventListener('input', setf); document.addEventListener('change', setf);

function opAction(id, action, body, ok) {
  var D = S.d;
  if (!S.on) {
    if (!SYNC.canQueue(action)) { toast('Sin señal: esta operación requiere conexión'); return; }
    SYNC.queue(id, action, body); toast('Sin señal: guardado para sincronizar'); render(); return;
  }
  return act(function () { return API.post('/orders/' + id + '/' + action, D.token, body); }, ok);
}

document.addEventListener('click', async function (e) {
  var b = e.target.closest('[data-a]'); if (!b) return;
  var a = b.dataset.a, i = b.dataset.i, id = Number(i);
  switch (a) {
    case 'tab': S.tab = i; STORE.setPref('tab', i); await refresh(); break;
    case 'retry': await loadCatalog(); await refresh(); break;
    case 'ut': S.ut = i; S.orderView = null; S.vb = i === 'p'; break;
    case 'dt': S.dt = i; break;
    case 'order': S.orderView = S.orderView === id ? null : id; break;
    case 'closeOrder': S.orderView = null; break;
    case 'mode': S.mode = i; break;

    // --- usuario
    case 'login':
      try { var s = await API.post('/auth/customer', null, { phone: S.f.cel.trim(), pin: S.f.pin }); setSession('u', s); S.f.pin = ''; S.u.chat = []; S.u.lastId = 0; S.u.seen = {}; toast('¡Bienvenido/a, ' + s.user.name.split(' ')[0] + '!'); await refreshCustomer(); S.vb = true; }
      catch (err) { toast(err.message); }
      break;
    case 'reg':
      var F = S.f;
      try { var rs = await API.post('/auth/register', null, { name: F.name.trim(), document: F.ced, phone: F.cel, sector: F.sector, address: F.dir.trim(), pin: F.pin, pinConfirm: F.pin2, consent: !!F.ok }); setSession('u', rs); S.f.pin = S.f.pin2 = ''; S.u.chat = []; S.u.lastId = 0; toast('Cuenta creada. Activa el ingreso con rostro en Perfil.'); await refreshCustomer(); }
      catch (err) { toast(err.message); }
      break;
    case 'logout': setSession('u', null); S.u.me = null; S.u.chat = []; S.u.lastId = 0; S.mode = 'login'; toast('Sesión cerrada'); break;
    case 'reply':
      if (i === 'orders') { S.ut = 'o'; break; }
      if (i === 'balance') { S.ut = 'm'; break; }
      sendChat({ replyId: i, text: b.dataset.t }, b.dataset.t); return;
    case 'say': sendChat({ text: b.dataset.t }); return;
    case 'vsend': var ti = el('ti'); if (ti && ti.value.trim()) { var tv = ti.value; ti.value = ''; sendChat({ text: tv }); } return;
    case 'mic': listen(); return;
    case 'vz': S.voice = !S.voice; STORE.setPref('voice', S.voice); if (!S.voice && window.speechSynthesis) speechSynthesis.cancel(); toast(S.voice ? 'Voz activada' : 'Voz silenciada'); break;
    case 'vreset': if (window.speechSynthesis) speechSynthesis.cancel(); sendChat({ text: 'empezar de nuevo' }, '↺ Empezar de nuevo'); return;
    case 'vtest': if (!window.speechSynthesis) { toast('Este navegador no tiene voz de respuesta'); return; } speak('Hola, soy ChochoPagos. Si me escuchas, el audio funciona.', true); toast('Reproduciendo… si no oyes nada, sube el volumen o quita el modo silencio'); return;
    case 'cat': S.cat = S.cat === i ? null : i; break;
    case 'wrech': S.ut = 'p'; sendChat({ replyId: 'svc:wallet_topup', text: 'Quiero recargar mi monedero' }, 'Quiero recargar mi monedero'); return;
    case 'cancel': await act(function () { return API.post('/me/orders/' + id + '/cancel', S.u.token); }, 'Pedido #' + id + ' cancelado'); return;

    // --- rostro
    case 'fctx':
      var fr = b.dataset.r, fk = b.dataset.k || '';
      if (i === 'login') {
        if (fr === 'u') { fk = S.f.cel.trim(); if (!fk) { e.preventDefault(); toast('Escribe tu celular primero'); return; } }
        else if (fr === 'd') { fk = S.f.opc.trim().toUpperCase(); if (!fk) { e.preventDefault(); toast('Escribe tu código de operario primero'); return; } }
        else { fk = S.f.cc.trim().toUpperCase(); if (!fk) { e.preventDefault(); toast('Escribe el código del punto primero'); return; } }
        if (!STORE.face(fk)) { e.preventDefault(); toast('Aún no registraste tu rostro. Entra con tu PIN y actívalo en tu perfil.'); return; }
      }
      FC = { mode: i, key: fk, r: fr }; return;

    // --- domiciliario
    case 'oplogin': case 'cclogin':
      var role = a === 'oplogin' ? 'd' : 'c', code = a === 'oplogin' ? S.f.opc : S.f.cc, pin = a === 'oplogin' ? S.f.opp : S.f.ccp;
      try {
        var st = await API.post('/auth/staff', null, { code: code, pin: pin });
        if ((role === 'd') !== (st.actor.role === 'operator')) { toast('Ese código no corresponde a esta pantalla'); break; }
        setSession(role, st); S.f.opp = S.f.ccp = ''; toast(role === 'd' ? 'Turno iniciado' : 'Bienvenido al panel'); await refresh();
      } catch (err) { toast(err.message); }
      break;
    case 'oplogout': setSession('d', null); toast('Turno cerrado'); break;
    case 'cclogout': setSession('c', null); toast('Sesión cerrada'); break;
    case 'net':
      S.on = !S.on;
      if (S.on) { var res = await SYNC.flush(function (q) { return API.post('/orders/' + q.orderId + '/' + q.action, S.d.token, q.body); }); toast('Señal recuperada. ' + res.ok + ' operación(es) sincronizada(s)' + (res.errors.length ? '. Con error: ' + res.errors.join('; ') : '')); await refresh(); }
      else toast('Sin señal: modo offline');
      break;
    case 'acc': opAction(id, 'accept', {}, 'Pedido #' + id + ' aceptado'); return;
    case 'arr': opAction(id, 'arrive', {}, 'Verifica el recibo y recibe el efectivo'); return;
    case 'rec':
      if (!S.inp['chk' + id]) { toast('Verifica el recibo antes de recibir el efectivo'); return; }
      opAction(id, 'collect', { cashReceived: parseInt(S.inp['cash' + id], 10) || 0, customerCode: String(S.inp['code' + id] || ''), receiptVerified: true }, function () { return 'Efectivo recibido: ' + f(S.inp['cash' + id]); }); return;
    case 'opcomplete':
      if (!S.inp['opchk' + id]) { toast('Marca que verificaste los datos'); return; }
      var ord = S.d.orders.filter(function (o) { return o.id === id; })[0], sv = ord && svcOf(ord.service.code), fields = {};
      (sv ? sv.fields : []).forEach(function (x) { if (x.type === 'amount') return; var v = S.inp['opf' + x.key + id]; fields[x.key] = v !== undefined ? v : (ord.fields[x.key] || (x.key === 'reference' ? ord.reference : '')); });
      opAction(id, 'operation', { fields: fields }, 'Información de la operación guardada'); return;
    case 'payop':
      await act(function () { return API.post('/orders/' + id + '/pay', S.d.token, { simulate: S.inp['result' + id] || 'approved' }); }, function (o) { return o.status === 'PAID' ? 'Trámite #' + id + ' realizado' : o.status === 'PENDING_PROVIDER' ? 'Trámite #' + id + ' pendiente de confirmación' : 'Trámite #' + id + ' rechazado por el proveedor'; }); return;
    case 'refund': await act(function () { return API.post('/orders/' + id + '/refund', S.d.token); }, 'Efectivo devuelto al cliente'); return;
    case 'rend': await act(function () { return API.post('/settlements', S.d.token); }, function (r) { return 'Caja rendida: ' + f(r.amount); }); return;
    case 'rch':
      var rr = b.dataset.r, pk = rr === 'd' ? ['rcel', 'ramt', 'rok'] : ['ccel', 'camt', 'cok'], tok = S[rr].token;
      if (!S.f[pk[2]]) { toast('Confirma que verificaste su identidad con la cédula'); return; }
      await act(async function () { var r = await API.post('/wallet/topups', tok, { phone: S.f[pk[0]], amount: parseInt(S.f[pk[1]], 10) || 0, identityVerified: true }); S.f[pk[1]] = ''; S.f[pk[2]] = false; return r; }, function (r) { return 'Cuenta recargada con ' + f(r.amount); }); return;

    // --- centro
    case 'paycen':
      var co = S.c.orders.filter(function (o) { return o.id === id; })[0], result = S.inp['cres' + id] || 'approved';
      await act(function () { return co.statusIndex === 7 ? API.post('/orders/' + id + '/resolve', S.c.token, { result: result }) : API.post('/orders/' + id + '/pay', S.c.token, { simulate: result }); }, function (o) { return o.status === 'PAID' ? 'Trámite #' + id + ' procesado en el Centro' : o.status === 'PENDING_PROVIDER' ? 'Trámite #' + id + ' pendiente de confirmación' : 'Trámite #' + id + ' rechazado por el proveedor'; }); return;
    case 'rechplat': await act(function () { return API.post('/platform/recharge', S.c.token, { amount: 200000 }); }, 'Saldo recargado'); return;

    case 'reset':
      try { if (window.speechSynthesis) speechSynthesis.cancel(); await API.devReset(); SYNC.clear(); S.u.chat = []; S.u.lastId = 0; S.u.seen = {}; S.d.seen = {}; S.d.primed = false; S.inp = {}; toast('Demo reiniciada'); await refresh(); }
      catch (err) { toast(err.message); }
      break;
  }
  render();
});

document.addEventListener('change', function (e) {
  if (e.target.id === 'cam' || e.target.id === 'gal' || e.target.id === 'quickPhoto') sendPhoto(e.target.files[0]);
  if (e.target.id === 'faceIn') processFace(e.target.files[0]);
  if (e.target.dataset && e.target.dataset.evidence) {
    var oid = Number(e.target.dataset.evidence), file = e.target.files[0]; if (!file) return;
    shrink(file, function (blob) {
      act(async function () { var up = await API.upload(S.d.token, blob); return API.post('/orders/' + oid + '/deliver', S.d.token, { evidencePhoto: up.name }); }, 'Evidencia guardada. Pedido entregado.');
    });
  }
});
document.addEventListener('keydown', function (e) { if (e.target.id === 'ti' && e.key === 'Enter') { var v = e.target.value.trim(); if (v) { e.target.value = ''; sendChat({ text: v }); } } });
var UNL = 0; document.addEventListener('click', function () { if (!UNL && window.speechSynthesis) { UNL = 1; try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} } });

/* ---------- arranque y actualización periódica ---------- */
(async function start() {
  render();
  await loadCatalog();
  await refresh();
  S.vb = true; render();
  async function tick() {
    if (document.hidden || S.u.busy) return;
    var focused = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    await refresh();
    // Con mensajes nuevos del chat (p. ej. llegaron por Telegram) se pinta aunque
    // el cursor esté en la caja de texto, conservando lo que se estaba escribiendo.
    if (!focused) render();
    else if (S.vb) renderKeepingFocus();
  }
  setInterval(tick, 3000);
  // Al volver a la app (desde Telegram u otra pestaña) se actualiza de inmediato.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);
})();

/** Repinta y devuelve el foco, el texto y el cursor al campo donde estaba la persona. */
function renderKeepingFocus() {
  var a = document.activeElement, id = a && a.id, value = a && a.value, pos = null;
  try { pos = a.selectionStart; } catch (e) {}
  render();
  var n = id && el(id);
  if (!n) return;
  if (typeof value === 'string' && n.value !== value) n.value = value;
  n.focus({ preventScroll: true });
  try { if (pos != null) n.setSelectionRange(pos, pos); } catch (e) {}
}
