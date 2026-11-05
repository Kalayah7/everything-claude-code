"""Append-only JSONL journal of signals, risk decisions, orders and fills."""

from __future__ import annotations

import json
from datetime import datetime, timezone


class Journal:
    def __init__(self, path: str | None = None):
        self.path = path
        self.records: list[dict] = []

    def log(self, event: str, **fields) -> dict:
        rec = {"logged_at": datetime.now(timezone.utc).isoformat(), "event": event, **fields}
        self.records.append(rec)
        if self.path:
            with open(self.path, "a") as f:
                f.write(json.dumps(rec, default=str) + "\n")
        return rec
