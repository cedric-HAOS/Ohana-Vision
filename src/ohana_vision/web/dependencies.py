"""FastAPI dependencies for Ohana-Vision."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import Depends, HTTPException, Request, WebSocket, status

from ohana_vision.domain.incident_store import IncidentStore
from ohana_vision.domain.observation_store import ObservationStore
from ohana_vision.runtime import BackendRuntime, ObservationProcessor
from ohana_vision.timeline import TimelineEngine
from ohana_vision.topology import Topology
from ohana_vision.web.application_context import ApplicationContext
from ohana_vision.web.websocket_hub import WebSocketHub

"""FastAPI dependencies used by Ohana-Vision."""


def get_topology(
    request: Request,
) -> Topology:
    """Return the current infrastructure topology."""
    topology = getattr(
        request.app.state,
        "topology",
        None,
    )

    if topology is None:
        raise HTTPException(
            status_code=(status.HTTP_503_SERVICE_UNAVAILABLE),
            detail=("Infrastructure topology is not configured"),
        )

    return cast(Topology, topology)


def get_application_context(request: Request) -> ApplicationContext:
    """Return the application context attached to FastAPI."""
    context = getattr(request.app.state, "context", None)

    if context is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Application context is not configured",
        )

    return cast(ApplicationContext, context)


ApplicationContextDependency = Annotated[
    ApplicationContext,
    Depends(get_application_context),
]


def get_runtime(
    context: ApplicationContextDependency,
) -> BackendRuntime:
    """Return the backend runtime from the application context."""
    return context.runtime


def get_observation_store(
    context: ApplicationContextDependency,
) -> ObservationStore:
    """Return the observation store from the application context."""
    return context.observation_store


def get_incident_store(
    context: ApplicationContextDependency,
) -> IncidentStore:
    """Return the persistent incident store from the application context."""
    return context.incident_store


def get_timeline_engine(
    context: ApplicationContextDependency,
) -> TimelineEngine:
    """Return the timeline engine from the application context."""
    return context.timeline_engine


RuntimeDependency = Annotated[
    BackendRuntime,
    Depends(get_runtime),
]

ObservationStoreDependency = Annotated[
    ObservationStore,
    Depends(get_observation_store),
]

IncidentStoreDependency = Annotated[
    IncidentStore,
    Depends(get_incident_store),
]

TimelineEngineDependency = Annotated[
    TimelineEngine,
    Depends(get_timeline_engine),
]


def get_websocket_hub(
    websocket: WebSocket,
) -> WebSocketHub:
    """Return the WebSocket hub attached to FastAPI."""
    hub = getattr(
        websocket.app.state,
        "websocket_hub",
        None,
    )

    if hub is None:
        raise RuntimeError("WebSocket hub is not configured.")

    return hub


WebSocketHubDependency = Annotated[
    WebSocketHub,
    Depends(get_websocket_hub),
]

Timer = Callable[[], datetime]


def get_timer() -> Timer:
    """Return the timer used by observation processing."""
    return lambda: datetime.now(UTC)


TimerDependency = Annotated[
    Timer,
    Depends(get_timer),
]


def get_observation_processor(
    runtime: Annotated[
        BackendRuntime,
        Depends(get_runtime),
    ],
    observation_store: Annotated[
        ObservationStore,
        Depends(get_observation_store),
    ],
    incident_store: Annotated[
        IncidentStore,
        Depends(get_incident_store),
    ],
    timeline_engine: Annotated[
        TimelineEngine,
        Depends(get_timeline_engine),
    ],
    timer: TimerDependency,
) -> ObservationProcessor:
    """Build an observation processor from application dependencies."""
    return ObservationProcessor(
        runtime=runtime,
        observation_store=observation_store,
        incident_store=incident_store,
        timeline_engine=timeline_engine,
        timer=timer,
    )


ObservationProcessorDependency = Annotated[
    ObservationProcessor,
    Depends(get_observation_processor),
]
