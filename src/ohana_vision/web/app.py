"""FastAPI application factory for Ohana-Vision."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from ohana_vision import __version__
from ohana_vision.administration import AgentAdministrationClient
from ohana_vision.configuration import (
    ApplicationConfiguration,
)
from ohana_vision.topology import Topology
from ohana_vision.web.api.topology_router import (
    router as topology_router,
)
from ohana_vision.web.application_context import ApplicationContext
from ohana_vision.web.routers import (
    api_router,
    root_router,
    websocket_router,
)
from ohana_vision.web.websocket_hub import WebSocketHub

APPLICATION_NAME = "Ohana Vision"

STATIC_DIRECTORY = Path(__file__).parent / "static"
SHIZUNE_DIRECTORY = Path("/var/www/shizune")


def create_app(
    context: ApplicationContext | None = None,
    *,
    configuration: ApplicationConfiguration | None = None,
    websocket_hub: WebSocketHub | None = None,
    topology: Topology | None = None,
    administration_client: AgentAdministrationClient | None = None,
) -> FastAPI:
    """Create and configure the Ohana-Vision application."""
    resolved_configuration = configuration or ApplicationConfiguration()

    documentation_enabled = resolved_configuration.web.documentation_enabled

    app = FastAPI(
        title=resolved_configuration.name,
        version=__version__,
        debug=resolved_configuration.debug,
        docs_url="/docs" if documentation_enabled else None,
        redoc_url="/redoc" if documentation_enabled else None,
        openapi_url=("/openapi.json" if documentation_enabled else None),
    )

    resolved_topology = topology or Topology(
        topology_id="unconfigured",
        label="Infrastructure non configurée",
    )

    app.state.configuration = resolved_configuration
    app.state.base_topology = resolved_topology
    app.state.topology = resolved_topology
    app.state.infrastructure_snapshot = None
    app.state.administration_client = administration_client

    if context is not None:
        app.state.context = context

    app.state.websocket_hub = websocket_hub or WebSocketHub()

    app.include_router(root_router)
    app.include_router(api_router)
    app.include_router(websocket_router)

    app.mount(
        "/ui",
        StaticFiles(
            directory=STATIC_DIRECTORY,
            html=True,
        ),
        name="ui",
    )

    # Shizune is a static PWA installed by Ohana-Installer.  It deliberately
    # shares Vision's listener so no additional port or service is required.
    app.mount(
        "/shizune",
        StaticFiles(
            directory=SHIZUNE_DIRECTORY,
            html=True,
            check_dir=False,
        ),
        name="shizune",
    )

    app.include_router(topology_router)

    return app
