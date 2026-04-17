"""Unit tests — FFmpeg transcoding wrapper (app/services/transcoder.py)."""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.transcoder import TranscodeError, probe_duration, transcode


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fake_ffmpeg_success(cmd: list, **kwargs) -> MagicMock:  # type: ignore[type-arg]
    """Simulate a successful ffmpeg run: create the output file."""
    # Output file is the last positional argument
    output = Path(cmd[-1])
    output.write_bytes(b"\x00" * 8)  # minimal placeholder
    result = MagicMock()
    result.returncode = 0
    result.stderr = ""
    return result


def _fake_ffmpeg_failure(**kwargs) -> MagicMock:  # type: ignore[type-arg]
    result = MagicMock()
    result.returncode = 1
    result.stderr = "Conversion failed!"
    return result


# ── transcode() ───────────────────────────────────────────────────────────────

class TestTranscode:
    def test_raises_file_not_found_for_missing_input(self, tmp_path: Path) -> None:
        missing = tmp_path / "ghost.mp4"
        with pytest.raises(FileNotFoundError, match="ghost.mp4"):
            transcode(missing)

    def test_returns_path_with_tc_suffix(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 16)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=_fake_ffmpeg_success),
        ):
            out = transcode(src)

        assert out.name == "clip_tc.mp4"
        assert out.parent == tmp_path

    def test_raises_transcode_error_on_ffmpeg_failure(self, tmp_path: Path) -> None:
        src = tmp_path / "bad.mp4"
        src.write_bytes(b"\x00" * 8)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", return_value=_fake_ffmpeg_failure()),
        ):
            with pytest.raises(TranscodeError, match="Conversion failed"):
                transcode(src)

    def test_raises_transcode_error_when_ffmpeg_not_found(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)

        with patch("app.services.transcoder._ffmpeg_bin", side_effect=TranscodeError("ffmpeg not found")):
            with pytest.raises(TranscodeError, match="ffmpeg not found"):
                transcode(src)

    def test_raises_transcode_error_on_os_error(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=OSError("no such file")),
        ):
            with pytest.raises(TranscodeError, match="Failed to launch ffmpeg"):
                transcode(src)

    def test_delete_source_removes_input_after_success(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 16)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=_fake_ffmpeg_success),
        ):
            transcode(src, delete_source=True)

        assert not src.exists(), "Source file should be deleted when delete_source=True"

    def test_source_preserved_when_delete_source_false(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 16)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=_fake_ffmpeg_success),
        ):
            transcode(src, delete_source=False)

        assert src.exists(), "Source file should be preserved by default"

    def test_command_includes_720p_scale_filter(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)
        captured: list[list[str]] = []

        def capture_cmd(cmd: list, **kwargs) -> MagicMock:  # type: ignore[type-arg]
            captured.append(cmd)
            return _fake_ffmpeg_success(cmd)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=capture_cmd),
        ):
            transcode(src)

        cmd = captured[0]
        assert "-vf" in cmd
        scale_idx = cmd.index("-vf") + 1
        assert "scale=" in cmd[scale_idx]

    def test_command_sets_30fps(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)
        captured: list[list[str]] = []

        def capture_cmd(cmd: list, **kwargs) -> MagicMock:  # type-ignore[type-arg]
            captured.append(cmd)
            return _fake_ffmpeg_success(cmd)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=capture_cmd),
        ):
            transcode(src)

        cmd = captured[0]
        assert "-r" in cmd
        r_idx = cmd.index("-r") + 1
        assert cmd[r_idx] == "30"

    def test_command_uses_libx264(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)
        captured: list[list[str]] = []

        def capture_cmd(cmd: list, **kwargs) -> MagicMock:  # type: ignore[type-arg]
            captured.append(cmd)
            return _fake_ffmpeg_success(cmd)

        with (
            patch("app.services.transcoder._ffmpeg_bin", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=capture_cmd),
        ):
            transcode(src)

        assert "libx264" in captured[0]


# ── probe_duration() ──────────────────────────────────────────────────────────

class TestProbeDuration:
    def test_returns_float_duration(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)

        mock_result = MagicMock()
        mock_result.stdout = "12.345\n"
        mock_result.returncode = 0

        with (
            patch("shutil.which", return_value="/usr/bin/ffprobe"),
            patch("subprocess.run", return_value=mock_result),
        ):
            duration = probe_duration(src)

        assert duration == pytest.approx(12.345)

    def test_returns_zero_when_ffprobe_missing(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)

        with patch("shutil.which", return_value=None):
            assert probe_duration(src) == 0.0

    def test_returns_zero_on_invalid_output(self, tmp_path: Path) -> None:
        src = tmp_path / "clip.mp4"
        src.write_bytes(b"\x00" * 8)

        mock_result = MagicMock()
        mock_result.stdout = "N/A\n"

        with (
            patch("shutil.which", return_value="/usr/bin/ffprobe"),
            patch("subprocess.run", return_value=mock_result),
        ):
            assert probe_duration(src) == 0.0
