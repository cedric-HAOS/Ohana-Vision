"""WAL checkpoints must stay off the observation ingestion path."""

import sqlite3
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from ohana_vision.domain import (
    HealthStatus,
    IncidentStore,
    Observation,
    ObservationStore,
    WalCheckpointer,
)


def make_observation(index: int) -> Observation:
    return Observation(
        capability_id=f"dns.resolve.{index}",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.HEALTHY,
        observed_at=datetime(2026, 9, 28, 9, 0, tzinfo=UTC) + timedelta(seconds=index),
    )


def rows_in_main_file(path: Path) -> int:
    """Count rows already copied from the WAL into the database file."""
    connection = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
    try:
        # Until the first checkpoint even the schema lives only in the WAL.
        return int(
            connection.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
        )
    except sqlite3.OperationalError:
        return 0
    finally:
        connection.close()


def test_stores_keep_sqlite_automatic_checkpoints_by_default(tmp_path: Path) -> None:
    path = tmp_path / "vision.db"
    observations = ObservationStore(path)
    incidents = IncidentStore(path)

    assert observations._connection is not None
    assert (
        observations._connection.execute("PRAGMA wal_autocheckpoint").fetchone()[0]
        == 1000
    )
    assert (
        incidents._connection.execute("PRAGMA wal_autocheckpoint").fetchone()[0] == 1000
    )
    observations.close()
    incidents.close()


def test_background_checkpoint_disables_checkpoints_inside_commits(
    tmp_path: Path,
) -> None:
    path = tmp_path / "vision.db"
    observations = ObservationStore(path, background_checkpoint=True)
    incidents = IncidentStore(path, background_checkpoint=True)

    assert observations._connection is not None
    assert (
        observations._connection.execute("PRAGMA wal_autocheckpoint").fetchone()[0] == 0
    )
    assert incidents._connection.execute("PRAGMA wal_autocheckpoint").fetchone()[0] == 0
    observations.close()
    incidents.close()


def test_background_checkpoint_store_never_checkpoints_itself(tmp_path: Path) -> None:
    now = datetime(2026, 9, 28, 9, 0, tzinfo=UTC)
    store = ObservationStore(
        tmp_path / "vision.db", retention_days=7, background_checkpoint=True
    )
    assert store._connection is not None
    statements: list[str] = []
    store._connection.set_trace_callback(statements.append)

    store.add(make_observation(0))
    store.purge_expired(now=now + timedelta(days=8))

    assert not any("wal_checkpoint" in statement for statement in statements)
    store.close()


def test_store_checkpoints_the_wal_from_its_own_thread(tmp_path: Path) -> None:
    path = tmp_path / "vision.db"
    store = ObservationStore(path, background_checkpoint=True)
    # Keeps SQLite from checkpointing when the store's connection closes.
    incidents = IncidentStore(path, background_checkpoint=True)
    store.add_many(make_observation(index) for index in range(20))
    checkpointer = store._checkpointer
    assert checkpointer is not None and checkpointer.running
    assert rows_in_main_file(path) == 0

    store.close()

    assert not checkpointer.running
    assert rows_in_main_file(path) == 20
    incidents.close()


def test_checkpointer_copies_the_wal_at_each_interval(tmp_path: Path) -> None:
    path = tmp_path / "vision.db"
    store = ObservationStore(path)
    store._connection.execute("PRAGMA wal_autocheckpoint=0")
    store.add_many(make_observation(index) for index in range(5))
    checkpointer = WalCheckpointer(path, interval_seconds=0.05)

    checkpointer.start()
    deadline = time.monotonic() + 5
    while rows_in_main_file(path) < 5 and time.monotonic() < deadline:
        time.sleep(0.05)
    checkpointer.stop()

    assert rows_in_main_file(path) == 5
    store.close()


def test_checkpointer_rejects_a_non_positive_interval(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        WalCheckpointer(tmp_path / "vision.db", interval_seconds=0)
