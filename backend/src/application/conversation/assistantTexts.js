/**
 * Textos del asistente, tomados del chat del prototipo (vsay/vHelp/vInfo en app.js).
 * Están separados del flujo para poder ajustar el tono sin tocar la lógica.
 */
import { formatCOP } from '../../domain/money.js';

export const T = {
  idle: (op) => `Toca el botón de la cámara y mándame una foto de tu recibo: yo lo leo y se lo envío a ${op}. También puedes decirme qué trámite necesitas.`,
  restart: 'Listo, empecemos de nuevo.',

  providerFor: (service) =>
    service.code === 'mobile_topup' ? 'Selecciona tu operador móvil para hacer la recarga.'
      : service.code === 'data_package' ? 'Selecciona tu operador móvil para ver los paquetes disponibles.'
        : `Entendí: quieres pagar ${service.name}. Primero selecciona la empresa disponible.`,
  chooseFor: (service) => `Entendí: quieres ${service.phrase}. Puedes adjuntar una foto, escribir los datos o continuar conversando por voz.`,
  providerChosen: (provider) => `Seleccionaste ${provider}. Ahora elige si quieres adjuntar una foto, escribir los datos o dictarlos.`,
  rechargeAsk: (provider) => `Seleccionaste ${provider}. ¿Cuánto valor quieres recargar en tu celular?`,
  packageAsk: (provider) => `Seleccionaste ${provider}. Escoge uno de los paquetes disponibles.`,
  walletAsk: '¿Cuánto quieres cargar a tu monedero? El domiciliario recibe el efectivo y te lo acredita.',

  photoAsk: (service) => `Adjunta una foto clara del recibo. El domiciliario también podrá completar los datos faltantes.\n\nTen a la mano:\n${[...service.requirements, 'Efectivo del total a entregar'].map((r) => `• ${r}`).join('\n')}`,
  formStart: 'Completa los datos solicitados. Los revisaremos antes de enviar el pedido.',
  fieldForm: (pos, total, label, optional) => `(${pos}/${total}) Escribe: *${label}*${optional ? '\n_(Opcional: escribe *no* para omitirlo)_' : ''}`,
  fieldVoiceFirst: (label) => `Continúa por voz. Dime *${label}*.`,
  fieldVoiceNext: (label) => `Ahora dime *${label}*.`,
  voiceNoteHint: '🎤 Mantén presionado el micrófono de Telegram y mándame una nota de voz con cada dato. Yo te respondo también con audio.',
  voiceNoteNotUnderstood: '🎙️ No logré entender tu nota de voz. Inténtalo de nuevo hablando cerca del celular, o escríbemelo.',

  formDone: (total, walletTopUp) => `Datos recibidos. El total ${walletTopUp ? 'a entregar' : 'del pedido'} es ${formatCOP(total)}. Revisa el resumen y confirma.`,
  packageDone: (label, amount, provider) => `Seleccionaste ${label} de ${formatCOP(amount)} para ${provider}. Revisa el total y confirma.`,
  rechargeDone: (amount, provider) => `Recarga de ${formatCOP(amount)} para ${provider}. Revisa el total y confirma.`,
  rechargeRetry: 'No entendí el valor. Di, por ejemplo, veinte mil.',

  reading: 'Recibí tu foto. Estoy leyendo el recibo…',
  readingWait: 'Un momento, estoy leyendo tu recibo.',
  readFailed: 'No pude leer bien el recibo. Puedes escribir los datos, dictarlos por voz o tomar otra foto con más luz.',
  readNoAmount: (company, service) => `Reconocí un recibo de ${company} (${service}), pero no pude leer bien el valor. ¿De cuánto es? Dímelo, por ejemplo: ochenta y cinco mil.`,
  readOk: (company, service, amount, ref, total, confident) =>
    `Leí un recibo de ${company} (${service}) por ${formatCOP(amount)}${ref ? `, referencia terminada en ${ref.slice(-4)}` : ''}. Con comisión y domicilio, el efectivo a entregar es ${formatCOP(total)}. ${confident ? '¿Se lo envío?' : 'No estoy del todo seguro de los datos. ¿Los confirmas?'}`,
  amountAfterPhoto: (amount, total, walletTopUp) => `${walletTopUp ? 'Recargar tu saldo con ' : 'Valor del recibo: '}${formatCOP(amount)}. Con comisión y domicilio, el efectivo a entregar es ${formatCOP(total)}. ¿Confirmas?`,
  amountRetry: 'No entendí el valor. Dime, por ejemplo: cincuenta mil.',
  needPhoto: 'Necesito la foto del recibo. Toca el botón de la cámara.',

  placed: (id, total, op, code) => `Listo. Tu pedido número ${id} quedó registrado. Alista ${formatCOP(total)} en efectivo; ${op} pasará por tu casa. Tu código de entrega es *${code}*.`,
  confirmAsk: '¿Confirmas el pedido? Di “sí” o “no”.',
  confirmNo: (walletTopUp) => (walletTopUp ? 'Sin problema. ¿Qué trámite necesitas?' : 'Sin problema. Tómale otra foto al recibo o dime qué trámite necesitas.'),

  // En Telegram el bot borra el mensaje con el PIN apenas lo lee (ver chatService).
  // En la app no hace falta: se escribe oculto y el historial guarda "••••".
  pinAsk: (amount, channel) => `Escribe tu PIN de 4 dígitos para pagar ${formatCOP(amount)} con tu saldo.${channel === 'telegram' ? '\n_Por seguridad, borraré tu mensaje apenas lo lea._' : ''}`,
  pinWrong: (left) => `PIN incorrecto. Te quedan ${left} intento(s).`,
  pinLocked: 'Demasiados intentos con PIN incorrecto. Volvamos al resumen.',
  selfPaid: 'Listo. Pagaste tu trámite desde tu saldo. El comprobante está en Historial.',

  fixRecharge: (provider) => `Puedes modificar el valor de la recarga para ${provider}.`,
  fixPackage: (provider) => `Puedes cambiar el paquete de ${provider}.`,
  fixForm: (service) => `Puedes modificar los datos de ${service}.`,
  fixPhoto: 'Puedes volver a tomar la foto o escribir los datos del servicio.',
  fixWallet: 'Puedes modificar el valor de la recarga.',

  back: 'Volviste al paso anterior. Di ayuda si necesitas opciones.',
  backAtStart: 'Ya estás en el inicio. Di ver opciones para conocer los servicios disponibles.',
  whichBill: '¿Qué tipo de factura quieres pagar: energía, agua, gas o internet?',
  notUnderstood: 'No te entendí bien. Puedes decir: “pagar la luz”, “recargar 20 mil” o “pagar el SOAT”.',
  providerRetry: (providers) => `Elige una empresa disponible: ${providers.join(', ')}.`,

  noOrders: 'Todavía no tienes pedidos.',
  orderStatus: (id, label, message) => `Tu pedido número ${id} está: ${label}. ${message}`,
  ordersHeader: 'Aquí puedes consultar tus pedidos activos y su estado.',
  historyHeader: 'Aquí puedes consultar tus comprobantes y facturas anteriores.',
  balanceHeader: 'Aquí puedes consultar tu saldo y tus movimientos.',
  profileHeader: 'Aquí puedes consultar tus datos y configuración.',
  cancelled: (id) => `Pedido #${id} cancelado.`,

  help: {
    provider: (providers) => `Puedes decir el nombre de una empresa disponible: ${providers.join(', ')}.`,
    choose: 'Puedes decir foto para adjuntar un recibo, escribir para llenar un formulario o voz para dictar los datos.',
    fill: (label) => `Ahora necesito: ${label}. También puedes decir repetir, volver o cancelar.`,
    confirm: 'Puedes decir confirmar, corregir o cancelar. También puedo repetir el resumen.',
    recharge: 'Di el valor de la recarga, por ejemplo veinte mil, o di cancelar.',
    idle: 'Puedes decir pagar la luz, pagar el agua, recargar tu celular, pagar el SOAT, consultar el estado, ver opciones o pedir ayuda.',
  },

  // Registro por Telegram (mismos datos que el formulario "Crea tu cuenta")
  reg: {
    welcome: '👋 ¡Hola! Soy *ChochoPagos*: pagos y trámites sin salir de la vereda.\n\nPara crear tu cuenta, ¿cuál es tu *nombre completo*?',
    name: 'Escribe tu nombre completo, por ejemplo *María Pérez*.',
    document: (first) => `Gracias, ${first}. ¿Cuál es tu *número de cédula*? (sin puntos)`,
    documentRetry: 'La cédula debe tener entre 6 y 10 números.',
    sector: '¿En qué *vereda o sector* vives?',
    address: '¿Cómo llegamos a tu casa? Escribe unas *indicaciones*, por ejemplo: _Finca La Rosa, portón verde_.',
    addressRetry: 'Cuéntanos un poco más para que el domiciliario encuentre tu casa.',
    pin: 'Crea un *PIN de 4 dígitos*. Lo usarás para entrar a la app y pagar con tu saldo.\n_Por seguridad, borraré tu mensaje apenas lo lea._',
    pinRetry: 'El PIN debe tener 4 números.',
    pinConfirm: 'Confirma tu PIN escribiéndolo otra vez.',
    pinMismatch: 'Los PIN no coinciden. Crea tu PIN de 4 dígitos otra vez.',
    consent: 'Último paso: ¿autorizas el tratamiento de tus datos para recibir el servicio?\n\n_Demo académica: no se mueve dinero real._',
    declined: 'Entendido. Sin tu autorización no podemos prestarte el servicio. Escribe *hola* cuando quieras retomar.',
    done: (first) => `¡Bienvenido/a, ${first}! Tu cuenta quedó creada ✅`,
  },
};

/** Preguntas frecuentes (vInfo del prototipo). Devuelve la respuesta o null. */
export function infoAnswer(t, { deliveryFee, service }) {
  if (/(que servicios|que tramites|que ofrecen|servicios tienen|tramites tienen)/.test(t)) return 'Puedes solicitar pagos de energía, acueducto, gas, internet, recargas, paquetes de datos, pagos y bancos, SOAT, impuestos, trámites de documentos y giros.';
  if (/(cuanto cuesta|cuanto vale|precio|tarifa|comision|domicilio)/.test(t)) return `El domicilio cuesta ${formatCOP(deliveryFee)}. Cada trámite muestra su comisión antes de confirmar. El total siempre aparece antes de enviar el pedido.`;
  if (/(como pago|formas de pago|medio de pago)/.test(t)) return 'Puedes entregar efectivo al domiciliario o pagar con tu saldo en los servicios que permiten hacerlo desde casa.';
  if (/(que necesito|requisitos|documentos)/.test(t)) return service ? `Para este trámite necesitas: ${service.requirements.join(', ')}. También tendrás que confirmar el valor.` : 'Puedes enviar una foto del recibo, escribir los datos o dictarlos por voz.';
  if (/(sin internet|sin senal|offline|no tengo internet)/.test(t)) return 'Puedes registrar el pedido y recoger el efectivo sin señal. Cuando vuelva la conexión, la operación queda pendiente de sincronización.';
  if (/(horario|cuando atienden|hora de atencion)/.test(t)) return 'En esta demo el Centro está disponible durante el día. En una versión real el horario lo define el comercio aliado.';
  if (/(contacto|soporte|hablar con alguien|centro comunitario)/.test(t)) return 'Puedes solicitar ayuda en el Centro Comunitario o escribir aquí mismo.';
  if (/(como funciona|para que sirve)/.test(t)) return 'ChochoPagos te permite pedir un pago o trámite, enviar el recibo, entregar efectivo al domiciliario y seguir el estado hasta recibir el comprobante.';
  return null;
}
