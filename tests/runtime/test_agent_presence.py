"""Vision must notice missing Agent deliveries without asking the Agent."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from ohana_vision.runtime import BackendRuntime
from ohana_vision.runtime.agent_presence import AgentPresence
from ohana_vision.web.app import create_app
from ohana_vision.web.bootstrap import build_application_context


class Clock:
    def __init__(self):
        self.seconds = 0.0
        self.wall = datetime(2026, 9, 28, 16, 0, tzinfo=UTC)

    def timer(self):
        return self.seconds

    def now(self):
        return self.wall


def runtime_with_clock():
    clock = Clock()
    runtime = BackendRuntime(
        clock=clock.now, agent_presence=AgentPresence(timer=clock.timer)
    )
    runtime.start()
    return runtime, clock


def test_no_contact_is_waiting_then_silent_never_healthy():
    runtime, clock = runtime_with_clock()
    assert runtime.vitals()["agent"]["state"] == "waiting"
    clock.seconds = 300
    assert runtime.vitals()["agent"]["state"] == "waiting"
    clock.seconds = 301
    presence = runtime.vitals()["agent"]
    assert presence["state"] == "silent"
    assert presence["last_received_at"] is None
    assert presence["max_silence_seconds"] == 300
    runtime.stop()
    assert runtime.vitals()["agent"]["state"] == "unknown"


def test_silence_uses_monotonic_time_and_survives_statistics_reset():
    runtime, clock = runtime_with_clock()
    runtime.record_received(clock.wall + timedelta(days=30))
    runtime.record_accepted()
    last = runtime.vitals()["agent"]["last_received_at"]
    assert last == "2026-09-28T18:00:00+02:00"
    clock.seconds = 301
    clock.wall -= timedelta(days=1)  # NTP correction must not hide silence.
    runtime.reset_statistics()
    assert runtime.vitals()["agent"]["state"] == "silent"
    assert runtime.vitals()["agent"]["last_received_at"] == last
    runtime.record_received(clock.wall)
    runtime.record_rejected()  # Rejection still proves a new delivery.
    assert runtime.vitals()["agent"]["state"] == "active"


def test_restart_does_not_reuse_previous_contact_as_current():
    runtime, clock = runtime_with_clock()
    runtime.record_received(clock.wall)
    runtime.record_accepted()
    runtime.stop()
    clock.seconds += 600
    runtime.start()
    assert runtime.vitals()["agent"]["state"] == "waiting"
    assert runtime.vitals()["agent"]["last_received_at"] is None
    clock.seconds += 301
    assert runtime.vitals()["agent"]["state"] == "silent"


def test_http_replay_proves_delivery_but_restored_database_does_not(tmp_path):
    database = tmp_path / "vision.db"
    context = build_application_context(database_path=database)
    clock = Clock()
    context.runtime.clock = clock.now
    context.runtime.agent_presence = AgentPresence(timer=clock.timer)
    context.runtime.agent_presence.start()
    observation = {
        "observation_id": str(uuid4()),
        "node_id": "infra-01",
        "service_id": "ohana-host",
        "capability_id": "host.health",
        "observed_at": (clock.wall - timedelta(days=2)).isoformat(),
        "status": "healthy",
        "message": "Previous healthy state",
        "metadata": {"host_health": {"state": "healthy"}},
    }
    try:
        with TestClient(create_app(context=context)) as client:
            clock.seconds = 301
            assert (
                client.get("/api/runtime/vitals").json()["agent"]["state"] == "silent"
            )
            assert client.post("/api/observations", json=observation).status_code == 202
            response = client.get("/api/runtime/vitals")
            assert response.headers["cache-control"] == "no-store"
            assert response.json()["agent"]["state"] == "active"
            assert response.json()["agent"]["last_received_at"] == (
                "2026-09-28T18:00:00+02:00"
            )
            clock.seconds += 301
            assert (
                client.get("/api/runtime/vitals").json()["agent"]["state"] == "silent"
            )
            # The durable outbox can resend a duplicate after a lost response.
            assert client.post("/api/observations", json=observation).status_code == 202
            assert (
                client.get("/api/runtime/vitals").json()["agent"]["state"] == "active"
            )
    finally:
        context.observation_store.close()
        context.incident_store.close()
    restored = build_application_context(database_path=database)
    try:
        assert restored.observation_store.observation_count == 1
        assert restored.runtime.vitals()["agent"]["state"] == "waiting"
    finally:
        restored.observation_store.close()
        restored.incident_store.close()
