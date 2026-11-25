import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectService, parseAmount, parseReceiptText } from '../src/nlp/text.js';
import { parseField } from '../src/application/conversation/fieldParsers.js';

test('detecta el servicio a partir de texto libre', () => {
  assert.equal(detectService('Quiero pagar la luz'), 'energy');
  assert.equal(detectService('factura de Aguas de Marinilla'), 'water');
  assert.equal(detectService('recargar 20 mil al celular'), 'mobile_topup');
  assert.equal(detectService('comprar un paquete de datos'), 'data_package');
  assert.equal(detectService('pagar el impuesto predial'), 'property_tax');
  assert.equal(detectService('enviar plata a mi hija'), 'remittance');
  assert.equal(detectService('buenas noches'), null);
});

test('entiende montos escritos de varias formas', () => {
  assert.equal(parseAmount('85000'), 85000);
  assert.equal(parseAmount('$ 85.000'), 85000);
  assert.equal(parseAmount('85 mil'), 85000);
  assert.equal(parseAmount('ochenta y cinco mil'), 85000);
  assert.equal(parseAmount('un millon'), 1000000);
  assert.equal(parseAmount('2 gb'), null);
});

test('extrae datos del texto OCR de un recibo', () => {
  const r = parseReceiptText('EPM Energía\nContrato: 4471290\nTotal a pagar $ 87.400\nFecha límite 2026-11-20');
  assert.equal(r.serviceCode, 'energy');
  assert.equal(r.reference, '4471290');
  assert.equal(r.amount, 87400);
  assert.equal(r.dueDate, '2026-11-20');
  assert.ok(r.confidence >= 0.75);
});

test('valida campos del formulario conversacional', () => {
  assert.deepEqual(parseField({ type: 'phone' }, '312 888 9900'), { ok: true, value: '3128889900' });
  assert.equal(parseField({ type: 'phone' }, '12345').ok, false);
  assert.deepEqual(parseField({ type: 'date' }, '15/03/1980'), { ok: true, value: '1980-03-15' });
  assert.equal(parseField({ type: 'date' }, '31/02/1980').ok, false);
  assert.deepEqual(parseField({ type: 'text', optional: true }, 'no'), { ok: true, value: '' });
});
