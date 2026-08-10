"""Tests for ObservationRequest."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from ohana_vision.domain.health import HealthStatus
from ohana_vision.web import ObservationRequest


def make_payload() -> dict:
    return {
        "capability_id": "dns",
        "service_id": "dns-primary",
        "node_id": "infra-01",
        "status": HealthStatus.HEALTHY,
        "observed_at": datetime.now(UTC),
        "latency_ms": 12.5,
        "metadata": {"server": "1.1.1.1"},
    }


def test_request_accepts_valid_payload() -> None:
    observation_id = uuid4()
    payload = make_payload()
    payload["observation_id"] = observation_id
    payload["message"] = "DNS is healthy."
    request = ObservationRequest(**payload)

    assert request.capability_id == "dns"
    assert request.status is HealthStatus.HEALTHY
    assert request.latency_ms == 12.5
    assert request.metadata["server"] == "1.1.1.1"
    assert request.observation_id == observation_id
    assert request.message == "DNS is healthy."


def test_request_defaults_metadata() -> None:
    payload = make_payload()
    payload.pop("metadata")

    request = ObservationRequest(**payload)

    assert request.metadata == {}


def test_request_rejects_negative_latency() -> None:
    payload = make_payload()
    payload["latency_ms"] = -1

    with pytest.raises(ValidationError):
        ObservationRequest(**payload)


def test_request_rejects_unknown_fields() -> None:
    payload = make_payload()
    payload["unknown"] = "value"

    with pytest.raises(ValidationError):
        ObservationRequest(**payload)


@pytest.mark.parametrize(
    "field",
    [
        "capability_id",
        "service_id",
        "node_id",
    ],
)
def test_request_requires_non_empty_identifiers(field: str) -> None:
    payload = make_payload()
    payload[field] = ""

    with pytest.raises(ValidationError):
        ObservationRequest(**payload)
