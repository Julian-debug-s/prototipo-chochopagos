#!/usr/bin/env sh
# Inicia el backend de ChochoPagos (API + app + bot de Telegram) y abre el navegador.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKEND="$ROOT/backend"
PORT=${CHOCHO_PORT:-3000}
URL="http://127.0.0.1:${PORT}/"

if ! command -v node >/dev/null 2>&1; then
  printf 'Se necesita Node.js 22.13 o superior: https://nodejs.org\n' >&2
  exit 1
fi
[ -d "$BACKEND/node_modules" ] || (cd "$BACKEND" && npm install --omit=dev)
[ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"

if ! curl -fsS "${URL}health" >/dev/null 2>&1; then
  LOG="${TMPDIR:-/tmp}/chochopagos-${PORT}.log"
  (cd "$BACKEND" && PORT="$PORT" nohup node --env-file-if-exists=.env src/server.js >"$LOG" 2>&1 </dev/null &)
  curl --retry 30 --retry-delay 1 --retry-connrefused -fsS "${URL}health" >/dev/null 2>&1 || { printf 'No arrancó. Revisa %s\n' "$LOG" >&2; exit 1; }
fi

case "$(uname -s)" in
  Darwin) open "$URL" ;;
  Linux) xdg-open "$URL" >/dev/null 2>&1 || printf 'Abre %s\n' "$URL" ;;
  *) printf 'Abre %s\n' "$URL" ;;
esac
printf 'ChochoPagos abierto en %s\n' "$URL"
