# STUDIO NIKO · AI VFX — Workflow Library

This folder is intentionally empty of untested model graphs. Unlike fake demos, AI VFX jobs run **only** after installing actual ComfyUI nodes and model weights, and exporting API JSON into this directory.

File names recognised:

| file | Suggested technology | What it edits |
|--|--|--|
| `remove.json` | Netflix VOID with SAM 3 | Moving-object and interaction removal |
| `replace.json` | Wan VACE or LTX Edit | Character or object replacement |
| `particles.json` | Model-directed VFX transformation | Subject disintegration / particle sequence |
| `relight.json` | Video relighting graph | Lighting |
| `cutout.json` | SAM 3 / SAM2 + alpha pipeline | Video rotoscope/matte |
| `depth.json` | Depth Anything 3 + compositor | Depth-aware effects |
| `upscale.json` | SeedVR2 | Temporal enhancement |
| `stylize.json` | VACE / LTX editing workflow | Cinematic style conversion |

## Required fields

1. Export a **ComfyUI API-format** workflow, not a UI-only graph.
2. Replace the video input filename in `LoadVideo` / `VHS_LoadVideo` with `{{INPUT_FILE}}` or `{{SOURCE_VIDEO}}`.
3. Replace the instruction field in your model's text conditioning node with `{{PROMPT}}`; optional tokens: `{{SEED}}`, `{{NEGATIVE}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{FPS}}`, `{{FRAMES}}`, `{{DURATION}}`.
4. Save a **real MP4 or WebM** via an appropriate SaveVideo output node. A single image is not accepted as a video VFX result.
5. Perform a brief end-to-end test on a short clip with your exact ComfyUI version before working on full films.

The Studio runs locally via `COMFY_URL`, uploads the source video to ComfyUI's `input` directory through its `/upload/image` API route (this name is retained by the upstream API for other media), injects the uploaded filename into the workflow, submits to `/prompt`, polls `/history/{prompt_id}` and downloads `/view` outputs. The final result is conformed with FFmpeg and verified with FFprobe at the chosen 4K resolution.

Never expose the ComfyUI port publicly. Access the Studio API over authenticated HTTPS from a mobile phone. **Weights are not shipped** and individual model licenses must be checked (some are open-weight but not OSI open-source).
