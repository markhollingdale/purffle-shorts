"""Writing Studio-editable settings back to .env: only named keys change, secrets and comments survive."""

import os

from purffle_shorts.config import (
    EDITABLE,
    Settings,
    editable_values,
    format_env_value,
    load_env,
    save_env,
)

WRITTEN = ("WATERMARK", "END_CTA", "CAPTION_MAX_WORDS", "KEN_BURNS", "MUSIC_VOLUME", "HOOK_OVERLAY")


def _clean():
    for key in WRITTEN:
        os.environ.pop(key, None)


def test_save_env_updates_only_named_keys(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# my settings\n"
        "LLM_API_KEY=secret-value\n"
        "WATERMARK=\n"
        "# a comment stays\n"
        "END_CTA=Follow for more!\n"
        "UPLOAD=true\n",
        encoding="utf-8")
    save_env({"WATERMARK": "none", "END_CTA": "Subscribe!"}, env)
    text = env.read_text(encoding="utf-8")
    assert "WATERMARK=none" in text
    assert "END_CTA=Subscribe!" in text
    assert "END_CTA=Follow for more!" not in text
    assert "LLM_API_KEY=secret-value" in text   # secrets are never touched
    assert "# my settings" in text and "# a comment stays" in text
    assert "UPLOAD=true" in text


def test_save_env_appends_missing_keys(tmp_path):
    env = tmp_path / ".env"
    env.write_text("WATERMARK=\n", encoding="utf-8")
    save_env({"HOOK_OVERLAY": "false"}, env)
    lines = env.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "WATERMARK="
    assert "HOOK_OVERLAY=false" in lines


def test_save_env_roundtrips_through_settings(tmp_path):
    env = tmp_path / ".env"
    env.write_text("WATERMARK=none\nCAPTION_MAX_WORDS=3\nKEN_BURNS=true\nMUSIC_VOLUME=0.14\n", encoding="utf-8")
    try:
        save_env({"CAPTION_MAX_WORDS": "4", "KEN_BURNS": "false", "MUSIC_VOLUME": "0.2"}, env)
        load_env(str(env))
        s = Settings.from_env()
        assert s.caption_max_words == 4 and s.ken_burns is False and abs(s.music_volume - 0.2) < 1e-9
    finally:
        _clean()


def test_format_env_value():
    assert format_env_value(True) == "true"
    assert format_env_value(False) == "false"
    assert format_env_value(3) == "3"
    assert format_env_value(0.14) == "0.14"
    assert format_env_value("none") == "none"


def test_editable_values_shape():
    s = Settings(channel_name="X", watermark="none", end_cta="", caption_style="bold")
    vals = editable_values(s)
    assert set(vals) == {attr for attr, _env, _kind in EDITABLE}
    assert vals["channel_name"] == "X" and vals["watermark"] == "none" and vals["end_cta"] == ""
