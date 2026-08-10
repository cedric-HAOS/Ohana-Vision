"""Observation processing pipeline."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
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


class ObservationStoreProtocol(Protocol):
    """Minimal observation store contract required by the processor."""

    @property
    def observation_count(self) -> int:
        """Return the number of stored observations."""

    @property
    def observations(self) -> tuple[Observation, ...]:
        """Return stored observations in ingestion order."""

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

    def process(self, observation: Observation) -> ProcessingResult:
        """Process an observation through the backend pipeline."""
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
            candidate_observations = (
                *self.observation_store.observations,
                observation,
            )
            candidate_timeline = self.timeline_engine.build_infrastructure(
                tuple(
                    candidate
                    for candidate in candidate_observations
                    if candidate.contributes_to_health
                )
            )

            self.observation_store.add(observation)
            incident_transition = (
                self.incident_store.process(observation)
                if self.incident_store is not None
                else None
            )
        except DuplicateObservationError:
            self.runtime.record_accepted()
            return ProcessingResult.accepted_result(
                observation_id=observation.observation_id,
                snapshot=self._snapshot(),
                duration=self._duration_since(started),
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
        self.infrastructure_timeline = candidate_timeline

        self.runtime.record_accepted()

        return ProcessingResult.accepted_result(
            observation_id=observation.observation_id,
            snapshot=self._snapshot(),
            duration=self._duration_since(started),
            timeline_updated=timeline_updated,
            incident_updated=incident_transition is not None,
            incident_id=(
                incident_transition.incident.incident_id
                if incident_transition is not None
                else None
            ),
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
            self.runtime.record_rejected()

        return ProcessingResult.rejected_result(
            observation_id=observation.observation_id,
            snapshot=self._snapshot(),
            duration=self._duration_since(started),
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
