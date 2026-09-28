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
