import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainer } from '../src/container.js';
import { markupToHtml, toTelegramPayload } from '../src/infrastructure/telegram/format.js';
import { parseUpdate, commandToText } from '../src/infrastructure/telegram/updates.js';
import { createTelegramPoller } from '../src/infrastructure/telegram/poller.js';
import { testConfig, ROSA } from './helpers.js';

/** Bot API falsa: guarda cada llamada y responde como Telegram. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    sent: (chatId) => calls.filter((c) => c.method === 'sendMessage' && c.params.chat_id === String(chatId)).map((c) => c.params),
    of: (method) => calls.filter((c) => c.method === method).map((c) => c.params),
    async call(method, params = {}) {
      calls.push({ method, params });
      if (method === 'sendMessage') return { message_id: calls.length };
      if (method === 'getFile') return { file_path: 'photos/file_1.jpg', file_size: 3 };
      return true;
    },
    async upload(method, params, file) {
      calls.push({ method, params: { ...params, file: file.filename } });
      return { message_id: calls.length };
    },
    async downloadFile() {
      return Buffer.from([0xff, 0xd8, 0xff]);
    },
  };
}

let uid = 0;
const message = (chatId, fields) => ({ update_id: ++uid, message: { message_id: uid, chat: { id: chatId, type: 'private' }, from: { id: chatId }, ...fields } });
const say = (chatId, text) => message(chatId, { text });
const shareContact = (chatId, phone, userId = chatId) => message(chatId, { contact: { phone_number: phone, user_id: userId } });
const press = (chatId, data, label = data) => ({
  update_id: ++uid,
  callback_query: { id: `cb${uid}`, from: { id: chatId }, data, message: { message_id: 900, chat: { id: chatId, type: 'private' }, reply_markup: { inline_keyboard: [[{ text: label, callback_data: data }]] } } },
});

let c;
afterEach(async () => {
  await c?.close();
  c = null;
});
function setup(overrides = {}) {
  const api = fakeApi();
  c = buildContainer(testConfig(), { telegramApi: api, ...overrides });
  const send = async (...updates) => { for (const u of updates) await c.telegram.updates.handle(u); };
  return { api, send };
}

describe('Formato de mensajes para Telegram', () => {
  test('pasa *negrita* y _cursiva_ a HTML sin dejar inyectar etiquetas', () => {
    assert.equal(markupToHtml('Hola *Rosa* <script> & _ya_'), 'Hola <b>Rosa</b> &lt;script&gt; &amp; <i>ya</i>');
  });

  test('botones y listas se vuelven botones en línea', () => {
    const b = toTelegramPayload({ type: 'buttons', body: '¿Confirmas?', buttons: [{ id: 'confirm:yes', title: 'Sí' }, { id: 'confirm:edit', title: 'Editar' }] });
    assert.deepEqual(b.reply_markup.inline_keyboard, [[{ text: 'Sí', callback_data: 'confirm:yes' }], [{ text: 'Editar', callback_data: 'confirm:edit' }]]);
    const l = toTelegramPayload({ type: 'list', body: 'Elige', button: 'Ver', sections: [{ title: 'A', rows: [{ id: 'prov:0', title: 'EPM', description: 'Agua' }] }, { title: 'B', rows: [{ id: 'prov:1', title: 'Otro' }] }] });
    assert.deepEqual(l.reply_markup.inline_keyboard.map((r) => r[0].text), ['EPM · Agua', 'Otro']);
  });

  test('entiende comandos', () => {
    assert.equal(commandToText('/start'), 'hola');
    assert.equal(commandToText('/menu@ChochoBot'), 'menu');
    assert.equal(commandToText('pagar la luz'), 'pagar la luz');
  });

  test('toma la foto más grande e ignora grupos', () => {
    const u = parseUpdate(message(1, { photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: 'recibo' }));
    assert.deepEqual(u.content, { type: 'image', text: 'recibo', media: { id: 'big', mimeType: 'image/jpeg' } });
    assert.equal(parseUpdate({ update_id: 1, message: { message_id: 1, chat: { id: -5, type: 'group' }, text: 'hola' } }), null);
  });
});

describe('Bot de Telegram', () => {
  test('pide el celular, lo vincula y arranca el registro', async () => {
    const { api, send } = setup();
    await send(say(111, '/start'));
    const [ask] = api.sent(111);
    assert.match(ask.text, /Compartir mi número/);
    assert.equal(ask.reply_markup.keyboard[0][0].request_contact, true);

    await send(shareContact(111, '+57 300 999 8877', 222));
    assert.match(api.sent(111).at(-1).text, /Ese no es tu número/, 'no acepta el contacto de otra persona');
    assert.equal(c.repos.telegramLinks.phoneFor('111'), null);

    await send(shareContact(111, '+573009998877'));
    assert.equal(c.repos.telegramLinks.phoneFor('111'), '573009998877');
    const texts = api.sent(111).map((m) => m.text);
    assert.ok(texts.includes('✅ Listo, ya te reconozco.'));
    assert.match(texts.at(-1), /nombre completo/);
  });

  test('rechaza celulares que no son de Colombia', async () => {
    const { api, send } = setup();
    await send(shareContact(333, '+14155550000'));
    assert.match(api.sent(333).at(-1).text, /celulares de Colombia/);
    assert.equal(c.repos.telegramLinks.phoneFor('333'), null);
  });

  test('los botones funcionan y el historial se comparte con la app', async () => {
    const { api, send } = setup();
    c.repos.telegramLinks.link('444', ROSA, new Date());
    await send(say(444, 'pagar el agua'));
    const list = api.sent(444).at(-1);
    assert.ok(list.reply_markup.inline_keyboard.some((r) => r[0].callback_data === 'prov:0'));

    await send(press(444, 'prov:0', 'EPM'));
    assert.equal(api.of('answerCallbackQuery').length, 1);
    assert.equal(api.of('editMessageReplyMarkup')[0].message_id, 900, 'quita los botones ya usados');
    assert.equal(c.chat.step(ROSA), 'choose', 'avanzó tras elegir la empresa');
    const history = c.chat.history(ROSA);
    assert.deepEqual(history.at(-2), { ...history.at(-2), direction: 'in', channel: 'telegram' });
  });

  test('borra del chat el mensaje con el PIN', async () => {
    const { api, send } = setup();
    c.repos.telegramLinks.link('555', ROSA, new Date());
    await c.financeService.topUpWallet({ customerPhone: ROSA, amount: 50000, channel: 'center', actorId: 'CC-01', identityVerified: true });
    await send(say(555, 'pagar el agua'), press(555, 'prov:0'), press(555, 'mode:form'), say(555, '889900'), say(555, '42300'), press(555, 'confirm:wallet'));
    assert.match(api.sent(555).at(-1).text, /borraré tu mensaje/);

    const pin = say(555, '1234');
    await send(pin);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(api.of('deleteMessage'), [{ chat_id: '555', message_id: pin.message.message_id }]);
    assert.ok(api.sent(555).some((m) => /Pagaste tu trámite/.test(m.text)));
  });

  test('los avisos del pedido llegan al chat vinculado', async () => {
    const { api, send } = setup();
    c.repos.telegramLinks.link('666', ROSA, new Date());
    await send(say(666, 'pagar el agua'), press(666, 'prov:0'), press(666, 'mode:form'), say(666, '889900'), say(666, '42300'), press(666, 'confirm:yes'));
    await c.orderService.accept(1, 'OP-01');
    assert.match(api.sent(666).at(-1).text, /Carlos va en camino/);
  });

  test('si la conexión se cuelga, reconecta enseguida y no pierde el clic', async () => {
    const seen = [];
    let polls = 0;
    const api = {
      async call(method, _params, { signal } = {}) {
        if (method !== 'getUpdates') return { username: 'ChochoBot' };
        polls++;
        if (polls === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
        if (polls === 2) return [{ update_id: 10, callback_query: { data: 'sector:0' } }];
        return new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('abort'))));
      },
    };
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const poller = createTelegramPoller({ api, logger, onUpdate: async (u) => { seen.push(u.update_id); } });
    const started = Date.now();
    await poller.start();
    while (!seen.length && Date.now() - started < 2000) await new Promise((r) => setTimeout(r, 10));
    await poller.stop();
    assert.deepEqual(seen, [10]);
    assert.ok(Date.now() - started < 1000, 'reintenta sin pausa tras una conexión colgada');
  });

  test('solo quedan activos los botones del paso actual, aunque se avance desde la app', async () => {
    const { api, send } = setup();
    c.repos.telegramLinks.link('777', ROSA, new Date());
    await send(say(777, 'pagar el agua'));
    const listId = api.calls.findIndex((x) => x.method === 'sendMessage' && x.params.reply_markup?.inline_keyboard?.length);
    const listMessageId = listId + 1; // el fake devuelve message_id = posición de la llamada
    // La persona sigue en la app: Telegram recibe el eco y el paso nuevo, y se cierran los botones viejos.
    await c.chat.converse({ messageId: 'w1', from: ROSA, type: 'reply', replyId: 'prov:0', text: 'EPM' }, 'web');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(api.of('editMessageReplyMarkup').some((p) => p.message_id === listMessageId));
    assert.ok(api.sent(777).some((m) => /Desde la app/.test(m.text)));
    assert.ok(api.sent(777).at(-1).reply_markup.inline_keyboard.some((r) => r[0].callback_data === 'mode:voice'));
  });

  test('a una nota de voz le responde con texto y con nota de voz', async () => {
    const spoken = [];
    const { api, send } = setup({
      transcriber: { transcribe: async () => 'quiero pagar el agua' },
      synthesizer: { synthesize: async (t) => { spoken.push(t); return Buffer.from('ogg'); } },
    });
    c.repos.telegramLinks.link('888', ROSA, new Date());
    await send(message(888, { voice: { file_id: 'v1', mime_type: 'audio/ogg' } }));
    assert.ok(api.of('sendChatAction').length >= 1, 'muestra "escribiendo…" mientras transcribe');
    assert.match(api.sent(888).at(-1).text, /Primero selecciona la empresa/);
    assert.equal(api.of('sendVoice').length, spoken.length);
    assert.match(spoken.at(-1), /Opciones: /);
    assert.doesNotMatch(spoken.join(' '), /[*_]/, 'la voz no lee el formato');
  });

  test('prepara el texto para leerlo en voz alta', async () => {
    const { speechTextFor } = await import('../src/infrastructure/speech/speechText.js');
    assert.equal(
      speechTextFor({ type: 'buttons', body: 'Tu pedido #12 cuesta *$45.300* 🏍️', buttons: [{ id: 'a', title: '✅ Sí' }, { id: 'b', title: 'Editar' }] }),
      'Tu pedido número 12 cuesta 45300 pesos. Opciones: Sí, Editar.',
    );
  });

  test('si alguien no tiene Telegram, los avisos no fallan', async () => {
    setup();
    await c.chat.notify(ROSA, { type: 'text', body: 'hola' });
    assert.equal(c.chat.history(ROSA).at(-1).message.body, 'hola');
  });
});
