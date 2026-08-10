"""Integration tests for the complete observation pipeline."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import (
    BackendRuntime,
    ObservationProcessor,
)
from ohana_vision.timeline.timeline_engine import TimelineEngine

RUNTIME_AT = datetime(
    2026,
    7,
    10,
    15,
    0,
    tzinfo=UTC,
)

FIRST_OBSERVATION_AT = datetime(
    2026,
    7,
    10,
    8,
    0,
    tzinfo=UTC,
)


def make_observation(
    *,
    observation_id: str,
    status: HealthStatus = HealthStatus.HEALTHY,
    observed_at: datetime = FIRST_OBSERVATION_AT,
    capability_id: str = "dns.resolve",
    service_id: str = "dns-primary",
    node_id: str = "infra-01",
) -> Observation:
    """Create a deterministic observation."""

    return Observation(
        observation_id=UUID(observation_id),
        capability_id=capability_id,
        service_id=service_id,
        node_id=node_id,
        status=status,
        observed_at=observed_at,
    )


def make_processor() -> tuple[
    ObservationProcessor,
    BackendRuntime,
    ObservationStore,
]:
    """Create a running pipeline with real components."""

    runtime = BackendRuntime(clock=lambda: RUNTIME_AT)
    runtime.start()

    store = ObservationStore()

    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=store,
        timeline_engine=TimelineEngine(),
        timer=lambda: 10.0,
    )

    return processor, runtime, store


def test_pipeline_processes_first_observation() -> None:
    processor, runtime, store = make_processor()
    observation = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001")
    )

    result = processor.process(observation)

    assert result.accepted is True
    assert result.timeline_updated is True

    assert store.observations == (observation,)

    infrastructure = processor.infrastructure_timeline
    node = infrastructure.node("infra-01")

    assert node is not None
    assert node.current_status is HealthStatus.HEALTHY

    service = node.service("dns-primary")

    assert service is not None
    assert service.current_status is HealthStatus.HEALTHY

    capability = service.capability("dns.resolve")

    assert capability is not None
    assert capability.current_status is HealthStatus.HEALTHY

    assert runtime.statistics.observations_received == 1
    assert runtime.statistics.observations_accepted == 1
    assert runtime.statistics.observations_rejected == 0

    assert result.snapshot.observations_stored == 1
    assert result.snapshot.service_timelines == 1
    assert result.snapshot.node_timelines == 1
    assert result.snapshot.infrastructure_timelines == 1
    assert result.snapshot.timeline_count == 3


def test_pipeline_builds_status_transition() -> None:
    processor, runtime, store = make_processor()

    healthy = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001"),
    )
    degraded = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000002"),
        status=HealthStatus.DEGRADED,
        observed_at=FIRST_OBSERVATION_AT + timedelta(minutes=10),
    )

    processor.process(healthy)
    result = processor.process(degraded)

    infrastructure = processor.infrastructure_timeline
    node = infrastructure.node("infra-01")

    assert node is not None

    service = node.service("dns-primary")

    assert service is not None

    capability = service.capability("dns.resolve")

    assert capability is not None
    assert len(capability.periods) == 2
    assert capability.periods[0].status is HealthStatus.HEALTHY
    assert capability.periods[0].ended_at == degraded.observed_at
    assert capability.current_status is HealthStatus.DEGRADED

    assert result.accepted is True
    assert result.timeline_updated is True
    assert store.observation_count == 2
    assert runtime.statistics.observations_accepted == 2


def test_pipeline_accepts_redundant_observation_without_timeline_change() -> None:
    processor, runtime, store = make_processor()

    first = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001"),
    )
    repeated = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000002"),
        observed_at=FIRST_OBSERVATION_AT + timedelta(minutes=5),
    )

    first_result = processor.process(first)
    second_result = processor.process(repeated)

    assert first_result.timeline_updated is True
    assert second_result.accepted is True
    assert second_result.timeline_updated is False

    assert store.observation_count == 2
    assert runtime.statistics.observations_accepted == 2


def test_pipeline_accepts_duplicate_idempotently_without_changing_state() -> None:
    processor, runtime, store = make_processor()

    observation = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001")
    )

    accepted = processor.process(observation)
    timeline_before_replay = processor.infrastructure_timeline

    replayed = processor.process(observation)

    assert accepted.accepted is True
    assert replayed.accepted is True
    assert replayed.reason is None
    assert replayed.timeline_updated is False

    assert store.observations == (observation,)
    assert processor.infrastructure_timeline == timeline_before_replay

    assert runtime.statistics.observations_received == 2
    assert runtime.statistics.observations_accepted == 2
    assert runtime.statistics.observations_rejected == 0


def test_pipeline_rejects_conflict_without_polluting_store() -> None:
    processor, runtime, store = make_processor()

    healthy = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001"),
    )
    conflicting = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000002"),
        status=HealthStatus.UNAVAILABLE,
        observed_at=healthy.observed_at,
    )

    processor.process(healthy)
    timeline_before_rejection = processor.infrastructure_timeline

    result = processor.process(conflicting)

    assert result.accepted is False
    assert "same instant" in result.reason

    assert store.observations == (healthy,)
    assert processor.infrastructure_timeline == (timeline_before_rejection)

    assert runtime.statistics.observations_received == 2
    assert runtime.statistics.observations_accepted == 1
    assert runtime.statistics.observations_rejected == 1


def test_pipeline_counts_complete_infrastructure_hierarchy() -> None:
    processor, _, store = make_processor()

    dns = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000001"),
    )
    mqtt = make_observation(
        observation_id=("00000000-0000-0000-0000-000000000002"),
        node_id="green-01",
        service_id="mqtt-primary",
        capability_id="mqtt.connect",
        status=HealthStatus.DEGRADED,
    )

    processor.process(dns)
    result = processor.process(mqtt)

    assert store.observation_count == 2

    assert result.snapshot.observations_stored == 2
    assert result.snapshot.service_timelines == 2
    assert result.snapshot.node_timelines == 2
    assert result.snapshot.infrastructure_timelines == 1
    assert result.snapshot.timeline_count == 5

    assert processor.infrastructure_timeline.current_status is HealthStatus.DEGRADED
