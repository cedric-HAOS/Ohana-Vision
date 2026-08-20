"""Tests for the Ohana-Vision application bootstrap."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision.configuration import (
    ApplicationConfiguration,
    Environment,
)
from ohana_vision.domain import HealthStatus, Observation, ObservationStore
from ohana_vision.runtime import BackendRuntime, ObservationProcessor
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web.app import create_app
from ohana_vision.web.application_context import ApplicationContext
from ohana_vision.web.bootstrap import (
    build_application,
    build_application_context,
)


def test_build_application_context_returns_context() -> None:
    """The bootstrap must build an application context."""
    context = build_application_context()

    assert isinstance(context, ApplicationContext)


def test_build_application_context_contains_runtime() -> None:
    """The context must contain a backend runtime."""
    context = build_application_context()

    assert isinstance(context.runtime, BackendRuntime)


def test_build_application_context_contains_observation_store() -> None:
    """The context must contain an observation store."""
    context = build_application_context()

    assert isinstance(
        context.observation_store,
        ObservationStore,
    )


def test_build_application_context_restores_persistent_observations(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "vision.db"
    first = build_application_context(database_path=database_path)
    first.observation_store.add(
        Observation(
            capability_id="dns.resolve",
            service_id="dns-primary",
            node_id="infra-01",
            status=HealthStatus.HEALTHY,
            observed_at=datetime(2026, 8, 10, 10, 0, tzinfo=UTC),
        )
    )
    first.observation_store.close()

    restored = build_application_context(database_path=database_path)

    assert restored.observation_store.observation_count == 1
    restored.observation_store.close()


def test_build_application_context_contains_timeline_engine() -> None:
    """The context must contain a timeline engine."""
    context = build_application_context()

    assert isinstance(
        context.timeline_engine,
        TimelineEngine,
    )


def test_build_application_context_contains_long_lived_processor() -> None:
    """The processor must be composed once with the shared persistent stores."""
    context = build_application_context()

    assert isinstance(context.observation_processor, ObservationProcessor)
    assert context.observation_processor.observation_store is context.observation_store
    assert context.observation_processor.runtime is context.runtime


def test_build_application_returns_fastapi() -> None:
    """The bootstrap must create the complete FastAPI application."""
    app = build_application()

    assert isinstance(app, FastAPI)


def test_build_application_stores_built_context() -> None:
    """The application must retain its composed context."""
    context = build_application_context()

    app = create_app(context=context)

    assert app.state.context is context
    assert app.state.context.runtime is context.runtime
    assert app.state.context.observation_store is context.observation_store
    assert app.state.context.timeline_engine is context.timeline_engine
    assert app.state.context.observation_processor is context.observation_processor


def test_bootstrapped_runtime_api_is_available() -> None:
    """The complete application must expose its runtime."""
    client = TestClient(build_application())

    response = client.get("/api/runtime")

    assert response.status_code == 200
    assert response.json()["state"] == "running"


def test_bootstrapped_observation_api_is_available() -> None:
    """The complete application must expose its observation store."""
    client = TestClient(build_application())

    response = client.get("/api/observations")

    assert response.status_code == 200
    assert response.json() == []


def test_bootstrapped_timeline_api_is_available() -> None:
    """The complete application must expose its timeline."""
    client = TestClient(build_application())

    response = client.get("/api/timeline")

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [],
        "periods": [],
    }


def test_bootstrapped_application_waits_for_agent_topology() -> None:
    """The complete application must start without a local topology."""
    client = TestClient(build_application())

    response = client.get("/api/topology")

    assert response.status_code == 200

    payload = response.json()

    assert payload["topology_id"] == "unconfigured"
    assert payload["label"] == "Infrastructure non configurée"
    assert payload["devices"] == []
    assert payload["links"] == []
    assert payload["layouts"] == []


def test_build_application_accepts_configuration() -> None:
    """The bootstrap must accept an injected configuration."""
    configuration = ApplicationConfiguration(
        environment=Environment.TEST,
    )

    app = build_application(
        configuration=configuration,
    )

    assert app.state.configuration is configuration


def test_build_application_loads_configuration_file(
    tmp_path: Path,
) -> None:
    """The bootstrap must load its external YAML configuration."""
    path = tmp_path / "vision.yaml"
    path.write_text(
        """
name: External Vision
environment: test
debug: false

server:
  host: 127.0.0.1
  port: 9000
  log_level: info

web:
  documentation_enabled: true
""",
        encoding="utf-8",
    )

    app = build_application(
        configuration_path=path,
    )

    assert app.state.configuration.name == "External Vision"
    assert app.state.configuration.environment is Environment.TEST
    assert app.state.configuration.server.port == 9000


def test_module_application_uses_default_configuration() -> None:
    """The module-level application must be importable without a file."""
    from ohana_vision.web.bootstrap import app

    assert isinstance(
        app.state.configuration,
        ApplicationConfiguration,
    )


def test_build_application_uses_default_configuration() -> None:
    """The bootstrap must work without an external file."""
    application = build_application()

    assert isinstance(
        application.state.configuration,
        ApplicationConfiguration,
    )
    assert application.state.configuration.environment is Environment.DEVELOPMENT


def test_build_application_rejects_two_configuration_sources(
    tmp_path: Path,
) -> None:
    """Only one configuration source may be supplied."""
    configuration_path = tmp_path / "vision.yaml"
    configuration_path.write_text(
        "",
        encoding="utf-8",
    )

    with pytest.raises(
        ValueError,
        match="cannot be provided together",
    ):
        build_application(
            configuration=ApplicationConfiguration(),
            configuration_path=configuration_path,
        )
