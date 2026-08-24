"""Administration routes proxied to the Agent-owned API."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status

from ohana_vision.administration import (
    AgentAdministrationClient,
    AgentAdministrationError,
)

router = APIRouter(
    prefix="/administration",
    tags=["administration"],
)


def _client(request: Request) -> AgentAdministrationClient:
    client = request.app.state.administration_client

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ohana-Agent administration is not configured",
        )

    return client


def _call(operation: Any) -> dict[str, Any]:
    try:
        return operation()
    except AgentAdministrationError as error:
        if error.status_code is not None and 400 <= error.status_code < 500:
            status_code = error.status_code
        else:
            status_code = status.HTTP_502_BAD_GATEWAY

        raise HTTPException(
            status_code=status_code,
            detail=str(error),
        ) from error


@router.get("/capabilities")
def read_capabilities(request: Request) -> dict[str, Any]:
    """Discover the administration operations exposed by Agent."""
    client = _client(request)
    return _call(client.capabilities)


@router.get("/dhcp")
def read_dhcp(request: Request) -> dict[str, Any]:
    """Read DHCP configuration and active leases."""
    client = _client(request)
    return _call(client.read_dhcp)


@router.put("/dhcp")
def write_dhcp(
    request: Request,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Validate and apply a complete DHCP configuration through Agent."""
    client = _client(request)
    return _call(
        lambda: client.write_dhcp(payload),
    )


@router.get("/network")
def read_network(request: Request) -> dict[str, Any]:
    """Read the Agent host NetworkManager state."""
    client = _client(request)
    return _call(client.read_network)


@router.put("/network")
def write_network(
    request: Request,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Apply a candidate Agent host network configuration."""
    client = _client(request)
    return _call(lambda: client.write_network(payload))


@router.post("/network/{transaction_id}/confirm")
def confirm_network(transaction_id: str, request: Request) -> dict[str, Any]:
    """Confirm a pending Agent host network configuration."""
    client = _client(request)
    return _call(lambda: client.confirm_network(transaction_id))


@router.post("/network/{transaction_id}/rollback")
def rollback_network(transaction_id: str, request: Request) -> dict[str, Any]:
    """Restore the previous Agent host network configuration."""
    client = _client(request)
    return _call(lambda: client.rollback_network(transaction_id))


@router.get("/plugins")
def read_plugins(request: Request) -> dict[str, Any]:
    """Read plugins registered by Agent."""
    client = _client(request)
    return _call(client.read_plugins)


@router.get("/plugins/{identifier}")
def read_plugin(
    identifier: str,
    request: Request,
) -> dict[str, Any]:
    """Read one plugin configuration and runtime state."""
    client = _client(request)
    return _call(
        lambda: client.read_plugin(identifier),
    )


@router.put("/plugins/{identifier}")
def write_plugin(
    identifier: str,
    request: Request,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Apply one plugin configuration through Agent."""
    client = _client(request)
    return _call(
        lambda: client.write_plugin(identifier, payload),
    )


@router.post("/plugins/{identifier}/test")
def test_plugin(
    identifier: str,
    request: Request,
) -> dict[str, Any]:
    """Execute one immediate plugin capability test."""
    client = _client(request)
    return _call(
        lambda: client.test_plugin(identifier),
    )


@router.post("/plugins/backup/icloud/connect")
def connect_backup_icloud(
    request: Request,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Start or complete the rclone iCloud authentication flow."""
    client = _client(request)
    return _call(lambda: client.connect_backup_icloud(payload))


@router.post("/plugins/backup/targets/{target_id}/run")
def run_backup(target_id: str, request: Request) -> dict[str, Any]:
    """Start one configured HAOS backup without waiting for completion."""
    client = _client(request)
    return _call(lambda: client.run_backup(target_id))


@router.get("/workers/pairings")
def read_worker_pairings(request: Request) -> dict[str, Any]:
    """List Katsuyu pairing requests through Agent's administration contract."""
    client = _client(request)
    return _call(client.read_worker_pairings)


@router.get("/workers")
def read_workers(request: Request) -> dict[str, Any]:
    """Expose Agent-owned Katsuyu availability without duplicating state."""
    client = _client(request)
    return _call(client.read_workers)


@router.get("/tsunade/incidents")
def read_tsunade_incidents(
    request: Request,
    state: str = Query(default="all", pattern="^(active|resolved|all)$"),
) -> dict[str, Any]:
    """Expose Agent-owned incidents without duplicating their state in Vision."""
    client = _client(request)
    return _call(lambda: client.read_tsunade_incidents(state))


@router.get("/tsunade/incidents/{incident_id}")
def read_tsunade_incident(incident_id: str, request: Request) -> dict[str, Any]:
    """Expose one incident evolution through the existing administration proxy."""
    client = _client(request)
    return _call(lambda: client.read_tsunade_incident(incident_id))


@router.post("/tsunade/incidents/{incident_id}/diagnose")
def diagnose_tsunade_incident(incident_id: str, request: Request) -> dict[str, Any]:
    """Request expertise through Agent; Vision never executes an operation."""
    client = _client(request)
    return _call(lambda: client.diagnose_tsunade_incident(incident_id))


@router.post("/tsunade/incidents/logs/check")
def request_tsunade_log_check(request: Request) -> dict[str, Any]:
    """Request the deterministic log control owned by Agent/Tsunade."""
    client = _client(request)
    return _call(client.request_tsunade_log_check)


@router.post("/tsunade/incidents/{incident_id}/logs/investigate")
def request_tsunade_log_investigation(
    incident_id: str, payload: dict[str, Any], request: Request
) -> dict[str, Any]:
    """Forward an explicit bounded authorization; Vision executes nothing."""
    client = _client(request)
    return _call(lambda: client.request_tsunade_log_investigation(incident_id, payload))


@router.post("/tsunade/incidents/{incident_id}/repairs")
def propose_tsunade_repair(
    incident_id: str, payload: dict[str, Any], request: Request
) -> dict[str, Any]:
    """Forward a proposal only; Vision cannot execute it."""
    client = _client(request)
    return _call(lambda: client.propose_tsunade_repair(incident_id, payload))


@router.post("/tsunade/incidents/{incident_id}/repairs/authorize")
def authorize_tsunade_repair(
    incident_id: str, payload: dict[str, Any], request: Request
) -> dict[str, Any]:
    """Record Vision as the explicit authorization source through Agent."""
    client = _client(request)
    return _call(lambda: client.authorize_tsunade_repair(incident_id, payload))


@router.post("/tsunade/incidents/{incident_id}/experience")
def confirm_tsunade_experience(
    incident_id: str, payload: dict[str, Any], request: Request
) -> dict[str, Any]:
    """Confirm a known repair without storing Tsunade state in Vision."""
    client = _client(request)
    return _call(lambda: client.confirm_tsunade_experience(incident_id, payload))


@router.post("/workers/pairings/{pairing_id}/approve")
def approve_worker_pairing(pairing_id: str, request: Request) -> dict[str, Any]:
    """Approve a Katsuyu installer after comparing its verification code."""
    client = _client(request)
    return _call(lambda: client.approve_worker_pairing(pairing_id))


@router.post("/workers/pairings/{pairing_id}/reject")
def reject_worker_pairing(pairing_id: str, request: Request) -> dict[str, Any]:
    """Reject an unrecognized Katsuyu installer request."""
    client = _client(request)
    return _call(lambda: client.reject_worker_pairing(pairing_id))


@router.get("/infrastructure")
def read_infrastructure(request: Request) -> dict[str, Any]:
    """Read Agent's infrastructure source of truth."""
    client = _client(request)
    return _call(client.read_infrastructure)


@router.put("/infrastructure")
def write_infrastructure(
    request: Request,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Validate and apply infrastructure configuration through Agent."""
    client = _client(request)
    return _call(
        lambda: client.write_infrastructure(payload),
    )
