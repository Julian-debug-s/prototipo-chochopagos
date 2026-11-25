/**
 * Catálogo de trámites. Fuente única de verdad para comisiones, campos requeridos
 * y proveedores. Migrado de las tablas SV / vFields / PROV / PACKS del prototipo.
 *
 * Es configuración del dominio: datos inmutables, sin dependencias de infraestructura.
 */

export const CATEGORIES = Object.freeze([
  { id: 'utilities', name: 'Servicios públicos', icon: '💡' },
  { id: 'mobile', name: 'Recargas', icon: '📱' },
  { id: 'banking', name: 'Pagos y bancos', icon: '🏦' },
  { id: 'paperwork', name: 'Trámites', icon: '📄' },
  { id: 'remittance', name: 'Giros', icon: '💸' },
  { id: 'wallet', name: 'Monedero', icon: '👛' },
]);

/** @typedef {'text'|'amount'|'phone'|'document'|'date'} FieldType */
/** @typedef {{ key: string, label: string, type: FieldType, optional?: boolean }} FieldSpec */

const f = (key, label, type = 'text', optional = false) => Object.freeze({ key, label, type, optional });

const MOBILE_OPERATORS = ['Claro', 'Tigo', 'Movistar'];

/**
 * @typedef {object} ServiceSpec
 * @property {string} code
 * @property {string} category
 * @property {string} name
 * @property {string} icon
 * @property {number} fee            Comisión del servicio en pesos.
 * @property {number|null} fixedAmount  Valor fijo del trámite; null si lo define el cliente.
 * @property {string} referenceLabel
 * @property {string[]} providers
 * @property {boolean} usesPackages  El valor sale de un paquete del operador.
 * @property {FieldSpec[]} fields    Datos que se le piden al cliente, en orden.
 * @property {string} referenceField Campo que se usa como referencia visible del pedido.
 * @property {string} phrase
 * @property {string[]} requirements
 * @property {boolean} selfPayable
 */

/**
 * Datos del asistente del prototipo (PH, REQ y SELF):
 *  phrase: cómo se nombra el trámite en una frase ("quieres pagar la energía")
 *  requirements: qué debe tener a la mano el cliente
 *  selfPayable: se puede pagar con el saldo del monedero, sin domicilio
 */
const ASSISTANT = {
  energy: ['pagar la energía', ['Recibo de energía vigente', 'N.º de contrato'], true],
  water: ['pagar el acueducto', ['Recibo de acueducto vigente', 'Matrícula'], true],
  gas: ['pagar el gas', ['Factura de gas', 'N.º de cuenta'], true],
  internet_tv: ['pagar internet o televisión', ['Factura de internet o TV', 'N.º de cuenta'], true],
  mobile_topup: ['recargar tu celular', ['N.º de celular', 'Operador (Claro, Movistar, Tigo…)'], true],
  data_package: ['comprar un paquete de datos', ['N.º de celular', 'Paquete que quieres'], true],
  bank_deposit: ['hacer una consignación', ['Banco y N.º de cuenta', 'Nombre del titular', 'Cédula de quien consigna'], true],
  card_payment: ['pagar tu tarjeta o crédito', ['Recibo o extracto de la tarjeta', 'N.º de obligación'], true],
  coop_fee: ['pagar la cuota de la cooperativa', ['Recibo de la cuota', 'N.º de asociado'], true],
  soat: ['pagar el SOAT', ['Placa del vehículo', 'Cédula del propietario', 'Tarjeta de propiedad'], true],
  property_tax: ['pagar el impuesto', ['Recibo del impuesto o matrícula', 'Cédula del propietario'], true],
  civil_registry: ['sacar una copia de registro civil', ['Nombre y fecha de nacimiento', 'Cédula del solicitante'], false],
  eps_authorization: ['gestionar la autorización de la EPS', ['Cédula', 'Orden médica o autorización'], false],
  remittance: ['enviar un giro', ['Nombre y cédula de quien recibe', 'Celular de quien recibe'], true],
  wallet_topup: ['recargar tu monedero', ['Efectivo del valor a cargar'], false],
};

/** @type {ServiceSpec[]} */
const SERVICES = [
  svc('energy', 'utilities', 'Energía', '💡', 1500, null, 'N.º de contrato o factura', ['EPM', 'CHEC'], [f('reference', 'N.º de contrato o factura'), f('amount', 'Valor a pagar', 'amount')]),
  svc('water', 'utilities', 'Acueducto', '🚰', 1500, null, 'N.º de matrícula o factura', ['Aguas de Marinilla'], [f('reference', 'N.º de matrícula o factura'), f('amount', 'Valor a pagar', 'amount')]),
  svc('gas', 'utilities', 'Gas domiciliario', '🔥', 1500, null, 'N.º de cuenta', ['EPM'], [f('reference', 'N.º de cuenta'), f('amount', 'Valor a pagar', 'amount')]),
  svc('internet_tv', 'utilities', 'Internet / TV', '📡', 1500, null, 'N.º de cuenta', MOBILE_OPERATORS, [f('reference', 'N.º de cuenta'), f('amount', 'Valor a pagar', 'amount')]),
  svc('mobile_topup', 'mobile', 'Recarga a celular', '📱', 500, null, 'N.º de celular', MOBILE_OPERATORS, [f('phone', 'Número de celular', 'phone'), f('amount', 'Valor de la recarga', 'amount')], { referenceField: 'phone' }),
  svc('data_package', 'mobile', 'Paquete de datos', '📶', 500, null, 'N.º de celular', MOBILE_OPERATORS, [f('phone', 'Número de celular', 'phone')], { referenceField: 'phone', usesPackages: true }),
  svc('bank_deposit', 'banking', 'Consignación bancaria', '🏦', 2500, null, 'Banco y N.º de cuenta', [], [
    f('bank', 'Banco'), f('accountType', 'Tipo de cuenta (ahorros o corriente)'), f('account', 'Número de cuenta'),
    f('holder', 'Nombre del titular'), f('amount', 'Valor a consignar', 'amount'), f('concept', 'Concepto', 'text', true),
  ], { referenceField: 'account' }),
  svc('card_payment', 'banking', 'Pago de tarjeta o crédito', '💳', 2000, null, 'N.º de obligación', [], [f('entity', 'Entidad o banco'), f('obligation', 'Número de obligación'), f('amount', 'Valor a pagar', 'amount')], { referenceField: 'obligation' }),
  svc('coop_fee', 'banking', 'Cuota de cooperativa', '🤝', 1500, null, 'N.º de asociado', [], [f('associate', 'Número de asociado'), f('amount', 'Valor de la cuota', 'amount')], { referenceField: 'associate' }),
  svc('soat', 'paperwork', 'SOAT', '🛵', 5000, null, 'Placa del vehículo', [], [f('plate', 'Placa del vehículo'), f('ownerDocument', 'Documento del propietario', 'document'), f('amount', 'Valor del SOAT', 'amount')], { referenceField: 'plate' }),
  svc('property_tax', 'paperwork', 'Impuesto predial / vehicular', '🏠', 5000, null, 'Matrícula o placa', [], [f('plate', 'Matrícula o placa'), f('ownerDocument', 'Documento del propietario', 'document'), f('amount', 'Valor del impuesto', 'amount')], { referenceField: 'plate' }),
  svc('civil_registry', 'paperwork', 'Copia de registro civil', '📄', 6000, 10000, 'Nombre de la persona', [], [f('personName', 'Nombre de la persona'), f('birthDate', 'Fecha de nacimiento (DD/MM/AAAA)', 'date'), f('document', 'Documento del solicitante', 'document')], { referenceField: 'personName' }),
  svc('eps_authorization', 'paperwork', 'Autorización o reclamo EPS', '💊', 8000, 0, 'EPS y N.º de documento', [], [f('document', 'Documento del paciente', 'document'), f('authorization', 'Número de autorización u orden')], { referenceField: 'document' }),
  svc('remittance', 'remittance', 'Envío de giro', '💸', 3000, null, 'Nombre y celular de quien recibe', [], [
    f('recipient', 'Nombre de quien recibe'), f('document', 'Documento de quien recibe', 'document'), f('phone', 'Celular de quien recibe', 'phone'),
    f('city', 'Municipio de destino'), f('amount', 'Valor del giro', 'amount'), f('concept', 'Mensaje', 'text', true),
  ], { referenceField: 'recipient' }),
  svc('wallet_topup', 'wallet', 'Recarga de monedero', '👛', 0, null, 'Valor a cargar', [], [f('amount', 'Valor a cargar', 'amount')], { referenceField: null }),
];

function svc(code, category, name, icon, fee, fixedAmount, referenceLabel, providers, fields, extra = {}) {
  const [phrase, requirements, selfPayable] = ASSISTANT[code];
  return Object.freeze({
    code, category, name, icon, fee, fixedAmount, referenceLabel,
    providers: Object.freeze(providers),
    fields: Object.freeze(fields),
    usesPackages: extra.usesPackages ?? false,
    referenceField: extra.referenceField === undefined ? 'reference' : extra.referenceField,
    phrase,
    requirements: Object.freeze(requirements),
    selfPayable,
  });
}

export const DATA_PACKAGES = Object.freeze({
  Claro: [{ label: 'Paquete 2 GB · 7 días', amount: 12000 }, { label: 'Paquete 5 GB · 15 días', amount: 22000 }, { label: 'Paquete 10 GB · 30 días', amount: 35000 }],
  Tigo: [{ label: 'Paquete 3 GB · 7 días', amount: 12000 }, { label: 'Paquete 6 GB · 15 días', amount: 22000 }, { label: 'Paquete 12 GB · 30 días', amount: 35000 }],
  Movistar: [{ label: 'Paquete 2 GB · 7 días', amount: 10000 }, { label: 'Paquete 6 GB · 15 días', amount: 20000 }, { label: 'Paquete 15 GB · 30 días', amount: 40000 }],
});

const BY_CODE = new Map(SERVICES.map((s) => [s.code, s]));

export const MIN_AMOUNT = 1000;
export const MAX_AMOUNT = 5_000_000;

export function listServices() {
  return SERVICES;
}

export function servicesInCategory(categoryId) {
  return SERVICES.filter((s) => s.category === categoryId);
}

/** @returns {ServiceSpec|undefined} */
export function findService(code) {
  return BY_CODE.get(code);
}

/** @returns {ServiceSpec} */
export function getService(code) {
  const service = BY_CODE.get(code);
  if (!service) throw new Error(`Servicio desconocido: ${code}`);
  return service;
}

export function packagesFor(provider) {
  return DATA_PACKAGES[provider] ?? [];
}
