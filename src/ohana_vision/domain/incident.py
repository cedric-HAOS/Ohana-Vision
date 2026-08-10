"""Persistent incident domain models."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ohana_vision.domain.health import HealthStatus


@dataclass(frozen=True, slots=True)
class Incident:
    """Represent one continuous capability degradation."""

    incident_id: UUID
    node_id: str
    service_id: str
    capability_id: str
    status: HealthStatus
    started_at: datetime
    last_observed_at: datetime
    ended_at: datetime | None = None
    message: str | None = None
    occurrence_count: int = 1
    acknowledged_at: datetime | None = None
    acknowledgement_note: str | None = None
    silenced_until: datetime | None = None

    @property
    def active(self) -> bool:
        """Return whether the incident is still open."""
        return self.ended_at is None

    def silenced(self, now: datetime) -> bool:
        """Return whether notifications are currently silenced."""
        if now.tzinfo is None:
            raise ValueError("now must be timezone-aware.")
        return self.silenced_until is not None and self.silenced_until > now


@dataclass(frozen=True, slots=True)
class IncidentTransition:
    """Describe the incident change caused by one observation."""

    kind: str
    incident: Incident
