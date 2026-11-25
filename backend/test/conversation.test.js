import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestContainer, textMsg, replyMsg, imageMsg, audioMsg, bodies, buttonIds, chat, waterOrderMessages, ROSA, JAIRO } from './helpers.js';
import { createConsoleGateway } from '../src/infrastructure/messaging/consoleGateway.js';
import { OrderStatus } from '../src/domain/order.js';

let current;
afterEach(async () => current?.c.close());
const setup = (overrides) => (current = buildTestContainer(overrides));

describe('Registro por Telegram (mismos datos que "Crea tu cuenta")', () => {
  test('nombre → cédula → sector → indicaciones → autorización → PIN', async () => {
    const { c } = setup();
    const p = '573001112233';
    const say = (m) => c.conversation.handle(m);

    assert.match(bodies(await say(textMsg(p, 'hola'))), /nombre completo/);
    assert.match(bodies(await say(textMsg(p, 'Pedro Pérez'))), /cédula/);
    assert.match(bodies(await say(textMsg(p, '1.036.123'))), /vereda o sector/);
    assert.match(bodies(await say(replyMsg(p, 'sector:0'))), /indicaciones/);
    assert.match(bodies(await say(textMsg(p, 'Casa roja junto al puente'))), /autorizas/);
    assert.match(bodies(await say(replyMsg(p, 'consent:yes'))), /PIN de 4 dígitos/);
    assert.match(bodies(await say(textMsg(p, '4321'))), /Confirma tu PIN/);
    assert.match(bodies(await say(textMsg(p, '4321'))), /Bienvenido\/a, Pedro/);

    assert.equal(c.userService.find(p).document, '1036123');
    assert.ok(c.userService.checkPin(p, '4321'));
    // El PIN en claro nunca queda guardado en la sesión.
    assert.doesNotMatch(JSON.stringify(c.repos.sessions.find(p)), /4321/);
  });

  test('sin autorización de datos no se crea la cuenta', async () => {
    const { c } = setup();
    const p = '573001112244';
    await chat(c, textMsg(p, 'hola'), textMsg(p, 'Ana María Ruiz'), textMsg(p, '43123456'), replyMsg(p, 'sector:1'), textMsg(p, 'Vereda arriba, casa 3'));
    assert.match(bodies(await c.conversation.handle(replyMsg(p, 'consent:no'))), /Sin tu autorización/);
    assert.equal(c.userService.find(p), null);
  });
});

describe('Flujo del asistente del prototipo', () => {
  test('saludo con el texto del prototipo', async () => {
    const { c } = setup();
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'hola'))), /mándame una foto de tu recibo: yo lo leo y se lo envío a Carlos/);
  });

  test('pagar la luz: empresa → escribir datos → confirmar → "Que Carlos venga"', async () => {
    const { c } = setup();
    const say = (m) => c.conversation.handle(m);

    assert.match(bodies(await say(textMsg(ROSA, 'quiero pagar la luz de 85 mil'))), /Primero selecciona la empresa/);
    const afterProvider = await say(replyMsg(ROSA, 'prov:0'));
    assert.match(bodies(afterProvider), /Seleccionaste EPM/);
    assert.deepEqual(buttonIds(afterProvider), ['mode:photo', 'mode:form', 'mode:voice']);
    assert.match(bodies(await say(replyMsg(ROSA, 'mode:form'))), /N\.º de contrato/);

    const summary = await say(textMsg(ROSA, '4471290'));
    assert.match(bodies(summary), /Efectivo a entregar: \$89\.500/);
    assert.ok(buttonIds(summary).includes('confirm:yes'));

    assert.match(bodies(await say(replyMsg(ROSA, 'confirm:yes'))), /Tu pedido número 1 quedó registrado. Alista \$89\.500/);
    const [order] = c.orderService.listForCustomer(ROSA);
    assert.equal(order.reference, '4471290');
    assert.equal(order.amount, 85000);
  });

  test('un contrato largo en la frase no se toma como valor', async () => {
    const { c } = setup();
    await chat(c, textMsg(ROSA, 'pagar la luz contrato 4471290'), replyMsg(ROSA, 'prov:0'));
    const replies = await c.conversation.handle(replyMsg(ROSA, 'mode:form'));
    assert.match(bodies(replies), /contrato/);
    const second = await c.conversation.handle(textMsg(ROSA, '4471290'));
    assert.match(bodies(second), /Valor a pagar/);
  });

  test('recarga: usa el celular de la cuenta y el valor dicho en la frase', async () => {
    const { c } = setup();
    await c.conversation.handle(textMsg(ROSA, 'recargar 20 mil a mi celular'));
    const replies = await c.conversation.handle(replyMsg(ROSA, 'prov:1'));
    assert.match(bodies(replies), /Recarga de \$20\.000 para Tigo/);
    await c.conversation.handle(replyMsg(ROSA, 'confirm:yes'));
    assert.equal(c.orderService.listForCustomer(ROSA)[0].fields.phone, '3128889900');
  });

  test('paquete de datos: el valor sale del paquete elegido', async () => {
    const { c } = setup();
    await chat(c, textMsg(ROSA, 'paquete de datos'), replyMsg(ROSA, 'prov:0'), replyMsg(ROSA, 'pkg:1'), replyMsg(ROSA, 'confirm:yes'));
    const [order] = c.orderService.listForCustomer(ROSA);
    assert.equal(order.amount, 22000);
    assert.equal(order.fields.package, 'Paquete 5 GB · 15 días');
  });

  test('dictar datos usa las frases "Dime…" / "Ahora dime…"', async () => {
    const { c } = setup();
    await chat(c, textMsg(ROSA, 'pagar el agua'), replyMsg(ROSA, 'prov:0'));
    assert.match(bodies(await c.conversation.handle(replyMsg(ROSA, 'mode:voice'))), /Continúa por voz. Dime \*N\.º de matrícula/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, '889900'))), /Ahora dime \*Valor a pagar/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'cuarenta y dos mil trescientos'))), /\$42\.300/);
  });

  test('pagar con el saldo y PIN, sin domicilio ("O hazlo tú desde casa")', async () => {
    const { c } = setup();
    const summary = await chat(c, ...waterOrderMessages(ROSA));
    assert.ok(buttonIds(summary).includes('confirm:wallet'), 'Rosa tiene $50.000 de saldo');
    assert.match(bodies(await c.conversation.handle(replyMsg(ROSA, 'confirm:wallet'))), /PIN/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, '9999'))), /PIN incorrecto/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, '1234'))), /Pagaste tu trámite desde tu saldo/);

    const [order] = c.orderService.listForCustomer(ROSA);
    assert.equal(order.status, OrderStatus.DELIVERED);
    assert.equal(order.deliveryFee, 0);
    assert.equal(c.financeService.customerBalances(ROSA).wallet, 50000 - 42300 - 1500);
  });

  test('sin saldo suficiente no ofrece pagar con saldo', async () => {
    const { c } = setup();
    const summary = await chat(c, ...waterOrderMessages(JAIRO));
    assert.ok(!buttonIds(summary).includes('confirm:wallet'));
    assert.match(bodies(summary), /Te faltan/);
  });

  test('"cancelar" reinicia; "volver" regresa a elegir empresa; "repetir" repite', async () => {
    const { c } = setup();
    await chat(c, textMsg(ROSA, 'pagar el gas'), replyMsg(ROSA, 'prov:0'));
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'volver'))), /Volviste al paso anterior/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'repetir'))), /Volviste al paso anterior/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'cancelar'))), /empecemos de nuevo/);
    assert.equal(c.conversation.currentStep(ROSA), 'idle');
  });

  test('preguntas frecuentes y estado del pedido', async () => {
    const { c } = setup();
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, '¿cuánto cuesta el domicilio?'))), /El domicilio cuesta \$3\.000/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'como va mi pedido'))), /Todavía no tienes pedidos/);
    await chat(c, ...waterOrderMessages(ROSA), replyMsg(ROSA, 'confirm:yes'));
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'como va mi pedido'))), /Tu pedido número 1 está: Solicitado/);
  });

  test('el cliente cancela su pedido; otro cliente no puede', async () => {
    const { c } = setup();
    await chat(c, ...waterOrderMessages(ROSA), replyMsg(ROSA, 'confirm:yes'));
    assert.match(bodies(await c.conversation.handle(textMsg(JAIRO, 'cancelar pedido 1'))), /no es tuyo/);
    assert.match(bodies(await c.conversation.handle(replyMsg(ROSA, 'order:cancel:1'))), /Pedido #1 cancelado/);
    assert.equal(c.orderService.get(1).status, OrderStatus.CANCELLED);
  });

  test('foto del recibo sin elegir trámite: lee, confirma y guarda la foto', async () => {
    const { c } = setup({
      mediaDownloader: { download: async () => ({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg' }) },
      receiptReader: { read: async () => 'CHEC energía\nContrato 4471290\nTotal a pagar $ 87.400' },
    });
    const progress = [];
    const replies = await c.conversation.handle(imageMsg(ROSA), { sendNow: async (m) => progress.push(m) });
    assert.match(bodies(progress), /Estoy leyendo el recibo/);
    assert.match(bodies(replies), /Leí un recibo de CHEC \(Energía\) por \$87\.400, referencia terminada en 1290/);
    assert.match(bodies(replies), /Esto leí del recibo/);

    await c.conversation.handle(replyMsg(ROSA, 'confirm:yes'));
    const [order] = c.orderService.listForCustomer(ROSA);
    assert.equal(order.provider, 'CHEC');
    assert.ok(order.receiptPath);
  });

  test('foto sin valor legible: pide el valor', async () => {
    const { c } = setup({
      mediaDownloader: { download: async () => ({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' }) },
      receiptReader: { read: async () => 'Aguas de Marinilla\nMatrícula 889900' },
    });
    assert.match(bodies(await c.conversation.handle(imageMsg(ROSA))), /no pude leer bien el valor/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'cuarenta mil'))), /Valor del recibo: \$40\.000/);
  });

  test('si la foto falla, ofrece escribir o dictar', async () => {
    const { c } = setup({ mediaDownloader: { download: async () => { throw new Error('red caída'); } } });
    await chat(c, textMsg(ROSA, 'pagar el agua'), replyMsg(ROSA, 'prov:0'), replyMsg(ROSA, 'mode:photo'));
    const replies = await c.conversation.handle(imageMsg(ROSA));
    assert.match(bodies(replies), /No pude leer bien el recibo/);
    assert.ok(buttonIds(replies).includes('mode:form'));
  });
});

describe('Historial compartido y avisos', () => {
  test('lo hablado por Telegram y la app queda en un mismo historial', async () => {
    const { c } = setup();
    await c.chat.converse(textMsg(ROSA, 'hola'), 'telegram');
    await c.chat.converse(textMsg(ROSA, 'cuanto cuesta'), 'web');
    const history = c.chat.history(ROSA);
    assert.deepEqual(history.map((m) => [m.direction, m.channel]), [['in', 'telegram'], ['out', 'telegram'], ['in', 'web'], ['out', 'web']]);
  });

  test('el PIN nunca queda en el historial (app ni Telegram)', async () => {
    const { c } = setup();
    for (const channel of ['web', 'telegram']) {
      await c.financeService.topUpWallet({ customerPhone: ROSA, amount: 50000, channel: 'center', actorId: 'CC-01', identityVerified: true });
      for (const m of [...waterOrderMessages(ROSA), replyMsg(ROSA, 'confirm:wallet')]) await c.chat.converse(m, channel);
      const asked = c.chat.history(ROSA).at(-1).message.body;
      assert.equal(/borraré tu mensaje/.test(asked), channel === 'telegram', 'solo en Telegram se avisa que se borra');
      await c.chat.converse(textMsg(ROSA, '1234'), channel);
    }
    const stored = JSON.stringify(c.chat.history(ROSA, { limit: 500 }));
    assert.doesNotMatch(stored, /"1234"/);
    assert.match(stored, /••••/);
    assert.equal(c.orderService.listForCustomer(ROSA).filter((o) => o.paidVia === 'wallet').length, 2);
  });

  test('lo que pasa en la app también llega a Telegram, en orden y sin el PIN', async () => {
    const { c, messaging } = setup();
    const replies = await c.chat.converse(textMsg(ROSA, 'pagar el agua'), 'web');
    await new Promise((r) => setImmediate(r));
    const sent = messaging.drain(ROSA);
    assert.equal(sent[0].body, '🖥️ _Desde la app:_ pagar el agua');
    assert.deepEqual(sent.slice(1), replies, 'las respuestas de la app se reflejan en Telegram');

    await c.financeService.topUpWallet({ customerPhone: ROSA, amount: 50000, channel: 'center', actorId: 'CC-01', identityVerified: true });
    await c.chat.converse(textMsg(ROSA, 'cancelar'), 'web');
    for (const m of [...waterOrderMessages(ROSA), replyMsg(ROSA, 'confirm:wallet'), textMsg(ROSA, '1234')]) await c.chat.converse(m, 'web');
    await new Promise((r) => setImmediate(r));
    assert.doesNotMatch(JSON.stringify(messaging.drain(ROSA)), /1234/);
  });

  test('nota de voz: se transcribe, se responde también con voz y queda como texto en la app', async () => {
    const heard = [];
    const sentOptions = [];
    const messaging = createConsoleGateway();
    const send = messaging.send;
    messaging.send = async (to, m, options) => { sentOptions.push(options); return send(to, m); };
    const { c } = setup({
      messaging,
      mediaDownloader: { download: async (id) => ({ buffer: Buffer.from(id), mimeType: 'audio/ogg' }) },
      transcriber: { transcribe: async (buffer) => { heard.push(String(buffer)); return 'quiero pagar el agua'; } },
    });
    const replies = await c.chat.converse(audioMsg(ROSA), 'telegram');
    assert.deepEqual(heard, ['voice-1']);
    assert.match(bodies(replies), /Primero selecciona la empresa/);
    assert.equal(c.chat.history(ROSA)[0].message.body, '🎤 quiero pagar el agua');
    assert.ok(sentOptions.length && sentOptions.every((o) => o?.voice === true));

    await c.chat.converse(textMsg(ROSA, 'cancelar'), 'telegram');
    assert.ok(sentOptions.at(-1)?.voice === false, 'a un texto se le responde solo con texto');
  });

  test('si no se entiende la nota de voz, lo dice y pide repetir o escribir', async () => {
    const { c } = setup({ transcriber: { transcribe: async () => '' }, mediaDownloader: { download: async () => ({ buffer: Buffer.from('x') }) } });
    const replies = await c.chat.converse(audioMsg(ROSA), 'telegram');
    assert.match(bodies(replies), /No logré entender tu nota de voz/);
  });

  test('"Hola, quiero pagar el agua" va directo al trámite; "hola" solo muestra el inicio', async () => {
    const { c } = setup();
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'Hola, quiero pagar el recibo del agua.'))), /Primero selecciona la empresa/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'hola'))), /Hola, Rosa/);
    assert.match(bodies(await c.conversation.handle(textMsg(ROSA, 'buenas tardes, cómo están'))), /Hola, Rosa/);
  });

  test('al elegir dictar en Telegram, explica cómo mandar la nota de voz', async () => {
    const { c } = setup();
    await c.chat.converse(textMsg(ROSA, 'pagar el agua'), 'telegram');
    await c.chat.converse(replyMsg(ROSA, 'prov:0'), 'telegram');
    const replies = await c.chat.converse(replyMsg(ROSA, 'mode:voice'), 'telegram');
    assert.match(bodies(replies), /nota de voz/);
    assert.match(bodies(replies), /Continúa por voz/);
  });

  test('avisa al cliente cuando el domiciliario avanza el pedido, con los textos del prototipo', async () => {
    const { c, messaging } = setup();
    await chat(c, ...waterOrderMessages(ROSA), replyMsg(ROSA, 'confirm:yes'));
    await c.orderService.accept(1, 'OP-01');
    await c.orderService.markArrived(1);
    const sent = bodies(messaging.drain(ROSA));
    assert.match(sent, /Tu pedido #1: Carlos va en camino a tu casa 🏍️/);
    assert.match(sent, /Carlos llegó a tu casa/);
    assert.match(bodies(c.chat.history(ROSA).map((m) => m.message)), /va en camino/, 'el aviso también queda en el historial');
  });

  test('ignora mensajes duplicados', async () => {
    const { c, messaging } = setup();
    const m = textMsg(ROSA, 'hola');
    await c.inbound.process([m]);
    await c.inbound.process([m]);
    assert.equal(messaging.drain(ROSA).length, 1);
  });
});
