"""
Dashboard WebSocket server — runs in a background thread inside main.py.
Broadcasts bot state to all connected browser clients every second.
"""

import asyncio
import json
import logging
import threading
from typing import Set, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

log = logging.getLogger(__name__)

app = FastAPI()

# Shared state — written by the bot loop, read by WebSocket broadcaster
_state: dict = {}
_clients: Set[WebSocket] = set()
_lock = asyncio.Lock()

STATIC_DIR = os.path.join(os.path.dirname(__file__))


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _clients.add(ws)
    log.info("Dashboard client connected (%d total)", len(_clients))
    try:
        # Send current state immediately on connect
        if _state:
            await ws.send_text(json.dumps(_state))
        while True:
            await ws.receive_text()   # keep-alive; client sends pings
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(ws)


async def _broadcast(data: dict):
    if not _clients:
        return
    msg = json.dumps(data)
    dead = set()
    for ws in list(_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


def push_state(state: dict):
    """Call from the bot's sync loop to broadcast updated state."""
    _state.update(state)
    try:
        loop = _get_loop()
        asyncio.run_coroutine_threadsafe(_broadcast(state), loop)
    except Exception as e:
        log.debug("Dashboard push error: %s", e)


_loop: asyncio.AbstractEventLoop | None = None


def _get_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is None:
        raise RuntimeError("Dashboard loop not started")
    return _loop


def start(host: str = "0.0.0.0", port: int = 8765):
    """Start the dashboard server in a background daemon thread."""

    def _run():
        global _loop
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
        config = uvicorn.Config(app, host=host, port=port, loop="none",
                                log_level="warning", access_log=False)
        server = uvicorn.Server(config)
        _loop.run_until_complete(server.serve())

    t = threading.Thread(target=_run, daemon=True, name="dashboard")
    t.start()
    log.info("Dashboard running at http://localhost:%d", port)
