"""
Dashboard server — simple HTTP + Server-Sent Events (no WebSocket, no async).
Compatible with Python 3.9+. No extra dependencies beyond stdlib + fastapi.
"""

import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
import os

log = logging.getLogger(__name__)

_state: dict = {}
_state_lock = threading.Lock()

STATIC_DIR = os.path.dirname(__file__)


def push_state(state: dict):
    """Called from the bot loop every tick to update shared state."""
    with _state_lock:
        _state.update(state)


class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # silence access logs

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._serve_file(os.path.join(STATIC_DIR, "index.html"), "text/html")
        elif self.path == "/state":
            self._serve_state()
        else:
            self.send_error(404)

    def _serve_file(self, path: str, content_type: str):
        try:
            with open(path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404)

    def _serve_state(self):
        with _state_lock:
            data = json.dumps(_state).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def start(host: str = "0.0.0.0", port: int = 8765):
    server = HTTPServer((host, port), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="dashboard")
    t.start()
    log.info("Dashboard running at http://localhost:%d", port)
