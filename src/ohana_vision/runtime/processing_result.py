"""Result of an observation processing operation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from ohana_vision.runtime.runtime_snapshot import RuntimeSnapshot


@dataclass(frozen=True, slots=True)
class ProcessingResult:
    """Immutable result returned after processing an observation."""

    observation_id: UUID
    accepted: bool
    snapshot: RuntimeSnapshot
    duration: timedelta
    timeline_updated: bool = False
    incident_updated: bool = False
    incident_id: UUID | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        """Validate processing result consistency."""

        if self.duration < timedelta():
            raise ValueError("duration cannot be negative")

        if self.accepted and self.reason is not None:
            raise ValueError(
                "An accepted processing result cannot have a rejection reason"
            )

        if not self.accepted and not self.reason:
            raise ValueError("A rejected processing result must have a reason")

        if not self.accepted and self.timeline_updated:
            raise ValueError("A rejected observation cannot update a timeline")

        if not self.accepted and self.incident_updated:
            raise ValueError("A rejected observation cannot update an incident")

    @property
    def rejected(self) -> bool:
        """Return whether the observation was rejected."""

        return not self.accepted

    @property
    def duration_ms(self) -> float:
        """Return the processing duration in milliseconds."""

        return self.duration.total_seconds() * 1000

    @classmethod
    def accepted_result(
        cls,
        *,
        observation_id: UUID,
        snapshot: RuntimeSnapshot,
        duration: timedelta,
        timeline_updated: bool,
        incident_updated: bool = False,
        incident_id: UUID | None = None,
    ) -> ProcessingResult:
        """Create a successful processing result."""

        return cls(
            observation_id=observation_id,
            accepted=True,
            snapshot=snapshot,
            duration=duration,
            timeline_updated=timeline_updated,
            incident_updated=incident_updated,
            incident_id=incident_id,
        )

    @classmethod
    def rejected_result(
        cls,
        *,
        observation_id: UUID,
        snapshot: RuntimeSnapshot,
        duration: timedelta,
        reason: str,
    ) -> ProcessingResult:
        """Create a rejected processing result."""

        return cls(
            observation_id=observation_id,
            accepted=False,
            snapshot=snapshot,
            duration=duration,
            timeline_updated=False,
            reason=reason,
        )
