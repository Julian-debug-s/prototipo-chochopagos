"""
Síntesis de voz en español con Kokoro (proceso persistente).

Mismo protocolo que stt_worker.py (una línea JSON por mensaje):

  entrada:  {"id": 1, "text": "Hola Rosa", "out": "/tmp/respuesta.wav"}
  salida:   {"id": 1, "ok": true}
  al cargar: {"ready": true}

Variables de entorno: KOKORO_VOICE (ef_dora | em_alex), KOKORO_SPEED (1.0 = normal).
"""
import json
import os
import sys

protocol = sys.stdout
sys.stdout = sys.stderr


def reply(payload):
    protocol.write(json.dumps(payload, ensure_ascii=False) + "\n")
    protocol.flush()


import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402

VOICE = os.environ.get("KOKORO_VOICE") or "ef_dora"
SPEED = float(os.environ.get("KOKORO_SPEED") or 1.0)
SAMPLE_RATE = 24000

pipeline = KPipeline(lang_code="e", device="cpu", repo_id="hexgrad/Kokoro-82M")  # 'e' = español


def synthesize(text, out):
    chunks = [audio for _, _, audio in pipeline(text, voice=VOICE, speed=SPEED)]
    if not chunks:
        raise ValueError("Kokoro no generó audio")
    sf.write(out, np.concatenate(chunks), SAMPLE_RATE)


reply({"ready": True})

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request_id = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        synthesize(request["text"], request["out"])
        reply({"id": request_id, "ok": True})
    except Exception as error:
        reply({"id": request_id, "ok": False, "error": f"{type(error).__name__}: {error}"})
