"""Observation API routes for Ohana-Vision."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from ohana_vision.domain.observation import Observation
from ohana_vision.web.dependencies import (
    ObservationProcessorDependency,
    ObservationStoreDependency,
)
from ohana_vision.web.observation_ingestion_response import (
    ObservationIngestionResponse,
)
from ohana_vision.web.observation_mapper import ObservationMapper
from ohana_vision.web.observation_request import ObservationRequest

router = APIRouter(
    prefix="/observations",
    tags=["observations"],
)

OptionalStringQuery = Annotated[str | None, Query()]
OptionalDatetimeQuery = Annotated[datetime | None, Query()]
ObservationLimitQuery = Annotated[int, Query(ge=1, le=100)]


@router.get(
    "",
    summary="Stored observations",
)
def get_observations(
    observation_store: ObservationStoreDependency,
    node_id: OptionalStringQuery = None,
    service_id: OptionalStringQuery = None,
    capability_id: OptionalStringQuery = None,
    since: OptionalDatetimeQuery = None,
    until: OptionalDatetimeQuery = None,
    limit: ObservationLimitQuery = 100,
) -> list[Observation]:
    """Return stored observations matching the requested filters."""
    try:
        observations = observation_store.history(
            node_id=node_id,
            service_id=service_id,
            capability_id=capability_id,
            since=since,
            until=until,
            limit=limit,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    return list(observations)


@router.post(
    "",
    response_model=ObservationIngestionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_observation(
    request: Request,
    observation_request: ObservationRequest,
    processor: ObservationProcessorDependency,
) -> ObservationIngestionResponse:
    """Receive, process, and broadcast an observation."""
    observation = ObservationMapper.to_domain(observation_request)
    result = processor.process(observation)

    if result.accepted:
        await request.app.state.websocket_hub.broadcast(
            {
                "type": "observation.accepted",
                "observation_id": str(observation.observation_id),
                "capability_id": observation.capability_id,
                "service_id": observation.service_id,
                "node_id": observation.node_id,
                "status": observation.status.value,
                "incident_updated": result.incident_updated,
                "incident_id": (
                    str(result.incident_id) if result.incident_id is not None else None
                ),
            }
        )

    return ObservationIngestionResponse(
        accepted=result.accepted,
        message=(
            "Observation accepted." if result.accepted else "Observation rejected."
        ),
    )
