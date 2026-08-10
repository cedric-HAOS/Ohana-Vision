"""REST request model used to ingest observations."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ohana_vision.domain.health import HealthStatus


class ObservationRequest(BaseModel):
    """Incoming observation received through the REST API."""

    model_config = ConfigDict(extra="forbid")

    capability_id: str = Field(min_length=1)
    service_id: str = Field(min_length=1)
    node_id: str = Field(min_length=1)

    status: HealthStatus

    observed_at: datetime
    observation_id: UUID | None = None
    message: str | None = None

    latency_ms: float | None = Field(default=None, ge=0)

    metadata: dict[str, Any] = Field(default_factory=dict)
