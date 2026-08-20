import sqlite3
import tracemalloc
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from ohana_vision.domain import (
    DuplicateObservationError,
    HealthStatus,
    Observation,
    ObservationStore,
)


def make_observation(
    *,
    observed_at: datetime | None = None,
    capability_id: str = "dns.resolve",
) -> Observation:
    return Observation(
        capability_id=capability_id,
        service_id="dns-primary",
        node_id="zwave-01",
        status=HealthStatus.HEALTHY,
        observed_at=observed_at or datetime(2026, 7, 10, 14, 0, tzinfo=UTC),
    )


def test_store_is_initially_empty() -> None:
    store = ObservationStore()

    assert store.observation_count == 0
    assert store.observations == ()


def test_store_adds_observation() -> None:
    store = ObservationStore()
    observation = make_observation()

    result = store.add(observation)

    assert result is observation
    assert store.observations == (observation,)


def test_store_rejects_duplicate_observation() -> None:
    store = ObservationStore()
    observation = make_observation()

    store.add(observation)

    with pytest.raises(DuplicateObservationError):
        store.add(observation)


def test_store_adds_many_observations() -> None:
    store = ObservationStore()
    first = make_observation(capability_id="dns.resolve")
    second = make_observation(capability_id="dns.latency")

    result = store.add_many([first, second])

    assert result == (first, second)
    assert store.observation_count == 2


def test_history_filters_observations() -> None:
    store = ObservationStore()
    first = make_observation(capability_id="dns.resolve")
    second = make_observation(capability_id="dns.latency")

    store.add_many([first, second])

    assert store.history(capability_id="dns.resolve") == (first,)


def test_history_is_chronological() -> None:
    store = ObservationStore()
    first_date = datetime(2026, 7, 10, 14, 0, tzinfo=UTC)
    second_date = first_date + timedelta(minutes=5)

    second = make_observation(observed_at=second_date)
    first = make_observation(observed_at=first_date)

    store.add_many([second, first])

    assert store.history() == (first, second)


def test_clear_removes_all_observations() -> None:
    store = ObservationStore()
    store.add(make_observation())

    store.clear()

    assert store.observation_count == 0
    assert store.observations == ()


def test_history_limit_returns_the_latest_observations_chronologically() -> None:
    store = ObservationStore()
    start = datetime(2026, 7, 10, 14, 0, tzinfo=UTC)
    observations = [
        make_observation(
            observed_at=start + timedelta(minutes=index),
            capability_id=f"dns.resolve.{index}",
        )
        for index in range(5)
    ]
    store.add_many(reversed(observations))

    assert store.history(limit=3) == tuple(observations[-3:])


def test_sqlite_latest_per_capability_keeps_only_the_newest_identity(
    tmp_path: Path,
) -> None:
    store = ObservationStore(tmp_path / "vision.db")
    observed_at = datetime(2026, 8, 20, 8, 0, tzinfo=UTC)
    older = make_observation(
        observed_at=observed_at,
        capability_id="dns.resolve",
    )
    newer_same_timestamp = make_observation(
        observed_at=observed_at,
        capability_id="dns.resolve",
    )
    other = make_observation(
        observed_at=observed_at + timedelta(minutes=1),
        capability_id="dns.latency",
    )
    store.add_many((older, newer_same_timestamp, other))

    assert store.latest_per_capability() == (newer_same_timestamp, other)
    store.close()


def test_history_rejects_a_non_positive_limit() -> None:
    store = ObservationStore()

    with pytest.raises(ValueError, match="limit must be greater than zero"):
        store.history(limit=0)


def test_history_window_keeps_only_latest_state_before_since() -> None:
    """Timeline windows retain one carry-forward state per capability."""
    store = ObservationStore()
    start = datetime(2026, 7, 10, 8, 0, tzinfo=UTC)
    old_resolve = make_observation(
        observed_at=start,
        capability_id="dns.resolve",
    )
    latest_resolve_before = make_observation(
        observed_at=start + timedelta(hours=1),
        capability_id="dns.resolve",
    )
    latency_before = make_observation(
        observed_at=start + timedelta(hours=1, minutes=30),
        capability_id="dns.latency",
    )
    resolve_in_window = make_observation(
        observed_at=start + timedelta(hours=3),
        capability_id="dns.resolve",
    )
    after_until = make_observation(
        observed_at=start + timedelta(hours=5),
        capability_id="dns.latency",
    )
    store.add_many(
        [
            old_resolve,
            latest_resolve_before,
            latency_before,
            resolve_in_window,
            after_until,
        ]
    )

    result = store.history_window(
        since=start + timedelta(hours=2),
        until=start + timedelta(hours=4),
    )

    assert result == (
        latest_resolve_before,
        latency_before,
        resolve_in_window,
    )


def test_sqlite_store_restores_observations_after_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "vision.db"
    original = Observation(
        capability_id="dns.resolve",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.DEGRADED,
        observed_at=datetime(2026, 8, 10, 10, 0, tzinfo=UTC),
        message="DNS latency is elevated.",
        latency_ms=42.5,
        metadata={"server": "192.168.1.10"},
    )
    first_store = ObservationStore(database_path)
    first_store.add(original)
    first_store.close()

    restored_store = ObservationStore(database_path)

    assert restored_store.observations == (original,)
    assert restored_store.history(capability_id="dns.resolve") == (original,)
    restored_store.close()


def test_sqlite_store_rejects_duplicate_after_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "vision.db"
    observation = make_observation()
    first_store = ObservationStore(database_path)
    first_store.add(observation)
    first_store.close()
    restored_store = ObservationStore(database_path)

    with pytest.raises(DuplicateObservationError):
        restored_store.add(observation)

    restored_store.close()


def test_sqlite_store_clear_is_durable(tmp_path: Path) -> None:
    database_path = tmp_path / "vision.db"
    store = ObservationStore(database_path)
    store.add(make_observation())
    store.clear()
    store.close()

    restored_store = ObservationStore(database_path)

    assert restored_store.observations == ()
    restored_store.close()


def test_sqlite_history_is_paginated_without_loading_the_database(
    tmp_path: Path,
) -> None:
    store = ObservationStore(tmp_path / "vision.db")
    start = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)
    observations = [
        make_observation(
            observed_at=start + timedelta(minutes=index),
            capability_id=f"dns.resolve.{index}",
        )
        for index in range(5)
    ]
    store.add_many(observations)

    assert store.history(limit=2, offset=2) == tuple(observations[1:3])
    store.close()


def test_memory_history_uses_the_same_pagination_order() -> None:
    store = ObservationStore()
    start = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)
    observations = [
        make_observation(
            observed_at=start + timedelta(minutes=index),
            capability_id=f"dns.resolve.{index}",
        )
        for index in range(5)
    ]
    store.add_many(observations)

    assert store.history(limit=2, offset=2) == tuple(observations[1:3])


def test_sqlite_retention_purges_observations_and_reuses_database_pages(
    tmp_path: Path,
) -> None:
    now = datetime(2026, 8, 10, 12, 0, tzinfo=UTC)
    store = ObservationStore(tmp_path / "vision.db", retention_days=7)
    expired = make_observation(observed_at=now - timedelta(days=8))
    retained = make_observation(
        observed_at=now - timedelta(days=6),
        capability_id="dns.latency",
    )
    store.add_many((expired, retained))

    removed = store.purge_expired(now=now)

    assert removed == 1
    assert store.observation_count == 1
    assert store.history() == (retained,)
    store.close()


def test_sqlite_capability_history_uses_a_dedicated_ordered_index(
    tmp_path: Path,
) -> None:
    """The host page must not scan and sort the complete observation history."""
    database_path = tmp_path / "vision.db"
    store = ObservationStore(database_path)
    store.close()
    connection = sqlite3.connect(database_path)

    plan = connection.execute(
        """
        EXPLAIN QUERY PLAN
        SELECT sequence
        FROM observations
        WHERE capability_id = 'host.health'
        ORDER BY observed_at DESC, sequence DESC
        LIMIT 1
        """
    ).fetchall()
    connection.close()

    detail = " ".join(str(row[3]) for row in plan)
    assert "observations_capability_observed_at" in detail
    assert "TEMP B-TREE" not in detail


def test_sqlite_startup_memory_is_bounded_for_a_one_gib_host(
    tmp_path: Path,
) -> None:
    """A representative history must not be materialised during startup."""
    database_path = tmp_path / "vision.db"
    ObservationStore(database_path).close()
    connection = sqlite3.connect(database_path)
    connection.executemany(
        """
        INSERT INTO observations (
            observation_id, capability_id, service_id, node_id, status,
            observed_at, message, latency_ms, metadata_json
        ) VALUES (?, 'dns.resolve', 'dns-primary', 'infra-01', 'healthy',
                  '2026-08-10T10:00:00+00:00', NULL, NULL, '{}')
        """,
        ((f"00000000-0000-0000-0000-{index:012d}",) for index in range(50_000)),
    )
    connection.commit()
    connection.close()

    tracemalloc.start()
    store = ObservationStore(database_path)
    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert store.observation_count == 50_000
    assert peak < 16 * 1024 * 1024
    store.close()
