#!/data/data/com.termux/files/usr/bin/sh
# Requiere: pkg install nodejs termux-api
set -eu
ROOT=${CHOCHO_ROOT:-$HOME/chochopagos-realista}
PORT=${CHOCHO_PORT:-3000}
cd "$ROOT/backend"
[ -d node_modules ] || npm install --omit=dev
[ -f .env ] || cp .env.example .env
PORT="$PORT" nohup node --env-file-if-exists=.env src/server.js >/data/data/com.termux/files/usr/tmp/chochopagos.log 2>&1 &
sleep 3
URL="http://127.0.0.1:${PORT}/"
if command -v termux-open-url >/dev/null 2>&1; then termux-open-url "$URL"; else am start -a android.intent.action.VIEW -d "$URL"; fi
printf 'ChochoPagos abierto en %s\n' "$URL"
