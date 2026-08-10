"""Tests for ObservationMapper."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation
from ohana_vision.web.observation_mapper import ObservationMapper
from ohana_vision.web.observation_request import ObservationRequest


def make_request() -> ObservationRequest:
    """Create a valid observation request."""
    return ObservationRequest(
        capability_id="dns.resolve",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.HEALTHY,
        observed_at=datetime(
            2026,
            7,
            11,
            14,
            30,
            tzinfo=UTC,
        ),
        latency_ms=12.5,
        metadata={
            "hostname": "example.com",
            "server": "192.168.1.11",
        },
    )


def test_mapper_returns_domain_observation() -> None:
    request = make_request()

    observation = ObservationMapper.to_domain(request)

    assert isinstance(observation, Observation)


def test_mapper_copies_request_fields() -> None:
    request = make_request()

    observation = ObservationMapper.to_domain(request)

    assert observation.capability_id == request.capability_id
    assert observation.service_id == request.service_id
    assert observation.node_id == request.node_id
    assert observation.status is request.status
    assert observation.observed_at == request.observed_at
    assert observation.latency_ms == request.latency_ms
    assert observation.metadata == request.metadata


def test_mapper_copies_metadata_container() -> None:
    request = make_request()

    observation = ObservationMapper.to_domain(request)

    assert observation.metadata is not request.metadata


def test_mapper_preserves_empty_metadata() -> None:
    request = ObservationRequest(
        capability_id="mqtt.connectivity",
        service_id="mqtt-primary",
        node_id="infra-01",
        status=HealthStatus.UNKNOWN,
        observed_at=datetime(
            2026,
            7,
            11,
            14,
            35,
            tzinfo=UTC,
        ),
    )

    observation = ObservationMapper.to_domain(request)

    assert observation.metadata == {}


def test_mapper_preserves_none_latency() -> None:
    request = ObservationRequest(
        capability_id="dhcp.availability",
        service_id="dhcp-primary",
        node_id="infra-01",
        status=HealthStatus.DEGRADED,
        observed_at=datetime(
            2026,
            7,
            11,
            14,
            40,
            tzinfo=UTC,
        ),
        latency_ms=None,
    )

    observation = ObservationMapper.to_domain(request)

    assert observation.latency_ms is None


def test_mapper_preserves_public_observation_identity_and_message() -> None:
    observation_id = uuid4()
    request = ObservationRequest(
        capability_id="dns.resolve",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.DEGRADED,
        observed_at=datetime(2026, 8, 10, 10, 0, tzinfo=UTC),
        observation_id=observation_id,
        message="DNS latency is elevated.",
    )

    observation = ObservationMapper.to_domain(request)

    assert observation.observation_id == observation_id
    assert observation.message == "DNS latency is elevated."


def test_mapper_recovers_identity_from_legacy_agent_metadata() -> None:
    observation_id = uuid4()
    request = ObservationRequest(
        capability_id="dns.resolve",
        service_id="dns-primary",
        node_id="infra-01",
        status=HealthStatus.DEGRADED,
        observed_at=datetime(2026, 8, 10, 10, 0, tzinfo=UTC),
        metadata={
            "agent_observation": {
                "id": str(observation_id),
                "message": "Legacy payload.",
            }
        },
    )

    observation = ObservationMapper.to_domain(request)

    assert observation.observation_id == observation_id
    assert observation.message == "Legacy payload."
