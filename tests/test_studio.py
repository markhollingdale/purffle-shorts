"""The Studio web app's server: security checks, the JSON API and a real (offline) job."""

import http.client
import json
import logging
import os
import threading
import time
import urllib.parse
from http.server import ThreadingHTTPServer

import pytest

from purffle_shorts import studio as ST

SETTINGS_ENV = ("CHANNEL_NAME", "WATERMARK", "END_CTA", "CAPTION_MAX_WORDS", "KEN_BURNS",
                "MUSIC_VOLUME", "MUSIC_DIR", "MUSIC_FILE")


@pytest.fixture
def server(settings, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "CHANNEL_NAME=TestChannel\nWATERMARK=\nEND_CTA=Follow for more!\n"
        "CAPTION_MAX_WORDS=3\nKEN_BURNS=true\nMUSIC_VOLUME=0.14\n",
        encoding="utf-8")
    app = ST.StudioServer(settings.with_overrides(upload=False), env_file=env_file)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), ST._handler(app, "127.0.0.1"))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield app, httpd.server_address[1]
    httpd.shutdown()
    httpd.server_close()
    root = logging.getLogger()
    for h in [h for h in root.handlers if isinstance(h, ST._JobLog)]:
        root.removeHandler(h)
    for key in SETTINGS_ENV:  # save_settings reloads from os.environ: don't leak into other tests
        os.environ.pop(key, None)


def req(port, method, path, body=None, token=None, host=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Studio-Token"] = token
    if host:
        headers["Host"] = host
    c.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, dict(r.getheaders()), data


def test_page_has_token_and_strict_csp(server):
    app, port = server
    status, headers, body = req(port, "GET", "/")
    assert status == 200 and app.token.encode() in body and b"__TOKEN__" not in body
    assert "default-src 'self'" in headers["Content-Security-Policy"]
    assert "unsafe-inline" not in headers["Content-Security-Policy"]
    assert req(port, "GET", "/static/app.js")[0] == 200
    assert req(port, "GET", "/static/../studio.py")[0] == 404


def test_other_host_names_are_refused(server):
    app, port = server
    assert req(port, "GET", "/api/info", host="evil.example:8765")[0] == 421
    assert req(port, "GET", "/api/info", host=f"localhost:{port}")[0] == 200


def test_writes_need_the_token(server):
    app, port = server
    assert req(port, "POST", "/api/ideas", {"subject": "x"})[0] == 403
    status, _, body = req(port, "POST", "/api/ideas", {"subject": "Why cats purr", "style": "facts"}, app.token)
    assert status == 200
    iid = json.loads(body)["id"]
    ideas = json.loads(req(port, "GET", "/api/ideas")[2])["pending"]
    assert [(i["id"], i["style"]) for i in ideas] == [(iid, "facts")]
    req(port, "POST", f"/api/ideas/{iid}/delete", {}, app.token)
    assert json.loads(req(port, "GET", "/api/ideas")[2])["pending"] == []


def test_options_and_doctor(server):
    app, port = server
    opts = json.loads(req(port, "GET", "/api/options")[2])
    assert {"chat", "dialogue"} <= set(opts["styles"]) and "16:9" in opts["aspects"]
    checks = json.loads(req(port, "GET", "/api/doctor")[2])
    assert any(c["label"] == "Python" for c in checks)


def test_form_values_are_validated(server):
    app, _ = server
    s = app.overrides({"caption_style": "<script>", "aspect": "16:9", "duration": "999", "review": "rewrite",
                       "grade": "cinematic", "visuals": ["pollinations"], "music": False, "tts": "rm -rf"})
    assert s.caption_style == app.settings.caption_style and s.resolution == (1920, 1080)
    assert s.target_seconds == 170 and s.color_grade == "cinematic" and s.visual_sources == ["pollinations"]
    assert s.music_volume == 0.0 and s.tts_engine == app.settings.tts_engine


def test_offline_draft_job_runs_to_completion(server):
    app, port = server
    status, _, body = req(port, "POST", "/api/draft", {"offline": True, "style": "chat"}, app.token)
    jid = json.loads(body)["job"]
    for _ in range(100):
        job = json.loads(req(port, "GET", f"/api/jobs/{jid}")[2])
        if job["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert job["status"] == "done", job
    assert job["result"]["script"]["style"] == "chat" and job["pct"] == 100
    assert job["label"] == "Demo video"


def test_settings_get_shape(server):
    app, port = server
    data = json.loads(req(port, "GET", "/api/settings")[2])
    assert data["can_save"] is True and data["env_file"] == str(app.env_file)
    assert {f["attr"] for f in data["fields"]} >= {"watermark", "end_cta", "caption_style", "music_volume"}
    assert "bold" in data["choices"]["caption_style"] and "cinematic" in data["choices"]["color_grade"]


def test_settings_save_writes_env_and_reloads(server):
    app, port = server
    assert req(port, "POST", "/api/settings", {"watermark": "none"})[0] == 403  # token required
    status, _, body = req(port, "POST", "/api/settings",
                          {"watermark": "none", "end_cta": "Subscribe!", "caption_style": "karaoke",
                           "unknown_key": "ignored"}, app.token)
    assert status == 200
    res = json.loads(body)
    assert res["values"]["watermark"] == "none" and res["values"]["end_cta"] == "Subscribe!"
    assert res["values"]["caption_style"] == "karaoke"
    assert app.settings.watermark == "none" and app.settings.end_cta == "Subscribe!"
    text = app.env_file.read_text(encoding="utf-8")
    assert "WATERMARK=none" in text and "END_CTA=Subscribe!" in text and "CHANNEL_NAME=TestChannel" in text


def test_settings_rejects_bad_values(server):
    app, port = server
    assert req(port, "POST", "/api/settings", {"caption_style": "<script>"}, app.token)[0] == 400
    assert req(port, "POST", "/api/settings", {"caption_max_words": "lots"}, app.token)[0] == 400
    assert req(port, "POST", "/api/settings", {"end_cta": "one\ntwo"}, app.token)[0] == 400
    # nothing was written by the rejected requests
    assert "WATERMARK=none" not in app.env_file.read_text(encoding="utf-8")


def test_settings_clamps_numbers(server):
    app, port = server
    res = json.loads(req(port, "POST", "/api/settings",
                         {"caption_max_words": 999, "music_volume": 5}, app.token)[2])
    assert res["values"]["caption_max_words"] == 20 and res["values"]["music_volume"] == 1.0


class _DocLLM:
    label = "fake:model"

    def __init__(self, replies):
        self.replies, self.calls = list(replies), 0

    def complete_json(self, system, user, schema=None, max_tokens=4000):
        r = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return r


def test_doctor_critique_and_rewrite_endpoints(server):
    app, port = server
    app.settings.target_seconds = 8          # ~20-word target
    script = {"title": "T", "hook_text": "H", "cast": [],
              "scenes": [{"speaker": "A", "narration": "one two three four five", "search_query": "cats",
                          "image_prompt": "a cat"}], "description": "d", "hashtags": ["#c"], "tags": ["c"],
              "category": "pets"}
    app.studio._llm = _DocLLM([{"score": 55, "issues": ["weak hook", "flat ending"]}])
    res = json.loads(req(port, "POST", "/api/doctor/critique", {"script": script}, app.token)[2])
    assert res["score"] == 55 and res["issues"] == ["weak hook", "flat ending"]

    better = dict(script, title="Better", scenes=[dict(script["scenes"][0],
                  narration="one two three four five six seven eight nine ten eleven twelve")])
    app.studio._llm = _DocLLM([{"score": 88, "issues": [], "script": better}])
    status, _, body = req(port, "POST", "/api/doctor/rewrite",
                          {"script": script, "score": 40, "issues": ["weak hook"]}, app.token)
    assert status == 200
    assert json.loads(body)["script"]["title"] == "Better" and json.loads(body)["score"] == 88


def test_doctor_needs_a_model(server):
    app, port = server
    app.studio._llm = None
    app.studio.s = app.studio.s.with_overrides(offline=True)
    code, _, body = req(port, "POST", "/api/doctor/critique",
                        {"script": {"title": "T", "scenes": [{"narration": "hi", "search_query": "c",
                                                              "image_prompt": "c"}]}}, app.token)
    assert code == 400 and "error" in json.loads(body)


def test_settings_expose_music_fields(server):
    app, port = server
    kinds = {f["attr"]: f["kind"] for f in json.loads(req(port, "GET", "/api/settings")[2])["fields"]}
    assert kinds["music_dir"] == "str" and kinds["music_file"] == "str"


def test_music_lookup_and_save(server, tmp_path):
    app, port = server
    music = tmp_path / "tunes"
    music.mkdir()
    (music / "one.mp3").write_bytes(b"x")
    (music / "two.wav").write_bytes(b"x")
    (music / "notes.txt").write_text("x", encoding="utf-8")
    q = urllib.parse.quote(str(music), safe="")
    info = json.loads(req(port, "GET", f"/api/music?dir={q}")[2])
    assert info["exists"] is True and info["count"] == 2
    assert set(info["files"]) == {"one.mp3", "two.wav"}
    res = json.loads(req(port, "POST", "/api/settings",
                         {"music_dir": str(music), "music_file": "two.wav"}, app.token)[2])
    assert res["values"]["music_file"] == "two.wav"
    text = app.env_file.read_text(encoding="utf-8")
    assert "MUSIC_FILE=two.wav" in text and "MUSIC_DIR=" in text


def test_scenes_and_manual_footage(server, tmp_path):
    app, port = server
    folder = tmp_path / "vid1"
    folder.mkdir()
    (folder / "short.mp4").write_bytes(b"x")
    (folder / "script.json").write_text(json.dumps({
        "title": "T", "scenes": [{"narration": "hello world", "search_query": "cats", "image_prompt": "a cat"}]}),
        encoding="utf-8")
    vid = app.studio.history.add_video(title="T", status="rendered", folder=str(folder),
                                       video_path=str(folder / "short.mp4"))
    data = json.loads(req(port, "GET", f"/api/videos/{vid}/scenes")[2])
    assert data["scenes"][0]["index"] == 0 and data["scenes"][0]["media"] is None
    assert req(port, "GET", f"/api/videos/{vid}/scenes")[0] == 200
    # a candidate search with no keys configured returns an empty list, not an error
    assert "candidates" in json.loads(req(port, "POST", f"/api/videos/{vid}/scenes/0/search", {"query": "cats"}, app.token)[2])
    # manual pick copies a file into footage/ and records it
    img = tmp_path / "mine.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n")
    status, _, body = req(port, "POST", f"/api/videos/{vid}/scenes/0/manual", {"path": str(img)}, app.token)
    assert status == 200
    entry = json.loads(body)["media"]
    assert entry["source"] == "manual" and (folder / entry["file"]).exists()
    assert entry["file"].startswith("footage")
    assert (folder / "media.json").exists()
    assert json.loads(req(port, "GET", f"/api/videos/{vid}/scenes")[2])["scenes"][0]["media"]["source"] == "manual"
    assert req(port, "GET", f"/media/{vid}/0")[0] == 200
    assert req(port, "POST", f"/api/videos/{vid}/scenes/0/manual", {"path": "nope.mp4"}, app.token)[0] == 400
    assert "job" in json.loads(req(port, "POST", f"/api/videos/{vid}/render", {}, app.token)[2])


def test_draft_job_picks_footage(server):
    app, port = server
    _, _, body = req(port, "POST", "/api/draft", {"offline": True, "style": "facts"}, app.token)
    jid = json.loads(body)["job"]
    for _ in range(200):
        job = json.loads(req(port, "GET", f"/api/jobs/{jid}")[2])
        if job["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert job["status"] == "done", job
    did = job["result"]["draft_id"]
    assert (app._draft_dir(did) / "script.json").exists()
    data = json.loads(req(port, "GET", f"/api/drafts/{did}/scenes")[2])
    assert data["scenes"] and data["media_base"] == f"/drafts/{did}/media"


def test_draft_scene_footage_can_be_swapped(server, tmp_path):
    app, port = server
    draft_id = "draft01"
    folder = app._draft_dir(draft_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "script.json").write_text(json.dumps({
        "title": "D", "scenes": [{"narration": "hello", "search_query": "cats", "image_prompt": "a cat"}]}),
        encoding="utf-8")
    data = json.loads(req(port, "GET", f"/api/drafts/{draft_id}/scenes")[2])
    assert data["scenes"][0]["index"] == 0 and data["scenes"][0]["media"] is None
    assert req(port, "POST", f"/api/drafts/{draft_id}/scenes/0/search", {"query": "cats"}, app.token)[0] == 200
    img = tmp_path / "pic.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n")
    status, _, body = req(port, "POST", f"/api/drafts/{draft_id}/scenes/0/manual", {"path": str(img)}, app.token)
    assert status == 200 and json.loads(body)["media"]["source"] == "manual"
    assert (folder / "footage").is_dir()
    assert req(port, "GET", f"/drafts/{draft_id}/media/0")[0] == 200
    # rendering with the draft reuses the picked footage (no new search)
    assert "job" in json.loads(req(port, "POST", "/api/make", {"draft_id": draft_id}, app.token)[2])


def test_browse_lists_dirs_and_audio_files(server, tmp_path):
    app, port = server
    root = tmp_path / "lib"
    (root / "sub").mkdir(parents=True)
    (root / "song.mp3").write_bytes(b"x")
    (root / "readme.md").write_text("x", encoding="utf-8")
    q = urllib.parse.quote(str(root), safe="")
    data = json.loads(req(port, "GET", f"/api/browse?path={q}")[2])
    assert "sub" in data["dirs"] and "song.mp3" in data["files"] and "readme.md" not in data["files"]
    assert data["parent"]
