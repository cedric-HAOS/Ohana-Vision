"""Tests for the Ohana-Vision runtime API router."""

from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.domain import ObservationStore
from ohana_vision.runtime import (
    BackendRuntime,
    BackendRuntimeState,
    RuntimeSnapshot,
    RuntimeStatistics,
)
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web.dependencies import (
    get_observation_store,
    get_runtime,
    get_timeline_engine,
)
from ohana_vision.web.routers import runtime_router


class FakeBackendRuntime:
    """Backend runtime double recording snapshot counters."""

    def __init__(self, snapshot: RuntimeSnapshot) -> None:
        self._snapshot = snapshot
        self.snapshot_calls = 0
        self.snapshot_arguments: dict[str, int] = {}

    def snapshot(
        self,
        *,
        observations_stored: int = 0,
        service_timelines: int = 0,
        node_timelines: int = 0,
        infrastructure_timelines: int = 0,
    ) -> RuntimeSnapshot:
        """Return the configured runtime snapshot."""
        self.snapshot_calls += 1
        self.snapshot_arguments = {
            "observations_stored": observations_stored,
            "service_timelines": service_timelines,
            "node_timelines": node_timelines,
            "infrastructure_timelines": infrastructure_timelines,
        }
        return self._snapshot


class FakeObservationStore:
    """Observation store double exposing stored observations."""

    def __init__(self, observation_count: int = 0) -> None:
        self._observations = [object()] * observation_count

    def history(self) -> tuple[object, ...]:
        """Return all stored observations."""
        return tuple(self._observations)


class FakeTimelineEngine:
    """Timeline engine double exposing timeline collections."""

    def __init__(
        self,
        *,
        service_timelines: int = 0,
        node_timelines: int = 0,
        infrastructure_timelines: int = 0,
    ) -> None:
        self.service_timelines = [object()] * service_timelines
        self.node_timelines = [object()] * node_timelines
        self.infrastructure_timelines = [object()] * infrastructure_timelines


def make_snapshot(
    *,
    state: BackendRuntimeState = BackendRuntimeState.RUNNING,
    observations_stored: int = 0,
    service_timelines: int = 0,
    node_timelines: int = 0,
    infrastructure_timelines: int = 0,
) -> RuntimeSnapshot:
    """Create a runtime snapshot for tests."""

    return RuntimeSnapshot(
        state=state,
        statistics=RuntimeStatistics(),
        generated_at=datetime(
            2026,
            7,
            10,
            15,
            0,
            tzinfo=UTC,
        ),
        observations_stored=observations_stored,
        service_timelines=service_timelines,
        node_timelines=node_timelines,
        infrastructure_timelines=infrastructure_timelines,
    )


def make_client(
    runtime: FakeBackendRuntime,
    *,
    observation_count: int = 0,
    service_timelines: int = 0,
    node_timelines: int = 0,
    infrastructure_timelines: int = 0,
) -> TestClient:
    """Create a test client with overridden runtime services."""
    app = FastAPI()
    app.include_router(runtime_router)

    observation_store = FakeObservationStore(observation_count)
    timeline_engine = FakeTimelineEngine(
        service_timelines=service_timelines,
        node_timelines=node_timelines,
        infrastructure_timelines=infrastructure_timelines,
    )

    app.dependency_overrides[get_runtime] = lambda: cast(
        BackendRuntime,
        runtime,
    )
    app.dependency_overrides[get_observation_store] = lambda: cast(
        ObservationStore,
        observation_store,
    )
    app.dependency_overrides[get_timeline_engine] = lambda: cast(
        TimelineEngine,
        timeline_engine,
    )

    return TestClient(app)


def test_runtime_router_returns_runtime_snapshot() -> None:
    """The runtime endpoint must expose the current snapshot."""
    snapshot = make_snapshot()
    runtime = FakeBackendRuntime(snapshot)
    client = make_client(runtime)

    response = client.get("/runtime")

    assert response.status_code == 200
    assert runtime.snapshot_calls == 1


def test_runtime_router_serializes_snapshot() -> None:
    """The runtime endpoint must serialize the complete snapshot."""
    snapshot = make_snapshot(
        observations_stored=3,
        service_timelines=2,
        node_timelines=1,
        infrastructure_timelines=1,
    )
    runtime = FakeBackendRuntime(snapshot)
    client = make_client(runtime)

    response = client.get("/runtime")

    assert response.status_code == 200
    assert response.json() == {
        "state": snapshot.state.value,
        "statistics": {
            "observations_received": 0,
            "observations_accepted": 0,
            "observations_rejected": 0,
            "errors": 0,
            "last_observation_at": None,
            "last_error_at": None,
            "last_processing_ms": None,
            "average_processing_ms": 0.0,
            "max_processing_ms": 0.0,
            "total_processing_ms": 0.0,
        },
        "generated_at": snapshot.generated_at.isoformat().replace("+00:00", "Z"),
        "observations_stored": 3,
        "service_timelines": 2,
        "node_timelines": 1,
        "infrastructure_timelines": 1,
    }


def test_runtime_router_exposes_runtime_state() -> None:
    """The runtime endpoint must expose the runtime state."""
    snapshot = make_snapshot()
    runtime = FakeBackendRuntime(snapshot)
    client = make_client(runtime)

    response = client.get("/runtime")

    assert response.status_code == 200
    assert response.json()["state"] == snapshot.state.value


def test_runtime_router_returns_503_without_context() -> None:
    """The runtime API must fail explicitly without application context."""
    app = FastAPI()
    app.include_router(runtime_router)

    response = TestClient(app).get("/runtime")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }
