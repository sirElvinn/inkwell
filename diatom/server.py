"""
server.py - serve the frontend and measure an uploaded SEM image.

    .venv/Scripts/python server.py

Then open http://127.0.0.1:8899/frontend/
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

from run import process
from scale import IMG_EXT

ROOT = os.path.dirname(os.path.abspath(__file__))
ANALYZE = threading.Lock()
DATA_ROOT = os.environ.get(
    "DIATOM_DATA",
    r"C:\Users\Menilik\Downloads\2026 Hackathon\2026 Hackathon",
)
PORT = 8899
BACKENDS = {"fastsam", "sam", "circles"}
SAMPLES = {"auto", "name", "thaps", "didymo", "mixed"}


def jsonable(value):
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items() if not str(k).startswith("_")}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if hasattr(value, "item"):
        return jsonable(value.item())
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def parse_form(body: bytes, content_type: str) -> dict:
    match = re.search(r'boundary=(?:"([^"]+)"|([^;\s]+))', content_type or "")
    if not match:
        raise ValueError("Upload was not a form.")
    boundary = (match.group(1) or match.group(2)).encode()
    fields = {}
    for chunk in body.split(b"--" + boundary):
        if chunk.startswith(b"\r\n"):
            chunk = chunk[2:]
        chunk = chunk.removesuffix(b"\r\n")
        if chunk in (b"", b"--"):
            continue
        if chunk.endswith(b"--"):
            chunk = chunk[:-2].removesuffix(b"\r\n")
        header, sep, data = chunk.partition(b"\r\n\r\n")
        if not sep:
            continue
        text = header.decode("utf-8", "replace")
        name = re.search(r'name="([^"]+)"', text)
        if not name:
            continue
        filename = re.search(r'filename="([^"]*)"', text)
        if filename:
            fields[name.group(1)] = {"filename": filename.group(1), "data": data}
        else:
            fields[name.group(1)] = data.decode("utf-8", "replace").strip()
    return fields


def attach_dataset_txt(image_path: str, original_name: str) -> bool:
    """Hitachi scale lives in a sibling .txt. Use one from the dataset if the upload omitted it."""
    dest = os.path.splitext(image_path)[0] + ".txt"
    if os.path.exists(dest) or not os.path.isdir(DATA_ROOT):
        return os.path.exists(dest)
    wanted = os.path.splitext(os.path.basename(original_name))[0] + ".txt"
    for dirpath, _, files in os.walk(DATA_ROOT):
        for name in files:
            if name.lower() == wanted.lower():
                shutil.copyfile(os.path.join(dirpath, name), dest)
                return True
    return False


def write_preview(image_path: str, png_path: str) -> None:
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    with Image.open(image_path) as im:
        im.convert("RGB").save(png_path, "PNG")


def measure(form: dict) -> dict:
    uploaded = form.get("file")
    if not isinstance(uploaded, dict) or not uploaded.get("data"):
        raise ValueError("Choose an image file.")
    backend = form.get("backend") or "fastsam"
    sample = form.get("sample_type") or "auto"
    if backend not in BACKENDS:
        raise ValueError("Unknown segmentation option.")
    if sample not in SAMPLES:
        raise ValueError("Unknown sample option.")
    filename = os.path.basename(uploaded["filename"] or "upload.tif")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in IMG_EXT:
        raise ValueError("Use a JPG, PNG, or TIFF.")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename)
    rel = f"{time.strftime('%Y%m%d-%H%M%S')}_{safe}"
    inbox = os.path.join(ROOT, "uploads", "inbox")
    os.makedirs(inbox, exist_ok=True)
    path = os.path.join(inbox, rel)
    with open(path, "wb") as fh:
        fh.write(uploaded["data"])
    sidecar = form.get("sidecar")
    if isinstance(sidecar, dict) and sidecar.get("data"):
        with open(os.path.splitext(path)[0] + ".txt", "wb") as fh:
            fh.write(sidecar["data"])
    else:
        attach_dataset_txt(path, filename)

    with ANALYZE:
        shells, _pores, img = process(path, rel, backend, os.path.join(ROOT, "uploads"), sample)
    overlay_name = rel.rsplit(".", 1)[0] + ".png"
    overlay_file = os.path.join(ROOT, "uploads", "overlays", overlay_name)
    if os.path.exists(overlay_file):
        overlay = f"uploads/overlays/{overlay_name}"
    else:
        preview = os.path.join(ROOT, "uploads", "previews", overlay_name)
        write_preview(path, preview)
        overlay = f"uploads/previews/{overlay_name}"
    note = img.get("note")
    if note == "no scale - skipped":
        note = ("No scale in this file, so it was not measured. "
                "Phenom images include the scale. A Hitachi image also needs its matching .txt.")
    return jsonable({
        "id": f"upload::{rel}",
        "image": filename,
        "overlay": overlay,
        "backend": backend,
        "sample_type": img.get("sample_type"),
        "sample_type_source": img.get("sample_type_source"),
        "sample_type_confidence": img.get("sample_type_confidence"),
        "um_per_px": img.get("um_per_px"),
        "scale_source": img.get("scale_source"),
        "scale_check": img.get("scale_check"),
        "n_frustules": img.get("n_frustules") or 0,
        "n_intact": img.get("n_intact"),
        "n_cracked": img.get("n_cracked"),
        "n_fragmented": img.get("n_fragmented"),
        "median_length_um": img.get("median_length_um"),
        "pore_note": img.get("pore_note") or note,
        "note": note,
        "seconds": img.get("seconds"),
        "shells": shells,
        "preview": False,
    })


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/analyze":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            run = measure(parse_form(body, self.headers.get("Content-Type", "")))
            self._json(200, run)
            print(f"analyzed {run['image']}: {run['n_frustules']} shells ({run.get('seconds')} s)", flush=True)
        except ValueError as exc:
            self._json(400, {"error": str(exc)})
        except Exception as exc:
            self._json(500, {"error": f"Analysis failed: {exc}"})

    def _json(self, status: int, payload: dict):
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main():
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Diatom SEM  http://127.0.0.1:{PORT}/frontend/", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
