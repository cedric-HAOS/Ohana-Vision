"""Timelines read only status changes: same periods, a fraction of the rows."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import BackendRuntime, ObservationProcessor
from ohana_vision.runtime.observation_processor import HEALTH_CHANGES_PER_CAPABILITY
from ohana_vision.timeline import TimelineEngine

START = datetime(2026, 9, 25, 19, 0, tzinfo=UTC)


def _observation(node, capability, minute, status=HealthStatus.HEALTHY, **metadata):
    return Observation(
        capability_id=capability,
        service_id=node,
        node_id=node,
        status=status,
        observed_at=START + timedelta(minutes=minute),
        metadata=metadata,
    )


def _konoha_day() -> list[Observation]:
    """A Z-Wave node every 2 minutes, a presence flap, a stable DNS."""
    observations = []
    for minute in range(0, 24 * 60, 2):
        observations.append(
            _observation(
                "zwave-node-5", "zwave.node.alive", minute, target_type="device"
            )
        )
        status = (
            HealthStatus.UNAVAILABLE
            if 600 <= minute < 640 or 900 <= minute < 902
            else HealthStatus.HEALTHY
        )
        observations.append(
            _observation("she-04", "network.reachable", minute + 1, status)
        )
    observations.append(_observation("infra-01", "dns.resolve", 5))
    return observations


@pytest.fixture(params=["memory", "sqlite"])
def store(request, tmp_path: Path):
    database = tmp_path / "vision.db" if request.param == "sqlite" else None
    store = ObservationStore(database, history_max_rows=5_000)
    store.add_many(_konoha_day())
    yield store
    store.close()


@pytest.mark.parametrize("hours", [20, 12, 2])
def test_state_changes_build_the_same_timeline(store, hours) -> None:
    since = START + timedelta(hours=24 - hours)
    engine = TimelineEngine()

    changes = store.state_changes_window(since=since)
    everything = store.history_window(since=since)

    assert engine.build_infrastructure(changes) == engine.build_infrastructure(
        everything
    )
    assert len(changes) < len(everything) / 20


def test_carry_forward_state_precedes_the_window(store) -> None:
    changes = store.state_changes_window(since=START + timedelta(hours=10, minutes=30))

    presence = [item for item in changes if item.node_id == "she-04"]
    assert presence[0].status is HealthStatus.UNAVAILABLE  # still down at 10:30
    assert presence[0].observed_at < START + timedelta(hours=10, minutes=30)
    assert [item.status for item in presence[1:]] == [
        HealthStatus.HEALTHY,
        HealthStatus.UNAVAILABLE,
        HealthStatus.HEALTHY,
    ]


def test_processor_keeps_a_bounded_health_history() -> None:
    runtime = BackendRuntime()
    runtime.start()
    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=ObservationStore(),
        timeline_engine=TimelineEngine(),
    )
    for minute in range(200):
        status = HealthStatus.DEGRADED if minute % 2 else HealthStatus.HEALTHY
        result = processor.process(
            _observation("infra-01", "dns.resolve", minute, status)
        )
        assert result.status_changed is True

    [changes] = processor._health_changes.values()  # noqa: SLF001
    assert len(changes) == HEALTH_CHANGES_PER_CAPABILITY
    repeated = processor.process(
        _observation("infra-01", "dns.resolve", 201, HealthStatus.DEGRADED)
    )
    assert repeated.status_changed is False
    assert repeated.timeline_updated is False
