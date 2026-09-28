"""Runtime API routes for Ohana-Vision."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ohana_vision.runtime import RuntimeSnapshot
from ohana_vision.web.dependencies import (
    RuntimeDependency,
)

router = APIRouter(
    prefix="/runtime",
    tags=["runtime"],
)


@router.get(
    "",
    summary="Runtime snapshot",
)
def get_runtime_snapshot(
    runtime: RuntimeDependency,
) -> RuntimeSnapshot:
    """Return the current backend runtime snapshot."""
    return runtime.snapshot()


@router.get(
    "/vitals",
    summary="Vital state read by the Agent",
)
def get_runtime_vitals(
    runtime: RuntimeDependency,
) -> JSONResponse:
    """Phase 5: availability and last ingestion; cheap and never cached."""
    return JSONResponse(runtime.vitals(), headers={"Cache-Control": "no-store"})
