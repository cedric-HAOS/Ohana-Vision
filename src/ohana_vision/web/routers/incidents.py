"""Persistent incident API routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from ohana_vision.domain import IncidentNotFoundError
from ohana_vision.web.dependencies import IncidentStoreDependency, TimerDependency
from ohana_vision.web.incident_schemas import (
    IncidentAcknowledgementRequest,
    IncidentResponse,
    IncidentSilenceRequest,
)

router = APIRouter(prefix="/incidents", tags=["incidents"])
IncidentStateQuery = Annotated[Literal["active", "resolved", "all"], Query()]
IncidentLimitQuery = Annotated[int, Query(ge=1, le=500)]


@router.get("", response_model=list[IncidentResponse], summary="Incident history")
def get_incidents(
    incident_store: IncidentStoreDependency,
    state: IncidentStateQuery = "active",
    limit: IncidentLimitQuery = 100,
) -> list[IncidentResponse]:
    """Return active or resolved incidents."""
    return [
        IncidentResponse.from_domain(incident)
        for incident in incident_store.list(state=state, limit=limit)
    ]


@router.post(
    "/{incident_id}/acknowledge",
    response_model=IncidentResponse,
    summary="Acknowledge an incident",
)
def acknowledge_incident(
    incident_id: UUID,
    payload: IncidentAcknowledgementRequest,
    incident_store: IncidentStoreDependency,
    timer: TimerDependency,
) -> IncidentResponse:
    """Record that an operator has seen one incident."""
    try:
        incident = incident_store.acknowledge(
            incident_id,
            acknowledged_at=timer(),
            note=payload.note.strip() if payload.note else None,
        )
    except IncidentNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        ) from error
    return IncidentResponse.from_domain(incident)


@router.post(
    "/{incident_id}/silence",
    response_model=IncidentResponse,
    summary="Silence an incident",
)
def silence_incident(
    incident_id: UUID,
    payload: IncidentSilenceRequest,
    incident_store: IncidentStoreDependency,
    timer: TimerDependency,
) -> IncidentResponse:
    """Silence one incident until an explicit future instant."""
    now = timer()
    if payload.until.tzinfo is None or payload.until <= now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Silence deadline must be a future timezone-aware instant.",
        )
    try:
        incident = incident_store.silence(incident_id, until=payload.until)
    except IncidentNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        ) from error
    return IncidentResponse.from_domain(incident)


@router.delete(
    "/{incident_id}/silence",
    response_model=IncidentResponse,
    summary="Clear an incident silence",
)
def clear_incident_silence(
    incident_id: UUID,
    incident_store: IncidentStoreDependency,
) -> IncidentResponse:
    """Resume notifications for one incident."""
    try:
        incident = incident_store.silence(incident_id, until=None)
    except IncidentNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        ) from error
    return IncidentResponse.from_domain(incident)
