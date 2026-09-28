"""Observation processing pipeline."""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import RLock
from time import monotonic
from typing import Protocol

from ohana_vision.domain.incident import IncidentTransition
from ohana_vision.domain.observation import Observation
from ohana_vision.domain.observation_store import DuplicateObservationError
from ohana_vision.runtime.backend_runtime import BackendRuntime
from ohana_vision.runtime.processing_result import ProcessingResult
from ohana_vision.runtime.runtime_snapshot import RuntimeSnapshot
from ohana_vision.timeline.infrastructure_timeline import (
    InfrastructureTimeline,
)

# Enough to show recent transitions in the runtime counters; the timeline
# history itself is read from the store by the timeline API.
HEALTH_CHANGES_PER_CAPABILITY = 16


class ObservationStoreProtocol(Protocol):
    """Minimal observation store contract required by the processor."""

    @property
    def observation_count(self) -> int:
        """Return the number of stored observations."""

    def latest_per_capability(self) -> tuple[Observation, ...]:
        """Return the latest observation for each capability identity."""

    def add(self, observation: Observation) -> Observation:
        """Store and return an observation."""


class TimelineEngineProtocol(Protocol):
    """Minimal timeline engine contract required by the processor."""

    def build_infrastructure(
        self,
        observations: tuple[Observation, ...],
    ) -> InfrastructureTimeline:
        """Build the complete infrastructure timeline hierarchy."""


class IncidentStoreProtocol(Protocol):
    """Minimal incident store contract required by the processor."""

    def process(self, observation: Observation) -> IncidentTransition | None:
        """Apply one observation to the incident lifecycle."""


@dataclass(slots=True)
class ObservationProcessor:
    """Orchestrate observation storage and timeline reconstruction."""

    runtime: BackendRuntime
    observation_store: ObservationStoreProtocol
    timeline_engine: TimelineEngineProtocol
    incident_store: IncidentStoreProtocol | None = None
    timer: Callable[[], float] = monotonic
    infrastructure_timeline: InfrastructureTimeline = field(
        default_factory=InfrastructureTimeline,
        init=False,
    )
    _latest_observations: dict[tuple[str, str, str], Observation] = field(
        default_factory=dict,
        init=False,
    )
    # Last health changes per capability. The whole list since start was
    # kept and rebuilt on every change: it grew without bound.
    _health_changes: dict[tuple[str, str, str], deque[Observation]] = field(
        default_factory=dict,
        init=False,
    )
    # Ingestion runs in worker threads so a slow disk never stalls the loop.
    _lock: RLock = field(default_factory=RLock, init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        """Restore only the compact current state needed during ingestion."""
        self._latest_observations = {
            self._capability_key(observation): observation
            for observation in self.observation_store.latest_per_capability()
        }
        self._health_changes = {
            key: deque((observation,), maxlen=HEALTH_CHANGES_PER_CAPABILITY)
            for key, observation in self._latest_observations.items()
            if observation.contributes_to_health
        }
        if self._latest_observations:
            self.infrastructure_timeline = self._timeline(self._health_changes)

    def process(self, observation: Observation) -> ProcessingResult:
        """Process an observation through the backend pipeline."""
        with self._lock:
            return self._process(observation)

    def _process(self, observation: Observation) -> ProcessingResult:
        started = self.timer()

        if not self.runtime.running:
            return self._reject(
                observation=observation,
                started=started,
                reason="Backend runtime is not running",
                record_received=False,
            )

        self.runtime.record_received(observation.observed_at)

        try:
            candidate_observations = dict(self._latest_observations)
            key = self._capability_key(observation)
            current = candidate_observations.get(key)
            replaces_current = (
                current is None or observation.observed_at >= current.observed_at
            )
            status_changed = replaces_current and (
                current is None or observation.status is not current.status
            )
            health_changed = observation.contributes_to_health and (
                current is None or observation.status is not current.status
            )
            if replaces_current:
                candidate_observations[key] = observation
            candidate_changes = self._health_changes
            if health_changed:
                changes = deque(
                    sorted(
                        (*self._health_changes.get(key, ()), observation),
                        key=lambda item: item.observed_at,
                    ),
                    maxlen=HEALTH_CHANGES_PER_CAPABILITY,
                )
                candidate_changes = {**self._health_changes, key: changes}
            candidate_timeline = (
                self._timeline(candidate_changes)
                if health_changed
                else self.infrastructure_timeline
            )

            self.observation_store.add(observation)
            incident_transition = (
                self.incident_store.process(observation)
                if self.incident_store is not None
                else None
            )
        except DuplicateObservationError:
            duration = self._duration_since(started)
            self.runtime.record_accepted(duration.total_seconds() * 1000)
            return ProcessingResult.accepted_result(
                observation_id=observation.observation_id,
                snapshot=self._snapshot(),
                duration=duration,
                timeline_updated=False,
            )
        except (TypeError, ValueError, KeyError) as exc:
            return self._reject(
                observation=observation,
                started=started,
                reason=str(exc) or exc.__class__.__name__,
                record_received=True,
            )
        except Exception:
            self.runtime.record_error()
            raise

        timeline_updated = candidate_timeline != self.infrastructure_timeline
        self._latest_observations = candidate_observations
        self._health_changes = candidate_changes
        self.infrastructure_timeline = candidate_timeline

        duration = self._duration_since(started)
        self.runtime.record_accepted(duration.total_seconds() * 1000)

        return ProcessingResult.accepted_result(
            observation_id=observation.observation_id,
            snapshot=self._snapshot(),
            duration=duration,
            timeline_updated=timeline_updated,
            incident_updated=incident_transition is not None,
            incident_id=(
                incident_transition.incident.incident_id
                if incident_transition is not None
                else None
            ),
            status_changed=status_changed,
        )

    def _timeline(
        self, changes: dict[tuple[str, str, str], deque[Observation]]
    ) -> InfrastructureTimeline:
        return self.timeline_engine.build_infrastructure(
            tuple(observation for items in changes.values() for observation in items)
        )

    def latest_observation(self, *, capability_id: str) -> Observation | None:
        """Return the latest compact current state for one capability."""
        current = self._latest_observations
        return max(
            (
                observation
                for observation in current.values()
                if observation.capability_id == capability_id
            ),
            key=lambda observation: observation.observed_at,
            default=None,
        )

    def _reject(
        self,
        *,
        observation: Observation,
        started: float,
        reason: str,
        record_received: bool,
    ) -> ProcessingResult:
        """Create a rejected processing result."""
        if record_received:
            duration = self._duration_since(started)
            self.runtime.record_rejected(duration.total_seconds() * 1000)
        else:
            duration = self._duration_since(started)

        return ProcessingResult.rejected_result(
            observation_id=observation.observation_id,
            snapshot=self._snapshot(),
            duration=duration,
            reason=reason,
        )

    def _snapshot(self) -> RuntimeSnapshot:
        """Create a snapshot from the current pipeline state."""
        service_timelines = sum(
            len(node.services) for node in self.infrastructure_timeline.nodes
        )

        infrastructure_timelines = (
            1
            if (
                self.infrastructure_timeline.nodes
                or self.infrastructure_timeline.periods
            )
            else 0
        )

        return self.runtime.snapshot(
            observations_stored=(self.observation_store.observation_count),
            service_timelines=service_timelines,
            node_timelines=len(self.infrastructure_timeline.nodes),
            infrastructure_timelines=infrastructure_timelines,
        )

    def _duration_since(
        self,
        started: float | datetime,
    ) -> timedelta:
        """Return the non-negative processing duration."""
        elapsed = self.timer() - started

        if isinstance(elapsed, timedelta):
            return max(
                elapsed,
                timedelta(),
            )

        return timedelta(
            seconds=max(elapsed, 0.0),
        )

    @staticmethod
    def _capability_key(observation: Observation) -> tuple[str, str, str]:
        return observation.node_id, observation.service_id, observation.capability_id
