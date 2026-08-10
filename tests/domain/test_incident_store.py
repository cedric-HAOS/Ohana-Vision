"""Tests for persistent incident lifecycle management."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from ohana_vision.domain import (
    HealthStatus,
    IncidentStore,
    Observation,
    ObservationStore,
)

START = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


def observation(
    status: HealthStatus,
    *,
    observed_at: datetime = START,
    message: str | None = None,
) -> Observation:
    return Observation(
        capability_id="dns.resolve",
        service_id="dns-primary",
        node_id="infra-01",
        status=status,
        observed_at=observed_at,
        message=message,
    )


def test_degradation_opens_and_updates_one_incident() -> None:
    store = IncidentStore()

    opened = store.process(
        observation(HealthStatus.DEGRADED, message="Latency elevated")
    )
    updated = store.process(
        observation(
            HealthStatus.UNAVAILABLE,
            observed_at=START + timedelta(minutes=1),
            message="DNS unavailable",
        )
    )

    assert opened is not None
    assert opened.kind == "opened"
    assert updated is not None
    assert updated.kind == "updated"
    assert updated.incident.incident_id == opened.incident.incident_id
    assert updated.incident.status is HealthStatus.UNAVAILABLE
    assert updated.incident.occurrence_count == 2
    store.close()


def test_healthy_observation_resolves_active_incident() -> None:
    store = IncidentStore()
    opened = store.process(observation(HealthStatus.DEGRADED))

    resolved = store.process(
        observation(HealthStatus.HEALTHY, observed_at=START + timedelta(minutes=2))
    )

    assert opened is not None
    assert resolved is not None
    assert resolved.kind == "resolved"
    assert resolved.incident.ended_at == START + timedelta(minutes=2)
    assert resolved.incident.occurrence_count == 1
    assert store.list(state="active") == ()
    assert store.list(state="resolved") == (resolved.incident,)
    store.close()


def test_new_degradation_after_recovery_creates_new_incident() -> None:
    store = IncidentStore()
    first = store.process(observation(HealthStatus.DEGRADED))
    store.process(
        observation(HealthStatus.HEALTHY, observed_at=START + timedelta(minutes=1))
    )
    second = store.process(
        observation(HealthStatus.DEGRADED, observed_at=START + timedelta(minutes=2))
    )

    assert first is not None
    assert second is not None
    assert second.incident.incident_id != first.incident.incident_id
    store.close()


def test_out_of_order_observation_does_not_rewrite_current_incident() -> None:
    store = IncidentStore()
    current = store.process(
        observation(HealthStatus.UNAVAILABLE, observed_at=START + timedelta(minutes=2))
    )

    transition = store.process(observation(HealthStatus.HEALTHY, observed_at=START))

    assert current is not None
    assert transition is None
    assert store.list(state="active") == (current.incident,)
    store.close()


def test_acknowledgement_and_silence_survive_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "vision.db"
    first_store = IncidentStore(database_path)
    opened = first_store.process(observation(HealthStatus.DEGRADED))
    assert opened is not None
    incident_id = opened.incident.incident_id
    first_store.acknowledge(
        incident_id,
        acknowledged_at=START + timedelta(minutes=1),
        note="Investigating",
    )
    first_store.silence(incident_id, until=START + timedelta(hours=1))
    first_store.close()

    restored_store = IncidentStore(database_path)
    restored = restored_store.get(incident_id)

    assert restored.acknowledged_at == START + timedelta(minutes=1)
    assert restored.acknowledgement_note == "Investigating"
    assert restored.silenced_until == START + timedelta(hours=1)
    restored_store.close()


def test_neutral_states_do_not_open_incidents() -> None:
    store = IncidentStore()

    for status in (
        HealthStatus.HEALTHY,
        HealthStatus.UNKNOWN,
        HealthStatus.SUSPENDED,
    ):
        assert store.process(observation(status)) is None

    assert store.incident_count == 0
    store.close()


def test_processing_same_observation_twice_is_idempotent() -> None:
    store = IncidentStore()
    degraded = observation(HealthStatus.DEGRADED)

    first = store.process(degraded)
    replay = store.process(degraded)

    assert first is not None
    assert replay is None
    assert store.incident_count == 1
    assert store.list(state="active")[0].occurrence_count == 1
    store.close()


def test_rebuild_recovers_observation_persisted_before_incident(tmp_path: Path) -> None:
    database_path = tmp_path / "vision.db"
    observations = ObservationStore(database_path)
    degraded = observation(HealthStatus.DEGRADED)
    observations.add(degraded)

    incidents = IncidentStore(database_path)
    incidents.rebuild(observations.observations)

    assert incidents.incident_count == 1
    assert incidents.list(state="active")[0].occurrence_count == 1
    incidents.close()
    observations.close()


def test_rebuild_preserves_acknowledgement_of_processed_incident(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "vision.db"
    store = IncidentStore(database_path)
    degraded = observation(HealthStatus.DEGRADED)
    opened = store.process(degraded)
    assert opened is not None
    store.acknowledge(
        opened.incident.incident_id,
        acknowledged_at=START + timedelta(minutes=1),
        note="Investigating",
    )

    store.rebuild([degraded])

    restored = store.get(opened.incident.incident_id)
    assert restored.occurrence_count == 1
    assert restored.acknowledgement_note == "Investigating"
    store.close()
