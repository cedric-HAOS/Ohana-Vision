"""Outcome of the Shizune bridge from Vision to the Agent (Phase 5)."""

from collections.abc import Callable
from datetime import datetime
from threading import Lock
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")


def _paris(value: datetime | None) -> str | None:
    return value.astimezone(PARIS).isoformat() if value is not None else None


class ShizuneGateway:
    """Last relayed call and last failure, kept in memory only.

    An Agent answer, even a 4xx refusal, proves the bridge works; only an
    unreachable Agent or a 5xx counts as a gateway failure. Nothing is
    persisted: a Vision restart starts a new period without evidence.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self.configured = False
        self._last_success_at: datetime | None = None
        self._last_failure_at: datetime | None = None
        self._last_failure: str | None = None

    def succeeded(self, now: datetime) -> None:
        with self._lock:
            self._last_success_at = now

    def failed(self, now: datetime, reason: str) -> None:
        with self._lock:
            self._last_failure_at = now
            self._last_failure = reason[:300]

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            success = self._last_success_at
            failure = self._last_failure_at
            reason = self._last_failure
        if not self.configured:
            state = "unconfigured"
        elif success is None and failure is None:
            state = "unused"
        elif failure is not None and (success is None or failure > success):
            state = "failing"
        else:
            state = "available"
        return {
            "state": state,
            "last_success_at": _paris(success),
            "last_failure_at": _paris(failure),
            "last_failure": reason,
            "measured_by": "vision",
        }


def record_call(
    gateway: ShizuneGateway | None,
    now: Callable[[], datetime],
    *,
    reached_agent: bool,
    reason: str = "",
) -> None:
    if gateway is None:
        return
    if reached_agent:
        gateway.succeeded(now())
    else:
        gateway.failed(now(), reason)
