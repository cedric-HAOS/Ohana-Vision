"""Tests for the Ohana-Vision observation API router."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import ObservationProcessor
from ohana_vision.web.dependencies import (
    get_observation_processor,
    get_observation_store,
)
from ohana_vision.web.routers import observations_router


@dataclass(frozen=True)
class FakeProcessingResult:
    """Minimal processing result used by endpoint tests."""

    accepted: bool
    incident_updated: bool = False
    incident_id: UUID | None = None


class FakeObservationStore:
    """Observation store double exposing fixed history results."""

    def __init__(
        self,
        observations: tuple[Observation, ...] = (),
    ) -> None:
        self._observations = observations
        self.history_calls: list[dict[str, object]] = []

    def history(
        self,
        *,
        node_id: str | None = None,
        service_id: str | None = None,
        capability_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int | None = None,
    ) -> tuple[Observation, ...]:
        """Return the configured observations."""
        self.history_calls.append(
            {
                "node_id": node_id,
                "service_id": service_id,
                "capability_id": capability_id,
                "since": since,
                "until": until,
                "limit": limit,
            }
        )

        return self._observations


def make_observation(
    *,
    capability_id: str = "dns-resolution",
    service_id: str = "dns-primary",
    node_id: str = "infra-01",
    status: HealthStatus = HealthStatus.HEALTHY,
    observed_at: datetime | None = None,
    latency_ms: float | None = 4.2,
) -> Observation:
    """Create an observation for API tests."""
    return Observation(
        capability_id=capability_id,
        service_id=service_id,
        node_id=node_id,
        status=status,
        observed_at=observed_at or datetime(2026, 7, 11, 12, 0, tzinfo=UTC),
        latency_ms=latency_ms,
        metadata={},
    )


def make_client(
    store: FakeObservationStore,
) -> TestClient:
    """Create a client with an overridden observation store."""
    app = FastAPI()
    app.include_router(observations_router)

    app.dependency_overrides[get_observation_store] = lambda: cast(
        ObservationStore,
        store,
    )

    return TestClient(app)


def test_observations_router_returns_empty_list() -> None:
    """The endpoint must return an empty list when no history exists."""
    client = make_client(FakeObservationStore())

    response = client.get("/observations")

    assert response.status_code == 200
    assert response.json() == []


def test_observations_router_returns_stored_observations() -> None:
    """The endpoint must return observations provided by the store."""
    first = make_observation()
    second = make_observation(
        capability_id="internet-access",
        service_id="internet-primary",
        status=HealthStatus.DEGRADED,
        latency_ms=42.5,
    )
    client = make_client(
        FakeObservationStore((first, second)),
    )

    response = client.get("/observations")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_observations_router_passes_filters_to_store() -> None:
    """The endpoint must delegate all filters to the store."""
    store = FakeObservationStore()
    client = make_client(store)

    response = client.get(
        "/observations",
        params={
            "node_id": "infra-01",
            "service_id": "dns-primary",
            "capability_id": "dns-resolution",
            "since": "2026-07-11T10:00:00Z",
            "until": "2026-07-11T12:00:00Z",
        },
    )

    assert response.status_code == 200
    assert store.history_calls == [
        {
            "node_id": "infra-01",
            "service_id": "dns-primary",
            "capability_id": "dns-resolution",
            "since": datetime(
                2026,
                7,
                11,
                10,
                0,
                tzinfo=UTC,
            ),
            "until": datetime(
                2026,
                7,
                11,
                12,
                0,
                tzinfo=UTC,
            ),
            "limit": 100,
        }
    ]


def test_observations_router_accepts_a_smaller_limit() -> None:
    """Callers may request fewer than the 100 latest observations."""
    store = FakeObservationStore()
    client = make_client(store)

    response = client.get("/observations", params={"limit": 25})

    assert response.status_code == 200
    assert store.history_calls[-1]["limit"] == 25


def test_observations_router_rejects_a_limit_above_100() -> None:
    """The public endpoint must never expose more than 100 observations."""
    client = make_client(FakeObservationStore())

    response = client.get("/observations", params={"limit": 101})

    assert response.status_code == 422


class InvalidHistoryObservationStore(FakeObservationStore):
    """Observation store double rejecting history filters."""

    def history(
        self,
        *,
        node_id: str | None = None,
        service_id: str | None = None,
        capability_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int | None = None,
    ) -> tuple[Observation, ...]:
        """Reject invalid date ordering."""
        raise ValueError("since must not be after until.")


def test_observations_router_returns_422_for_invalid_history() -> None:
    """Domain validation errors must become HTTP 422 responses."""
    client = make_client(InvalidHistoryObservationStore())

    response = client.get(
        "/observations",
        params={
            "since": "2026-07-11T12:00:00Z",
            "until": "2026-07-11T10:00:00Z",
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "since must not be after until.",
    }


def test_observations_router_returns_503_without_context() -> None:
    """The endpoint must fail explicitly without application context."""
    app = FastAPI()
    app.include_router(observations_router)

    response = TestClient(app).get("/observations")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }


class FakeObservationProcessor:
    """Observation processor recording received observations."""

    def __init__(
        self,
        *,
        accepted: bool = True,
    ) -> None:
        self.accepted = accepted
        self.observations: list[Observation] = []

    def process(
        self,
        observation: Observation,
    ) -> FakeProcessingResult:
        """Record and process an observation."""
        self.observations.append(observation)

        return FakeProcessingResult(
            accepted=self.accepted,
        )


class FakeWebSocketHub:
    """WebSocket hub recording broadcast messages."""

    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def broadcast(
        self,
        message: dict[str, object],
    ) -> None:
        """Record a broadcast message."""
        self.messages.append(message)


def make_ingestion_client(
    processor: FakeObservationProcessor,
    websocket_hub: FakeWebSocketHub | None = None,
) -> TestClient:
    """Create an API client with injected ingestion services."""
    application = FastAPI()
    application.state.websocket_hub = websocket_hub or FakeWebSocketHub()
    application.include_router(
        observations_router,
        prefix="/api",
    )
    application.dependency_overrides[get_observation_processor] = lambda: cast(
        ObservationProcessor,
        processor,
    )

    return TestClient(application)


def test_post_observation_returns_accepted_response() -> None:
    """The endpoint must accept a valid observation."""
    processor = FakeObservationProcessor()
    client = make_ingestion_client(processor)

    response = client.post(
        "/api/observations",
        json={
            "capability_id": "dns.resolve",
            "service_id": "dns-primary",
            "node_id": "infra-01",
            "status": "healthy",
            "observed_at": datetime(
                2026,
                7,
                11,
                16,
                30,
                tzinfo=UTC,
            ).isoformat(),
            "latency_ms": 12.5,
            "metadata": {
                "hostname": "example.com",
                "server": "192.168.1.11",
            },
        },
    )

    assert response.status_code == 202
    assert response.json() == {
        "accepted": True,
        "message": "Observation accepted.",
    }


def test_post_observation_forwards_domain_observation() -> None:
    """The endpoint must forward a domain observation to the processor."""
    processor = FakeObservationProcessor()
    client = make_ingestion_client(processor)

    response = client.post(
        "/api/observations",
        json={
            "capability_id": "dns.resolve",
            "service_id": "dns-primary",
            "node_id": "infra-01",
            "status": "healthy",
            "observed_at": "2026-07-11T16:30:00+00:00",
            "latency_ms": 12.5,
            "metadata": {
                "hostname": "example.com",
            },
        },
    )

    assert response.status_code == 202
    assert len(processor.observations) == 1

    observation = processor.observations[0]

    assert isinstance(observation, Observation)
    assert observation.capability_id == "dns.resolve"
    assert observation.service_id == "dns-primary"
    assert observation.node_id == "infra-01"
    assert observation.latency_ms == 12.5
    assert observation.metadata == {
        "hostname": "example.com",
    }


def test_post_observation_rejects_invalid_payload() -> None:
    """The endpoint must reject an invalid observation request."""
    processor = FakeObservationProcessor()
    client = make_ingestion_client(processor)

    response = client.post(
        "/api/observations",
        json={
            "capability_id": "dns.resolve",
            "service_id": "dns-primary",
            "node_id": "infra-01",
            "status": "healthy",
            "observed_at": "2026-07-11T16:30:00+00:00",
            "latency_ms": -1,
        },
    )

    assert response.status_code == 422
    assert processor.observations == []


def test_post_observation_broadcasts_after_success() -> None:
    """An accepted observation must be broadcast to WebSocket clients."""
    processor = FakeObservationProcessor()
    websocket_hub = FakeWebSocketHub()
    client = make_ingestion_client(
        processor,
        websocket_hub,
    )

    response = client.post(
        "/api/observations",
        json={
            "capability_id": "dns.resolve",
            "service_id": "dns-primary",
            "node_id": "infra-01",
            "status": "healthy",
            "observed_at": "2026-07-11T16:30:00+00:00",
            "latency_ms": 12.5,
            "metadata": {},
        },
    )

    assert response.status_code == 202
    assert len(websocket_hub.messages) == 1

    message = websocket_hub.messages[0]

    assert message["type"] == "observation.accepted"
    assert message["capability_id"] == "dns.resolve"
    assert message["service_id"] == "dns-primary"
    assert message["node_id"] == "infra-01"
    assert message["status"] == "healthy"
    assert message["incident_updated"] is False
    assert message["incident_id"] is None


def test_post_observation_does_not_broadcast_after_rejection() -> None:
    """A rejected observation must not be broadcast."""
    processor = FakeObservationProcessor(
        accepted=False,
    )
    websocket_hub = FakeWebSocketHub()
    client = make_ingestion_client(
        processor,
        websocket_hub,
    )

    response = client.post(
        "/api/observations",
        json={
            "capability_id": "dns.resolve",
            "service_id": "dns-primary",
            "node_id": "infra-01",
            "status": "healthy",
            "observed_at": "2026-07-11T16:30:00+00:00",
            "latency_ms": 12.5,
            "metadata": {},
        },
    )

    assert response.status_code == 202
    assert response.json() == {
        "accepted": False,
        "message": "Observation rejected.",
    }
    assert websocket_hub.messages == []
