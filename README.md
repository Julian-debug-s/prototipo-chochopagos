# ChochoPagos - prototipo realista

Esta carpeta contiene la version de trabajo del prototipo. El archivo original `../chochopagos_app_completa.html` se conserva intacto como referencia principal.

## Estructura

- `index.html`, `assets/css/style.css`: interfaz y apariencia original del prototipo.
- `assets/js/app.js`: vistas de Usuario, Domiciliario y Centro Comunitario, conectadas al backend.
- `assets/js/api.js`: cliente de la API. `storage.js`: sesiones y preferencias del navegador. `sync.js`: cola del modo "sin señal".
- `assets/js/legacy/`: copia de la versión 100 % local original (sin servidor), como referencia.
- `backend/`: servidor con base de datos, reglas de negocio y el asistente del **bot de Telegram**. Ver `backend/README.md`.
- `manifest.webmanifest`, `sw.js` y `assets/js/pwa.js`: acceso instalable tipo PWA.
- `launchers/`: accesos de apertura para Linux, macOS, Windows y Android con Termux.

## Ejecutar localmente

Requiere Node.js 22.13 o superior.

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Luego abrir <http://localhost:3000>. Los lanzadores de `launchers/` hacen estos pasos automáticamente.

Cuentas de prueba: Usuario `3128889900` · PIN `1234`; Domiciliario `OP-01` · PIN `1234`; Centro `CC-01` · PIN `1234`.

## Modelos de IA (no incluidos en el repositorio)

Los modelos de voz pesan varios GB, por eso no se suben al repositorio. La app web, el chat y el bot de Telegram funcionan sin ellos; solo se desactivan las notas de voz. Para activarlas:

### 1. Requisitos del sistema

- Python 3.11 o superior.
- `ffmpeg` con soporte libopus (por ejemplo `sudo apt install ffmpeg`).
- `espeak-ng` (lo usa Kokoro para el español; por ejemplo `sudo apt install espeak-ng`).

### 2. Voz → texto: faster-whisper large-v3-turbo (~1,6 GB)

Desde la raíz del proyecto:

```bash
python3 -m venv whisper/.venv
whisper/.venv/bin/pip install faster-whisper huggingface_hub
whisper/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('dropbox-dash/faster-whisper-large-v3-turbo', local_dir='whisper/modelos/faster-whisper-large-v3-turbo')"
```

Al terminar debe existir `whisper/modelos/faster-whisper-large-v3-turbo/model.bin`.

### 3. Texto → voz: Kokoro-82M

Kokoro se instala fuera del proyecto, en `~/kokoro-local`. El modelo (`hexgrad/Kokoro-82M`) se descarga solo la primera vez que arranca el servidor.

```bash
python3 -m venv ~/kokoro-local/.venv
~/kokoro-local/.venv/bin/pip install kokoro soundfile numpy
```

### 4. Configurar `backend/.env`

Los valores de `.env.example` ya apuntan a esas rutas:

```env
WHISPER_PYTHON=../whisper/.venv/bin/python
WHISPER_MODEL_DIR=../whisper/modelos/faster-whisper-large-v3-turbo
KOKORO_PYTHON=~/kokoro-local/.venv/bin/python
```

En Windows las rutas del entorno son `whisper\.venv\Scripts\python.exe` y `%USERPROFILE%\kokoro-local\.venv\Scripts\python.exe`. Si se deja vacía la ruta de Python de uno de los dos, esa parte se desactiva.

Al iniciar con `npm start`, la consola muestra `python_worker_ready` cuando los modelos están cargados.

### OCR de recibos

No requiere instalación: tesseract.js descarga el idioma español (`spa.traineddata`) la primera vez que lee un recibo.

## Telegram

El chat de la pestaña Usuario es el **mismo asistente** que atiende el bot de Telegram, con el mismo flujo y los mismos textos. Ambos comparten el historial por número de celular: lo que se habla por Telegram aparece en la app, y los avisos del pedido llegan a los dos lados. Para conectar el bot solo se necesita un token de @BotFather; funciona en local, sin túnel. Las notas de voz se transcriben con Whisper y el bot responde con voz usando Kokoro, ambos en local (carpeta `whisper/` y `~/kokoro-local`). Los pasos están en `backend/README.md`.

## Alcance

- Dinero y transacciones simuladas.
- Sin conexión con bancos, SEDPE, operadores móviles o proveedores de servicios.
- Comprobantes de uso académico.
- Cancelación de pedidos antes de recibir el efectivo.
- Resultados simulados del proveedor: aprobado, pendiente y rechazado.
- Modo sin señal del domiciliario: las acciones se guardan y se sincronizan al recuperar la señal.
- Ayuda contextual por voz y navegación entre pedidos, saldo y perfil.
- Historial compacto: cada comprobante se abre solo cuando el usuario lo solicita.
- Pedidos activos separados de la pestaña Historial y facturas anteriores.
- Evidencia fotográfica de entrega.
- OCR en el servidor con Tesseract para extraer empresa, referencia, valor y fecha.
- Confirmación y corrección cuando la lectura tiene baja confianza.
- La apariencia conserva la identidad visual del prototipo original.

## Frases utiles por voz

- "Que opciones tengo" o "Necesito ayuda" para recibir instrucciones segun el paso actual.
- "Volver" para regresar al paso anterior.
- "Mis pedidos", "mi saldo" o "mi perfil" para navegar.
- "Como va mi pedido" para consultar el estado mas reciente.
- "Repetir" para escuchar de nuevo la ultima respuesta.

## Lectura de recibos

La foto del recibo se envía al servidor (desde la app o por Telegram), que la lee con Tesseract. Si no encuentra datos suficientes, el asistente lo dice y permite escribir, dictar o tomar otra foto. Si falta algún dato, el domiciliario lo completa en "Información de la operación" antes de pagar.

## Lanzadores

- Linux: ejecutar `launchers/abrir-chochopagos.sh` o instalar `launchers/ChochoPagos.desktop`.
- macOS: abrir `launchers/abrir-chochopagos.command`.
- Windows: abrir `launchers/abrir-chochopagos.bat`.
- Android: con Termux (`pkg install nodejs termux-api`), copiar la carpeta al teléfono y ejecutar `launchers/abrir-chochopagos-android-termux.sh`.

Los lanzadores instalan las dependencias la primera vez, inician el backend y abren el navegador en `http://127.0.0.1:3000/`.

## Instalar como aplicacion

El boton `Instalar ChochoPagos` aparece cuando el navegador detecta que la aplicacion se esta sirviendo desde `localhost` o desde HTTPS. No aparece al abrir el HTML con doble clic.

- Android: abre la URL en Chrome, usa el boton de instalacion si aparece o el menu `Agregar a pantalla de inicio`.
- Windows, Linux y macOS: abre la URL en Chrome o Edge y selecciona `Instalar ChochoPagos` en el icono de instalacion de la barra de direcciones.
- La instalacion crea un acceso directo y puede abrir la demo en una ventana independiente. No instala dinero real ni una aplicacion financiera.
