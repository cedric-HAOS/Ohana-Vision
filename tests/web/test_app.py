"""Tests for the Ohana-Vision FastAPI application."""

from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ohana_vision import __version__
from ohana_vision.configuration import (
    ApplicationConfiguration,
    Environment,
    WebConfiguration,
)
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import BackendRuntime
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web import ApplicationContext, WebSocketHub, create_app


def test_application_exposes_package_version() -> None:
    app = create_app()

    assert app.version == __version__


def make_client() -> TestClient:
    """Create an Ohana-Vision application client."""
    return TestClient(create_app())


def test_create_app_returns_fastapi_application() -> None:
    """The application factory must return a FastAPI instance."""
    app = create_app()

    assert isinstance(app, FastAPI)


def test_root_endpoint_opens_web_interface() -> None:
    """The application root must redirect to the rendered interface."""
    client = TestClient(create_app())

    response = client.get(
        "/",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "/ui/"


def test_shizune_is_exposed_under_vision_listener(monkeypatch, tmp_path) -> None:
    """The installed Shizune PWA is served without a second listener."""
    from ohana_vision.web import app as app_module

    shizune_directory = tmp_path / "shizune"
    shizune_directory.mkdir()
    (shizune_directory / "index.html").write_text(
        "<title>Shizune</title>",
        encoding="utf-8",
    )
    monkeypatch.setattr(app_module, "SHIZUNE_DIRECTORY", shizune_directory)

    response = TestClient(create_app()).get("/shizune/")

    assert response.status_code == 200
    assert "Shizune" in response.text


def test_api_endpoint_returns_api_status() -> None:
    """The application must expose the API router."""
    client = TestClient(create_app())

    response = client.get("/api/")

    assert response.status_code == 200
    assert response.json() == {
        "name": "Ohana Vision API",
        "status": "running",
    }


def test_openapi_schema_is_available() -> None:
    """The OpenAPI schema must be exposed."""
    client = TestClient(create_app())

    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"] == {
        "title": "Ohana Vision",
        "version": __version__,
    }


def test_swagger_documentation_is_available() -> None:
    """Swagger UI must be exposed."""
    client = TestClient(create_app())

    response = client.get("/docs")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def make_context() -> ApplicationContext:
    """Create a context for application factory tests."""
    return ApplicationContext(
        runtime=cast(BackendRuntime, object()),
        observation_store=cast(ObservationStore, object()),
        timeline_engine=cast(TimelineEngine, object()),
    )


def test_create_app_accepts_application_context() -> None:
    """The application factory must accept a service context."""
    context = make_context()

    app = create_app(context)

    assert app.state.context is context


def test_create_app_can_run_without_application_context() -> None:
    """The basic web application must remain independently runnable."""
    app = create_app()

    assert getattr(app.state, "context", None) is None


def test_runtime_api_is_registered() -> None:
    """The application must register the runtime API."""
    client = TestClient(create_app())

    response = client.get("/api/runtime")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }


def test_runtime_api_is_exposed_in_openapi() -> None:
    """The runtime API must appear in the OpenAPI schema."""
    client = TestClient(create_app())

    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/runtime" in response.json()["paths"]


def test_observations_api_is_registered() -> None:
    """The application must register the observation API."""
    client = TestClient(create_app())

    response = client.get("/api/observations")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Application context is not configured",
    }


def test_observations_api_is_exposed_in_openapi() -> None:
    """The observation API must appear in the OpenAPI schema."""
    client = TestClient(create_app())

    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/observations" in response.json()["paths"]


def test_timeline_api_is_registered() -> None:
    """The application must register the timeline API."""
    client = TestClient(create_app())

    response = client.get("/api/timeline")

    assert response.status_code == 503


def test_timeline_routes_are_exposed_in_openapi() -> None:
    """Timeline routes must appear in the OpenAPI schema."""
    response = TestClient(create_app()).get("/openapi.json")

    assert response.status_code == 200

    paths = response.json()["paths"]

    assert "/api/timeline" in paths
    assert "/api/timeline/nodes/{node_id}" in paths
    assert "/api/timeline/nodes/{node_id}/services/{service_id}" in paths


def test_create_app_stores_websocket_hub() -> None:
    """The application must retain its WebSocket hub."""
    hub = WebSocketHub()

    app = create_app(websocket_hub=hub)

    assert app.state.websocket_hub is hub


def test_create_app_builds_default_websocket_hub() -> None:
    """The application must build a hub when none is provided."""
    app = create_app()

    assert isinstance(
        app.state.websocket_hub,
        WebSocketHub,
    )


def test_application_mounts_static_ui() -> None:
    """The application must expose the static dashboard."""
    client = TestClient(create_app())

    response = client.get("/ui/")

    assert response.status_code == 200


def test_observation_ingestion_is_exposed_in_openapi() -> None:
    """The ingestion endpoint must appear in the OpenAPI schema."""
    response = TestClient(create_app()).get("/openapi.json")

    assert response.status_code == 200
    assert "post" in response.json()["paths"]["/api/observations"]


def test_dashboard_connects_topology_controls() -> None:
    """The topology module must connect its navigation controls."""
    client = make_client()

    response = client.get("/ui/topology.js")

    assert response.status_code == 200
    assert "#topology-zoom-in" in response.text
    assert "#topology-zoom-out" in response.text
    assert "#topology-reset-view" in response.text
    assert "this.canvas.zoomIn()" in response.text
    assert "this.canvas.zoomOut()" in response.text
    assert "this.canvas.resetView()" in response.text


def test_dashboard_calculates_kpis() -> None:
    """The dashboard must calculate its main indicators."""
    client = make_client()

    response = client.get("/ui/dashboard.js")

    assert response.status_code == 200
    assert "renderKpis()" in response.text
    assert "availabilityPercentage(" in response.text
    assert "deviceHealthStatistics()" in response.text
    assert "renderCapabilityDistribution()" in response.text
    assert "renderServiceCount()" not in response.text
    assert "renderIncidents(" not in response.text


def test_dashboard_renders_global_topology_health() -> None:
    """The dashboard must render a global topology status."""
    client = make_client()

    response = client.get("/ui/dashboard.js")

    assert response.status_code == 200
    assert "globalTopologyHealth(" in response.text
    assert "formatGlobalTopologyHealth(" in response.text
    assert "topologyHealthIndicator" in response.text
    assert "topologyHealthLabel" in response.text


def test_dashboard_renders_graphical_timeline() -> None:
    """The dashboard must render health periods graphically."""
    client = make_client()

    response = client.get("/ui/timeline.js")

    assert response.status_code == 200
    assert "export class TimelineController" in response.text
    assert "renderAxis(" in response.text
    assert "renderPeriodRow(" in response.text
    assert "renderPeriod(" in response.text


def test_dashboard_connects_timeline_to_topology() -> None:
    """Timeline nodes must select their topology devices."""
    client = make_client()

    app_response = client.get("/ui/application.js")
    timeline_response = client.get("/ui/timeline.js")
    topology_response = client.get("/ui/topology.js")

    assert app_response.status_code == 200
    assert timeline_response.status_code == 200
    assert topology_response.status_code == 200

    assert "onNodeSelected" in app_response.text
    assert "selectDeviceByNode" in app_response.text
    assert "this.onNodeSelected(" in timeline_response.text
    assert "selectDeviceByNode(" in topology_response.text


def test_dashboard_animates_kpi_updates() -> None:
    """The dashboard must animate changed KPI values."""
    client = make_client()

    response = client.get("/ui/dashboard.js")

    assert response.status_code == 200
    assert "animateKpi(" in response.text
    assert "dashboard-kpi--updating" in response.text
    assert "requestAnimationFrame" in response.text
    assert "setTimeout" in response.text


def test_dashboard_renders_device_details() -> None:
    """The frontend must render selected-device details."""
    client = make_client()

    response = client.get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    assert "DeviceDetailsController" in response.text
    assert "deviceIconMarkup(" in response.text
    assert "renderLinks(" in response.text
    assert "healthStatusLabel(" in response.text


def test_dashboard_connects_topology_to_device_details() -> None:
    """Topology selections must open device details."""
    client = make_client()

    application_response = client.get(
        "/ui/application.js",
    )
    topology_response = client.get(
        "/ui/topology.js",
    )
    details_response = client.get(
        "/ui/device_details.js",
    )

    assert application_response.status_code == 200
    assert topology_response.status_code == 200
    assert details_response.status_code == 200

    assert "onDeviceSelected" in application_response.text
    assert "this.deviceDetails" in application_response.text
    assert ".select(" in application_response.text

    assert "this.onDeviceSelected(" in topology_response.text
    assert "select(deviceId)" in details_response.text


def test_dashboard_renders_realtime_side_panel() -> None:
    """The frontend must render alerts and recent activity."""
    client = make_client()

    dashboard_response = client.get(
        "/ui/dashboard.js",
    )
    observations_response = client.get(
        "/ui/observations.js",
    )

    assert dashboard_response.status_code == 200
    assert observations_response.status_code == 200

    assert "renderActiveAlerts()" in dashboard_response.text
    assert "renderRecent(" in observations_response.text


def test_dashboard_connects_to_websocket() -> None:
    """The frontend must connect to the realtime backend."""
    client = make_client()

    app_response = client.get("/ui/application.js")
    websocket_response = client.get(
        "/ui/websocket.js",
    )

    assert app_response.status_code == 200
    assert websocket_response.status_code == 200

    assert "WebSocketController" in app_response.text
    assert "new WebSocket(" in websocket_response.text
    assert "websocketUrl()" in websocket_response.text
    assert "this.onMessage(message)" in websocket_response.text


def test_dashboard_reconnects_websocket() -> None:
    """The realtime connection must reconnect after closing."""
    client = make_client()

    response = client.get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert "scheduleReconnect()" in response.text
    assert "reconnectDelayMs" in response.text
    assert "window.setTimeout(" in response.text


def test_static_javascript_is_available() -> None:
    """The frontend JavaScript entry point must be served."""
    client = make_client()

    response = client.get("/ui/app.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert 'from "./application.js"' in response.text
    assert "ApplicationController" in response.text
    assert "application.initialize()" in response.text


def test_create_app_stores_configuration() -> None:
    """The application must retain its configuration."""
    configuration = ApplicationConfiguration(
        environment=Environment.TEST,
    )

    app = create_app(configuration=configuration)

    assert app.state.configuration is configuration


def test_create_app_uses_configuration_name() -> None:
    """The configured name must be exposed through OpenAPI."""
    configuration = ApplicationConfiguration(
        name="Configured Vision",
    )

    client = TestClient(create_app(configuration=configuration))

    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Configured Vision"


def test_create_app_enables_debug_from_configuration() -> None:
    """FastAPI debug mode must follow the configuration."""
    configuration = ApplicationConfiguration(
        environment=Environment.DEVELOPMENT,
        debug=True,
    )

    app = create_app(configuration=configuration)

    assert app.debug is True


def test_create_app_disables_documentation() -> None:
    """Documentation endpoints must be removable in production."""
    configuration = ApplicationConfiguration(
        environment=Environment.PRODUCTION,
        debug=False,
        web=WebConfiguration(
            documentation_enabled=False,
        ),
    )

    client = TestClient(create_app(configuration=configuration))

    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_create_app_keeps_api_when_documentation_is_disabled() -> None:
    """Disabling documentation must not disable the application."""
    configuration = ApplicationConfiguration(
        environment=Environment.PRODUCTION,
        debug=False,
        web=WebConfiguration(
            documentation_enabled=False,
        ),
    )

    client = TestClient(create_app(configuration=configuration))

    response = client.get("/")

    assert response.status_code == 200
