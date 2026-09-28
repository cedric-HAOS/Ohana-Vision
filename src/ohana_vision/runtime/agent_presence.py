"""Agent delivery activity observed by Vision, independent of Agent timestamps."""

from collections.abc import Callable
from datetime import datetime
from threading import Lock
from time import monotonic
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
AGENT_SILENCE_SECONDS = 300


class AgentPresence:
    """Measure silence with Vision's monotonic clock, even across clock changes."""

    def __init__(self, *, timer: Callable[[], float] = monotonic) -> None:
        self._timer = timer
        self._lock = Lock()
        self._reference: float | None = None
        self._last_received_at: datetime | None = None

    def start(self) -> None:
        # Persisted observations do not prove a contact since Vision restarted.
        with self._lock:
            self._reference = self._timer()
            self._last_received_at = None

    def received(self, now: datetime) -> None:
        with self._lock:
            self._reference = self._timer()
            self._last_received_at = now

    def snapshot(self, *, now: datetime, running: bool) -> dict[str, object]:
        with self._lock:
            silence = (
                max(int(self._timer() - self._reference), 0)
                if self._reference is not None
                else None
            )
            last = self._last_received_at
        state = "unknown"
        if running and silence is not None:
            if silence > AGENT_SILENCE_SECONDS:
                state = "silent"
            else:
                state = "active" if last is not None else "waiting"
        return {
            "state": state,
            "last_received_at": last.astimezone(PARIS).isoformat() if last else None,
            "silence_seconds": silence,
            "max_silence_seconds": AGENT_SILENCE_SECONDS,
            "measured_by": "vision",
            "generated_at": now.astimezone(PARIS).isoformat(),
        }
