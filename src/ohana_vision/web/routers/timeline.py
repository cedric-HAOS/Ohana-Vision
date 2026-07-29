"""Timeline API routes for Ohana-Vision."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from ohana_vision.timeline import InfrastructureTimeline
from ohana_vision.web.api.timeline_mapper import (
    map_infrastructure_timeline,
    map_node_timeline,
    map_service_timeline,
)
from ohana_vision.web.api.timeline_schemas import (
    InfrastructureTimelineResponse,
    NodeTimelineResponse,
    ServiceTimelineResponse,
)
from ohana_vision.web.dependencies import (
    ObservationStoreDependency,
    TimelineEngineDependency,
)

router = APIRouter(
    prefix="/timeline",
    tags=["timeline"],
)

OptionalDatetimeQuery = Annotated[datetime | None, Query()]


def build_infrastructure_timeline(
    observation_store: ObservationStoreDependency,
    timeline_engine: TimelineEngineDependency,
    *,
    since: datetime | None,
    until: datetime | None,
) -> InfrastructureTimeline:
    """Build the infrastructure timeline from stored observations."""
    try:
        observations = (
            observation_store.history_window(
                since=since,
                until=until,
            )
            if since is not None
            else observation_store.history(until=until)
        )

        return timeline_engine.build_infrastructure(
            observations,
            until=until,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


@router.get(
    "",
    response_model=InfrastructureTimelineResponse,
    summary="Infrastructure timeline",
)
def get_infrastructure_timeline(
    observation_store: ObservationStoreDependency,
    timeline_engine: TimelineEngineDependency,
    since: OptionalDatetimeQuery = None,
    until: OptionalDatetimeQuery = None,
) -> InfrastructureTimelineResponse:
    """Return the complete infrastructure timeline hierarchy."""
    timeline = build_infrastructure_timeline(
        observation_store,
        timeline_engine,
        since=since,
        until=until,
    )

    return map_infrastructure_timeline(timeline)


@router.get(
    "/nodes/{node_id}",
    response_model=NodeTimelineResponse,
    summary="Node timeline",
)
def get_node_timeline(
    node_id: str,
    observation_store: ObservationStoreDependency,
    timeline_engine: TimelineEngineDependency,
    since: OptionalDatetimeQuery = None,
    until: OptionalDatetimeQuery = None,
) -> NodeTimelineResponse:
    """Return the timeline of one node."""
    infrastructure = build_infrastructure_timeline(
        observation_store,
        timeline_engine,
        since=since,
        until=until,
    )

    node = infrastructure.node(node_id)

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node timeline '{node_id}' was not found.",
        )

    return map_node_timeline(node)


@router.get(
    "/nodes/{node_id}/services/{service_id}",
    response_model=ServiceTimelineResponse,
    summary="Service timeline",
)
def get_service_timeline(
    node_id: str,
    service_id: str,
    observation_store: ObservationStoreDependency,
    timeline_engine: TimelineEngineDependency,
    since: OptionalDatetimeQuery = None,
    until: OptionalDatetimeQuery = None,
) -> ServiceTimelineResponse:
    """Return the timeline of one service on one node."""
    infrastructure = build_infrastructure_timeline(
        observation_store,
        timeline_engine,
        since=since,
        until=until,
    )

    node = infrastructure.node(node_id)

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node timeline '{node_id}' was not found.",
        )

    service = node.service(service_id)

    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Service timeline '{service_id}' was not found on node '{node_id}'."
            ),
        )

    return map_service_timeline(service)
