"""Tests for the host supervision API."""

from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.domain import HealthStatus, Observation
from ohana_vision.runtime import ObservationProcessor
from ohana_vision.web.dependencies import get_observation_processor
from ohana_vision.web.routers.host import router


class FakeObservationProcessor:
    def __init__(self, observations: tuple[Observation, ...] = ()) -> None:
        self.observations = observations
        self.calls: list[dict[str, object]] = []

    def latest_observation(self, *, capability_id: str) -> Observation | None:
        self.calls.append({"capability_id": capability_id})
        return self.observations[-1] if self.observations else None


def make_client(processor: FakeObservationProcessor) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_observation_processor] = lambda: cast(
        ObservationProcessor,
        processor,
    )
    return TestClient(app)


def test_host_health_returns_latest_snapshot() -> None:
    observation = Observation(
        capability_id="host.health",
        service_id="ohana-host",
        node_id="infra-01",
        status=HealthStatus.HEALTHY,
        observed_at=datetime(2026, 8, 10, 16, 0, tzinfo=UTC),
        metadata={
            "target_type": "device",
            "host_health": {
                "state": "healthy",
                "hostname": "infra-01",
                "cpu_percent": 12.5,
                "host_uptime": "8 j 19 h 29 min",
            },
        },
    )
    processor = FakeObservationProcessor((observation,))

    response = make_client(processor).get("/host-health")

    assert response.status_code == 200
    assert response.json()["cpu_percent"] == 12.5
    assert response.json()["host_uptime"] == "8 j 19 h 29 min"
    assert processor.calls == [{"capability_id": "host.health"}]


def test_host_health_returns_not_found_without_observation() -> None:
    response = make_client(FakeObservationProcessor()).get("/host-health")

    assert response.status_code == 404
