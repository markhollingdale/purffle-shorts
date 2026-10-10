import os
import shutil
from pathlib import Path

import pytest

from purffle_shorts.config import Settings

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Tests never see the developer's real keys or .env settings, and nothing a test loads leaks out.

    A test that calls ``load_env()`` (e.g. through ``main``) can pick up the developer's real ``.env`` via
    python-dotenv's fallback search, so the whole environment is snapshotted and restored around each test."""
    snapshot = dict(os.environ)
    for key in list(os.environ):
        if key.endswith("_API_KEY") or key.startswith(("LLM_", "ANTHROPIC_", "TTS_", "CAPTION_")) or key in (
                "OLLAMA_HOST", "UPLOAD", "ASPECT", "RESOLUTION", "TARGET_SECONDS", "SCRIPT_REVIEW", "ALSO_LANGUAGES",
                "RSS_FEEDS", "NOTIFY_WEBHOOK", "LEARN_FROM_STATS", "PURFFLE_HOME", "KEEP_WORK"):
            monkeypatch.delenv(key, raising=False)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.fixture
def settings(tmp_path) -> Settings:
    font = next((f for f in FONT_CANDIDATES if Path(f).exists()), "")
    return Settings(output_dir=str(tmp_path / "out"), data_dir=str(tmp_path / "data"), caption_font=font,
                    upload=False)


needs_ffmpeg = pytest.mark.skipif(
    not (shutil.which("ffmpeg") or __import__("importlib").util.find_spec("imageio_ffmpeg")),
    reason="ffmpeg not available")
