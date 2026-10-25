"""End-to-end render checks with synthetic clips (no IA/GPU required).

Run: python -m unittest discover -s niko-genesis/tests -v
"""
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from render import RenderStore, info, srt_stamp


def sample(filename, audio=False):
    command = [
        "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=12:d=1.2",
    ]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:duration=1.2"]
    command += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        command += ["-c:a", "aac", "-shortest"]
    command += [str(filename)]
    subprocess.run(command, check=True, capture_output=True)


class RenderTests(unittest.TestCase):
    def test_srt_timecode(self):
        self.assertEqual(srt_stamp(3661.223), "01:01:01,223")

    def test_protect_uploads(self):
        with tempfile.TemporaryDirectory() as directory:
            store = RenderStore(directory)
            job = store.create({"title": "Sécurité", "ratio": "16:9", "clips": [{"line": "Salut"}]})
            with self.assertRaises(ValueError):
                store.upload(job["id"], 9, io.BytesIO(b"x"*200), 200)
            with self.assertRaises(ValueError):
                store.upload(job["id"], 0, io.BytesIO(b"x"*200), 200)
            with self.assertRaises(ValueError):
                store.start(job["id"])
            with self.assertRaises(ValueError):
                store.status("../etc/passwd")

    def test_real_mp4_audio_and_french_subtitles(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory)
            a, b = folder / "a.mp4", folder / "b.mp4"
            sample(a)
            sample(b, audio=True)
            store = RenderStore(folder / "storage")
            d = store.create({
                "title": "Film test",
                "ratio": "16:9",
                "clips": [{"label": "Ouverture", "line": "Bonjour."},
                          {"label": "Suite", "line": "Le cinéma continue."}],
            })
            key = d["id"]
            for index, path in enumerate((a, b)):
                raw = path.read_bytes()
                status = store.upload(key, index, io.BytesIO(raw), len(raw))
                self.assertIn(index, status["uploaded"])
            store.start(key)
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                result = store.status(key)
                if result["state"] in ("done", "error"):
                    break
                time.sleep(0.3)
            self.assertEqual(result["state"], "done", result.get("error", result))
            dest = store.result_file(key)
            self.assertGreater(dest.stat().st_size, 2000)
            self.assertGreater(info(dest)[0], 2)
            subtitles = store.result_file(key, subtitle=True).read_text(encoding="utf-8")
            self.assertIn("Bonjour.", subtitles)
            self.assertIn("Le cinéma continue.", subtitles)
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,codec_type",
                 "-of", "json", str(dest)],
                check=True, capture_output=True, text=True,
            )
            codecs = json.loads(probe.stdout)["streams"]
            self.assertIn("h264", [v["codec_name"] for v in codecs])
            self.assertIn("aac", [v["codec_name"] for v in codecs])
            self.assertIn("mov_text", [v["codec_name"] for v in codecs])
            # Completed films remain accessible after a process restart
            another_store = RenderStore(folder / "storage")
            self.assertEqual(another_store.status(key)["state"], "done")
            self.assertTrue(another_store.result_file(key).is_file())


if __name__ == "__main__":
    unittest.main()
