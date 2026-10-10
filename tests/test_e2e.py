"""Full offline render: silent voice, generated backgrounds, real ffmpeg. No network needed."""

import json

import pytest

from purffle_shorts import ffmpeg
from purffle_shorts.pipeline import Studio

from .conftest import needs_ffmpeg


@needs_ffmpeg
@pytest.mark.parametrize("renderer", ["pillow", "ass"])
def test_offline_render(settings, monkeypatch, renderer):
    if renderer == "ass" and not ffmpeg.has_filter("ass"):
        pytest.skip("ffmpeg built without libass")
    monkeypatch.setenv("CAPTION_RENDERER", renderer)
    s = settings.with_overrides(offline=True, tts_engine="silent", resolution=(360, 640), fps=24,
                                transition="random", music_volume=0.0)
    r = Studio(s).make()
    assert r.ok, r.error
    info = ffmpeg.probe(r.video)
    assert (info["width"], info["height"]) == (360, 640)
    assert info["has_audio"] and info["duration"] > 5
    for name in ("cover.jpg", "captions.srt", "metadata.json", "script.json"):
        assert (r.folder / name).exists()
    meta = json.loads((r.folder / "metadata.json").read_text())
    assert meta["title"].endswith("#shorts") and meta["resolution"] == "360x640"
    assert not (r.folder / "work").exists()
    hist = Studio(s).history.recent(1)[0]
    assert hist["status"] == "rendered"


def test_footage_is_kept_and_reloadable(settings, tmp_path):
    from purffle_shorts.media import MediaItem
    from purffle_shorts.pipeline import Studio
    studio = Studio(settings)
    folder = tmp_path / "vid"
    (folder / "work" / "media").mkdir(parents=True)
    src = folder / "work" / "media" / "scene00_pexels_7.mp4"
    src.write_bytes(b"clip")
    own = tmp_path / "own.jpg"
    own.write_bytes(b"img")
    by_scene = {0: MediaItem("pexels", "7", "video", url="https://example/x", path=src, query="cats"),
                1: MediaItem("local", str(own), "image", path=own)}
    studio._persist_footage(folder, folder / "work", by_scene)
    assert (folder / "footage").is_dir() and not src.exists()
    manifest = json.loads((folder / "media.json").read_text())
    assert manifest["scenes"]["0"]["source"] == "pexels" and (folder / manifest["scenes"]["0"]["file"]).exists()
    back = studio._load_media_map(folder)
    assert back[0].source == "pexels" and back[0].path.exists()
    assert back[1].path == own          # your own media is referenced in place, not copied


@needs_ffmpeg
def test_rerender_reuses_saved_footage(settings, tmp_path, monkeypatch):
    from PIL import Image

    from purffle_shorts import pipeline as P
    media = tmp_path / "media"
    media.mkdir()
    Image.new("RGB", (1080, 1920), (30, 40, 80)).save(media / "octopus.png")
    f = tmp_path / "s.json"
    f.write_text(json.dumps({"title": "Octopus", "scenes": [
        {"narration": "Octopuses are clever and have three hearts.", "search_query": "octopus"}]}))
    s = settings.with_overrides(offline=True, tts_engine="silent", resolution=(360, 640), fps=24,
                                music_volume=0.0, media_dir=str(media), visual_sources=["local"])
    studio = P.Studio(s)
    r = studio.make(script_file=f)
    assert r.ok, r.error
    assert (r.folder / "media.json").exists()
    assert json.loads((r.folder / "media.json").read_text())["scenes"]["0"]["source"] == "local"

    def boom(*a, **k):
        raise AssertionError("a re-render must not search for new footage")
    monkeypatch.setattr(P.Visuals, "for_scenes", boom)
    r2 = studio.rerender(r.record_id)
    assert r2.ok, r2.error
    assert r2.record_id == r.record_id and r2.folder == r.folder and r2.video.exists()


@needs_ffmpeg
def test_render_from_script_file_needs_no_llm(settings, tmp_path):
    f = tmp_path / "script.json"
    f.write_text(json.dumps({"title": "Honey Never Spoils", "hook_text": "3000 YEARS OLD",
                             "scenes": [{"narration": "Archaeologists found honey in Egyptian tombs.",
                                         "search_query": "honey jar"},
                                        {"narration": "It was still safe to eat.", "search_query": "honey"}]}))
    # Not offline, yet no LLM key is set: a script file must not need one.
    s = settings.with_overrides(tts_engine="silent", resolution=(360, 640), fps=24, music_volume=0.0)
    r = Studio(s).make(script_file=f)
    assert r.ok, r.error
    meta = json.loads((r.folder / "metadata.json").read_text())
    assert meta["title"] == "Honey Never Spoils #shorts"
    assert meta["llm"] == "script file" and meta["source"] == "script"
