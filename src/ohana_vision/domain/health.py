"""Health model used by Ohana-Vision domain objects."""

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum


class HealthStatus(StrEnum):
    """Possible health states for an infrastructure entity."""

    HEALTHY = "healthy"
    SUSPENDED = "suspended"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"
    STALE = "stale"


_HEALTH_PRIORITY: dict[HealthStatus, int] = {
    HealthStatus.SUSPENDED: -1,
    HealthStatus.HEALTHY: 0,
    HealthStatus.UNKNOWN: 1,
    HealthStatus.STALE: 2,
    HealthStatus.DEGRADED: 3,
    HealthStatus.UNAVAILABLE: 4,
}


@dataclass(frozen=True, slots=True)
class Health:
    """Health information attached to a domain entity."""

    status: HealthStatus
    reason: str | None = None

    @property
    def is_healthy(self) -> bool:
        """Return whether the entity is considered healthy."""

        return self.status is HealthStatus.HEALTHY

    @property
    def is_available(self) -> bool:
        """Return whether the entity remains operational."""

        return self.status in {
            HealthStatus.HEALTHY,
            HealthStatus.SUSPENDED,
            HealthStatus.DEGRADED,
        }


def aggregate_health(health_values: Iterable[Health]) -> Health:
    """Aggregate several health values using the most severe status.

    The aggregation performed here is deliberately simple. More advanced
    rules involving criticality and dependencies will be introduced by the
    future Health Engine.
    """

    values = tuple(health_values)

    if not values:
        return Health(
            status=HealthStatus.UNKNOWN,
            reason="No health information is available.",
        )

    most_severe = max(
        values,
        key=lambda health: _HEALTH_PRIORITY[health.status],
    )

    return Health(
        status=most_severe.status,
        reason=most_severe.reason,
    )
