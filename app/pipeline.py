"""The four stages: transcribe (image) -> modernize + context (text) -> narrate (audio).

Every stage caches its result on disk, keyed by a hash of its input, model and prompt, so demo
letters load instantly and repeated runs don't spend API budget. With no API key set, each stage
returns the bundled sample letter's results instead (demo mode).
"""
import base64
import hashlib
import io
import json
import os
import re
from pathlib import Path

import httpx
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = ROOT / "prompts"
CACHE = ROOT / ".cache"
SAMPLES = Path(__file__).resolve().parent / "samples"

TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gemini-3.8-flash")
TEXT_MODEL = os.getenv("TEXT_MODEL", "gemini-3.5-flash-lite")
TTS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
# Library voice; replace with any voice ID from your ElevenLabs voice library.
DEFAULT_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")

TRANSCRIBE_SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {"type": "array", "items": {"type": "string"}},
        "uncertain": {"type": "array", "items": {"type": "object", "properties": {
            "line": {"type": "integer"}, "text": {"type": "string"}, "reason": {"type": "string"}}}},
        "writer_guess": {"type": "string"},
        "date_guess": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": ["lines", "uncertain"],
}

MODERNIZE_SCHEMA = {
    "type": "object",
    "properties": {
        "sentences": {"type": "array", "items": {"type": "object", "properties": {
            "original": {"type": "string"}, "modern": {"type": "string"}},
            "required": ["original", "modern"]}},
        "glossary": {"type": "array", "items": {"type": "object", "properties": {
            "original": {"type": "string"}, "modern": {"type": "string"},
            "reason": {"type": "string", "enum": ["long s", "abbreviation", "spelling", "archaic word", "superscript"]},
            "note": {"type": "string"}},
            "required": ["original", "modern", "reason"]}},
    },
    "required": ["sentences", "glossary"],
}

CONTEXT_SCHEMA = {
    "type": "object",
    "properties": {
        "letter": {"type": "object", "properties": {
            "writer": {"type": "string"}, "recipient": {"type": "string"},
            "date": {"type": "string"}, "place": {"type": "string"}, "setting": {"type": "string"}},
            "required": ["writer", "recipient", "date", "place", "setting"]},
        "entities": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string"}, "canonical_name": {"type": "string"},
            "type": {"type": "string", "enum": ["person", "place", "organization", "event"]},
            "who_or_what": {"type": "string"}, "role_in_letter": {"type": "string"},
            "modern_location": {"type": "string"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]}},
            "required": ["name", "canonical_name", "type", "who_or_what", "role_in_letter", "confidence"]}},
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["letter", "entities", "questions"],
}


def gemini_ready():
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


def elevenlabs_ready():
    return bool(os.getenv("ELEVENLABS_API_KEY"))


# ---------- cache ----------

def _key(*parts):
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
        h.update(b"\x00")
    return h.hexdigest()[:32]


def _cache_get(stage, key):
    path = CACHE / stage / f"{key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _cache_put(stage, key, value):
    (CACHE / stage).mkdir(parents=True, exist_ok=True)
    (CACHE / stage / f"{key}.json").write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")
    return value


def _prompt(name):
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


# ---------- samples (demo mode) ----------

def list_samples():
    out = []
    for d in sorted(p for p in SAMPLES.iterdir() if p.is_dir()):
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        out.append({"id": d.name, **meta})
    return out


def sample_stage(sample_id, stage):
    path = SAMPLES / sample_id / f"{stage}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _default_sample():
    return list_samples()[0]["id"]


# ---------- stage 0: image prep ----------

def prepare_image(raw):
    """Fix phone rotation, downscale to 2000px long side, re-encode as JPEG."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img.thumbnail((2000, 2000))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


# ---------- Gemini ----------

def _gemini_json(model, system, contents, schema):
    from google import genai
    from google.genai import types

    client = genai.Client()
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0,
        response_mime_type="application/json",
        response_json_schema=schema,
    )
    resp = client.models.generate_content(model=model, contents=contents, config=config)
    return json.loads(resp.text)


def transcribe(raw_image):
    jpeg = prepare_image(raw_image)
    key = _key("transcribe", TRANSCRIBE_MODEL, _prompt("transcribe"), jpeg)
    if cached := _cache_get("transcribe", key):
        return {"id": key, **cached}
    if not gemini_ready():
        return {"id": key, "demo": True, **sample_stage(_default_sample(), "transcribe")}
    from google.genai import types

    result = _gemini_json(TRANSCRIBE_MODEL, _prompt("transcribe"),
                          [types.Part.from_bytes(data=jpeg, mime_type="image/jpeg")], TRANSCRIBE_SCHEMA)
    return {"id": key, **_cache_put("transcribe", key, result)}


def modernize(lines, sample_id=None):
    if sample_id:
        return sample_stage(sample_id, "modernize")
    text = "\n".join(lines)
    key = _key("modernize", TEXT_MODEL, _prompt("modernize"), text)
    if cached := _cache_get("modernize", key):
        return cached
    if not gemini_ready():
        return {"demo": True, **sample_stage(_default_sample(), "modernize")}
    return _cache_put("modernize", key, _gemini_json(TEXT_MODEL, _prompt("modernize"), [text], MODERNIZE_SCHEMA))


def context(modern_text, metadata=None, sample_id=None):
    if sample_id:
        return sample_stage(sample_id, "context")
    payload = modern_text + ("\n\nKnown metadata: " + json.dumps(metadata) if metadata else "")
    key = _key("context", TEXT_MODEL, _prompt("context"), payload)
    if cached := _cache_get("context", key):
        return cached
    if not gemini_ready():
        return {"demo": True, **sample_stage(_default_sample(), "context")}
    return _cache_put("context", key, _gemini_json(TEXT_MODEL, _prompt("context"), [payload], CONTEXT_SCHEMA))


# ---------- ElevenLabs ----------

def words_from_alignment(text, alignment):
    """Collapse ElevenLabs per-character timings into per-word timings.

    Words are the whitespace-separated tokens of `text`, in order, which is exactly how the
    frontend splits the same text into highlightable spans.
    """
    chars = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    words = []
    for m in re.finditer(r"\S+", text):
        a, b = m.start(), min(m.end(), len(chars)) - 1
        if a >= len(chars):
            break
        words.append({"word": m.group(), "start": starts[a], "end": ends[b]})
    return words


def narrate(text, voice_id=None):
    """Returns {"audio": url or None, "words": [...]} ; audio None means use browser speech."""
    voice_id = voice_id or DEFAULT_VOICE
    key = _key("narrate", TTS_MODEL, voice_id, text)
    audio_path = CACHE / "audio" / f"{key}.mp3"
    if (cached := _cache_get("narrate", key)) and audio_path.exists():
        return cached
    if not elevenlabs_ready():
        return {"audio": None, "words": [], "demo": True}
    resp = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
        json={"text": text, "model_id": TTS_MODEL},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    audio_path.write_bytes(base64.b64decode(data["audio_base64"]))
    return _cache_put("narrate", key, {"audio": f"/api/audio/{key}.mp3",
                                       "words": words_from_alignment(text, data["alignment"])})
