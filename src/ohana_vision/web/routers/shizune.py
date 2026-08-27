"""Same-origin, bounded bridge from the Shizune PWA to Agent/Tsunade."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from ohana_vision.administration import AgentCompanionClient, AgentCompanionError

router = APIRouter(prefix="/shizune", tags=["shizune"])


def _client(request: Request) -> AgentCompanionClient:
    client = request.app.state.companion_client
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le canal Shizune n’est pas configuré",
        )
    return client


def _call(operation: Callable[[], dict[str, Any]]) -> JSONResponse:
    try:
        document = operation()
    except AgentCompanionError as error:
        status_code = (
            error.status_code
            if error.status_code is not None and 400 <= error.status_code < 500
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    return JSONResponse(document, headers={"Cache-Control": "no-store"})


def _identity(
    authorization: str | None,
    companion_id: str | None,
) -> tuple[str, str]:
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix) or not companion_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session Shizune absente",
        )
    return companion_id.strip(), authorization.removeprefix(prefix).strip()


@router.post("/pairings")
def create_pairing(request: Request, payload: dict[str, Any]) -> JSONResponse:
    return _call(lambda: _client(request).create_pairing(payload))


@router.post("/pairings/{pairing_id}/poll")
def poll_pairing(
    pairing_id: str,
    request: Request,
    payload: dict[str, Any],
) -> JSONResponse:
    return _call(lambda: _client(request).poll_pairing(pairing_id, payload))


@router.get("/summary")
def read_summary(
    request: Request,
    authorization: str | None = Header(default=None),
    companion_id: str | None = Header(default=None, alias="X-Ohana-Companion-Id"),
) -> JSONResponse:
    device_id, token = _identity(authorization, companion_id)
    return _call(lambda: _client(request).read_summary(device_id, token))


@router.get("/requests")
def read_requests(
    request: Request,
    authorization: str | None = Header(default=None),
    companion_id: str | None = Header(default=None, alias="X-Ohana-Companion-Id"),
) -> JSONResponse:
    device_id, token = _identity(authorization, companion_id)
    return _call(lambda: _client(request).read_requests(device_id, token))


@router.get("/activity")
def read_activity(
    request: Request,
    authorization: str | None = Header(default=None),
    companion_id: str | None = Header(default=None, alias="X-Ohana-Companion-Id"),
) -> JSONResponse:
    device_id, token = _identity(authorization, companion_id)
    return _call(lambda: _client(request).read_activity(device_id, token))


@router.post("/requests/{request_id}/response")
def respond(
    request_id: str,
    request: Request,
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
    companion_id: str | None = Header(default=None, alias="X-Ohana-Companion-Id"),
) -> JSONResponse:
    device_id, token = _identity(authorization, companion_id)
    return _call(
        lambda: _client(request).respond(
            request_id,
            payload,
            device_id,
            token,
        )
    )
