"""
Transcripción de notas de voz con faster-whisper (proceso persistente).

El backend de Node lo arranca una vez y le habla por stdin/stdout, una línea JSON
por mensaje, para no cargar el modelo (1,6 GB) en cada audio:

  entrada:  {"id": 1, "path": "/tmp/nota.ogg"}
  salida:   {"id": 1, "ok": true, "text": "quiero pagar la luz"}
  al cargar: {"ready": true}

Variables de entorno: WHISPER_MODEL_DIR (obligatoria), WHISPER_THREADS (0 = todos los núcleos).
"""
import json
import os
import sys

# stdout queda reservado para el protocolo: cualquier print de librerías va a stderr.
protocol = sys.stdout
sys.stdout = sys.stderr


def reply(payload):
    protocol.write(json.dumps(payload, ensure_ascii=False) + "\n")
    protocol.flush()


from faster_whisper import WhisperModel  # noqa: E402

MODEL_DIR = os.environ["WHISPER_MODEL_DIR"]
THREADS = int(os.environ.get("WHISPER_THREADS") or 0) or (os.cpu_count() or 4)

# Vocabulario del dominio: ayuda al modelo con nombres propios y montos.
PROMPT = (
    "ChochoPagos. Quiero pagar la luz, el agua, el gas o el internet. "
    "Recarga de celular, paquete de datos, SOAT, giro. "
    "Cincuenta mil pesos. Matrícula, referencia, cédula, vereda Alto del Chocho. "
    "EPM, Claro, Tigo, Movistar, Wom."
)

model = WhisperModel(MODEL_DIR, device="cpu", compute_type="int8", cpu_threads=THREADS)


def transcribe(path):
    segments, _info = model.transcribe(
        path,
        language="es",
        beam_size=5,  # notas de voz cortas: se prioriza precisión sobre velocidad
        vad_filter=True,  # quita silencios y evita "alucinaciones" en audio vacío
        initial_prompt=PROMPT,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segments).strip()


reply({"ready": True})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request_id = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        reply({"id": request_id, "ok": True, "text": transcribe(request["path"])})
    except Exception as error:  # el proceso nunca se cae por un audio malo
        reply({"id": request_id, "ok": False, "error": f"{type(error).__name__}: {error}"})
