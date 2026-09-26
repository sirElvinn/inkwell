"""Founders' Ink web server.

  .venv/bin/uvicorn app.main:app --reload     then open http://localhost:8000
"""
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from PIL import UnidentifiedImageError  # noqa: E402
from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app import pipeline  # noqa: E402

app = FastAPI(title="Founders' Ink")
STATIC = Path(__file__).resolve().parent / "static"
MAX_UPLOAD = 20 * 1024 * 1024


class LinesIn(BaseModel):
    lines: list[str] = []
    sample_id: str | None = None


class ContextIn(BaseModel):
    modern_text: str = ""
    metadata: dict | None = None
    sample_id: str | None = None


class NarrateIn(BaseModel):
    text: str
    voice_id: str | None = None


def _upstream_error(e):
    return HTTPException(502, f"{type(e).__name__}: {e}")


@app.get("/api/status")
def status():
    return {"gemini": pipeline.gemini_ready(), "elevenlabs": pipeline.elevenlabs_ready(),
            "transcribe_model": pipeline.TRANSCRIBE_MODEL, "text_model": pipeline.TEXT_MODEL}


@app.get("/api/samples")
def samples():
    return pipeline.list_samples()


@app.get("/api/samples/{sample_id}/image")
def sample_image(sample_id: str):
    if not re.fullmatch(r"[\w-]+", sample_id):
        raise HTTPException(404)
    path = pipeline.SAMPLES / sample_id / "page.jpg"
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)


@app.get("/api/samples/{sample_id}/transcribe")
def sample_transcribe(sample_id: str):
    if not re.fullmatch(r"[\w-]+", sample_id) or not (result := pipeline.sample_stage(sample_id, "transcribe")):
        raise HTTPException(404)
    return {"id": sample_id, "sample_id": sample_id, **result}


@app.post("/api/transcribe")
async def transcribe(image: UploadFile = File(...)):
    raw = await image.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "Image is over 20 MB.")
    try:
        return pipeline.transcribe(raw)
    except UnidentifiedImageError:
        raise HTTPException(400, "That file isn't an image we can read. Try a JPEG or PNG.")
    except Exception as e:  # Gemini error
        raise _upstream_error(e)


@app.post("/api/modernize")
def modernize(body: LinesIn):
    try:
        return pipeline.modernize(body.lines, body.sample_id)
    except Exception as e:
        raise _upstream_error(e)


@app.post("/api/context")
def context(body: ContextIn):
    try:
        return pipeline.context(body.modern_text, body.metadata, body.sample_id)
    except Exception as e:
        raise _upstream_error(e)


@app.post("/api/narrate")
def narrate(body: NarrateIn):
    try:
        return pipeline.narrate(body.text, body.voice_id)
    except Exception as e:
        raise _upstream_error(e)


@app.get("/api/audio/{name}")
def audio(name: str):
    if not re.fullmatch(r"[0-9a-f]{32}\.mp3", name):
        raise HTTPException(404)
    path = pipeline.CACHE / "audio" / name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="audio/mpeg")


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
