"""Phase 5: the vital state the Agent reads from Vision."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from ohana_vision.runtime import BackendRuntime
from ohana_vision.web.bootstrap import build_application


class Clock:
    def __init__(self) -> None:
        self.value = datetime(2026, 9, 28, 15, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.value


def test_silence_counts_from_the_start_until_a_first_ingestion() -> None:
    clock = Clock()
    runtime = BackendRuntime(clock=clock)
    runtime.start()
    clock.value += timedelta(seconds=40)

    vitals = runtime.vitals()

    assert vitals["state"] == "running"
    assert vitals["started_at"] == "2026-09-28T17:00:00+02:00"
    assert vitals["last_ingested_at"] is None
    assert vitals["ingestion_silence_seconds"] == 40


def test_silence_counts_from_the_reception_not_the_observation_time() -> None:
    clock = Clock()
    runtime = BackendRuntime(clock=clock)
    runtime.start()
    clock.value += timedelta(minutes=10)
    # A replayed observation from an hour ago is still a fresh ingestion.
    runtime.record_received(clock.value - timedelta(hours=1))
    runtime.record_accepted(3.0)
    clock.value += timedelta(seconds=5)

    vitals = runtime.vitals()

    assert vitals["last_ingested_at"] == "2026-09-28T17:10:00+02:00"
    assert vitals["ingestion_silence_seconds"] == 5
    assert vitals["observations_accepted"] == 1


def test_vitals_endpoint_is_served_uncached() -> None:
    client = TestClient(build_application())

    response = client.get("/api/runtime/vitals")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["state"] == "running"
    assert response.json()["started_at"].endswith(("+02:00", "+01:00"))


def test_ingestion_lag_summarises_the_last_fifteen_minutes() -> None:
    clock = Clock()
    runtime = BackendRuntime(clock=clock)
    runtime.start()
    for delay in (1, 2, 3, 4, 100):
        runtime.record_received(clock.value - timedelta(seconds=delay))
    clock.value += timedelta(minutes=20)
    runtime.record_received(clock.value - timedelta(seconds=2))

    lag = runtime.vitals()["ingestion_lag"]

    # Only the reception of the last 15 minutes counts.
    assert lag == {
        "samples": 1,
        "p50_seconds": 2.0,
        "p95_seconds": 2.0,
        "max_seconds": 2.0,
    }


def test_detail_sources_never_break_the_vitals() -> None:
    runtime = BackendRuntime(clock=Clock())
    runtime.start()

    def broken() -> dict:
        raise OSError("disk")

    runtime.detail_sources["storage"] = broken
    runtime.detail_sources["websocket"] = lambda: {"clients": 2}

    vitals = runtime.vitals()

    assert vitals["storage"] == {"error": "OSError"}
    assert vitals["websocket"] == {"clients": 2}
    assert vitals["version"]


def test_vitals_expose_storage_retention_and_websocket_clients(tmp_path) -> None:
    from ohana_vision.web.app import create_app
    from ohana_vision.web.bootstrap import build_application_context

    context = build_application_context(
        database_path=tmp_path / "vision.db", retention_days=2
    )
    try:
        client = TestClient(create_app(context=context))
        vitals = client.get("/api/runtime/vitals").json()
    finally:
        context.observation_store.close()
        context.incident_store.close()

    assert vitals["storage"]["database_bytes"] > 0
    assert vitals["storage"]["retention_days"] == 2
    assert vitals["storage"]["oldest_observed_at"] is None
    assert vitals["storage"]["retention_overdue"] is False
    assert vitals["websocket"] == {"clients": 0}
