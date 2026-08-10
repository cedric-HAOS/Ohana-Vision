"""Tests for the persistent incident API."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from ohana_vision.domain import (
    HealthStatus,
    IncidentStore,
    Observation,
    ObservationStore,
)
from ohana_vision.runtime import BackendRuntime
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web.app import create_app
from ohana_vision.web.application_context import ApplicationContext

START = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


def make_client() -> tuple[TestClient, IncidentStore]:
    incident_store = IncidentStore()
    runtime = BackendRuntime()
    runtime.start()
    context = ApplicationContext(
        runtime=runtime,
        observation_store=ObservationStore(),
        timeline_engine=TimelineEngine(),
        incident_store=incident_store,
    )
    return TestClient(create_app(context=context)), incident_store


def open_incident(store: IncidentStore):
    transition = store.process(
        Observation(
            capability_id="dns.resolve",
            service_id="dns-primary",
            node_id="infra-01",
            status=HealthStatus.DEGRADED,
            observed_at=START,
            message="DNS latency elevated",
        )
    )
    assert transition is not None
    return transition.incident


def test_incident_api_lists_active_incidents() -> None:
    client, store = make_client()
    incident = open_incident(store)

    response = client.get("/api/incidents?state=active")

    assert response.status_code == 200
    assert response.json() == [
        {
            "incident_id": str(incident.incident_id),
            "node_id": "infra-01",
            "service_id": "dns-primary",
            "capability_id": "dns.resolve",
            "status": "degraded",
            "state": "active",
            "started_at": "2026-08-10T10:00:00Z",
            "last_observed_at": "2026-08-10T10:00:00Z",
            "ended_at": None,
            "message": "DNS latency elevated",
            "occurrence_count": 1,
            "acknowledged_at": None,
            "acknowledgement_note": None,
            "silenced_until": None,
        }
    ]
    store.close()


def test_incident_api_acknowledges_incident() -> None:
    client, store = make_client()
    incident = open_incident(store)

    response = client.post(
        f"/api/incidents/{incident.incident_id}/acknowledge",
        json={"note": "Je vérifie le DNS."},
    )

    assert response.status_code == 200
    assert response.json()["acknowledged_at"] is not None
    assert response.json()["acknowledgement_note"] == "Je vérifie le DNS."
    store.close()


def test_incident_api_silences_and_clears_incident() -> None:
    client, store = make_client()
    incident = open_incident(store)
    until = datetime.now(UTC) + timedelta(hours=1)

    silenced = client.post(
        f"/api/incidents/{incident.incident_id}/silence",
        json={"until": until.isoformat()},
    )
    cleared = client.delete(f"/api/incidents/{incident.incident_id}/silence")

    assert silenced.status_code == 200
    assert silenced.json()["silenced_until"] is not None
    assert cleared.status_code == 200
    assert cleared.json()["silenced_until"] is None
    store.close()


def test_incident_api_rejects_past_silence() -> None:
    client, store = make_client()
    incident = open_incident(store)

    response = client.post(
        f"/api/incidents/{incident.incident_id}/silence",
        json={"until": "2020-01-01T00:00:00Z"},
    )

    assert response.status_code == 422
    store.close()
