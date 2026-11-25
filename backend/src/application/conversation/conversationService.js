import { CATEGORIES, servicesInCategory, findService, getService, packagesFor } from '../../domain/catalog.js';
import { OrderStatus } from '../../domain/order.js';
import { formatCOP } from '../../domain/money.js';
import { normalize, detectService, parseAmount, isYes, isNo } from '../../nlp/text.js';
import { AppError } from '../../shared/errors.js';
import { hashPin, verifyPin, isValidPin } from '../../shared/security.js';
import { firstName } from '../userService.js';
import { orderLine, receiptText, statusLabel, statusMessage, isCustomerActive } from '../presenters.js';
import { text, buttons, list, Reply, parseReplyId } from './messages.js';
import { parseField } from './fieldParsers.js';
import { T, infoAnswer } from './assistantTexts.js';

/**
 * Asistente conversacional de ChochoPagos como máquina de estados. Sigue el
 * flujo del chat del prototipo (vSetSvc → empresa → foto/escribir/dictar →
 * confirmar → "Que Carlos venga" o "Pagar con mi saldo").
 *
 * - Se usa igual desde Telegram y desde la app web (ver chatService).
 * - Cada manejador recibe (contexto, estado) y devuelve { state, replies }:
 *   no envía nada por sí mismo, así que se prueba sin Telegram.
 * - Las reglas de negocio viven en los servicios; aquí solo hay diálogo.
 *
 * @typedef {{ messageId: string, from: string, ref?: { chatId: string, messageId?: number }, type: 'text'|'reply'|'image'|'audio'|'unsupported', text?: string, replyId?: string, media?: { id?: string, mimeType?: string, stored?: string } }} IncomingMessage
 * @typedef {{ serviceCode: string, provider: string, fields: Record<string,string>, amount: number|null, receiptPath: string|null, mode: 'form'|'voice'|'photo'|null, ocr: { company: string, confidence: number } | null }} Draft
 * @typedef {{ step: string, draft?: Draft, fieldKey?: string, pinAttempts?: number, registration?: Record<string,string>, last?: object }} SessionState
 * @typedef {{ state: SessionState, replies: import('./messages.js').OutgoingMessage[] }} StepResult
 */

const RX = {
  greeting: /^(hola|holi|ola|buenas|buenos dias|buenas tardes|buenas noches|inicio|empezar)\b/,
  repeat: /\b(repetir|repite)\b/,
  restart: /^(cancelar|cancela|empezar de nuevo|reiniciar|salir)$/,
  cancelOrder: /^cancelar (?:el )?pedido (?:numero )?#?(\d+)$/,
  help: /(\bayuda\b|\bopciones\b|que puedo hacer|no entiendo|\bmenu\b|servicios disponibles)/,
  back: /(volver|atras|regresar|paso anterior)/,
  history: /(historial|facturas anteriores|comprobantes anteriores)/,
  orders: /(mis pedidos|ver pedidos|pedidos activos)/,
  balance: /(mi saldo|ver saldo|cuanto tengo|^saldo$)/,
  profile: /(mi perfil|mis datos|configuracion)/,
  status: /(como va|donde esta|estado|cuando llega)/,
  bill: /\bfactura\b/,
  modePhoto: /\b(foto|imagen|recibo|adjuntar)\b/,
  modeForm: /\b(escribir|texto|datos|formulario)\b/,
  modeVoice: /\b(audio|voz|dictar|decir)\b/,
};
const CONFIDENT = 0.75;
const MAX_PIN_ATTEMPTS = 3;

const initialState = () => ({ step: 'idle' });

/**
 * Valor mencionado en una frase ("recargar 20 mil"). Un número largo sin
 * "mil"/"pesos"/"$" suele ser un contrato o celular, no un valor.
 */
function spokenAmount(raw) {
  const amount = parseAmount(raw);
  if (amount === null) return null;
  const hasCue = /\$|\bmil\b|\bmillon|\bpesos\b/i.test(raw);
  return hasCue || String(amount).length <= 6 ? amount : null;
}
const keep = (state, ...replies) => ({ state, replies });
const localPhone = (e164) => e164.replace(/^57/, '');

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('../userService.js').createUserService>} deps.userService
 * @param {import('../orderService.js').OrderService} deps.orderService
 * @param {import('../financeService.js').FinanceService} deps.financeService
 * @param {ReturnType<typeof import('../../infrastructure/repositories/chatRepositories.js').createSessionRepository>} deps.sessions
 * @param {{ process(media: object): Promise<{ receiptPath: string|null, reading: ReturnType<typeof import('../../nlp/text.js').parseReceiptText>|null }> }} deps.receipts
 * @param {() => Date} deps.clock
 * @param {import('../../shared/logger.js').Logger} deps.logger
 * @param {{ sessionTtlMinutes: number, sectors: string[], operatorName: string }} deps.config
 */
export function createConversationService({ userService, orderService, financeService, sessions, receipts, clock, logger, config }) {
  const ttlMs = config.sessionTtlMinutes * 60_000;
  const { operatorName: OP, sectors } = config;
  const deliveryFee = () => orderService.deliveryFee;

  // ================================================================ mensajes

  const idleMenu = (body = T.idle(OP)) =>
    buttons(body, [
      { id: Reply.NEW, title: '📋 Ver trámites' },
      { id: Reply.ORDERS, title: '📦 Mis pedidos' },
      { id: Reply.BALANCE, title: '👛 Mi saldo' },
    ]);

  const categoriesList = (body = 'O elígelo de la lista:') =>
    list(body, 'Ver trámites', [{
      title: 'Trámites',
      rows: CATEGORIES.map((c) => ({ id: Reply.category(c.id), title: `${c.icon} ${c.name}`, description: servicesInCategory(c.id).map((s) => s.name).join(', ') })),
    }]);

  const servicesList = (categoryId) => {
    const category = CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return categoriesList();
    return list(`${category.icon} *${category.name}*`, 'Elegir', [{
      title: category.name,
      rows: servicesInCategory(categoryId).map((s) => ({
        id: Reply.service(s.code),
        title: `${s.icon} ${s.name}`,
        description: `${s.fixedAmount === null ? 'Valor según tu recibo' : s.fixedAmount === 0 ? 'Gestión sin pago a terceros' : `Valor fijo ${formatCOP(s.fixedAmount)}`} · ${s.selfPayable ? '🏠 tú mismo · ' : ''}Comisión ${formatCOP(s.fee)}`,
      })),
    }]);
  };

  const providerButtons = (body, service) => buttons(body, service.providers.map((p, i) => ({ id: Reply.provider(i), title: `🏢 ${p}` })));

  const modeButtons = (body) =>
    buttons(body, [
      { id: Reply.mode('photo'), title: '📷 Foto del recibo' },
      { id: Reply.mode('form'), title: '✍️ Escribir datos' },
      { id: Reply.mode('voice'), title: '🎤 Dictar datos' },
    ]);

  const packageList = (body, provider) =>
    list(body, 'Ver paquetes', [{
      title: provider,
      rows: packagesFor(provider).map((p, i) => ({ id: Reply.pkg(i), title: `📦 ${formatCOP(p.amount)}`, description: p.label })),
    }]);

  const totalOf = (draft) => {
    const service = getService(draft.serviceCode);
    return (draft.amount ?? 0) + service.fee + deliveryFee();
  };

  /** Tarjeta de confirmación (equivale a la tarjeta "Esto leí del recibo" del prototipo). */
  function confirmCard(ctx, draft) {
    const service = getService(draft.serviceCode);
    const amount = draft.amount ?? 0;
    const title = service.code === 'wallet_topup' ? 'Recarga de saldo' : draft.ocr ? 'Esto leí del recibo' : 'Revisa tu pedido';
    const fieldLines = service.fields
      .filter((f) => f.type !== 'amount' && draft.fields[f.key])
      .map((f) => `${f.label}: ${draft.fields[f.key]}`);
    if (draft.fields.package) fieldLines.push(`Paquete: ${draft.fields.package}`);

    const lines = [
      `*${title}*${draft.receiptPath ? ' 📷' : ''}`,
      `Trámite: ${service.name}`,
      draft.provider ? `Empresa: ${draft.provider}` : null,
      ...fieldLines,
      `Valor: ${formatCOP(amount)}`,
      service.fee ? `Comisión: ${formatCOP(service.fee)}` : null,
      `Domicilio: ${formatCOP(deliveryFee())}`,
      `*Efectivo a entregar: ${formatCOP(totalOf(draft))}*`,
      draft.ocr && draft.ocr.confidence < CONFIDENT ? '\n_Revisa bien los datos: no estoy del todo seguro._' : null,
    ];

    const actions = [{ id: Reply.CONFIRM, title: `🏍️ Que ${OP} venga` }];
    if (service.selfPayable) {
      const need = amount + service.fee;
      const wallet = financeService.customerBalances(ctx.phone).wallet;
      const complete = getService(draft.serviceCode).fields.every((f) => f.type === 'amount' || f.optional || draft.fields[f.key]);
      if (wallet >= need && complete) {
        lines.push(`\n🏠 *O hazlo tú desde casa:* pagas ${formatCOP(need)} con tu saldo, sin domicilio. Tu saldo: ${formatCOP(wallet)}.`);
        actions.push({ id: Reply.WALLET, title: '🏠 Pagar con saldo' });
      } else if (wallet < need) {
        lines.push(`\n🏠 Con saldo pagarías ${formatCOP(need)} sin domicilio. Te faltan ${formatCOP(need - wallet)}: pide una recarga a domicilio o en el Centro.`);
      }
    }
    actions.push({ id: Reply.EDIT, title: '✏️ Corregir' });
    return buttons(lines.filter((l) => l !== null).join('\n'), actions);
  }

  // ================================================================ registro

  const sectorButtons = () => buttons(T.reg.sector, sectors.slice(0, 3).map((s, i) => ({ id: Reply.sector(i), title: s })));
  const consentButtons = () => buttons(T.reg.consent, [{ id: Reply.CONSENT_YES, title: 'Sí, autorizo' }, { id: Reply.CONSENT_NO, title: 'No' }]);

  /** Mismos datos que el formulario "Crea tu cuenta" del prototipo, de uno en uno. */
  async function routeRegistration(ctx, state) {
    const reg = state.registration;
    const value = (ctx.text ?? '').trim().replace(/\s+/g, ' ');
    const next = (step, registration, ...replies) => ({ state: { step, registration }, replies });

    if (!reg || !state.step.startsWith('register.')) return next('register.name', {}, text(T.reg.welcome));

    switch (state.step) {
      case 'register.name':
        if (value.length < 5 || value.length > 80 || /\d/.test(value)) return keep(state, text(T.reg.name));
        return next('register.document', { name: value }, text(T.reg.document(value.split(' ')[0])));
      case 'register.document': {
        const doc = value.replace(/[.\s]/g, '');
        if (!/^\d{6,10}$/.test(doc)) return keep(state, text(T.reg.documentRetry));
        return next('register.sector', { ...reg, document: doc }, sectorButtons());
      }
      case 'register.sector': {
        const [kind, arg] = parseReplyId(ctx.reply);
        const sector = kind === 'sector' ? sectors[Number(arg)] : sectors.find((s) => normalize(s) === ctx.input);
        if (!sector) return keep(state, sectorButtons());
        return next('register.address', { ...reg, sector }, text(T.reg.address));
      }
      case 'register.address':
        if (value.length < 5) return keep(state, text(T.reg.addressRetry));
        return next('register.consent', { ...reg, address: value }, consentButtons());
      case 'register.consent':
        if (ctx.reply === Reply.CONSENT_YES || (!ctx.reply && isYes(ctx.text))) return next('register.pin', { ...reg, consent: true }, text(T.reg.pin));
        if (ctx.reply === Reply.CONSENT_NO || isNo(ctx.text)) return { state: initialState(), replies: [text(T.reg.declined)] };
        return keep(state, consentButtons());
      case 'register.pin':
        if (!isValidPin(value)) return keep(state, text(T.reg.pinRetry));
        // Solo se guarda el hash, nunca el PIN en claro.
        return next('register.pinConfirm', { ...reg, pinHash: hashPin(value) }, text(T.reg.pinConfirm));
      case 'register.pinConfirm':
        if (!isValidPin(value) || !verifyPin(value, reg.pinHash)) {
          const { pinHash, ...rest } = reg;
          return next('register.pin', rest, text(T.reg.pinMismatch));
        }
        {
          // El PIN en claro solo existe durante esta petición; se registra de inmediato.
          const { name, document, sector, address, consent } = reg;
          const user = userService.register({ phone: ctx.phone, name, document, sector, address, pin: value, consent });
          return { state: initialState(), replies: [text(T.reg.done(firstName(user))), idleMenu()] };
        }
      default:
        return next('register.name', {}, text(T.reg.welcome));
    }
  }

  // ================================================================ clientes

  async function routeCustomer(ctx, state) {
    const [kind, arg] = parseReplyId(ctx.reply);
    const typed = !ctx.reply && ctx.incoming.type === 'text';
    const t = ctx.input;
    const draftService = state.draft ? getService(state.draft.serviceCode) : null;

    // --- comandos globales (mismo orden que hv() del prototipo)
    if (typed && RX.repeat.test(t) && state.last) return keep(state, state.last);
    if (kind === 'order' && arg?.startsWith('cancel:')) return cancelOrder(ctx, state, Number(arg.slice(7)));
    const cancelMatch = typed && t.match(RX.cancelOrder);
    if (cancelMatch) return cancelOrder(ctx, state, Number(cancelMatch[1]));
    if (typed && RX.restart.test(t)) return { state: initialState(), replies: [text(T.restart), idleMenu()] };
    if (kind === 'menu') return home(ctx);
    if (typed && RX.greeting.test(t)) {
      // "Hola, quiero pagar el agua" (muy común al hablar): el saludo no tapa el pedido.
      const rest = t.replace(RX.greeting, '').replace(/^[\s,.;:!¡?¿-]+/, '');
      if (rest && detectService(rest)) return freeText({ ...ctx, input: rest }, initialState());
      return home(ctx);
    }
    if (state.step === 'pin') return handlePin(ctx, state);

    if (typed) {
      if (state.step === 'idle' && RX.orders.test(t)) return showOrders(ctx, state);
      if (state.step === 'idle' && RX.history.test(t)) return showHistory(ctx, state);
      if (state.step === 'idle' && RX.balance.test(t)) return showBalance(ctx, state);
      if (state.step === 'idle' && RX.profile.test(t)) return showProfile(ctx, state);
      // Mientras escribe un dato, no se interpretan preguntas (p. ej. "estado de cuenta").
      const answering = state.step === 'fill' || state.step === 'recharge' || state.step === 'wamt';
      const info = answering ? null : infoAnswer(t, { deliveryFee: deliveryFee(), service: draftService });
      if (info) return keep(state, text(info));
      if (RX.help.test(t)) return help(ctx, state);
      if (RX.back.test(t)) return goBack(ctx, state);
      if (!answering && RX.status.test(t)) return lastOrderStatus(ctx, state);
    }

    if (kind === 'orders') return showOrders(ctx, state);
    if (kind === 'balance') return showBalance(ctx, state);
    if (kind === 'new') return keep(initialState(), categoriesList('Elige el tipo de trámite:'));
    if (kind === 'cat') return keep(state, servicesList(arg));
    if (kind === 'svc') return setService(ctx, arg, null);

    if (ctx.incoming.type === 'image') return handlePhoto(ctx, state);
    // Llega como audio solo si no se pudo transcribir (ver chatService).
    if (ctx.incoming.type === 'audio') return keep(state, text(T.voiceNoteNotUnderstood));
    if (ctx.incoming.type === 'unsupported') return keep(state, text(T.notUnderstood));

    switch (state.step) {
      case 'provider': return chooseProvider(ctx, state, kind, arg);
      case 'choose': return chooseMode(ctx, state, kind === 'mode' ? arg : typed ? modeFromText(t) : null);
      case 'recharge': return rechargeAmount(ctx, state);
      case 'package': return choosePackage(state, kind, arg);
      case 'fill': return fillField(ctx, state);
      case 'wamt': return amountAfterPhoto(ctx, state);
      case 'confirm': return confirm(ctx, state, kind, arg);
      case 'reading': return keep(state, text(T.readingWait));
      default: return freeText(ctx, state);
    }
  }

  const modeFromText = (t) => (RX.modePhoto.test(t) ? 'photo' : RX.modeForm.test(t) ? 'form' : RX.modeVoice.test(t) ? 'voice' : null);

  function home(ctx) {
    return { state: initialState(), replies: [idleMenu(`Hola, ${firstName(ctx.user)} 👋\n\n${T.idle(OP)}`)] };
  }

  function freeText(ctx, state) {
    const t = ctx.input;
    const code = detectService(t);
    if (!code && RX.bill.test(t)) return keep(initialState(), text(T.whichBill));
    if (code) return setService(ctx, code, spokenAmount(ctx.text ?? ''));
    if (state.step === 'photo') return isNo(t) ? keep(initialState(), text('Está bien. ¿Qué trámite necesitas?')) : keep(state, text(T.needPhoto));
    return keep(state, text(T.notUnderstood));
  }

  // --- vSetSvc
  function setService(ctx, code, spokenAmount) {
    const service = findService(code);
    if (!service) return keep(initialState(), text('Ese trámite no está disponible.'), categoriesList());
    /** @type {Draft} */
    const draft = {
      serviceCode: code, provider: '', fields: {},
      amount: service.fixedAmount ?? (service.usesPackages ? null : spokenAmount ?? null),
      receiptPath: null, mode: null, ocr: null,
    };
    if (service.providers.length) return { state: { step: 'provider', draft }, replies: [providerButtons(T.providerFor(service), service)] };
    if (code === 'wallet_topup') return askField({ ...draft, mode: 'form' }, [text(T.walletAsk)], { quiet: true });
    return { state: { step: 'choose', draft }, replies: [modeButtons(T.chooseFor(service))] };
  }

  // --- vChooseProvider
  function chooseProvider(ctx, state, kind, arg) {
    const service = getService(state.draft.serviceCode);
    const provider = kind === 'prov'
      ? service.providers[Number(arg)]
      : ctx.input ? service.providers.find((p) => normalize(p).includes(ctx.input) || ctx.input.includes(normalize(p))) : undefined;
    if (!provider) return keep(state, providerButtons(T.providerRetry(service.providers), service));

    const draft = { ...state.draft, provider };
    if (service.code === 'mobile_topup') {
      draft.fields = { ...draft.fields, phone: localPhone(ctx.phone) };
      if (draft.amount) return toConfirm(draft, T.rechargeDone(draft.amount, provider));
      return { state: { step: 'recharge', draft }, replies: [text(T.rechargeAsk(provider))] };
    }
    if (service.code === 'data_package') {
      draft.fields = { ...draft.fields, phone: localPhone(ctx.phone) };
      return { state: { step: 'package', draft }, replies: [packageList(T.packageAsk(provider), provider)] };
    }
    return { state: { step: 'choose', draft }, replies: [modeButtons(T.providerChosen(provider))] };
  }

  // --- vChooseMode
  function chooseMode(ctx, state, mode) {
    const service = getService(state.draft.serviceCode);
    if (!mode) return keep(state, modeButtons(T.help.choose));
    if (mode === 'photo') return { state: { step: 'photo', draft: { ...state.draft, mode: 'photo' } }, replies: [text(T.photoAsk(service))] };
    const draft = { ...state.draft, mode };
    const intro = mode === 'form' ? [text(T.formStart)] : ctx.channel === 'telegram' ? [text(T.voiceNoteHint)] : [];
    return askField(draft, intro);
  }

  function rechargeAmount(ctx, state) {
    const amount = parseAmount(ctx.text ?? '');
    if (!amount) return keep(state, text(T.rechargeRetry));
    return toConfirm({ ...state.draft, amount }, T.rechargeDone(amount, state.draft.provider));
  }

  function choosePackage(state, kind, arg) {
    const pkg = kind === 'pkg' ? packagesFor(state.draft.provider)[Number(arg)] : null;
    if (!pkg) return keep(state, packageList(T.packageAsk(state.draft.provider), state.draft.provider));
    const draft = { ...state.draft, amount: pkg.amount, fields: { ...state.draft.fields, package: pkg.label } };
    return toConfirm(draft, T.packageDone(pkg.label, pkg.amount, draft.provider));
  }

  // --- formulario conversacional (escribir o dictar)
  const pendingFields = (draft) => {
    const service = getService(draft.serviceCode);
    return service.fields.filter((f) => (f.type === 'amount' ? service.fixedAmount === null && draft.amount === null : draft.fields[f.key] === undefined));
  };

  function askField(draft, intro = [], { quiet = false } = {}) {
    const service = getService(draft.serviceCode);
    const [next] = pendingFields(draft);
    if (!next) return toConfirm(draft, T.formDone(totalOf(draft), service.code === 'wallet_topup'));
    const position = service.fields.indexOf(next) + 1;
    const first = position === 1 || intro.length > 0;
    const question = quiet ? null
      : draft.mode === 'voice' ? text(first ? T.fieldVoiceFirst(next.label) : T.fieldVoiceNext(next.label))
        : text(T.fieldForm(position, service.fields.length, next.label, next.optional));
    return { state: { step: 'fill', draft, fieldKey: next.key }, replies: [...intro, ...(question ? [question] : [])] };
  }

  function fillField(ctx, state) {
    const service = getService(state.draft.serviceCode);
    const field = service.fields.find((f) => f.key === state.fieldKey);
    if (!field) return askField(state.draft);
    if (ctx.incoming.type !== 'text') return keep(state, text(T.help.fill(field.label)));

    const parsed = parseField(field, ctx.text ?? '');
    if (!parsed.ok) return keep(state, text(state.draft.mode === 'voice' ? 'No entendí ese dato. Dímelo nuevamente, por favor.' : parsed.error));
    const draft = field.type === 'amount'
      ? { ...state.draft, amount: parsed.value }
      : { ...state.draft, fields: { ...state.draft.fields, [field.key]: parsed.value } };
    return askField(draft);
  }

  // --- confirmación
  function toConfirm(draft, lead) {
    return { state: { step: 'confirm', draft }, replies: [text(lead), { deferredConfirm: true }] };
  }

  async function confirm(ctx, state, kind, arg) {
    const draft = state.draft;
    if (ctx.reply === Reply.CONFIRM || (!ctx.reply && isYes(ctx.text))) return placeOrder(ctx, draft);
    if (ctx.reply === Reply.WALLET) {
      const need = (draft.amount ?? 0) + getService(draft.serviceCode).fee;
      return { state: { step: 'pin', draft, pinAttempts: 0 }, replies: [text(T.pinAsk(need, ctx.channel))] };
    }
    if (ctx.reply === Reply.EDIT) return editDraft(state);
    if (!ctx.reply && isNo(ctx.text)) {
      const walletTopUp = draft.serviceCode === 'wallet_topup';
      return walletTopUp ? keep(initialState(), text(T.confirmNo(true)))
        : { state: { step: 'photo', draft: { ...draft, mode: 'photo', ocr: null } }, replies: [text(T.confirmNo(false))] };
    }
    return keep(state, text(T.confirmAsk), confirmCard(ctx, draft));
  }

  async function placeOrder(ctx, draft) {
    const order = await orderService.create({
      customerPhone: ctx.phone, serviceCode: draft.serviceCode, provider: draft.provider, fields: draft.fields,
      amount: draft.amount ?? undefined, channel: ctx.channel, receiptPath: draft.receiptPath,
    });
    return {
      state: initialState(),
      replies: [buttons(T.placed(order.id, order.total, OP, order.deliveryCode), [
        { id: Reply.ORDERS, title: '📦 Mis pedidos' },
        { id: Reply.MENU, title: '➕ Otro trámite' },
      ])],
    };
  }

  /** "Corregir" (vfix del prototipo): vuelve al paso donde se dio el dato. */
  function editDraft(state) {
    const draft = state.draft;
    const service = getService(draft.serviceCode);
    if (service.code === 'wallet_topup') return askField({ ...draft, amount: null, mode: 'form' }, [text(T.fixWallet)], { quiet: true });
    if (service.code === 'mobile_topup') return { state: { step: 'recharge', draft: { ...draft, amount: null } }, replies: [text(T.fixRecharge(draft.provider))] };
    if (service.code === 'data_package') return { state: { step: 'package', draft: { ...draft, amount: null } }, replies: [packageList(T.fixPackage(draft.provider), draft.provider)] };
    if (draft.mode === 'form' || draft.mode === 'voice') {
      return askField({ ...draft, fields: {}, amount: service.fixedAmount ?? null }, [text(T.fixForm(service.name))]);
    }
    return { state: { step: 'choose', draft: { ...draft, ocr: null } }, replies: [modeButtons(T.fixPhoto)] };
  }

  async function handlePin(ctx, state) {
    const pin = (ctx.text ?? '').trim();
    try {
      const order = await orderService.payWithWallet({
        customerPhone: ctx.phone, pin, serviceCode: state.draft.serviceCode, provider: state.draft.provider,
        fields: state.draft.fields, amount: state.draft.amount ?? undefined, channel: ctx.channel,
      });
      return { state: initialState(), replies: [text(`${T.selfPaid}\n\n${receiptText(order)}`), idleMenu('¿Algo más?')] };
    } catch (error) {
      if (error?.code !== 'INVALID_PIN') throw error;
      const attempts = (state.pinAttempts ?? 0) + 1;
      if (attempts >= MAX_PIN_ATTEMPTS) return { state: { step: 'confirm', draft: state.draft }, replies: [text(T.pinLocked), confirmCard(ctx, state.draft)] };
      return keep({ ...state, pinAttempts: attempts }, text(T.pinWrong(MAX_PIN_ATTEMPTS - attempts)));
    }
  }

  // --- foto del recibo (vPhoto / aiDone / aiFail)
  async function handlePhoto(ctx, state) {
    const allowed = ['idle', 'photo', 'choose'].includes(state.step);
    if (!allowed) return keep(state, text('Termina primero este trámite o escribe *cancelar*.'));
    await ctx.sendNow(text(T.reading));
    const { receiptPath, reading } = await receipts.process(ctx.incoming.media);

    const chosen = state.draft ? getService(state.draft.serviceCode) : null;
    const service = chosen ?? (reading?.serviceCode ? getService(reading.serviceCode) : null);
    if (!reading?.readable || !service) {
      if (chosen) return { state: { step: 'choose', draft: { ...state.draft, receiptPath } }, replies: [modeButtons(T.readFailed)] };
      return keep(initialState(), text(T.readFailed), categoriesList('¿Qué trámite es?'));
    }

    const company = state.draft?.provider || reading.company || service.name;
    const provider = state.draft?.provider || (service.providers.includes(reading.company) ? reading.company : service.providers[0] ?? '');
    const fields = { ...(state.draft?.fields ?? {}) };
    if (reading.reference && service.referenceField && !fields[service.referenceField]) fields[service.referenceField] = reading.reference;
    const amount = service.fixedAmount ?? (reading.amount >= 1000 ? reading.amount : null);

    /** @type {Draft} */
    const draft = { serviceCode: service.code, provider, fields, amount, receiptPath, mode: 'photo', ocr: { company, confidence: reading.confidence } };
    if (amount === null) return { state: { step: 'wamt', draft }, replies: [text(T.readNoAmount(company, service.name))] };
    return toConfirm(draft, T.readOk(company, service.name, amount, reading.reference, totalOf(draft), reading.confidence >= CONFIDENT));
  }

  function amountAfterPhoto(ctx, state) {
    const amount = parseAmount(ctx.text ?? '');
    if (!amount) return keep(state, text(T.amountRetry));
    const draft = { ...state.draft, amount };
    return toConfirm(draft, T.amountAfterPhoto(amount, totalOf(draft), draft.serviceCode === 'wallet_topup'));
  }

  // --- ayuda, volver, consultas
  function help(ctx, state) {
    const service = state.draft ? getService(state.draft.serviceCode) : null;
    switch (state.step) {
      case 'provider': return keep(state, providerButtons(T.help.provider(service.providers), service));
      case 'choose': return keep(state, modeButtons(T.help.choose));
      case 'fill': return keep(state, text(T.help.fill(service.fields.find((f) => f.key === state.fieldKey)?.label ?? 'el dato')));
      case 'confirm': return keep(state, text(T.help.confirm), confirmCard(ctx, state.draft));
      case 'recharge': return keep(state, text(T.help.recharge));
      default: return keep(state, idleMenu(T.help.idle), categoriesList());
    }
  }

  function goBack(ctx, state) {
    if (state.step === 'idle' || !state.draft) return keep(initialState(), text(T.backAtStart));
    const service = getService(state.draft.serviceCode);
    if (service.providers.length && state.step !== 'provider') {
      return { state: { step: 'provider', draft: { ...state.draft, provider: '' } }, replies: [providerButtons(T.back, service)] };
    }
    if (state.step === 'provider') return keep(initialState(), text(T.back), categoriesList());
    return { state: { step: 'choose', draft: state.draft }, replies: [modeButtons(T.back)] };
  }

  function lastOrderStatus(ctx, state) {
    const [last] = orderService.listForCustomer(ctx.phone, 1);
    if (!last) return keep(state, text(T.noOrders));
    return keep(state, text(T.orderStatus(last.id, statusLabel(last.status), statusMessage(last.status, OP))));
  }

  function showOrders(ctx, state) {
    const active = orderService.listForCustomer(ctx.phone, 30).filter((o) => isCustomerActive(o.status)).slice(0, 5);
    if (!active.length) return keep(state, idleMenu('No tienes pedidos activos.'));
    const body = `${T.ordersHeader}\n\n${active.map(orderLine).join('\n')}`;
    const cancellable = active.filter((o) => o.isCancellable).slice(0, 2);
    const actions = [...cancellable.map((o) => ({ id: Reply.cancelOrder(o.id), title: `Cancelar #${o.id}` })), { id: Reply.MENU, title: '🏠 Inicio' }];
    return keep(state, buttons(body, actions));
  }

  function showHistory(ctx, state) {
    const done = orderService.listForCustomer(ctx.phone, 30).filter((o) => !isCustomerActive(o.status)).slice(0, 3);
    if (!done.length) return keep(state, text('Todavía no tienes comprobantes anteriores.'));
    return keep(state, text(`${T.historyHeader}\n\n${done.map((o) => (o.status === OrderStatus.DELIVERED || o.status === OrderStatus.PAID ? receiptText(o) : orderLine(o))).join('\n\n')}`));
  }

  function showBalance(ctx, state) {
    const { wallet } = financeService.customerBalances(ctx.phone);
    return keep(state, buttons(`${T.balanceHeader}\n\n👛 Mi saldo: *${formatCOP(wallet)}*\nCon saldo pagas tú mismo, desde casa, los trámites marcados con 🏠, sin domicilio.\nRecarga: domiciliario o Centro.`, [
      { id: Reply.service('wallet_topup'), title: '🏍️ Pedir recarga' },
      { id: Reply.MENU, title: '🏠 Inicio' },
    ]));
  }

  function showProfile(ctx, state) {
    const u = ctx.user;
    const count = orderService.listForCustomer(ctx.phone, 1000).length;
    return keep(state, text(`${T.profileHeader}\n\n*${u.name}*\nCelular: ${localPhone(u.phone)}\nCédula: •••• ${String(u.document ?? '').slice(-3)}\nSector: ${u.sector}\nIndicaciones: ${u.address}\nPedidos realizados: ${count}`));
  }

  async function cancelOrder(ctx, state, orderId) {
    const order = await orderService.cancel(orderId, { by: 'customer', customerPhone: ctx.phone });
    return keep(state, text(T.cancelled(order.id)));
  }

  // ================================================================ entrada

  function loadState(phone, now) {
    const stored = sessions.find(phone);
    const fresh = stored && now.getTime() - stored.updatedAt.getTime() <= ttlMs;
    return fresh ? stored.state : initialState();
  }

  return {
    /**
     * Procesa un mensaje entrante y devuelve las respuestas.
     * @param {IncomingMessage} incoming
     * @param {{ sendNow?: (message: import('./messages.js').OutgoingMessage) => Promise<void>, channel?: 'telegram'|'web' }} [options]
     *   `sendNow` envía de inmediato avisos de progreso (p. ej. "leyendo el recibo…").
     * @returns {Promise<import('./messages.js').OutgoingMessage[]>}
     */
    async handle(incoming, { sendNow = async () => {}, channel = 'telegram' } = {}) {
      const phone = incoming.from;
      const state = loadState(phone, clock());
      const user = userService.find(phone);
      const ctx = { incoming, phone, user, channel, sendNow, text: incoming.text ?? '', input: normalize(incoming.text ?? ''), reply: incoming.replyId ?? null };

      let result;
      try {
        result = user ? await routeCustomer(ctx, state) : await routeRegistration(ctx, state);
      } catch (error) {
        if (!(error instanceof AppError)) logger.error('conversation_failed', { phone, error });
        result = keep(state, text(error instanceof AppError ? `⚠️ ${error.message}` : 'Tuvimos un problema procesando tu mensaje. Intenta de nuevo en un momento.'));
      }

      // La tarjeta de confirmación se arma al final, con el saldo vigente.
      const replies = result.replies.map((r) => (r.deferredConfirm ? confirmCard(ctx, result.state.draft) : r));
      const finalState = replies.length ? { ...result.state, last: replies[replies.length - 1] } : result.state;
      sessions.save(phone, finalState, clock());
      return replies;
    },

    /** Paso actual de la conversación (la app muestra atajos solo en "idle"). */
    currentStep(phone) {
      return loadState(phone, clock()).step;
    },
  };
}
