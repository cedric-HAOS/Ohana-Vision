"""Tests for Vision's bounded Shizune companion bridge."""

from typing import Any, cast

from fastapi.testclient import TestClient

from ohana_vision.administration import AgentCompanionClient, AgentCompanionError
from ohana_vision.domain import ObservationStore
from ohana_vision.runtime import BackendRuntime
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web import create_app
from ohana_vision.web.application_context import ApplicationContext


class FakeCompanionClient:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    def create_pairing(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("pair", payload))
        return {"pairing_id": "pairing-1", "verification_code": "ABCD-EFGH"}

    def poll_pairing(self, pairing_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("poll", pairing_id, payload))
        return {"status": "PENDING"}

    def read_summary(self, device_id: str, token: str) -> dict[str, Any]:
        self.calls.append(("summary", device_id, token))
        return {"schema_version": 1, "konoha_state": "healthy"}

    def read_requests(self, device_id: str, token: str) -> dict[str, Any]:
        self.calls.append(("requests", device_id, token))
        return {"schema_version": 1, "requests": []}

    def read_activity(self, device_id: str, token: str) -> dict[str, Any]:
        self.calls.append(("activity", device_id, token))
        return {"schema_version": 1, "activity": []}

    def respond(
        self,
        request_id: str,
        payload: dict[str, Any],
        device_id: str,
        token: str,
    ) -> dict[str, Any]:
        self.calls.append(("respond", request_id, payload, device_id, token))
        return {"request_id": request_id, "answer": payload["choice"]}

    def diagnose(self, incident_id: str, device_id: str, token: str) -> dict[str, Any]:
        self.calls.append(("diagnose", incident_id, device_id, token))
        return {"schema_version": 1, "status": "AI_QUEUED"}


def make_client() -> tuple[TestClient, FakeCompanionClient]:
    companion = FakeCompanionClient()
    app = create_app(
        companion_client=cast(AgentCompanionClient, companion),
    )
    return TestClient(app), companion


def test_diagnosis_requires_identity_and_forwards_only_incident():
    client, companion = make_client()
    path = "/api/shizune/incidents/incident-1/diagnose"
    assert client.post(path, json={}).status_code == 401
    assert companion.calls == []
    response = client.post(
        path,
        json={},
        headers={
            "Authorization": "Bearer scoped-secret",
            "X-Ohana-Companion-Id": "pwa-device",
        },
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"schema_version": 1, "status": "AI_QUEUED"}
    assert companion.calls == [
        ("diagnose", "incident-1", "pwa-device", "scoped-secret")
    ]


def test_pairing_is_forwarded_without_an_existing_session() -> None:
    client, companion = make_client()

    response = client.post(
        "/api/shizune/pairings",
        json={"device_id": "pwa-device"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["verification_code"] == "ABCD-EFGH"
    assert companion.calls == [("pair", {"device_id": "pwa-device"})]


def test_private_summary_requires_and_forwards_companion_identity() -> None:
    client, companion = make_client()

    unauthorized = client.get("/api/shizune/summary")
    response = client.get(
        "/api/shizune/summary",
        headers={
            "Authorization": "Bearer scoped-secret",
            "X-Ohana-Companion-Id": "pwa-device",
        },
    )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["konoha_state"] == "healthy"
    assert companion.calls == [("summary", "pwa-device", "scoped-secret")]


def test_structured_response_is_forwarded_without_free_form_action() -> None:
    client, companion = make_client()

    response = client.post(
        "/api/shizune/requests/request-1/response",
        headers={
            "Authorization": "Bearer scoped-secret",
            "X-Ohana-Companion-Id": "pwa-device",
        },
        json={"choice": "AUTHORIZE"},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "AUTHORIZE"
    assert companion.calls == [
        (
            "respond",
            "request-1",
            {"choice": "AUTHORIZE"},
            "pwa-device",
            "scoped-secret",
        )
    ]


def _gateway_client(
    companion: object | None,
) -> tuple[TestClient, BackendRuntime]:
    runtime = BackendRuntime()
    context = ApplicationContext(
        runtime=runtime,
        observation_store=cast(ObservationStore, object()),
        timeline_engine=cast(TimelineEngine, object()),
    )
    app = create_app(context, companion_client=cast(AgentCompanionClient, companion))
    return TestClient(app), runtime


SESSION = {"Authorization": "Bearer scoped-secret", "X-Ohana-Companion-Id": "pwa"}


def test_gateway_state_follows_relayed_calls() -> None:
    class Flaky(FakeCompanionClient):
        def __init__(self) -> None:
            super().__init__()
            self.error: AgentCompanionError | None = None

        def read_summary(self, device_id: str, token: str) -> dict[str, Any]:
            if self.error is not None:
                raise self.error
            return super().read_summary(device_id, token)

    companion = Flaky()
    client, runtime = _gateway_client(companion)
    assert runtime.shizune_gateway.snapshot()["state"] == "unused"

    assert client.get("/api/shizune/summary", headers=SESSION).status_code == 200
    assert runtime.shizune_gateway.snapshot()["state"] == "available"

    companion.error = AgentCompanionError("Agent injoignable")
    assert client.get("/api/shizune/summary", headers=SESSION).status_code == 502
    failing = runtime.shizune_gateway.snapshot()
    assert failing["state"] == "failing"
    assert failing["last_failure"] == "Agent injoignable"
    assert str(failing["last_failure_at"]).endswith(("+01:00", "+02:00"))

    # A refusal answered by the Agent proves the bridge works again.
    companion.error = AgentCompanionError("Session révoquée", status_code=401)
    assert client.get("/api/shizune/summary", headers=SESSION).status_code == 401
    assert runtime.shizune_gateway.snapshot()["state"] == "available"


def test_gateway_is_unconfigured_without_companion_client() -> None:
    _, runtime = _gateway_client(None)
    assert runtime.vitals()["shizune_gateway"]["state"] == "unconfigured"
