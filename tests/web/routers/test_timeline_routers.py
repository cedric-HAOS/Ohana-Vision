"""Tests for the Ohana-Vision timeline API router."""

from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.domain import (
    HealthStatus,
    Observation,
    ObservationStore,
)
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web.dependencies import (
    get_observation_store,
    get_timeline_engine,
)
from ohana_vision.web.routers import timeline_router


def make_observation(
    *,
    node_id: str = "infra-01",
    service_id: str = "dns-primary",
    capability_id: str = "dns.resolve",
    status: HealthStatus = HealthStatus.HEALTHY,
    observed_at: datetime | None = None,
) -> Observation:
    """Create an observation for timeline API tests."""
    return Observation(
        node_id=node_id,
        service_id=service_id,
        capability_id=capability_id,
        status=status,
        observed_at=observed_at or datetime(2026, 7, 11, 12, 0, tzinfo=UTC),
    )


def make_store(
    *observations: Observation,
) -> ObservationStore:
    """Create an observation store containing test observations."""
    store = ObservationStore()
    store.add_many(observations)
    return store


def make_client(
    store: ObservationStore,
    engine: TimelineEngine | None = None,
) -> TestClient:
    """Create a test client with timeline dependencies."""
    app = FastAPI()
    app.include_router(timeline_router)

    timeline_engine = engine or TimelineEngine()

    app.dependency_overrides[get_observation_store] = lambda: store
    app.dependency_overrides[get_timeline_engine] = lambda: cast(
        TimelineEngine,
        timeline_engine,
    )

    return TestClient(app)


def test_timeline_router_returns_empty_infrastructure() -> None:
    """An empty store must produce an empty infrastructure timeline."""
    client = make_client(ObservationStore())

    response = client.get("/timeline")

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [],
        "periods": [],
    }


def test_timeline_router_returns_complete_hierarchy() -> None:
    """The endpoint must expose nodes, services and capabilities."""
    store = make_store(
        make_observation(),
        make_observation(
            node_id="green-01",
            service_id="mqtt-primary",
            capability_id="mqtt.connect",
        ),
    )
    client = make_client(store)

    response = client.get("/timeline")

    assert response.status_code == 200

    payload = response.json()

    assert len(payload["nodes"]) == 2
    assert [node["node_id"] for node in payload["nodes"]] == [
        "green-01",
        "infra-01",
    ]


def test_timeline_router_returns_requested_node() -> None:
    """The node endpoint must return the requested node timeline."""
    store = make_store(
        make_observation(node_id="infra-01"),
        make_observation(
            node_id="green-01",
            service_id="mqtt-primary",
            capability_id="mqtt.connect",
        ),
    )
    client = make_client(store)

    response = client.get("/timeline/nodes/green-01")

    assert response.status_code == 200
    assert response.json()["node_id"] == "green-01"


def test_timeline_router_returns_404_for_unknown_node() -> None:
    """An unknown node must produce HTTP 404."""
    store = make_store(make_observation())
    client = make_client(store)

    response = client.get("/timeline/nodes/unknown")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Node timeline 'unknown' was not found.",
    }


def test_timeline_router_returns_requested_service() -> None:
    """The service endpoint must return the requested service timeline."""
    store = make_store(make_observation())
    client = make_client(store)

    response = client.get("/timeline/nodes/infra-01/services/dns-primary")

    assert response.status_code == 200
    assert response.json()["service_id"] == "dns-primary"
    assert response.json()["node_id"] == "infra-01"


def test_timeline_router_returns_404_for_unknown_service() -> None:
    """An unknown service must produce HTTP 404."""
    store = make_store(make_observation())
    client = make_client(store)

    response = client.get("/timeline/nodes/infra-01/services/unknown")

    assert response.status_code == 404
    assert response.json() == {
        "detail": ("Service timeline 'unknown' was not found on node 'infra-01'."),
    }


def test_timeline_router_builds_timeline_until_requested_date() -> None:
    """The until parameter must close the active timeline period."""
    observed_at = datetime(2026, 7, 11, 10, 0, tzinfo=UTC)
    until = datetime(2026, 7, 11, 11, 0, tzinfo=UTC)

    store = make_store(
        make_observation(observed_at=observed_at),
    )
    client = make_client(store)

    response = client.get(
        "/timeline",
        params={
            "until": until.isoformat().replace("+00:00", "Z"),
        },
    )

    assert response.status_code == 200

    period = response.json()["periods"][0]

    assert period["started_at"] == "2026-07-11T10:00:00Z"
    assert period["ended_at"] == "2026-07-11T11:00:00Z"


def test_timeline_router_returns_422_for_naive_until() -> None:
    """A timezone-naive until value must produce HTTP 422."""
    store = make_store(make_observation())
    client = make_client(store)

    response = client.get(
        "/timeline",
        params={
            "until": "2026-07-11T13:00:00",
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "until must be timezone-aware.",
    }


def test_timeline_router_returns_503_without_context() -> None:
    """The timeline API must require an application context."""
    app = FastAPI()
    app.include_router(timeline_router)

    response = TestClient(app).get("/timeline")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }


def test_timeline_router_exposes_period_metadata() -> None:
    """Timeline periods must expose the explicit API contract."""
    observed_at = datetime(
        2026,
        7,
        11,
        10,
        0,
        tzinfo=UTC,
    )
    until = datetime(
        2026,
        7,
        11,
        11,
        0,
        tzinfo=UTC,
    )
    store = make_store(
        make_observation(
            observed_at=observed_at,
        ),
    )
    client = make_client(store)

    response = client.get(
        "/timeline",
        params={
            "until": until.isoformat().replace(
                "+00:00",
                "Z",
            ),
        },
    )

    assert response.status_code == 200

    period = response.json()["periods"][0]

    assert period == {
        "status": "healthy",
        "started_at": "2026-07-11T10:00:00Z",
        "ended_at": "2026-07-11T11:00:00Z",
        "duration_seconds": 3600.0,
        "is_open": False,
    }


def test_timeline_router_accepts_a_bounded_history_window() -> None:
    """A visible window keeps the state active before its beginning."""
    store = make_store(
        make_observation(
            status=HealthStatus.HEALTHY,
            observed_at=datetime(2026, 7, 11, 8, 0, tzinfo=UTC),
        ),
        make_observation(
            status=HealthStatus.DEGRADED,
            observed_at=datetime(2026, 7, 11, 11, 0, tzinfo=UTC),
        ),
    )
    client = make_client(store)

    response = client.get(
        "/timeline",
        params={
            "since": "2026-07-11T10:00:00Z",
            "until": "2026-07-11T12:00:00Z",
        },
    )

    assert response.status_code == 200
    assert [period["status"] for period in response.json()["periods"]] == [
        "healthy",
        "degraded",
    ]


def test_timeline_window_reopens_after_monitoring_suspension() -> None:
    """A bounded window must keep a healthy period after scheduled monitoring."""
    store = make_store(
        make_observation(
            status=HealthStatus.UNKNOWN,
            observed_at=datetime(2026, 7, 11, 8, 0, tzinfo=UTC),
        ),
        make_observation(
            status=HealthStatus.HEALTHY,
            observed_at=datetime(2026, 7, 11, 10, 30, tzinfo=UTC),
        ),
    )
    client = make_client(store)

    response = client.get(
        "/timeline",
        params={
            "since": "2026-07-11T10:00:00Z",
            "until": "2026-07-11T12:00:00Z",
        },
    )

    assert response.status_code == 200
    periods = response.json()["periods"]
    assert [period["status"] for period in periods] == [
        "unknown",
        "healthy",
    ]
    assert periods[-1]["started_at"] == "2026-07-11T10:30:00Z"
    assert periods[-1]["ended_at"] == "2026-07-11T12:00:00Z"


def test_timeline_router_rejects_naive_since() -> None:
    """A timezone-naive lower bound must produce HTTP 422."""
    client = make_client(make_store(make_observation()))

    response = client.get(
        "/timeline",
        params={"since": "2026-07-11T10:00:00"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "since must be timezone-aware.",
    }
