"""Tests for Vision's bounded Shizune companion bridge."""

from typing import Any, cast

from fastapi.testclient import TestClient

from ohana_vision.administration import AgentCompanionClient
from ohana_vision.web import create_app


class FakeCompanionClient:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []

    def create_pairing(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("pair", payload))
        return {"pairing_id": "pairing-1", "verification_code": "ABCD-EFGH"}

    def poll_pairing(
        self, pairing_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
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


def make_client() -> tuple[TestClient, FakeCompanionClient]:
    companion = FakeCompanionClient()
    app = create_app(
        companion_client=cast(AgentCompanionClient, companion),
    )
    return TestClient(app), companion


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
