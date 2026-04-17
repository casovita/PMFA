"""FFmpeg transcoding wrapper.

Normalizes uploaded videos to 720p, 30 FPS, H.264 before inference.
All transcoding is synchronous — call from a background task, not a request handler.

Requirements:
  - ffmpeg ≥ 6 must be on PATH (or set PMFA_FFMPEG_PATH env var)
  - Output file is written alongside the source with a _transcoded suffix

Usage:
    output_path = transcode(input_path)
    # pass output_path to the inference pipeline
    output_path.unlink()  # clean up when done
"""

import logging
import shutil
import subprocess
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)


class TranscodeError(Exception):
    """Raised when ffmpeg exits with a non-zero return code."""


def _ffmpeg_bin() -> str:
    """Return the ffmpeg binary path. Respects PMFA_FFMPEG_PATH if set."""
    settings = get_settings()
    override = getattr(settings, "ffmpeg_path", None)
    if override:
        return str(override)
    binary = shutil.which("ffmpeg")
    if binary is None:
        raise TranscodeError(
            "ffmpeg not found on PATH. Install ffmpeg ≥ 6 or set PMFA_FFMPEG_PATH."
        )
    return binary


def transcode(input_path: Path, *, delete_source: bool = False) -> Path:
    """Transcode a video to 720p · 30 FPS · H.264 · AAC.

    Args:
        input_path: Absolute path to the uploaded video file.
        delete_source: If True, remove the source file after a successful transcode.

    Returns:
        Path to the transcoded output file (sibling of input with _tc suffix).

    Raises:
        FileNotFoundError: If input_path does not exist.
        TranscodeError: If ffmpeg exits with a non-zero return code.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"Input video not found: {input_path}")

    output_path = input_path.with_stem(input_path.stem + "_tc").with_suffix(".mp4")

    cmd = [
        _ffmpeg_bin(),
        "-y",                          # overwrite output if it exists
        "-i", str(input_path),
        # Video: scale to 720p (preserve aspect ratio), H.264, CRF 23
        "-vf", "scale='min(1280,iw)':'-2'",
        "-r", "30",                    # output frame rate
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        # Audio: AAC 128k (required by MP4 container; stripped if absent)
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",     # web-optimized MP4 atom order
        str(output_path),
    ]

    logger.info("Transcoding %s → %s", input_path.name, output_path.name)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        raise TranscodeError(f"Failed to launch ffmpeg: {exc}") from exc

    if result.returncode != 0:
        raise TranscodeError(
            f"ffmpeg failed (exit {result.returncode}):\n{result.stderr.strip()}"
        )

    logger.info("Transcode complete: %s (%.1f MB)", output_path.name, output_path.stat().st_size / 1e6)

    if delete_source:
        input_path.unlink(missing_ok=True)

    return output_path


def probe_duration(input_path: Path) -> float:
    """Return video duration in seconds via ffprobe, or 0.0 on failure."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        return 0.0
    cmd = [
        ffprobe,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(input_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return float(result.stdout.strip())
    except (OSError, ValueError):
        return 0.0
