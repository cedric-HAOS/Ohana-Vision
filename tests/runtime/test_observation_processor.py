"""Tests for the observation processing pipeline."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation
from ohana_vision.runtime import (
    BackendRuntime,
    BackendRuntimeState,
    ObservationProcessor,
)
from ohana_vision.timeline import (
    InfrastructureTimeline,
    TimelineEngine,
)

OBSERVATION_ID = UUID("00000000-0000-0000-0000-000000000001")

OBSERVED_AT = datetime(
    2026,
    7,
    10,
    15,
    0,
    tzinfo=UTC,
)

RUNTIME_AT = datetime(
    2026,
    7,
    10,
    15,
    1,
    tzinfo=UTC,
)


def make_observation() -> Observation:
    """Create a deterministic observation."""

    return Observation(
        observation_id=OBSERVATION_ID,
        capability_id="dns",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.HEALTHY,
        observed_at=OBSERVED_AT,
        message="DNS resolution succeeded",
    )


@dataclass
class FakeObservationStore:
    """Observation store used by processor tests."""

    stored: list[Observation] = field(default_factory=list)
    error: Exception | None = None

    @property
    def observation_count(self) -> int:
        return len(self.stored)

    @property
    def observations(self) -> tuple[Observation, ...]:
        return tuple(self.stored)

    def latest_per_capability(self) -> tuple[Observation, ...]:
        latest: dict[tuple[str, str, str], Observation] = {}
        for observation in self.stored:
            key = (
                observation.node_id,
                observation.service_id,
                observation.capability_id,
            )
            latest[key] = observation
        return tuple(latest.values())

    def add(self, observation: Observation) -> Observation:
        if self.error is not None:
            raise self.error

        self.stored.append(observation)

        return observation


def test_latest_observation_reads_the_compact_current_state() -> None:
    older = make_observation()
    newer = Observation(
        observation_id=UUID("00000000-0000-0000-0000-000000000002"),
        capability_id=older.capability_id,
        service_id=older.service_id,
        node_id=older.node_id,
        status=HealthStatus.HEALTHY,
        observed_at=older.observed_at + timedelta(minutes=1),
    )
    processor = ObservationProcessor(
        runtime=make_running_runtime(),
        observation_store=FakeObservationStore(stored=[older, newer]),
        timeline_engine=FakeTimelineEngine(),
    )

    assert processor.latest_observation(capability_id="dns") is newer
    assert processor.latest_observation(capability_id="host.health") is None


@dataclass
class FakeTimelineEngine:
    """Timeline engine used by processor tests."""

    error: Exception | None = None
    processed: list[tuple[Observation, ...]] = field(default_factory=list)

    def build_infrastructure(
        self,
        observations: tuple[Observation, ...],
    ) -> InfrastructureTimeline:
        if self.error is not None:
            raise self.error

        self.processed.append(observations)

        return TimelineEngine().build_infrastructure(observations)


def make_running_runtime() -> BackendRuntime:
    """Create and start a deterministic backend runtime."""

    runtime = BackendRuntime(clock=lambda: RUNTIME_AT)
    runtime.start()

    return runtime


def make_timer(
    started: float = 10.0,
    ended: float = 10.012,
):
    """Create a deterministic monotonic timer."""

    values = iter((started, ended))

    return lambda: next(values)


def test_processor_accepts_observation() -> None:
    runtime = make_running_runtime()
    store = FakeObservationStore()
    timeline_engine = FakeTimelineEngine()
    observation = make_observation()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=timeline_engine,
        timer=make_timer(),
    )

    result = processor.process(observation)

    assert result.accepted is True
    assert result.rejected is False
    assert result.observation_id == observation.observation_id
    assert result.timeline_updated is True
    assert result.reason is None
    assert result.duration_ms == pytest.approx(12.0)


def test_processor_stores_observation() -> None:
    runtime = make_running_runtime()
    store = FakeObservationStore()
    timeline_engine = FakeTimelineEngine()
    observation = make_observation()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=timeline_engine,
        timer=make_timer(),
    )

    processor.process(observation)

    assert store.observations == (observation,)


def test_processor_updates_timeline() -> None:
    runtime = make_running_runtime()
    store = FakeObservationStore()
    timeline_engine = FakeTimelineEngine()
    observation = make_observation()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=timeline_engine,
        timer=make_timer(),
    )

    processor.process(observation)

    assert timeline_engine.processed == [(observation,)]


def test_processor_records_accepted_statistics() -> None:
    runtime = make_running_runtime()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(),
        timeline_engine=FakeTimelineEngine(),
        timer=make_timer(),
    )

    processor.process(make_observation())

    assert runtime.statistics.observations_received == 1
    assert runtime.statistics.observations_accepted == 1
    assert runtime.statistics.observations_rejected == 0
    assert runtime.statistics.last_observation_at == OBSERVED_AT


def test_accepted_result_contains_runtime_snapshot() -> None:
    runtime = make_running_runtime()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(),
        timeline_engine=FakeTimelineEngine(),
        timer=make_timer(),
    )

    result = processor.process(make_observation())

    assert result.snapshot.state is BackendRuntimeState.RUNNING
    assert result.snapshot.observations_stored == 1
    assert result.snapshot.service_timelines == 1
    assert result.snapshot.node_timelines == 1
    assert result.snapshot.infrastructure_timelines == 1
    assert result.snapshot.timeline_count == 3


def test_processor_can_accept_without_timeline_change() -> None:
    runtime = make_running_runtime()
    store = FakeObservationStore()
    timeline_engine = FakeTimelineEngine()

    timer_values = iter(
        (
            10.000,
            10.010,
            20.000,
            20.010,
        )
    )

    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=timeline_engine,
        timer=lambda: next(timer_values),
    )

    first = make_observation()

    repeated = Observation(
        observation_id=UUID("00000000-0000-0000-0000-000000000002"),
        capability_id=first.capability_id,
        service_id=first.service_id,
        node_id=first.node_id,
        status=first.status,
        observed_at=first.observed_at + timedelta(minutes=5),
        message=first.message,
    )

    first_result = processor.process(first)
    second_result = processor.process(repeated)

    assert first_result.accepted is True
    assert first_result.timeline_updated is True

    assert second_result.accepted is True
    assert second_result.timeline_updated is False


def test_processor_rejects_when_runtime_is_not_running() -> None:
    runtime = BackendRuntime(clock=lambda: RUNTIME_AT)
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(),
        timeline_engine=FakeTimelineEngine(),
        timer=make_timer(),
    )

    result = processor.process(make_observation())

    assert result.accepted is False
    assert result.reason == "Backend runtime is not running"
    assert result.snapshot.state is BackendRuntimeState.CREATED
    assert runtime.statistics.observations_received == 0
    assert runtime.statistics.observations_rejected == 0


def test_processor_rejects_store_validation_error() -> None:
    runtime = make_running_runtime()
    store = FakeObservationStore(
        error=ValueError("Observation is already stored"),
    )
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=FakeTimelineEngine(),
        timer=make_timer(),
    )

    result = processor.process(make_observation())

    assert result.accepted is False
    assert result.reason == "Observation is already stored"
    assert result.timeline_updated is False
    assert runtime.statistics.observations_received == 1
    assert runtime.statistics.observations_accepted == 0
    assert runtime.statistics.observations_rejected == 1


def test_processor_rejects_timeline_validation_error() -> None:
    runtime = make_running_runtime()
    timeline_engine = FakeTimelineEngine(
        error=ValueError("Invalid timeline transition"),
    )
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(),
        timeline_engine=timeline_engine,
        timer=make_timer(),
    )

    result = processor.process(make_observation())

    assert result.accepted is False
    assert result.reason == "Invalid timeline transition"
    assert runtime.statistics.observations_received == 1
    assert runtime.statistics.observations_rejected == 1


def test_processor_records_unexpected_runtime_error() -> None:
    runtime = make_running_runtime()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(
            error=RuntimeError("Unexpected storage failure"),
        ),
        timeline_engine=FakeTimelineEngine(),
        timer=lambda: 10.0,
    )

    with pytest.raises(
        RuntimeError,
        match="Unexpected storage failure",
    ):
        processor.process(make_observation())

    assert runtime.statistics.observations_received == 1
    assert runtime.statistics.errors == 1


def test_unexpected_error_does_not_fail_runtime() -> None:
    runtime = make_running_runtime()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(
            error=RuntimeError("Unexpected storage failure"),
        ),
        timeline_engine=FakeTimelineEngine(),
        timer=lambda: 10.0,
    )

    with pytest.raises(RuntimeError):
        processor.process(make_observation())

    assert runtime.state is BackendRuntimeState.RUNNING


def test_negative_timer_difference_is_clamped_to_zero() -> None:
    runtime = make_running_runtime()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=FakeObservationStore(),
        timeline_engine=FakeTimelineEngine(),
        timer=make_timer(started=10.0, ended=9.0),
    )

    result = processor.process(make_observation())

    assert result.duration_ms == 0.0


class FakeTimelineRuntime:
    """Timeline runtime double for processor tests."""

    def __init__(self) -> None:
        self.timeline = InfrastructureTimeline()
        self.built_with: list[tuple[Observation, ...]] = []
        self.retained: list[InfrastructureTimeline] = []

    @property
    def service_count(self) -> int:
        return sum(len(node.services) for node in self.timeline.nodes)

    @property
    def node_count(self) -> int:
        return len(self.timeline.nodes)

    @property
    def infrastructure_count(self) -> int:
        return int(bool(self.timeline.nodes or self.timeline.periods))

    def build(
        self,
        observations: tuple[Observation, ...],
    ) -> InfrastructureTimeline:
        self.built_with.append(observations)
        return InfrastructureTimeline()

    def retain(
        self,
        timeline: InfrastructureTimeline,
    ) -> None:
        self.retained.append(timeline)
        self.timeline = timeline


def test_processor_stores_device_presence_without_updating_health() -> None:
    """Device presence must be stored without creating service timelines."""
    runtime = make_running_runtime()
    store = FakeObservationStore()
    timeline_engine = FakeTimelineEngine()
    observation = Observation(
        observation_id=UUID("00000000-0000-0000-0000-000000000014"),
        capability_id="network.reachable",
        service_id="ha-green",
        node_id="ha-green",
        status=HealthStatus.UNAVAILABLE,
        observed_at=OBSERVED_AT,
        metadata={
            "target_type": "device",
            "device_id": "ha-green",
            "address": "192.168.1.247",
        },
    )
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=timeline_engine,
        timer=make_timer(),
    )

    result = processor.process(observation)

    assert result.accepted is True
    assert result.timeline_updated is False
    assert store.observations == (observation,)
    assert timeline_engine.processed == []
    assert result.snapshot.observations_stored == 1
    assert result.snapshot.service_timelines == 0
    assert result.snapshot.node_timelines == 0
    assert result.snapshot.infrastructure_timelines == 0
    assert (
        processor.latest_observation(capability_id="network.reachable") is observation
    )
