"""Administration routes proxied to the Agent-owned API."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

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
