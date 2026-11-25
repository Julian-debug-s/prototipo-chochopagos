# ChochoPagos · Backend + Telegram

Backend del prototipo. Guarda usuarios, pedidos y movimientos de dinero, aplica las reglas de negocio, atiende a los clientes por un **bot de Telegram** y sirve la app del prototipo: Usuario, Domiciliario y Centro, con su misma estética.

> **Uso académico.** El dinero y los pagos a proveedores son **simulados**. No conecta con bancos ni SEDPE.

## Cómo se integra con el prototipo

```
 Telegram de Rosa ──┐                              ┌── Pestaña Usuario (chat del prototipo)
                    ├──▶  mismo asistente + mismo  ◀┤
 bot (long polling)─┘     historial por celular     └── /api/me/chat
                                   │
                         pedidos, saldos, avisos
                                   │
              Pestaña Domiciliario ─┴─ Pestaña Centro Comunitario
```

- **El chat de la pestaña Usuario es el mismo asistente del bot de Telegram.** Comparten sesión e historial por número de celular, y todo se refleja en los dos lados:
  - Lo que Rosa hace en Telegram aparece en la app en unos 3 segundos, aunque esté escribiendo en la caja de texto. Al volver a la app se actualiza de inmediato.
  - Lo que hace en la app llega a su Telegram como "🖥️ *Desde la app:* …", seguido de la respuesta del asistente. El PIN nunca se repite.
  - En Telegram solo quedan activos los botones del paso actual, y los botones viejos se quitan aunque se haya avanzado desde la app.
  - Los avisos ("Carlos va en camino 🏍️") llegan a los dos lados.
- **El asistente sigue el flujo del prototipo:**
  1. Elegir el trámite y la empresa.
  2. Escoger cómo dar los datos: 📷 foto, ✍️ escribir o 🎤 dictar.
  3. Revisar el resumen y elegir "🏍️ Que Carlos venga" o "🏠 Pagar con saldo" (con PIN).
  4. Comandos en cualquier momento: "repetir", "volver", "ayuda", "cómo va mi pedido" y preguntas frecuentes.
- **Domiciliario y Centro** usan las mismas pantallas del prototipo con datos reales:
  - Domiciliario: aceptar, "Llegué", recibir el efectivo con el código, guardar la información de la operación, pagar con la app, foto de evidencia, rendir caja y modo sin señal.
  - Centro: indicadores, cola de pagos, saldo de plataforma, papel, usuarios y tarifario.

## Arranque rápido

Necesitas **Node.js 22.13 o superior** (trae SQLite integrado, sin compilar nada).

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Abre <http://localhost:3000>. También puedes usar los lanzadores de `../launchers/`.

| Pantalla | Acceso de prueba |
|---|---|
| Usuario | Celular `3128889900` · PIN `1234` (Rosa) |
| Domiciliario | `OP-01` · PIN `1234` |
| Centro | `CC-01` · PIN `1234` |

"Reiniciar demo" borra todo y vuelve a cargar los datos de ejemplo (solo fuera de producción).

Sin token de Telegram, los mensajes del bot se imprimen en la consola. Para simular un mensaje entrante desde la terminal:

```bash
curl -s localhost:3000/dev/simulate -H 'content-type: application/json' \
  -d '{"from":"3128889900","text":"quiero pagar la luz de 85 mil"}'
```

Pruebas automáticas: `npm test` (65 pruebas). Reiniciar la base de datos: `npm run db:reset`.

## Conectar el bot de Telegram

**Funciona en local, sin túnel ni HTTPS.** El servidor le pregunta a Telegram por mensajes nuevos (*long polling*), así que no hace falta una URL pública.

1. En Telegram, abre **@BotFather**, envía `/newbot` y elige un nombre y un usuario que termine en `bot` (por ejemplo `ChochoPagosBot`).
2. Copia el token que te da (`123456789:AA...`) en `TELEGRAM_BOT_TOKEN` del archivo `.env`.
3. Reinicia el servidor. En la consola aparece `telegram_bot_ready` con el enlace `https://t.me/TU_BOT`.
4. Abre el enlace y toca **Iniciar**. La primera vez el bot pide **📱 Compartir mi número**. Si el celular ya existe (por ejemplo Rosa, `3128889900`), el bot la reconoce. Si no, hace el registro (nombre, cédula, sector, indicaciones, autorización de datos y PIN).

Notas:
- **Por qué se pide el número:** Telegram no le da al bot el celular de la persona, y en ChochoPagos todo se identifica por celular. El vínculo chat ↔ celular se guarda en la tabla `telegram_links` y solo se acepta el contacto propio (el del botón), no el de otra persona.
- Solo un proceso puede leer el mismo bot a la vez. Si abres dos servidores con el mismo token, la consola muestra `telegram_conflict`.
- Los botones y listas del asistente se muestran como botones bajo el mensaje. Al tocar uno, los botones de ese mensaje desaparecen para no tocarlos dos veces.
- Cuando la persona escribe su PIN en el chat, el bot borra ese mensaje apenas lo lee.
- Los avisos del pedido ("Carlos va en camino 🏍️") llegan por Telegram solo a quien ya vinculó su número con el bot. Quien usa solo la app los ve en la app.

## Voz en Telegram (modelos locales)

Todo corre en el computador, sin servicios externos:

- **Voz → texto:** las notas de voz se transcriben con **faster-whisper large-v3-turbo**, que vive en `../whisper/` (entorno de Python y modelo). En el historial y en la app aparecen como "🎤 lo que dijo".
- **Texto → voz:** a quien habla por nota de voz, el bot le responde con texto y, además, con una nota de voz generada por **Kokoro** (voz `ef_dora`). La voz lee también las opciones de los botones. A quien escribe se le responde solo con texto.
- Al elegir "🎤 Dictar datos" en Telegram, el bot explica cómo enviar la nota de voz.

Configuración en `.env` (ver `.env.example`): `WHISPER_PYTHON`, `WHISPER_MODEL_DIR`, `KOKORO_PYTHON`, `KOKORO_VOICE` y `FFMPEG_PATH`. Si dejas vacía la ruta de Python de uno de los dos, esa parte se desactiva y el resto sigue funcionando.

Los dos modelos se cargan al arrancar el servidor (unos 6-8 s, con `python_worker_ready` en la consola). Después, una nota de voz corta se transcribe en unos 2-4 s y cada respuesta en voz tarda alrededor de 0,5 s. Los procesos de Python están en `python/stt_worker.py` y `python/tts_worker.py`, y se comunican con Node por stdin/stdout. Si uno se cae, se vuelve a arrancar con la siguiente nota de voz.

Se necesita `ffmpeg` (con libopus) para convertir la voz al formato de notas de voz de Telegram.

## Arquitectura

Arquitectura **hexagonal (puertos y adaptadores)** por capas. Las dependencias siempre apuntan hacia el dominio:

```
http/  ──▶  application/  ──▶  domain/
  │              │  ▲
  └── infrastructure/ ┘ (implementa los puertos que usa application)
```

```
src/
├── domain/            Reglas puras, sin E/S
│   ├── catalog.js       Trámites, comisiones, campos, requisitos y frases (fuente única de verdad)
│   ├── order.js         Entidad Pedido + máquina de estados
│   ├── accounting.js    Asientos contables por evento (el dinero siempre cuadra)
├── nlp/text.js        Detecta trámites y montos en español ("ochenta y cinco mil") y lee el texto del OCR
├── application/
│   ├── conversation/    Asistente: flujo (máquina de estados), textos del prototipo, validación de campos
│   ├── chatService.js   Entrada única al asistente para Telegram y web; historial compartido
│   ├── orderService.js  Ciclo del pedido (transacción + eventos)
│   ├── financeService.js  Monedero, rendición de caja, plataforma, indicadores del Centro
│   ├── authService.js   Ingreso con PIN, tokens firmados y límite de intentos
│   ├── notificationService.js  Evento → aviso por Telegram y en el historial
│   └── receiptService.js, inboundProcessor.js, userService.js, presenters.js
├── infrastructure/    SQLite (node:sqlite) y migraciones, repositorios (único lugar con SQL),
│                      bot de Telegram (telegram/), voz (speech/ + python/), OCR, almacenamiento de fotos, pagos simulados
├── http/              Express: rutas delgadas, autenticación, validación con zod, errores uniformes
├── config.js          Variables de entorno validadas al arrancar
└── container.js       Raíz de composición (inyección de dependencias)
```

### Decisiones de diseño

- **Inversión de dependencias.** La lógica recibe repositorios, mensajería, OCR y pagos por parámetro. Cambiar SQLite por PostgreSQL, o el proveedor simulado por uno real, es escribir otro adaptador.
- **Dominio rico.** `Order` valida sus propias transiciones. Por ejemplo: no se paga con la app sin verificar la operación, no se cancela después de recibir el efectivo y el autopago con saldo no lleva domicilio.
- **Libro contable de solo inserción.** Los saldos se calculan sumando movimientos, y el dinero se maneja en **pesos enteros**.
- **Transacciones atómicas** (pedido y asientos juntos) y **bloqueo optimista** con la columna `version`.
- **Eventos después del commit.** Los avisos salen solo cuando la operación ya quedó guardada. Si Telegram falla, la operación no se revierte.
- **Un asistente, dos canales.** La conversación es una máquina de estados que recibe un mensaje neutro y devuelve mensajes neutros (`text`, `buttons`, `list`). El adaptador de Telegram y la app web los presentan cada uno a su manera.
- **Seguridad:**
  - PIN con hash scrypt; el PIN en claro nunca se guarda, ni siquiera durante el registro por chat.
  - Sesiones con tokens HMAC con vencimiento, y bloqueo tras 5 intentos fallidos.
  - Permisos por rol: el domiciliario no ve el código de entrega del cliente, y cada cliente solo ve sus pedidos y fotos.
  - El bot solo atiende chats privados y vincula el celular solo con el contacto propio de quien escribe.
  - El token del bot nunca se escribe en los logs.
  - Fotos con nombres aleatorios; la app escapa todo dato del cliente; el service worker no guarda en caché la API.
- **Robustez del bot.** Descarta mensajes duplicados, procesa en orden los de un mismo número y atiende a varias personas a la vez. Si el token falla, la app web sigue funcionando.

### Estados del pedido

```
REQUESTED → ON_THE_WAY → (llegada) → CASH_COLLECTED → (verificar operación) → PAID → DELIVERED
    └──────────┴─→ CANCELLED                      ├─→ PENDING_PROVIDER → PAID | REJECTED
                                                  └─→ REJECTED → REFUNDED
Autopago con saldo: nace DELIVERED, sin domicilio.
```

## API (resumen)

`/api/catalog` es público. Todo lo demás requiere `Authorization: Bearer <token>`, que se obtiene en `/api/auth/*`.

| Ruta | Quién | Para qué |
|---|---|---|
| `POST /api/auth/customer` · `/register` · `/staff` | todos | Ingreso con PIN / registro |
| `GET /api/me`, `/me/orders`, `/me/ledger` | cliente | Perfil, saldo, pedidos, movimientos |
| `GET/POST /api/me/chat` | cliente | Chat con el asistente (mismo del bot de Telegram) |
| `POST /api/me/orders/:id/cancel` | cliente | Cancelar antes de entregar el efectivo |
| `POST /api/uploads` | todos | Subir foto (recibo o evidencia) |
| `GET /api/orders` | personal | Pedidos con datos del cliente |
| `POST /api/orders/:id/accept·arrive·collect·operation·deliver·refund` | domiciliario | Avanzar el pedido |
| `POST /api/orders/:id/pay` `{simulate}` | personal | Pagar al proveedor (simulado) |
| `POST /api/orders/:id/resolve` | Centro | Confirmar un pago pendiente |
| `POST /api/wallet/topups` · `/settlements` · `/platform/recharge` | personal | Recargas y rendición de caja |
| `GET /api/operator/summary` · `/center/dashboard` · `/users` · `/ledger` | personal | Paneles |

Los errores siempre tienen la forma `{ "error": { "code", "message", "details" }, "requestId" }`. Códigos HTTP: 400 validación, 401/403 acceso, 404 no existe, 409 concurrencia, 422 regla de negocio, 429 demasiados intentos.

## Pendiente

- *Outbox* transaccional para no perder avisos si el proceso se cae justo después de guardar.
- Varios domiciliarios: el modelo ya guarda `operator_id` por pedido.
