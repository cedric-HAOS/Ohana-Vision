"""Backend runtime orchestration."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from ohana_vision.runtime.agent_presence import AgentPresence
from ohana_vision.runtime.backend_runtime_state import (
    BackendRuntimeState,
)
from ohana_vision.runtime.runtime_snapshot import RuntimeSnapshot
from ohana_vision.runtime.runtime_statistics import RuntimeStatistics


class BackendRuntimeError(RuntimeError):
    """Raised when a backend runtime operation is not allowed."""


PARIS = ZoneInfo("Europe/Paris")


def utc_now() -> datetime:
    """Return the current UTC datetime."""

    return datetime.now(UTC)


def _paris_iso(value: datetime | None) -> str | None:
    return value.astimezone(PARIS).isoformat() if value is not None else None


@dataclass(slots=True)
class BackendRuntime:
    """Manage the lifecycle and state of the Ohana-Vision backend."""

    clock: Callable[[], datetime] = utc_now
    agent_presence: AgentPresence = field(default_factory=AgentPresence)
    state: BackendRuntimeState = field(
        default=BackendRuntimeState.CREATED,
        init=False,
    )
    statistics: RuntimeStatistics = field(
        default_factory=RuntimeStatistics,
        init=False,
    )
    started_at: datetime | None = field(
        default=None,
        init=False,
    )
    stopped_at: datetime | None = field(
        default=None,
        init=False,
    )

    @property
    def running(self) -> bool:
        """Return whether the backend runtime is running."""

        return self.state is BackendRuntimeState.RUNNING

    @property
    def healthy(self) -> bool:
        """Return whether the backend runtime is operational."""

        return self.state.healthy

    def start(self) -> None:
        """Start the backend runtime.

        Raises:
            BackendRuntimeError: If the runtime cannot be started from its
                current state.
        """

        if self.state not in {
            BackendRuntimeState.CREATED,
            BackendRuntimeState.STOPPED,
        }:
            raise BackendRuntimeError(
                f"Cannot start backend runtime from state {self.state.value}"
            )

        self.state = BackendRuntimeState.STARTING

        try:
            started_at = self.clock()
            self._validate_datetime(started_at)

            self.started_at = started_at
            self.agent_presence.start()
            self.stopped_at = None
            self.state = BackendRuntimeState.RUNNING
        except Exception:
            self.state = BackendRuntimeState.FAILED
            raise

    def stop(self) -> None:
        """Stop the backend runtime.

        Raises:
            BackendRuntimeError: If the runtime is not running.
        """

        if self.state is not BackendRuntimeState.RUNNING:
            raise BackendRuntimeError(
                f"Cannot stop backend runtime from state {self.state.value}"
            )

        self.state = BackendRuntimeState.STOPPING

        try:
            stopped_at = self.clock()
            self._validate_datetime(stopped_at)

            self.stopped_at = stopped_at
            self.state = BackendRuntimeState.STOPPED
        except Exception:
            self.state = BackendRuntimeState.FAILED
            raise

    def fail(self, occurred_at: datetime | None = None) -> None:
        """Mark the runtime as failed and record the error."""

        self.record_error(occurred_at)
        self.state = BackendRuntimeState.FAILED

    def record_received(self, received_at: datetime) -> None:
        """Record a newly received observation."""

        self._validate_datetime(received_at)
        self.statistics = self.statistics.record_received(received_at)

    def record_accepted(self, processing_ms: float | None = None) -> None:
        """Record an accepted observation."""

        now = self.clock()
        self.statistics = self.statistics.record_accepted(
            processing_ms, ingested_at=now
        )
        self.agent_presence.received(now)

    def record_rejected(self, processing_ms: float | None = None) -> None:
        """Record a rejected observation."""

        now = self.clock()
        self.statistics = self.statistics.record_rejected(
            processing_ms, ingested_at=now
        )
        self.agent_presence.received(now)

    def record_error(self, occurred_at: datetime | None = None) -> None:
        """Record a runtime error."""

        error_at = occurred_at or self.clock()
        self._validate_datetime(error_at)

        self.statistics = self.statistics.record_error(error_at)

    def reset_statistics(self) -> None:
        """Reset all runtime statistics."""

        self.statistics = RuntimeStatistics()

    def vitals(self) -> dict[str, object]:
        """Phase 5: whether Vision is up and still ingesting, in Paris time."""

        now = self.clock()
        last = self.statistics.last_ingested_at
        # Right after a start nothing is ingested yet: count from the start.
        reference = last or self.started_at
        return {
            "state": self.state.value,
            "started_at": _paris_iso(self.started_at),
            "last_ingested_at": _paris_iso(last),
            "ingestion_silence_seconds": (
                max(int((now - reference).total_seconds()), 0)
                if reference is not None
                else None
            ),
            "observations_accepted": self.statistics.observations_accepted,
            "observations_rejected": self.statistics.observations_rejected,
            "errors": self.statistics.errors,
            "generated_at": _paris_iso(now),
            "agent": self.agent_presence.snapshot(now=now, running=self.running),
        }

    def snapshot(
        self,
        *,
        observations_stored: int = 0,
        service_timelines: int = 0,
        node_timelines: int = 0,
        infrastructure_timelines: int = 0,
    ) -> RuntimeSnapshot:
        """Create an immutable snapshot of the runtime."""

        generated_at = self.clock()
        self._validate_datetime(generated_at)

        return RuntimeSnapshot(
            state=self.state,
            statistics=self.statistics,
            generated_at=generated_at,
            observations_stored=observations_stored,
            service_timelines=service_timelines,
            node_timelines=node_timelines,
            infrastructure_timelines=infrastructure_timelines,
        )

    @staticmethod
    def _validate_datetime(value: datetime) -> None:
        """Ensure a datetime is timezone-aware."""

        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Runtime datetimes must be timezone-aware")
