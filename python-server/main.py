"""
Python torrent streaming server — FastAPI + libtorrent
API-compatible with the previous Node.js standalone-server.

Endpoints:
  GET  /health
  POST /api/torrent/add          → { id, status: 'connecting' }  (non-blocking)
  GET  /api/torrent/stream/{id}/{file_index}   → byte-range video stream
  WS   /ws/torrent/{id}          → progress events (metadata/progress/ready/error)
  GET  /api/streams              → list active streams
  DELETE /api/streams/{id}       → remove a stream

libtorrent advantages:
  • set_sequential_download(True)  — pieces downloaded front-to-back
  • piece_priority(idx, 7)         — boost leading-edge pieces for low latency
  • prioritize_files([...])        — skip files we don't care about
  • Native C++ speed, real DHT/tracker support
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import libtorrent as lt
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

PORT = int(os.environ.get("PORT", 8080))
API_KEY = os.environ.get("RELAY_API_KEY", "")        # empty → dev mode (no auth)
MAX_STREAMS = int(os.environ.get("MAX_STREAMS", 20))
STREAM_TTL_MIN = int(os.environ.get("STREAM_TTL_MIN", 30))
DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "trhstreamer"
PIECE_WAIT_TIMEOUT = 60          # seconds to wait for a piece before 503
PROGRESS_INTERVAL = 0.5          # seconds between progress broadcasts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("server")

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────────────
# CORS origins
# ──────────────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]

# ──────────────────────────────────────────────────────────────────────────────
# libtorrent session (module-level singleton)
# ──────────────────────────────────────────────────────────────────────────────

def _make_session() -> lt.session:
    settings = {
        "announce_to_all_trackers": True,
        "announce_to_all_tiers": True,
        "connection_speed": 200,
        "connections_limit": 500,
        "active_downloads": MAX_STREAMS,
        "active_seeds": MAX_STREAMS,
        "active_limit": MAX_STREAMS * 2,
        "dht_bootstrap_nodes": "router.bittorrent.com:6881,dht.transmissionbt.com:6881",
        "enable_dht": True,
        "enable_lsd": True,
        "enable_upnp": True,
        "enable_natpmp": True,
        "listen_interfaces": "0.0.0.0:6881",
    }
    ses = lt.session(settings)
    return ses


session = _make_session()

# ──────────────────────────────────────────────────────────────────────────────
# Stream registry
# ──────────────────────────────────────────────────────────────────────────────

class TorrentEntry:
    def __init__(self, stream_id: str, handle: lt.torrent_handle, save_path: Path):
        self.id = stream_id
        self.handle = handle
        self.save_path = save_path
        self.created_at = time.time()
        self.last_accessed = time.time()
        # metadata (filled once torrent_info is available)
        self.info: lt.torrent_info | None = None
        self.files: list[dict] = []
        # last-known events per type, sent to late-joining WebSocket clients
        self.status_cache: dict[str, dict] = {}
        # WebSocket subscriber queues {ws → asyncio.Queue}
        self.subscribers: dict[WebSocket, asyncio.Queue] = {}

    def touch(self):
        self.last_accessed = time.time()

    def is_expired(self) -> bool:
        age_min = (time.time() - self.last_accessed) / 60
        return age_min > STREAM_TTL_MIN


registry: dict[str, TorrentEntry] = {}
info_hash_to_id: dict[str, str] = {}

# ──────────────────────────────────────────────────────────────────────────────
# WebSocket helpers
# ──────────────────────────────────────────────────────────────────────────────

async def _ws_subscribe(entry: TorrentEntry, ws: WebSocket) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=128)
    entry.subscribers[ws] = q
    # replay cached events so late-joiners instantly see current state
    for event in entry.status_cache.values():
        await q.put(event)
    return q


def _ws_unsubscribe(entry: TorrentEntry, ws: WebSocket):
    entry.subscribers.pop(ws, None)


async def _broadcast(entry: TorrentEntry, event: dict):
    """Cache and fan-out a WS event to all subscribers."""
    entry.status_cache[event["type"]] = event
    dead: list[WebSocket] = []
    for ws, q in entry.subscribers.items():
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(ws)
    for ws in dead:
        entry.subscribers.pop(ws, None)

# ──────────────────────────────────────────────────────────────────────────────
# Background polling loop
# ──────────────────────────────────────────────────────────────────────────────

async def _progress_loop():
    """Poll libtorrent handles, emit progress events, evict expired streams."""
    while True:
        await asyncio.sleep(PROGRESS_INTERVAL)

        expired = [eid for eid, e in list(registry.items()) if e.is_expired()]
        for eid in expired:
            _evict(eid)

        for entry in list(registry.values()):
            try:
                await _poll_torrent(entry)
            except Exception as exc:
                log.warning("Poll error %s: %s", entry.id, exc)


async def _poll_torrent(entry: TorrentEntry):
    h = entry.handle
    if not h.is_valid():
        return

    s = h.status()

    # ── metadata just arrived ──────────────────────────────────────────────
    if entry.info is None and s.has_metadata:
        ti = h.torrent_file()
        if ti is None:
            return
        entry.info = ti
        fs = ti.files()
        entry.files = [
            {
                "index": i,
                "name": Path(fs.file_path(i)).name,
                "path": fs.file_path(i),
                "length": fs.file_size(i),
            }
            for i in range(fs.num_files())
        ]
        # sequential download + prioritise first file
        h.set_sequential_download(True)
        prios = [1] * fs.num_files()
        if prios:
            prios[0] = 7
        h.prioritize_files(prios)

        await _broadcast(entry, {
            "type": "metadata",
            "name": ti.name(),
            "files": entry.files,
            "totalSize": ti.total_size(),
            "infoHash": str(ti.info_hashes().v1),
        })

    if entry.info is None:
        return

    # ── progress ────────────────────────────────────────────────────────────
    await _broadcast(entry, {
        "type": "progress",
        "progress": round(s.progress, 4),
        "downloadSpeed": s.download_rate,
        "uploadSpeed": s.upload_rate,
        "numPeers": s.num_peers,
    })

    # ── signal ready once >1% downloaded (enough to start streaming) ────────
    if s.progress > 0.01 and "ready" not in entry.status_cache:
        await _broadcast(entry, {"type": "ready"})


def _evict(stream_id: str):
    entry = registry.pop(stream_id, None)
    if entry is None:
        return
    if entry.info:
        try:
            ih = str(entry.info.info_hashes().v1)
            if info_hash_to_id.get(ih) == stream_id:
                del info_hash_to_id[ih]
        except Exception:
            pass
    try:
        session.remove_torrent(entry.handle)
    except Exception:
        pass
    err = {"type": "error", "message": "Stream evicted (TTL or capacity limit)"}
    for q in entry.subscribers.values():
        try:
            q.put_nowait(err)
        except asyncio.QueueFull:
            pass
    log.info("Evicted stream %s", stream_id)

# ──────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_progress_loop())
    log.info("libtorrent session started — polling loop running on port %s", PORT)
    yield
    task.cancel()
    session.pause()
    log.info("Server shut down cleanly")


app = FastAPI(title="trhstreamer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Auth
# ──────────────────────────────────────────────────────────────────────────────

def require_api_key(request: Request):
    if not API_KEY:
        return  # dev mode — no key set
    key = request.headers.get("x-api-key", "")
    if not secrets.compare_digest(key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")

# ──────────────────────────────────────────────────────────────────────────────
# GET /health
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "streams": len(registry),
        "maxStreams": MAX_STREAMS,
    }

# ──────────────────────────────────────────────────────────────────────────────
# POST /api/torrent/add
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/torrent/add", dependencies=[Depends(require_api_key)])
async def add_torrent(request: Request):
    body = await request.json()
    magnet_uri: str = body.get("magnetUri", "")
    if not magnet_uri.startswith("magnet:"):
        raise HTTPException(status_code=400, detail="Invalid magnet URI")

    # parse_magnet_uri returns an add_torrent_params directly
    add_params = lt.parse_magnet_uri(magnet_uri)

    # extract info-hash for dedup
    ih: str | None = None
    try:
        ih = str(add_params.info_hashes.v1)
        if ih == "0000000000000000000000000000000000000000":
            ih = None
    except Exception:
        pass

    if ih and ih in info_hash_to_id:
        existing_id = info_hash_to_id[ih]
        if existing_id in registry:
            entry = registry[existing_id]
            entry.touch()
            status = "ready" if "ready" in entry.status_cache else "connecting"
            result: dict[str, Any] = {"id": existing_id, "status": status}
            if entry.files:
                result["files"] = entry.files
            return result

    # enforce capacity — evict the least-recently-used stream
    if len(registry) >= MAX_STREAMS:
        oldest = min(registry.values(), key=lambda e: e.last_accessed)
        _evict(oldest.id)

    stream_id = secrets.token_urlsafe(16)
    save_path = DOWNLOAD_DIR / stream_id
    save_path.mkdir(parents=True, exist_ok=True)

    add_params.save_path = str(save_path)
    add_params.storage_mode = lt.storage_mode_t.storage_mode_sparse
    add_params.flags |= lt.torrent_flags.sequential_download

    handle = session.add_torrent(add_params)
    handle.set_sequential_download(True)

    entry = TorrentEntry(stream_id, handle, save_path)
    registry[stream_id] = entry
    if ih:
        info_hash_to_id[ih] = stream_id

    log.info("Added torrent %s", stream_id)
    return {"id": stream_id, "status": "connecting"}

# ──────────────────────────────────────────────────────────────────────────────
# GET /api/torrent/stream/{id}/{file_index}
# ──────────────────────────────────────────────────────────────────────────────

CHUNK = 256 * 1024   # 256 KB read chunks

MIME_MAP = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".ts":  "video/mp2t",
    ".m4v": "video/mp4",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
}


def _mime_for(name: str) -> str:
    return MIME_MAP.get(Path(name).suffix.lower(), "application/octet-stream")


async def _wait_for_piece(handle: lt.torrent_handle, piece_idx: int):
    """Wait until piece is downloaded, boosting its priority."""
    deadline = time.time() + PIECE_WAIT_TIMEOUT
    while time.time() < deadline:
        s = handle.status()
        pieces = s.pieces
        if pieces and piece_idx < len(pieces) and pieces[piece_idx]:
            return
        # bump priority on this piece and look-ahead
        handle.piece_priority(piece_idx, 7)
        if piece_idx + 1 < len(pieces):
            handle.piece_priority(piece_idx + 1, 6)
        if piece_idx + 2 < len(pieces):
            handle.piece_priority(piece_idx + 2, 5)
        await asyncio.sleep(0.1)
    raise TimeoutError(f"Piece {piece_idx} not available after {PIECE_WAIT_TIMEOUT}s")


async def _stream_generator(
    handle: lt.torrent_handle,
    file_abs_path: Path,
    ti: lt.torrent_info,
    file_index: int,
    start: int,
    end: int,
):
    """Async generator yielding [start, end] bytes, waiting per piece."""
    fs = ti.files()
    piece_length = ti.piece_length()
    file_offset = fs.file_offset(file_index)

    pos = start
    loop = asyncio.get_running_loop()

    def _read_chunk(fh, size: int) -> bytes:
        return fh.read(size)

    with open(file_abs_path, "rb") as fh:
        fh.seek(pos)
        while pos <= end:
            abs_offset = file_offset + pos
            piece_idx = abs_offset // piece_length

            await _wait_for_piece(handle, piece_idx)

            remaining = end - pos + 1
            size = min(CHUNK, remaining)
            # offload blocking read to thread pool so event loop stays free
            data = await loop.run_in_executor(None, _read_chunk, fh, size)
            if not data:
                break
            yield data
            pos += len(data)


@app.get("/api/torrent/stream/{stream_id}/{file_index}")
async def stream_file(stream_id: str, file_index: int, request: Request):
    entry = registry.get(stream_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Stream not found")
    entry.touch()

    # wait up to 60s for metadata
    deadline = time.time() + 60
    while entry.info is None and time.time() < deadline:
        await asyncio.sleep(0.5)
    if entry.info is None:
        raise HTTPException(status_code=503, detail="Metadata not yet available — try again shortly")

    ti = entry.info
    fs = ti.files()
    if file_index >= fs.num_files():
        raise HTTPException(status_code=400, detail="Invalid file index")

    file_size = fs.file_size(file_index)
    file_rel_path = fs.file_path(file_index)
    file_abs_path = entry.save_path / file_rel_path
    file_name = Path(file_rel_path).name

    # boost priority for the requested file
    prios = [1] * fs.num_files()
    prios[file_index] = 7
    entry.handle.prioritize_files(prios)

    # parse Range header
    start, end = 0, file_size - 1
    range_header = request.headers.get("range", "")
    if range_header.startswith("bytes="):
        parts = range_header[6:].split("-")
        try:
            if parts[0]:
                start = int(parts[0])
            if len(parts) > 1 and parts[1]:
                end = int(parts[1])
        except ValueError:
            pass

    start = max(0, start)
    end = min(file_size - 1, end)
    if start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    content_length = end - start + 1
    mime = _mime_for(file_name)
    status_code = 206 if range_header else 200

    headers = {
        "Content-Type": mime,
        "Content-Length": str(content_length),
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Cache-Control": "no-cache",
    }

    return StreamingResponse(
        _stream_generator(entry.handle, file_abs_path, ti, file_index, start, end),
        status_code=status_code,
        headers=headers,
        media_type=mime,
    )

# ──────────────────────────────────────────────────────────────────────────────
# WS /ws/torrent/{id}
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/torrent/{stream_id}")
async def ws_torrent(websocket: WebSocket, stream_id: str):
    await websocket.accept()
    entry = registry.get(stream_id)
    if entry is None:
        await websocket.send_json({"type": "error", "message": "Stream not found"})
        await websocket.close()
        return

    queue = await _ws_subscribe(entry, websocket)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                # keepalive ping (ignored by the frontend switch statement)
                await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _ws_unsubscribe(entry, websocket)

# ──────────────────────────────────────────────────────────────────────────────
# Stream management
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/streams", dependencies=[Depends(require_api_key)])
def list_streams():
    return [
        {
            "id": e.id,
            "name": e.info.name() if e.info else None,
            "createdAt": e.created_at,
            "lastAccessed": e.last_accessed,
        }
        for e in registry.values()
    ]


@app.delete("/api/streams/{stream_id}", dependencies=[Depends(require_api_key)])
def remove_stream(stream_id: str):
    if stream_id not in registry:
        raise HTTPException(status_code=404, detail="Stream not found")
    _evict(stream_id)
    return {"ok": True}
