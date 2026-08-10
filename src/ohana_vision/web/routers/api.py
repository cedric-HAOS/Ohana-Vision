"""API router for Ohana-Vision."""

from fastapi import APIRouter

from ohana_vision import __version__
from ohana_vision.web.routers.administration import (
    router as administration_router,
)
from ohana_vision.web.routers.incidents import router as incidents_router
from ohana_vision.web.routers.infrastructure import (
    router as infrastructure_router,
)
from ohana_vision.web.routers.observations import (
    router as observations_router,
)
from ohana_vision.web.routers.runtime import (
    router as runtime_router,
)
from ohana_vision.web.routers.timeline import (
    router as timeline_router,
)

router = APIRouter(
    prefix="/api",
    tags=["api"],
)


@router.get(
    "/",
    summary="API status",
)
def api_status() -> dict[str, str]:
    """Return the basic API status."""
    return {
        "name": "Ohana Vision API",
        "status": "running",
    }


@router.get(
    "/version",
    summary="Application version",
)
def application_version() -> dict[str, str]:
    """Return the running Ohana-Vision version."""
    return {
        "name": "Ohana-Vision",
        "version": __version__,
    }


router.include_router(runtime_router)
router.include_router(observations_router)
router.include_router(timeline_router)
router.include_router(infrastructure_router)
router.include_router(incidents_router)
router.include_router(administration_router)
