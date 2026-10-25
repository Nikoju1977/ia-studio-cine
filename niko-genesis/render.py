"""Durable FFmpeg final-film renderer for NIKO STUDIO.

Standard library only. Requires ffmpeg/ffprobe executables. All paths are
server-generated; never pass user-supplied paths, filters, or shell commands.
"""
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import threading
import time

STORE = Path(os.environ.get("NIKO_MEDIA_DIR", str(Path(__file__).resolve().parent / ".niko-media"))).resolve()
MAX_CLIPS = 40
MAX_CLIP_BYTES = 120_000_000
MAX_TOTAL_BYTES = 1_200_000_000
MAX_DURATION = 120
ID_RE = re.compile(r"^[a-f0-9]{24}$")


def clean_text(value, limit=180):
    return " ".join(str(value or "").split())[:limit]


def safe_id(value):
    if not ID_RE.fullmatch(str(value or "")):
        raise ValueError("Identifiant de rendu invalide")
    return value


def srt_stamp(seconds):
    n = round(float(seconds) * 1000)
    h, n = divmod(n, 3_600_000)
    m, n = divmod(n, 60_000)
    s, ms = divmod(n, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def exec_ffmpeg(argv, timeout=900):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg/ffprobe absent du serveur") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Délai FFmpeg dépassé") from exc
    if p.returncode:
        raise RuntimeError("FFmpeg : " + (p.stderr or "")[-900:])
    return p.stdout


def info(path):
    payload = exec_ffmpeg(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type", "-of", "json", str(path)], timeout=35
    )
    data = json.loads(payload)
    streams = [s.get("codec_type") for s in data.get("streams", [])]
    dur = float(data.get("format", {}).get("duration") or 0)
    if "video" not in streams or not (0.1 < dur <= MAX_DURATION):
        raise ValueError("Rush vidéo invalide ou durée supérieure à 120 secondes")
    return dur, "audio" in streams


class RenderStore:
    def __init__(self, root=STORE):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.running = set()

    def directory(self, render_id):
        return self.root / safe_id(render_id)

    def read(self, render_id):
        f = self.directory(render_id) / "state.json"
        if not f.is_file():
            raise ValueError("Rendu introuvable")
        return json.loads(f.read_text(encoding="utf-8"))

    def _write(self, render_id, value):
        folder = self.directory(render_id)
        f = folder / "state.json"
        tmp = folder / "state.tmp"
        tmp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, f)

    def create(self, request):
        clips = request.get("clips") or []
        if not isinstance(clips, list) or not 1 <= len(clips) <= MAX_CLIPS:
            raise ValueError("Le montage exige entre 1 et 40 plans")
        manifest = []
        for i, shot in enumerate(clips):
            if not isinstance(shot, dict):
                raise ValueError("Plan invalide")
            manifest.append({
                "index": i,
                "label": clean_text(shot.get("label")),
                "line": clean_text(shot.get("line"), 350),
            })
        ratio = request.get("ratio", "16:9")
        if ratio not in ("16:9", "9:16", "1:1"):
            raise ValueError("Ratio inconnu")
        rid = secrets.token_hex(12)
        with self.lock:
            folder = self.directory(rid)
            folder.mkdir(parents=True, exist_ok=False)
            state = {
                "id": rid,
                "title": clean_text(request.get("title") or "Mon film", 100),
                "ratio": ratio,
                "clips": manifest,
                "uploaded": [],
                "state": "upload",
                "stage": "Réception des rushes",
                "progress": 0,
                "created": time.time(),
            }
            self._write(rid, state)
        return self.public(state)

    def public(self, state):
        return {k: state.get(k) for k in
                ("id", "title", "ratio", "state", "stage", "progress", "uploaded", "error")}

    def upload(self, rid, index, stream, length):
        rid = safe_id(rid)
        try:
            n = int(index)
        except (TypeError, ValueError):
            raise ValueError("Index invalide")
        if length < 100 or length > MAX_CLIP_BYTES:
            raise ValueError("Un rush doit peser entre 100 octets et 120 Mo")
        with self.lock:
            d = self.read(rid)
            if d["state"] != "upload" or n < 0 or n >= len(d["clips"]):
                raise ValueError("Rendu non modifiable ou numéro de plan invalide")
            folder = self.directory(rid)
            previous = folder / f"clip-{n:03d}.bin"
            existing = sum((folder / f"clip-{i:03d}.bin").stat().st_size
                           for i in d["uploaded"] if i != n and (folder / f"clip-{i:03d}.bin").exists())
            if existing + length > MAX_TOTAL_BYTES:
                raise ValueError("Taille totale des rushes excessive")
            temp = folder / f"clip-{n:03d}.part"
            try:
                with temp.open("wb") as out:
                    remaining = length
                    while remaining:
                        chunk = stream.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("Téléversement incomplet")
                        out.write(chunk)
                        remaining -= len(chunk)
                info(temp)  # fail early, before accepting a corrupt file
                os.replace(temp, previous)
            finally:
                temp.unlink(missing_ok=True)
            d["uploaded"] = sorted(set(d["uploaded"] + [n]))
            d["progress"] = int(20 * len(d["uploaded"]) / len(d["clips"]))
            self._write(rid, d)
        return self.public(d)

    def start(self, rid):
        rid = safe_id(rid)
        with self.lock:
            data = self.read(rid)
            if data["state"] == "running" and rid in self.running:
                return self.public(data)
            if data["state"] not in ("upload", "interrupted", "error", "running"):
                raise ValueError("Ce rendu ne peut pas être relancé")
            if len(data["uploaded"]) != len(data["clips"]):
                raise ValueError("Tous les rushes ne sont pas chargés")
            if rid in self.running:
                return self.public(data)
            data.update(state="running", stage="Initialisation FFmpeg", progress=20)
            data.pop("error", None)
            self._write(rid, data)
            self.running.add(rid)
            thread = threading.Thread(target=self._worker, args=(rid,), daemon=True)
            thread.start()
            return self.public(data)

    def status(self, rid):
        with self.lock:
            data = self.read(rid)
            if data["state"] == "running" and rid not in self.running:
                data.update(state="interrupted", stage="Rendu interrompu : relance possible")
                self._write(rid, data)
            return self.public(data)

    def _progress(self, rid, progress, stage):
        with self.lock:
            data = self.read(rid)
            data.update(progress=progress, stage=stage)
            self._write(rid, data)

    def _worker(self, rid):
        try:
            self.render(rid)
            with self.lock:
                d = self.read(rid)
                d.update(state="done", stage="Film MP4 prêt", progress=100)
                self._write(rid, d)
        except Exception as exc:
            with self.lock:
                d = self.read(rid)
                d.update(state="error", stage="Échec du rendu", error=clean_text(exc, 350))
                self._write(rid, d)
        finally:
            with self.lock:
                self.running.discard(rid)

    def render(self, rid):
        d = self.read(rid)
        folder = self.directory(rid)
        dims = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)}
        w, h = dims[d["ratio"]]
        durations = []
        concat_lines = []
        for i, shot in enumerate(d["clips"]):
            src = folder / f"clip-{i:03d}.bin"
            duration, has_audio = info(src)
            normalized = folder / f"ready-{i:03d}.mp4"
            common = [
                "-map", "0:v:0", "-vf",
                f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            ]
            if has_audio:
                command = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(src)] + common + [
                    "-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2",
                    "-b:a", "128k", "-movflags", "+faststart", str(normalized)]
            else:
                command = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(src),
                           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"] + common + [
                    "-map", "1:a:0", "-shortest", "-c:a", "aac", "-ar", "48000",
                    "-ac", "2", "-b:a", "128k", "-movflags", "+faststart", str(normalized)]
            exec_ffmpeg(command, timeout=360)
            normalized_duration, _ = info(normalized)
            durations.append(normalized_duration)
            concat_lines.append(f"file '{normalized.name}'")
            self._progress(rid, 20 + int(60 * (i + 1) / len(d["clips"])),
                           f"Encodage plan {i+1}/{len(d['clips'])}")
        concat = folder / "concat.txt"
        concat.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
        joined = folder / "joined.mp4"
        exec_ffmpeg(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                     "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(joined)])
        self._progress(rid, 87, "Assemblage et sous-titres")
        cues = []
        start = 0.0
        for i, (shot, duration) in enumerate(zip(d["clips"], durations)):
            line = clean_text(shot["line"], 350)
            if line:
                cues.append(f"{len(cues)+1}\n{srt_stamp(start)} --> {srt_stamp(start+duration)}\n{line}\n")
            start += duration
        srt = folder / "subtitles.srt"
        srt.write_text("\n".join(cues), encoding="utf-8")
        result = folder / "film.mp4"
        if cues:
            exec_ffmpeg(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(joined),
                         "-i", str(srt), "-map", "0:v:0", "-map", "0:a:0", "-map", "1:s:0",
                         "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
                         "-metadata:s:s:0", "language=fra", "-movflags", "+faststart",
                         str(result)])
        else:
            os.replace(joined, result)
        info(result)
        self._progress(rid, 99, "Finalisation")

    def result_file(self, rid, subtitle=False):
        state = self.status(rid)
        if state["state"] != "done":
            raise ValueError("Le rendu n'est pas terminé")
        path = self.directory(rid) / ("subtitles.srt" if subtitle else "film.mp4")
        if not path.is_file():
            raise ValueError("Fichier de sortie absent")
        return path

