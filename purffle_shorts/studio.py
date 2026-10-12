"""PurffleShorts Studio — a local web app (standard library only, no build step).

    purffle-shorts studio        -> http://127.0.0.1:8765

Create videos (or draft and edit the script first), watch every stage live, browse and play the library,
plan ideas, clip long videos, read channel stats and check the setup. It binds to localhost, refuses
requests addressed to any other host name (DNS rebinding), and every write needs a per-session token,
so other websites can't drive it from your browser.
"""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import queue
import re
import secrets
import shutil
import threading
import time
import webbrowser
from dataclasses import dataclass, field, replace
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote_plus, urlparse

from . import __version__
from .config import ASPECTS, Settings, aspect_resolution, load_env

log = logging.getLogger("purffle")

WEB = Path(__file__).parent / "web"
FILES = ("short.mp4", "video.mp4", "cover.jpg", "captions.srt", "metadata.json", "script.json")
STATIC = {"app.js": "text/javascript; charset=utf-8", "app.css": "text/css; charset=utf-8",
          "icon.svg": "image/svg+xml"}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
AUDIO_EXT = {".mp3", ".m4a", ".wav", ".aac", ".ogg", ".opus", ".flac", ".wma", ".aiff", ".aif"}
# Hosts we will pull a first-frame thumbnail from (keeps the thumbnail endpoint from fetching anything).
THUMB_HOSTS = ("videos.pexels.com", "images.pexels.com", "cdn.pixabay.com", "i.vimeocdn.com", "pixabay.com")
_THUMB_LOCK = threading.Semaphore(3)


@dataclass
class Job:
    id: int
    kind: str                       # make | draft | clip | plan | upload | stats
    params: dict
    label: str = ""
    status: str = "queued"          # queued | running | done | failed | cancelled
    stage: str = ""
    pct: int = 0
    message: str = ""
    log: list[str] = field(default_factory=list)
    result: dict = field(default_factory=dict)
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None

    def public(self, full_log: bool = False) -> dict:
        return {"id": self.id, "kind": self.kind, "label": self.label, "status": self.status, "stage": self.stage,
                "pct": self.pct, "message": self.message, "result": self.result, "created": self.created,
                "started": self.started, "finished": self.finished,
                "log": self.log if full_log else self.log[-60:]}


class _JobLog(logging.Handler):
    """Copies log lines produced by the worker thread into the running job."""

    def __init__(self, studio: StudioServer):
        super().__init__(logging.INFO)
        self.studio = studio
        self.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))

    def emit(self, record: logging.LogRecord) -> None:
        job = self.studio.current
        if job is None:
            return
        # One job runs at a time, so the worker's own thread pools (voices, footage, segments) belong to it.
        if record.threadName == "studio-worker" or record.threadName.startswith("ThreadPoolExecutor"):
            job.log.append(self.format(record))
            del job.log[:-400]


def _choice(value, allowed, default=None):
    return value if value in allowed else default


def _safe(text: str) -> str:
    return re.sub(r"[^\w.-]", "_", str(text)) or "item"


class StudioServer:
    def __init__(self, settings: Settings, env_file: str | Path | None = None):
        from .pipeline import Studio
        self.settings = settings
        self.env_file = Path(env_file) if env_file else None
        self.studio = Studio(settings)
        self.token = secrets.token_urlsafe(24)
        self.jobs: dict[int, Job] = {}
        self.queue: queue.Queue[Job] = queue.Queue()
        self.current: Job | None = None
        self._next = 1
        self._lock = threading.Lock()
        self._voices: dict[str, list] = {}
        logging.getLogger().addHandler(_JobLog(self))
        threading.Thread(target=self._worker, name="studio-worker", daemon=True).start()

    # ------------------------------------------------------------------ jobs
    def submit(self, kind: str, params: dict, label: str = "") -> Job:
        with self._lock:
            job = Job(self._next, kind, params, label=label or kind)
            self._next += 1
            self.jobs[job.id] = job
            for old in sorted(self.jobs)[:-100]:  # keep the list bounded
                if self.jobs[old].status not in ("queued", "running"):
                    del self.jobs[old]
        self.queue.put(job)
        return job

    def cancel(self, jid: int) -> bool:
        job = self.jobs.get(jid)
        if not job or job.status not in ("queued", "running"):
            return False
        job.status = "cancelled"
        if job.started is None:  # still queued: it never starts
            job.finished = time.time()
        return True  # running: the worker aborts at the next stage boundary

    def _progress(self, job: Job):
        from .pipeline import Cancelled

        def cb(stage: str, pct: int, message: str) -> None:
            if job.status == "cancelled":
                raise Cancelled()
            job.stage, job.pct = stage, max(job.pct, pct) if stage != "done" else 100
            job.message = message or job.message
        return cb

    def overrides(self, p: dict) -> Settings:
        """Turn Create-form fields into Settings. Unknown values are ignored, never trusted."""
        from .overlays import CAPTION_STYLES
        from .render import GRADES, TRANSITIONS
        from .script import STYLES
        s = self.settings
        ov: dict = {
            "style": _choice(p.get("style"), STYLES),
            "language": (str(p.get("language") or "").strip().lower()[:8] or None),
            "tts_engine": _choice(p.get("tts"), ("edge", "openai", "elevenlabs", "kokoro", "coqui", "system")),
            "tts_voice": str(p.get("voice") or "").strip()[:200] or None,
            "tts_voice_b": str(p.get("voice_b") or "").strip()[:200] or None,
            "caption_style": _choice(p.get("caption_style"), CAPTION_STYLES),
            "caption_position": _choice(p.get("caption_position"), ("upper", "center", "lower")),
            "color_grade": _choice(p.get("grade"), GRADES),
            "transition": _choice(p.get("transition"), ["random", "none", *TRANSITIONS]),
            "llm_provider": str(p.get("provider") or "").strip().lower() or None,
            "llm_model": str(p.get("model") or "").strip()[:120] or None,
            "script_review": _choice(p.get("review"), ("off", "score", "rewrite")),
        }
        if p.get("duration"):
            try:
                ov["target_seconds"] = max(10, min(170, int(p["duration"])))
            except (TypeError, ValueError):
                pass
        if p.get("aspect") in ASPECTS:
            ov["resolution"] = aspect_resolution(p["aspect"])
        if isinstance(p.get("visuals"), list) and p["visuals"]:
            ov["visual_sources"] = [str(v).lower() for v in p["visuals"]][:6]
        if p.get("music") is False:
            ov["music_volume"] = 0.0
        s = s.with_overrides(**ov)
        if p.get("offline"):
            s = replace(s, offline=True)
        return s

    def _worker(self) -> None:
        from .pipeline import Cancelled, Studio
        while True:
            job = self.queue.get()
            if job.status == "cancelled":
                continue
            self.current, job.status, job.started = job, "running", time.time()
            p = job.params
            try:
                if job.kind == "upload":
                    status = self.studio.upload_record(int(p["id"]))
                    job.result = {"status": status, "id": int(p["id"])}
                    ok = status in ("uploaded", "scheduled", "queued")
                elif job.kind == "stats":
                    from .analytics import sync_stats
                    job.result = {"updated": sync_stats(self.settings, self.studio.history)}
                    ok = True
                else:
                    s = self.overrides(p)
                    studio = Studio(s, progress=self._progress(job))
                    ok = self._run(job, studio, s, p)
                job.status = "done" if ok else "failed"
            except Cancelled:
                job.status = "cancelled"
                log.info("Studio job %d cancelled", job.id)
            except Exception as e:
                job.status, job.result = "failed", {"error": str(e)}
                log.exception("Studio job %d failed", job.id)
            finally:
                job.finished = time.time()
                if job.status == "done":
                    job.pct = 100
                self.current = None

    def _run(self, job: Job, studio, s: Settings, p: dict) -> bool:
        from .script import load_script, script_from_data
        if job.kind == "draft":
            script, pick, writer = studio.draft(p.get("topic") or None, source=p.get("source") or None,
                                                style=s.style if s.style != "auto" else None,
                                                url=p.get("url") or None)
            # Pick and download footage now, so each scene can be previewed and fixed before rendering.
            draft_id = secrets.token_urlsafe(9)
            folder = self._draft_dir(draft_id)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "script.json").write_text(json.dumps(script.to_dict(), indent=2, ensure_ascii=False),
                                                encoding="utf-8")
            try:
                studio.prepare_footage(script, folder)
            except Exception as e:  # a draft must not fail because a footage search hiccuped
                log.warning("Footage search during draft failed: %s", e)
            self._prune_drafts()
            job.result = {"script": script.to_dict(), "source": pick.source, "llm": writer, "draft_id": draft_id}
            job.stage, job.pct = "done", 100
            return True
        if job.kind == "plan":
            from .planner import plan_ideas
            niches = [p["niche"].strip()] if str(p.get("niche") or "").strip() else None
            ideas = plan_ideas(studio.llm, s, studio.history, int(p.get("count") or 10), niches)
            job.result = {"ideas": len(ideas)}
            return bool(ideas)
        if job.kind == "clip":
            from .clipper import make_clips
            results = make_clips(studio, str(p.get("source") or ""), count=int(p.get("count") or 3),
                                 crop=p.get("crop") or "center", upload=bool(p.get("upload")),
                                 min_seconds=int(p.get("min_seconds") or 20), max_seconds=int(p.get("max_seconds") or 58))
            job.result = {"clips": [_result(r) for r in results]}
            return any(r.ok for r in results)
        if job.kind == "render":
            r = studio.rerender(int(p["id"]), upload=bool(p.get("upload")))
            job.result = _result(r)
            return r.ok
        if job.kind == "doctor":
            from .script import run_doctor
            llm = studio.llm
            if llm is None:
                raise RuntimeError("No AI model is configured for the Script Doctor.")
            script = script_from_data(p.get("script") or {}, s)
            final, history = run_doctor(llm, script, s, int(p.get("passes") or 2),
                                        on_pass=lambda e: setattr(job, "message", f"pass {e['pass']}"))
            job.result = {"script": final.to_dict(), "history": history}
            job.stage, job.pct = "done", 100
            return True
        # make
        script = script_from_data(p["script"], s) if isinstance(p.get("script"), dict) else None
        langs = p.get("also_langs")
        if isinstance(langs, str):
            langs = [x.strip().lower() for x in langs.split(",") if x.strip()]
        media_map = None
        if p.get("draft_id"):  # reuse the footage picked when the script was drafted
            folder = self._draft_dir(str(p["draft_id"]))
            media_map = studio._load_media_map(folder)
            if script is None and (folder / "script.json").exists():
                script = load_script(folder / "script.json", s)
        r = studio.make(p.get("topic") or None, source=p.get("source") or None, upload=bool(p.get("upload")),
                        style=s.style if s.style != "auto" else None, script=script, url=p.get("url") or None,
                        languages=[str(x)[:8] for x in (langs or [])][:6], media_map=media_map or None)
        job.result = _result(r)
        return r.ok

    # ------------------------------------------------------------------ data
    def videos(self, status: str = "", q: str = "") -> list[dict]:
        out = []
        for r in self.studio.history.recent(200):
            if status and r["status"] != status:
                continue
            if q and q.lower() not in f"{r['title']} {r['topic']} {r['subject']}".lower():
                continue
            folder = Path(r["folder"]) if r["folder"] else None
            video = Path(r["video_path"]) if r["video_path"] else None
            out.append({
                "id": r["id"], "title": r["title"], "status": r["status"], "created": r["created_at"],
                "youtube_id": r["youtube_id"], "publish_at": r["publish_at"], "duration": r["duration"],
                "style": r["style"], "language": r["language"], "score": r.get("score"),
                "views": r.get("views"), "likes": r.get("likes"), "parent_id": r.get("parent_id"),
                "video": video.name if video and video.exists() else None,
                "has_cover": bool(folder and (folder / "cover.jpg").exists()),
                "error": r["error"],
            })
        return out

    def video(self, vid: int) -> dict | None:
        rec = self.studio.history.get(vid)
        if not rec:
            return None
        folder = Path(rec["folder"]) if rec["folder"] else None
        data = dict(rec)
        data["tags"] = json.loads(rec["tags"] or "[]")
        for name in ("metadata", "script"):
            f = folder / f"{name}.json" if folder else None
            try:
                data[name] = json.loads(f.read_text(encoding="utf-8")) if f and f.exists() else None
            except (OSError, ValueError):
                data[name] = None
        video = Path(rec["video_path"]) if rec["video_path"] else None
        data["video"] = video.name if video and video.exists() else None
        data["has_cover"] = bool(folder and (folder / "cover.jpg").exists())
        data["has_srt"] = bool(folder and (folder / "captions.srt").exists())
        return data

    def file_for(self, vid: int, name: str) -> Path | None:
        if name not in FILES:
            return None
        rec = self.studio.history.get(vid)
        if not rec or not rec["folder"]:
            return None
        p = Path(rec["folder"]) / name
        return p if p.exists() else None

    def voices(self, lang: str) -> list[dict]:
        lang = (lang or self.settings.language).lower()[:8]
        if lang not in self._voices:
            try:
                from .tts import list_edge_voices
                self._voices[lang] = [{"name": v["ShortName"], "gender": v["Gender"], "locale": v["Locale"]}
                                      for v in list_edge_voices(lang)]
            except Exception as e:
                log.warning("Could not list voices: %s", e)
                return []
        return self._voices[lang]

    def info(self) -> dict:
        s = self.settings
        from .llm import LLMError, resolve_provider_name
        try:
            llm = f"{resolve_provider_name(s)}{(':' + s.llm_model) if s.llm_model else ''}"
            llm_ok = True
        except LLMError:
            llm, llm_ok = "not configured", False
        h = self.studio.history
        stats = h.stats()
        views = sum(r.get("views") or 0 for r in h.recent(1000))
        return {"version": __version__, "llm": llm, "llm_ok": llm_ok, "tts": s.tts_engine,
                "voice": s.tts_voice or "auto", "visuals": s.visual_sources, "upload": s.upload,
                "privacy": s.privacy, "quota_left": self.studio.quota_left(), "daily_limit": s.daily_upload_limit,
                "language": s.language, "caption_style": s.caption_style, "caption_position": s.caption_position,
                "duration": s.target_seconds, "style": s.style, "grade": s.color_grade, "transition": s.transition,
                "review": s.script_review, "aspect": next((k for k, v in ASPECTS.items() if v == s.resolution),
                                                          f"{s.width}x{s.height}"),
                "also_languages": s.also_languages, "learn_from_stats": s.learn_from_stats,
                "counts": stats, "total": sum(stats.values()), "views": views,
                "ideas": len(h.ideas("pending")), "channel": s.channel_name}

    def options(self) -> dict:
        from .llm import PRESETS, available_providers
        from .overlays import CAPTION_STYLES
        from .render import GRADES, TRANSITIONS
        from .script import LANGUAGES, STYLES
        ready = set(available_providers(self.settings))
        return {"styles": STYLES, "languages": LANGUAGES, "aspects": list(ASPECTS),
                "caption_styles": list(CAPTION_STYLES), "grades": list(GRADES),
                "transitions": ["random", "none", *TRANSITIONS],
                "providers": [{"name": n, "label": p.label, "ready": n in ready or p.local}
                              for n, p in PRESETS.items()],
                "tts": ["edge", "openai", "elevenlabs", "kokoro", "coqui", "system"],
                "visuals": ["pexels", "pixabay", "local", "pollinations", "openai-images"]}

    def settings_values(self) -> dict:
        """Current values of the Studio-editable settings, plus the field list and allowed choices."""
        from .config import EDITABLE, editable_values
        return {
            "values": editable_values(self.settings),
            "choices": self._editable_choices(),
            "fields": [{"attr": a, "env": e, "kind": k} for a, e, k in EDITABLE],
            "env_file": str(self.env_file) if self.env_file else "",
            "can_save": bool(self.env_file),
        }

    def _editable_choices(self) -> dict:
        from .overlays import CAPTION_STYLES
        from .render import GRADES, TRANSITIONS
        return {"caption_style": list(CAPTION_STYLES), "caption_position": ["upper", "center", "lower"],
                "color_grade": list(GRADES), "transition": ["random", "none", *TRANSITIONS]}

    def save_settings(self, p: dict) -> dict:
        """Validate the posted settings, write ONLY those keys to .env and reload them live.

        Secrets and every other line in .env are left untouched. Raises ValueError on bad input."""
        from .config import EDITABLE, format_env_value, save_env
        if not self.env_file:
            raise ValueError("No .env file is being used, so there is nothing to write to — edit .env by hand.")
        choices = self._editable_choices()
        changes: dict[str, str] = {}
        for attr, env, kind in EDITABLE:
            if attr not in p:
                continue
            raw = p[attr]
            if kind == "bool":
                val = raw if isinstance(raw, bool) else str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}
            elif kind == "int":
                try:
                    val = int(raw)
                except (TypeError, ValueError):
                    raise ValueError(f"{attr} must be a whole number") from None
                if attr == "caption_max_words":
                    val = max(1, min(20, val))
            elif kind == "float":
                try:
                    val = max(0.0, min(1.0, float(raw)))
                except (TypeError, ValueError):
                    raise ValueError(f"{attr} must be a number") from None
            elif kind == "choice":
                val = str(raw)
                if val not in choices[attr]:
                    raise ValueError(f"{attr}: choose one of {', '.join(choices[attr])}")
            else:
                val = str(raw).strip()
                if "\n" in val or "\r" in val:
                    raise ValueError(f"{attr} must be a single line")
                val = val[:200]
            changes[env] = format_env_value(val)
        if changes:
            save_env(changes, self.env_file)
            load_env(str(self.env_file))            # refresh os.environ from the file we just wrote
            self.settings = Settings.from_env()     # then reload so the CLI/MCP and new jobs all agree
            self.studio.s = self.settings
        return self.settings_values()

    def music_info(self, directory: str = "") -> dict:
        """List the audio tracks found in a music folder (searched recursively), for the settings form."""
        raw = (directory or self.settings.music_dir or "").strip()
        p = Path(raw).expanduser()
        exists = bool(raw) and p.is_dir()
        files: list[str] = []
        if exists:
            try:
                files = sorted(str(f.relative_to(p)) for f in p.rglob("*")
                               if f.is_file() and f.suffix.lower() in AUDIO_EXT)
            except OSError:
                files = []
        return {"dir": str(p) if raw else "", "exists": exists, "count": len(files), "files": files[:1000]}

    def browse(self, path: str = "", kind: str = "audio") -> dict:
        """List a folder's sub-folders and files, for the folder/file picker.

        ``kind`` selects which files to list: ``audio`` (music), ``media`` (images and videos) or ``dir``
        (folders only)."""
        from .media import IMAGE_EXT, VIDEO_EXT
        raw = (path or "").strip()
        if not raw:
            start = Path(self.settings.music_dir).expanduser()
            raw = str(start if start.is_dir() else Path.home())
        p = Path(raw).expanduser()
        if p.is_file():
            p = p.parent
        if p.exists():
            p = p.resolve()
        exts = {"audio": AUDIO_EXT, "media": VIDEO_EXT | IMAGE_EXT}.get(kind, set())
        dirs: list[str] = []
        files: list[str] = []
        error = ""
        if p.is_dir():
            try:
                entries = sorted(p.iterdir(), key=lambda e: e.name.lower())
                dirs = [e.name for e in entries if e.is_dir() and not e.name.startswith(".")]
                files = [e.name for e in entries if e.is_file() and e.suffix.lower() in exts]
            except OSError as e:
                error = str(e)
        else:
            error = f"not a folder: {p}"
        home = Path.home()
        return {"path": str(p), "parent": str(p.parent) if p.parent != p else "", "kind": kind,
                "home": str(home) if home.is_dir() else "", "dirs": dirs, "files": files, "error": error}

    # ------------------------------------------------------------------ per-scene footage
    def _rec_folder(self, vid: int) -> Path | None:
        rec = self.studio.history.get(vid)
        return Path(rec["folder"]) if rec and rec.get("folder") else None

    def _draft_dir(self, draft_id: str) -> Path:
        safe = re.sub(r"[^\w-]", "", str(draft_id or ""))[:40]
        if not safe:
            raise ValueError("bad draft id")
        return self.settings.data_path / "drafts" / safe

    def _prune_drafts(self, keep: int = 12) -> None:
        root = self.settings.data_path / "drafts"
        if not root.is_dir():
            return
        dirs = sorted((d for d in root.iterdir() if d.is_dir()), key=lambda d: d.stat().st_mtime, reverse=True)
        for d in dirs[keep:]:
            shutil.rmtree(d, ignore_errors=True)

    def _scenes_payload(self, folder: Path, vid: int, title: str, media_base: str) -> dict:
        from .media import AI_SOURCES
        try:
            script = json.loads((folder / "script.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            script = {}
        media_map = self.studio._load_media_map(folder)
        out = []
        for n, sc in enumerate(script.get("scenes") or []):
            m = media_map.get(n)
            out.append({"index": n, "narration": sc.get("narration", ""), "search_query": sc.get("search_query", ""),
                        "image_prompt": sc.get("image_prompt", ""), "media": m.to_dict() if m else None,
                        "preview": bool(m and m.path), "kind": m.kind if m else ""})
        return {"id": vid, "title": title, "scenes": out, "media_base": media_base,
                "sources": [x for x in self.settings.visual_sources if x not in AI_SOURCES]}

    def scenes(self, vid: int) -> dict | None:
        """Every scene with its narration, search phrase and current footage, for the video drawer."""
        rec = self.studio.history.get(vid)
        folder = self._rec_folder(vid)
        if rec is None or folder is None:
            return None
        return self._scenes_payload(folder, vid, rec.get("title"), f"/media/{vid}")

    def draft_scenes(self, draft_id: str) -> dict | None:
        folder = self._draft_dir(draft_id)
        if not (folder / "script.json").exists():
            return None
        return self._scenes_payload(folder, 0, "Draft", f"/drafts/{draft_id}/media")

    def _media_file(self, folder: Path, n: int) -> Path | None:
        m = self.studio._load_media_map(folder).get(n)
        return m.path if m and m.path and m.path.exists() else None

    def media_file_for(self, vid: int, n: int) -> Path | None:
        folder = self._rec_folder(vid)
        return self._media_file(folder, n) if folder else None

    def draft_media_file(self, draft_id: str, n: int) -> Path | None:
        return self._media_file(self._draft_dir(draft_id), n)

    def _scene_search(self, n: int, query: str) -> dict:
        from .media import Visuals
        q = (query or "").strip()
        if not q:
            raise ValueError("give a search query")
        cands = Visuals(self.settings, used_keys=set()).candidates(q)
        out = []
        for c in cands:
            d = c.to_dict()
            if c.kind == "video" and not d.get("thumb") and c.url:
                d["thumb"] = "/api/thumb?url=" + quote(c.url, safe="")   # first frame, fetched on demand
            d["local"] = c.source == "local"
            d["path"] = str(c.path) if c.source == "local" and c.path else ""
            out.append(d)
        return {"query": q, "candidates": out}

    # ------------------------------------------------------------------ Script Doctor
    def _doctor_llm(self):
        llm = self.studio.llm
        if llm is None:
            raise ValueError("No AI model is configured — add a key or run Ollama to use the Script Doctor.")
        return llm

    def doctor_critique(self, script_data: dict) -> dict:
        from .script import critique_script, script_from_data
        script = script_from_data(script_data or {}, self.settings)
        score, issues = critique_script(self._doctor_llm(), script, self.settings)
        return {"score": score, "issues": issues}

    def doctor_rewrite(self, script_data: dict, score, issues) -> dict:
        from .script import rewrite_script, script_from_data
        script = script_from_data(script_data or {}, self.settings)
        better = rewrite_script(self._doctor_llm(), script, self.settings, score,
                                [str(i)[:300] for i in (issues or [])][:5])
        return {"script": better.to_dict(), "score": better.score, "issues": better.review}

    def candidate_thumb(self, url: str) -> Path | None:
        """Extract (and cache) the first frame of a stock video so the picker can show a real thumbnail."""
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or not any(
                host == h or host.endswith("." + h) for h in THUMB_HOSTS):
            return None
        dest = self.settings.data_path / "thumbs" / (hashlib.sha1(url.encode()).hexdigest() + ".jpg")
        if dest.exists() and dest.stat().st_size > 0:
            return dest
        from . import ffmpeg
        with _THUMB_LOCK:
            if dest.exists() and dest.stat().st_size > 0:
                return dest
            dest.parent.mkdir(parents=True, exist_ok=True)
            for at in ("0.2", "0"):
                try:
                    ffmpeg.run(["-ss", at, "-i", url, "-frames:v", "1", "-vf", "scale=270:-2", str(dest)],
                               label="thumbnail", timeout=60)
                    if dest.exists() and dest.stat().st_size > 0:
                        break
                except Exception:
                    continue
        return dest if dest.exists() and dest.stat().st_size > 0 else None

    def scene_search(self, vid: int, n: int, query: str) -> dict:
        if self._rec_folder(vid) is None:
            raise ValueError("no such video")
        return self._scene_search(n, query)

    def draft_search(self, draft_id: str, n: int, query: str) -> dict:
        if not self._draft_dir(draft_id).is_dir():
            raise ValueError("no such draft")
        return self._scene_search(n, query)

    def _scene_pick(self, folder: Path, n: int, item: dict) -> dict:
        from .media import MediaItem, Visuals
        if n < 0 or not isinstance(item, dict):
            raise ValueError("bad candidate")
        if item.get("local") or item.get("source") == "local":
            src = Path(str(item.get("path") or item.get("url") or ""))
            if not src.is_file():
                raise ValueError("local file not found")
            mi = MediaItem.from_dict(item, path=src)
        else:
            mi = MediaItem.from_dict(item)
            if not mi.url:
                raise ValueError("candidate has no url")
            tmp = folder / "work" / "pick"
            tmp.mkdir(parents=True, exist_ok=True)
            Visuals(self.settings, used_keys=set()).fetch(mi, tmp, n)
        return {"media": self._store_scene(folder, n, mi)}

    def scene_pick(self, vid: int, n: int, item: dict) -> dict:
        folder = self._rec_folder(vid)
        if folder is None:
            raise ValueError("no such video")
        return self._scene_pick(folder, n, item)

    def draft_pick(self, draft_id: str, n: int, item: dict) -> dict:
        return self._scene_pick(self._draft_dir(draft_id), n, item)

    def _scene_manual(self, folder: Path, n: int, path: str) -> dict:
        from .media import IMAGE_EXT, VIDEO_EXT, MediaItem
        src = Path(str(path or "").strip())
        if not src.is_file():
            raise ValueError("file not found")
        if src.suffix.lower() not in VIDEO_EXT | IMAGE_EXT:
            raise ValueError("that's not an image or video file")
        mi = MediaItem("manual", src.name, "video" if src.suffix.lower() in VIDEO_EXT else "image", path=src)
        return {"media": self._store_scene(folder, n, mi)}

    def scene_manual(self, vid: int, n: int, path: str) -> dict:
        folder = self._rec_folder(vid)
        if folder is None:
            raise ValueError("no such video")
        return self._scene_manual(folder, n, path)

    def draft_manual(self, draft_id: str, n: int, path: str) -> dict:
        return self._scene_manual(self._draft_dir(draft_id), n, path)

    def _store_scene(self, folder: Path, n: int, item) -> dict:
        dest = folder / "footage"
        dest.mkdir(exist_ok=True)
        ext = item.path.suffix or (".mp4" if item.kind == "video" else ".jpg")
        target = dest / f"scene{n:02d}_{_safe(item.source)}_{_safe(Path(item.id).stem)}{ext}"
        if item.path.resolve() != target.resolve():
            shutil.copy2(item.path, target)
        item.path = target
        entry = item.to_dict()
        entry["file"] = str(target.relative_to(folder))
        manifest = folder / "media.json"
        try:
            data = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
        except (OSError, ValueError):
            data = {}
        data.setdefault("scenes", {})[str(n)] = entry
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return entry

    def channel(self) -> dict:
        rows = [r for r in self.studio.history.recent(1000) if r.get("views") is not None]
        by_style: dict[str, list[int]] = {}
        for r in rows:
            by_style.setdefault(r["style"] or "other", []).append(r["views"])
        return {"videos": [{"id": r["id"], "title": r["title"], "views": r["views"], "likes": r["likes"],
                            "comments": r["comments"], "score": r.get("score"), "style": r["style"],
                            "youtube_id": r["youtube_id"]} for r in sorted(rows, key=lambda r: -r["views"])[:100]],
                "by_style": sorted(({"style": k, "videos": len(v), "avg_views": round(sum(v) / len(v))}
                                    for k, v in by_style.items()), key=lambda x: -x["avg_views"]),
                "synced": max((r.get("stats_at") or "" for r in rows), default="")}


def _result(r) -> dict:
    return {"ok": r.ok, "title": r.title, "status": r.status, "youtube_id": r.youtube_id, "error": r.error,
            "id": r.record_id, "score": r.score, "language": r.language, "seconds": round(r.seconds, 1),
            "variants": [_result(v) for v in getattr(r, "variants", [])]}


def _handler(app: StudioServer, bound_host: str):
    loopback = bound_host in LOCAL_HOSTS

    class H(BaseHTTPRequestHandler):
        server_version = f"PurffleStudio/{__version__}"

        def log_message(self, fmt, *args):  # keep the console for pipeline logs
            pass

        def handle_one_request(self):
            # A browser closing the media viewer / seeking a video / aborting an image aborts the socket.
            # That is normal, not an error: swallow it instead of dumping a traceback from socketserver.
            try:
                super().handle_one_request()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError):
                self.close_connection = True

        def _host_ok(self) -> bool:
            if not loopback:
                return True
            host = (self.headers.get("Host") or "").strip().lower()
            name = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
            return name in LOCAL_HOSTS

        def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, data, code: int = 200):
            self._send(code, json.dumps(data, default=str).encode(), "application/json")

        def do_GET(self):
            if not self._host_ok():
                return self._send(421, b"wrong host", "text/plain")
            path, _, qs = self.path.partition("?")
            params = dict(x.partition("=")[::2] for x in qs.split("&") if x)
            params = {k: unquote_plus(v) for k, v in params.items()}
            if path == "/":
                html = (WEB / "index.html").read_text(encoding="utf-8")
                html = html.replace("__TOKEN__", app.token).replace("__VERSION__", __version__)
                return self._send(200, html.encode(), "text/html; charset=utf-8", {
                    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://i.ytimg.com "
                                               "https://images.pexels.com https://cdn.pixabay.com https://pixabay.com; "
                                               "media-src 'self' https://videos.pexels.com https://cdn.pixabay.com; "
                                               "connect-src 'self'; frame-ancestors 'none'",
                    "X-Frame-Options": "DENY"})
            m = re.fullmatch(r"/static/([\w.-]+)", path)
            if m and m.group(1) in STATIC:
                return self._send(200, (WEB / m.group(1)).read_bytes(), STATIC[m.group(1)])
            if path == "/api/info":
                return self._json(app.info())
            if path == "/api/options":
                return self._json(app.options())
            if path == "/api/settings":
                return self._json(app.settings_values())
            if path == "/api/music":
                return self._json(app.music_info(params.get("dir", "")))
            if path == "/api/thumb":
                f = app.candidate_thumb(params.get("url", ""))
                return self._file(f) if f else self._send(404, b"no thumbnail", "text/plain")
            if path == "/api/browse":
                return self._json(app.browse(params.get("path", ""), params.get("kind", "audio")))
            if path == "/api/videos":
                return self._json(app.videos(params.get("status", ""), params.get("q", "")))
            m = re.fullmatch(r"/api/videos/(\d+)", path)
            if m:
                v = app.video(int(m.group(1)))
                return self._json(v) if v else self._json({"error": "not found"}, 404)
            m = re.fullmatch(r"/api/videos/(\d+)/scenes", path)
            if m:
                data = app.scenes(int(m.group(1)))
                return self._json(data) if data else self._json({"error": "not found"}, 404)
            m = re.fullmatch(r"/media/(\d+)/(\d+)", path)
            if m:
                f = app.media_file_for(int(m.group(1)), int(m.group(2)))
                return self._file(f) if f else self._send(404, b"not found", "text/plain")
            m = re.fullmatch(r"/api/drafts/([\w-]+)/scenes", path)
            if m:
                data = app.draft_scenes(m.group(1))
                return self._json(data) if data else self._json({"error": "not found"}, 404)
            m = re.fullmatch(r"/drafts/([\w-]+)/media/(\d+)", path)
            if m:
                f = app.draft_media_file(m.group(1), int(m.group(2)))
                return self._file(f) if f else self._send(404, b"not found", "text/plain")
            if path == "/api/jobs":
                jobs = sorted(app.jobs.values(), key=lambda j: j.id, reverse=True)[:40]
                return self._json([j.public() for j in jobs])
            m = re.fullmatch(r"/api/jobs/(\d+)", path)
            if m and int(m.group(1)) in app.jobs:
                return self._json(app.jobs[int(m.group(1))].public(full_log=True))
            if path == "/api/ideas":
                return self._json({"pending": app.studio.history.ideas("pending"),
                                   "used": app.studio.history.ideas("used", 30)})
            if path == "/api/doctor":
                from .doctor import checks
                return self._json(checks(app.settings))
            if path == "/api/channel":
                return self._json(app.channel())
            if path == "/api/voices":
                return self._json(app.voices(params.get("lang", "")))
            m = re.fullmatch(r"/files/(\d+)/([\w.]+)", path)
            if m:
                f = app.file_for(int(m.group(1)), m.group(2))
                if not f:
                    return self._send(404, b"not found", "text/plain")
                return self._file(f, download="download" in params)
            self._send(404, b"not found", "text/plain")

        def _file(self, f: Path, download: bool = False):
            size = f.stat().st_size
            ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            if f.suffix == ".srt":
                ctype = "text/plain; charset=utf-8"
            rng = self.headers.get("Range")
            start, end = 0, size - 1
            m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                if start > end:
                    self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            else:
                self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("X-Content-Type-Options", "nosniff")
            if download:
                folder = re.sub(r"[^\w.-]+", "-", f.parent.name)[:80]
                self.send_header("Content-Disposition", f'attachment; filename="{folder}{f.suffix}"')
            self.end_headers()
            with open(f, "rb") as fh:
                fh.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = fh.read(min(1 << 16, left))
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except ConnectionError:   # client went away (aborted/seeking): stop quietly
                        return
                    left -= len(chunk)

        def do_POST(self):
            if not self._host_ok():
                return self._send(421, b"wrong host", "text/plain")
            if self.headers.get("X-Studio-Token") != app.token:
                return self._json({"error": "bad token"}, 403)
            length = min(int(self.headers.get("Content-Length") or 0), 512 * 1024)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "bad json"}, 400)
            if not isinstance(body, dict):
                return self._json({"error": "expected an object"}, 400)
            path = self.path
            h = app.studio.history
            if path == "/api/settings":
                try:
                    return self._json(app.save_settings(body))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            if path == "/api/doctor/critique":
                try:
                    return self._json(app.doctor_critique(body.get("script") or {}))
                except Exception as e:
                    return self._json({"error": str(e)}, 400)
            if path == "/api/doctor/rewrite":
                try:
                    return self._json(app.doctor_rewrite(body.get("script") or {}, body.get("score"),
                                                         body.get("issues") or []))
                except Exception as e:
                    return self._json({"error": str(e)}, 400)
            if path == "/api/doctor/passes":
                label = f"Script Doctor ×{int(body.get('passes') or 2)}"
                return self._json({"job": app.submit("doctor", body, label).id})
            if path in ("/api/make", "/api/draft"):
                kind = "make" if path == "/api/make" else "draft"
                label = (body.get("script") or {}).get("title") if isinstance(body.get("script"), dict) else None
                label = (label or body.get("topic") or body.get("url")
                         or ("Demo video" if body.get("offline") else
                             "Next idea from the queue" if body.get("source") == "queue" else "AI-picked topic"))
                return self._json({"job": app.submit(kind, body, str(label)[:120]).id})
            if path == "/api/clip":
                if not str(body.get("source") or "").strip():
                    return self._json({"error": "give a video file path or URL"}, 400)
                src = str(body["source"]).strip()
                name = src if re.match(r"^https?://", src) else (Path(src).name or src)
                return self._json({"job": app.submit("clip", body, f"Clip: {name[:100]}").id})
            if path == "/api/plan":
                label = f"Plan {body.get('count') or 10} ideas" + (f" · {body['niche']}" if body.get("niche") else "")
                return self._json({"job": app.submit("plan", body, label).id})
            if path == "/api/stats":
                return self._json({"job": app.submit("stats", {}, "Refresh channel stats").id})
            if path == "/api/ideas":
                subject = str(body.get("subject") or "").strip()
                if not subject:
                    return self._json({"error": "empty idea"}, 400)
                from .script import STYLES
                return self._json({"id": h.add_idea(subject[:300], _choice(body.get("style"), STYLES, ""),
                                                    str(body.get("notes") or "")[:500])})
            m = re.fullmatch(r"/api/ideas/(\d+)/delete", path)
            if m:
                h.delete_idea(int(m.group(1)))
                return self._json({"ok": True})
            m = re.fullmatch(r"/api/upload/(\d+)", path)
            if m:
                rec = h.get(int(m.group(1)))
                label = f"Upload: {rec['title']}" if rec else f"Upload #{m.group(1)}"
                return self._json({"job": app.submit("upload", {"id": int(m.group(1))}, label).id})
            m = re.fullmatch(r"/api/drafts/([\w-]+)/scenes/(\d+)/search", path)
            if m:
                try:
                    return self._json(app.draft_search(m.group(1), int(m.group(2)), str(body.get("query") or "")))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/drafts/([\w-]+)/scenes/(\d+)/pick", path)
            if m:
                try:
                    return self._json(app.draft_pick(m.group(1), int(m.group(2)), body.get("item") or body))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/drafts/([\w-]+)/scenes/(\d+)/manual", path)
            if m:
                try:
                    return self._json(app.draft_manual(m.group(1), int(m.group(2)), str(body.get("path") or "")))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/videos/(\d+)/scenes/(\d+)/search", path)
            if m:
                try:
                    return self._json(app.scene_search(int(m.group(1)), int(m.group(2)), str(body.get("query") or "")))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/videos/(\d+)/scenes/(\d+)/pick", path)
            if m:
                try:
                    return self._json(app.scene_pick(int(m.group(1)), int(m.group(2)), body.get("item") or body))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/videos/(\d+)/scenes/(\d+)/manual", path)
            if m:
                try:
                    return self._json(app.scene_manual(int(m.group(1)), int(m.group(2)), str(body.get("path") or "")))
                except ValueError as e:
                    return self._json({"error": str(e)}, 400)
            m = re.fullmatch(r"/api/videos/(\d+)/render", path)
            if m:
                rec = h.get(int(m.group(1)))
                label = f"Re-render: {rec['title']}" if rec else f"Re-render #{m.group(1)}"
                return self._json({"job": app.submit("render", {"id": int(m.group(1)),
                                                                "upload": bool(body.get("upload"))}, label).id})
            m = re.fullmatch(r"/api/videos/(\d+)/delete", path)
            if m:
                return self._json({"ok": app.studio.delete(int(m.group(1)))})
            m = re.fullmatch(r"/api/jobs/(\d+)/cancel", path)
            if m:
                return self._json({"ok": app.cancel(int(m.group(1)))})
            self._json({"error": "not found"}, 404)

    return H


def serve(settings: Settings, host: str = "127.0.0.1", port: int = 8765, open_browser: bool = True,
          env_file: str | Path | None = None) -> None:
    app = StudioServer(settings, env_file=env_file)
    httpd = ThreadingHTTPServer((host, port), _handler(app, host))
    url = f"http://{'127.0.0.1' if host in ('0.0.0.0', '::') else host}:{port}/"
    log.info("PurffleShorts Studio running at %s  (Ctrl+C to stop)", url)
    if host not in LOCAL_HOSTS:
        log.warning("Studio is reachable from your network on %s — anyone who can load the page can use it.", host)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
