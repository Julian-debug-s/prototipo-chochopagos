import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { buildTestContainer, ROSA } from './helpers.js';

let c, messaging, server, base;
const tokens = {};

before(async () => {
  ({ c, messaging } = buildTestContainer());
  server = createApp(c).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await c.close();
});

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const isBuffer = Buffer.isBuffer(body);
  const res = await fetch(base + path, {
    method,
    headers: { ...(isBuffer ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : isBuffer || typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
};
const as = (who) => (method, path, body) => call(method, path, { token: tokens[who], body });
const op = as('operator');
const center = as('center');
const rosa = as('rosa');

describe('Acceso (pantallas de ingreso del prototipo)', () => {
  test('el personal entra con código y PIN', async () => {
    const res = await call('POST', '/api/auth/staff', { body: { code: 'op-01', pin: '1234' } });
    assert.equal(res.status, 200);
    tokens.operator = res.body.token;
    tokens.center = (await call('POST', '/api/auth/staff', { body: { code: 'CC-01', pin: '1234' } })).body.token;
    assert.equal((await call('POST', '/api/auth/staff', { body: { code: 'OP-01', pin: '0000' } })).status, 401);
  });

  test('el cliente entra con celular y PIN', async () => {
    const res = await call('POST', '/api/auth/customer', { body: { phone: '3128889900', pin: '1234' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Rosa Giraldo');
    assert.equal(res.body.user.pinHash, undefined, 'nunca expone el hash del PIN');
    tokens.rosa = res.body.token;
  });

  test('bloquea tras varios PIN incorrectos', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/customer', { body: { phone: '3104567890', pin: '0000' } });
    const res = await call('POST', '/api/auth/customer', { body: { phone: '3104567890', pin: '1234' } });
    assert.equal(res.status, 429);
  });

  test('registro con el formulario "Crea tu cuenta"', async () => {
    const body = { name: 'María Pérez', document: '1036999', phone: '3005556677', sector: 'Vereda vecina', address: 'Finca La Rosa, portón verde', pin: '2468', pinConfirm: '2468', consent: true };
    const res = await call('POST', '/api/auth/register', { body });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal((await call('POST', '/api/auth/register', { body })).body.error.code, 'ALREADY_REGISTERED');
  });

  test('exige sesión y respeta los roles', async () => {
    assert.equal((await call('GET', '/api/orders')).status, 401);
    assert.equal((await call('GET', '/api/orders', { token: 'falso.token' })).status, 401);
    assert.equal((await op('POST', '/api/platform/recharge', { amount: 1000 })).status, 403);
    assert.equal((await rosa('GET', '/api/orders')).status, 403);
    assert.equal((await op('GET', '/api/me')).status, 403);
  });
});

describe('Chat web de la pestaña Usuario (mismo asistente que Telegram)', () => {
  test('conversa y guarda el historial', async () => {
    const res = await rosa('POST', '/api/me/chat', { text: 'pagar el agua' });
    assert.equal(res.status, 200);
    assert.match(res.body.replies[0].body, /Primero selecciona la empresa/);
    assert.equal(res.body.step, 'provider');
    await rosa('POST', '/api/me/chat', { text: 'cancelar' });
    const history = (await rosa('GET', '/api/me/chat')).body;
    assert.ok(history.messages.length >= 4);
    assert.equal(history.step, 'idle');
  });

  test('sube la foto del recibo y la envía al chat', async () => {
    const up = await call('POST', '/api/uploads', { token: tokens.rosa, body: Buffer.from([0xff, 0xd8, 0xff]), headers: { 'content-type': 'image/jpeg' } });
    assert.equal(up.status, 201);
    const res = await rosa('POST', '/api/me/chat', { photo: up.body.name });
    assert.match(res.body.replies.map((r) => r.body).join(' '), /Estoy leyendo el recibo/);
    assert.equal((await rosa('GET', `/api/media/${up.body.name}`)).status, 200, 'la clienta puede ver su propia foto');
    await rosa('POST', '/api/me/chat', { text: 'cancelar' });
  });
});

describe('Ciclo completo con dinero cuadrado', () => {
  async function orderFromChat(text, reference, amount) {
    for (const step of [{ text }, { replyId: 'prov:0' }, { replyId: 'mode:form' }, { text: reference }, { text: String(amount) }, { replyId: 'confirm:yes' }]) {
      await rosa('POST', '/api/me/chat', step);
    }
    const [order] = (await rosa('GET', '/api/me/orders')).body;
    return order;
  }

  test('chat → domiciliario (con verificación de la operación) → Centro', async () => {
    const order = await orderFromChat('pagar el agua', '889900', 42300);
    const id = order.id;
    assert.match(order.deliveryCode, /^\d{4}$/, 'la clienta ve su código');
    assert.equal((await op('GET', `/api/orders/${id}`)).body.deliveryCode, undefined, 'el domiciliario no ve el código');
    assert.equal((await op('GET', `/api/orders/${id}`)).body.customer.sector, 'Alto del Chocho');

    assert.equal((await op('POST', `/api/orders/${id}/accept`, {})).body.status, 'ON_THE_WAY');
    await op('POST', `/api/orders/${id}/arrive`, {});
    const wrong = await op('POST', `/api/orders/${id}/collect`, { cashReceived: 40000, customerCode: order.deliveryCode, receiptVerified: true });
    assert.equal(wrong.body.error.code, 'CASH_MISMATCH');
    assert.equal((await op('POST', `/api/orders/${id}/collect`, { cashReceived: 46800, customerCode: order.deliveryCode, receiptVerified: true })).body.status, 'CASH_COLLECTED');

    assert.equal((await op('POST', `/api/orders/${id}/pay`, {})).body.error.code, 'OPERATION_NOT_VERIFIED');
    assert.equal((await op('POST', `/api/orders/${id}/operation`, { fields: { reference: '889900' } })).body.operationVerified, true);
    assert.equal((await op('POST', `/api/orders/${id}/pay`, {})).body.status, 'PAID');

    const evidence = await call('POST', '/api/uploads', { token: tokens.operator, body: Buffer.from([1, 2, 3]), headers: { 'content-type': 'image/png' } });
    const delivered = await op('POST', `/api/orders/${id}/deliver`, { evidencePhoto: evidence.body.name });
    assert.equal(delivered.body.status, 'DELIVERED');
    assert.equal(delivered.body.evidencePhoto, evidence.body.name);

    const summary = (await op('GET', '/api/operator/summary')).body;
    assert.equal(summary.pendingSettlement, 43800);
    assert.equal(summary.earnings, 3000);
    assert.equal((await op('POST', '/api/settlements')).body.amount, 43800);

    const dash = (await center('GET', '/api/center/dashboard')).body;
    assert.equal(dash.platform, 500000 - 42300);
    assert.equal(dash.commissions, 1500);
    assert.equal(dash.till, 50000 + 43800);
    assert.equal(dash.transactions, 1);
  });

  test('pago en el Centro (sin señal) y pago pendiente que el Centro confirma', async () => {
    const order = await orderFromChat('pagar el gas', '5566', 30000);
    await op('POST', `/api/orders/${order.id}/accept`, {});
    await op('POST', `/api/orders/${order.id}/arrive`, {});
    await op('POST', `/api/orders/${order.id}/collect`, { cashReceived: 34500, customerCode: order.deliveryCode, receiptVerified: true });
    assert.equal((await center('POST', `/api/orders/${order.id}/pay`, { simulate: 'pending' })).body.status, 'PENDING_PROVIDER');
    const resolved = await center('POST', `/api/orders/${order.id}/resolve`, { result: 'approved' });
    assert.equal(resolved.body.status, 'PAID');
    assert.equal(resolved.body.paidVia, 'center');
    assert.equal((await center('GET', '/api/center/dashboard')).body.paperSheets, 119);
  });

  test('recarga de monedero: avisa a la clienta', async () => {
    messaging.drain(ROSA);
    const res = await center('POST', '/api/wallet/topups', { phone: '3128889900', amount: 20000, identityVerified: true });
    assert.equal(res.status, 201);
    assert.match(messaging.drain(ROSA)[0].body, /recargada con \$20\.000/);
    assert.equal((await rosa('GET', '/api/me')).body.balances.wallet, 70000);
  });
});

test('sirve el prototipo pero no los archivos del backend', async () => {
  assert.match((await call('GET', '/')).body, /ChochoPagos/);
  assert.equal((await call('GET', '/assets/css/style.css')).status, 200);
  assert.equal((await call('GET', '/backend/.env.example')).status, 404);
  assert.equal((await call('GET', '/assets/../backend/package.json')).status, 404);
});
