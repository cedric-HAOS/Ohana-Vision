"""HTTP schemas for persistent incidents."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.incident import Incident


class IncidentResponse(BaseModel):
    """Serialized incident lifecycle."""

    model_config = ConfigDict(extra="forbid")

    incident_id: UUID
    node_id: str
    service_id: str
    capability_id: str
    status: HealthStatus
    state: Literal["active", "resolved"]
    started_at: datetime
    last_observed_at: datetime
    ended_at: datetime | None
    message: str | None
    occurrence_count: int
    acknowledged_at: datetime | None
    acknowledgement_note: str | None
    silenced_until: datetime | None

    @classmethod
    def from_domain(cls, incident: Incident) -> "IncidentResponse":
        """Map one domain incident to its public representation."""
        return cls(
            incident_id=incident.incident_id,
            node_id=incident.node_id,
            service_id=incident.service_id,
            capability_id=incident.capability_id,
            status=incident.status,
            state="active" if incident.active else "resolved",
            started_at=incident.started_at,
            last_observed_at=incident.last_observed_at,
            ended_at=incident.ended_at,
            message=incident.message,
            occurrence_count=incident.occurrence_count,
            acknowledged_at=incident.acknowledged_at,
            acknowledgement_note=incident.acknowledgement_note,
            silenced_until=incident.silenced_until,
        )


class IncidentAcknowledgementRequest(BaseModel):
    """Optional operator note attached to an acknowledgement."""

    model_config = ConfigDict(extra="forbid")
    note: str | None = Field(default=None, max_length=500)


class IncidentSilenceRequest(BaseModel):
    """Silence deadline requested by an operator."""

    model_config = ConfigDict(extra="forbid")
    until: datetime
