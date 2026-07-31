from ohana_vision.domain import (
    Health,
    HealthStatus,
    aggregate_health,
)


def test_healthy_health_is_healthy_and_available() -> None:
    health = Health(status=HealthStatus.HEALTHY)

    assert health.is_healthy is True
    assert health.is_available is True


def test_degraded_health_remains_available() -> None:
    health = Health(status=HealthStatus.DEGRADED)

    assert health.is_healthy is False
    assert health.is_available is True


def test_unavailable_health_is_not_available() -> None:
    health = Health(status=HealthStatus.UNAVAILABLE)

    assert health.is_available is False


def test_aggregate_health_returns_most_severe_health() -> None:
    health = aggregate_health(
        [
            Health(status=HealthStatus.HEALTHY),
            Health(
                status=HealthStatus.DEGRADED,
                reason="High latency.",
            ),
            Health(status=HealthStatus.STALE),
        ]
    )

    assert health.status is HealthStatus.DEGRADED
    assert health.reason == "High latency."


def test_aggregate_health_returns_unknown_for_empty_collection() -> None:
    health = aggregate_health([])

    assert health.status is HealthStatus.UNKNOWN


def test_suspended_health_is_available_without_being_healthy() -> None:
    health = Health(status=HealthStatus.SUSPENDED)

    assert health.is_healthy is False
    assert health.is_available is True


def test_aggregate_health_keeps_suspended_when_everything_is_suspended() -> None:
    health = aggregate_health(
        [
            Health(status=HealthStatus.SUSPENDED, reason="Plage inactive."),
            Health(status=HealthStatus.SUSPENDED),
        ]
    )

    assert health.status is HealthStatus.SUSPENDED
    assert health.reason == "Plage inactive."


def test_aggregate_health_ignores_suspended_beside_healthy() -> None:
    health = aggregate_health(
        [Health(status=HealthStatus.SUSPENDED), Health(status=HealthStatus.HEALTHY)]
    )

    assert health.status is HealthStatus.HEALTHY
