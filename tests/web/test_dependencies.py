"""Tests for Ohana-Vision FastAPI dependencies."""

from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.domain.incident_store import IncidentStore
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import (
    BackendRuntime,
    ObservationProcessor,
)
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web import (
    ApplicationContext,
    ApplicationContextDependency,
    ObservationStoreDependency,
    RuntimeDependency,
    TimelineEngineDependency,
    get_application_context,
)
from ohana_vision.web.dependencies import (
    ObservationProcessorDependency,
    get_observation_processor,
    get_timer,
)


def make_context() -> ApplicationContext:
    """Create an application context without constructing real services."""
    return ApplicationContext(
        runtime=cast(BackendRuntime, object()),
        observation_store=cast(ObservationStore, object()),
        timeline_engine=cast(TimelineEngine, object()),
    )


def test_application_context_dependency_returns_attached_context() -> None:
    """The dependency must return the context stored by FastAPI."""
    context = make_context()
    app = FastAPI()
    app.state.context = context

    @app.get("/context")
    def context_endpoint(
        injected_context: ApplicationContextDependency,
    ) -> dict[str, bool]:
        return {
            "same_context": injected_context is context,
        }

    response = TestClient(app).get("/context")

    assert response.status_code == 200
    assert response.json() == {
        "same_context": True,
    }


def test_application_context_dependency_returns_503_when_missing() -> None:
    """A missing context must produce an explicit service error."""
    app = FastAPI()

    @app.get("/context")
    def context_endpoint(
        context: ApplicationContextDependency,
    ) -> dict[str, bool]:
        return {
            "configured": context is not None,
        }

    response = TestClient(app).get("/context")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }


def test_runtime_dependency_returns_context_runtime() -> None:
    """The runtime dependency must expose the context runtime."""
    context = make_context()
    app = FastAPI()
    app.state.context = context

    @app.get("/runtime")
    def runtime_endpoint(
        runtime: RuntimeDependency,
    ) -> dict[str, bool]:
        return {
            "same_runtime": runtime is context.runtime,
        }

    response = TestClient(app).get("/runtime")

    assert response.status_code == 200
    assert response.json() == {
        "same_runtime": True,
    }


def test_observation_store_dependency_returns_context_store() -> None:
    """The store dependency must expose the context store."""
    context = make_context()
    app = FastAPI()
    app.state.context = context

    @app.get("/observation-store")
    def observation_store_endpoint(
        observation_store: ObservationStoreDependency,
    ) -> dict[str, bool]:
        return {
            "same_store": (observation_store is context.observation_store),
        }

    response = TestClient(app).get("/observation-store")

    assert response.status_code == 200
    assert response.json() == {
        "same_store": True,
    }


def test_timeline_engine_dependency_returns_context_engine() -> None:
    """The timeline dependency must expose the context engine."""
    context = make_context()
    app = FastAPI()
    app.state.context = context

    @app.get("/timeline-engine")
    def timeline_engine_endpoint(
        timeline_engine: TimelineEngineDependency,
    ) -> dict[str, bool]:
        return {
            "same_engine": (timeline_engine is context.timeline_engine),
        }

    response = TestClient(app).get("/timeline-engine")

    assert response.status_code == 200
    assert response.json() == {
        "same_engine": True,
    }


def test_application_context_dependency_can_be_overridden() -> None:
    """FastAPI must support overriding the context in tests."""
    original_context = make_context()
    overridden_context = make_context()

    app = FastAPI()
    app.state.context = original_context

    @app.get("/context")
    def context_endpoint(
        context: ApplicationContextDependency,
    ) -> dict[str, bool]:
        return {
            "overridden": context is overridden_context,
        }

    app.dependency_overrides[get_application_context] = lambda: overridden_context

    response = TestClient(app).get("/context")

    assert response.status_code == 200
    assert response.json() == {
        "overridden": True,
    }


def test_timer_dependency_returns_timezone_aware_datetime() -> None:
    """The timer dependency must return an aware UTC datetime."""
    timer = get_timer()

    now = timer()

    assert now.tzinfo is UTC


def test_observation_processor_dependency_reuses_context_processor() -> None:
    """Every ingestion request must reuse the long-lived processor."""
    runtime = BackendRuntime()
    observation_store = ObservationStore()
    timeline_engine = TimelineEngine()
    incident_store = IncidentStore()
    observed_at = datetime(
        2026,
        7,
        11,
        16,
        0,
        tzinfo=UTC,
    )

    processor = ObservationProcessor(
        runtime=runtime,
        observation_store=observation_store,
        incident_store=incident_store,
        timeline_engine=timeline_engine,
        timer=lambda: observed_at.timestamp(),
    )
    context = ApplicationContext(
        runtime=runtime,
        observation_store=observation_store,
        incident_store=incident_store,
        timeline_engine=timeline_engine,
        observation_processor=processor,
    )

    assert get_observation_processor(context) is processor
    assert get_observation_processor(context) is processor
    incident_store.close()


def test_observation_processor_dependency_rejects_missing_processor() -> None:
    """An incomplete context must fail instead of rebuilding per request."""
    context = make_context()

    application = FastAPI()
    application.state.context = context

    @application.get("/processor")
    def read_processor(
        processor: ObservationProcessorDependency,
    ) -> dict[str, bool]:
        return {"configured": processor is not None}

    response = TestClient(application).get("/processor")

    assert response.status_code == 503
    assert response.json() == {"detail": "Observation processor is not configured"}


def test_observation_processor_dependency_can_be_overridden() -> None:
    """FastAPI must support overriding the processor dependency."""
    expected_processor = cast(
        ObservationProcessor,
        object(),
    )

    application = FastAPI()

    @application.get("/processor")
    def read_processor(
        processor: ObservationProcessorDependency,
    ) -> dict[str, bool]:
        return {
            "injected": processor is expected_processor,
        }

    application.dependency_overrides[get_observation_processor] = lambda: (
        expected_processor
    )

    response = TestClient(application).get("/processor")

    assert response.status_code == 200
    assert response.json() == {
        "injected": True,
    }
