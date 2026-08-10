"""Host supervision API routes for Ohana-Vision."""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from ohana_vision.web.dependencies import ObservationStoreDependency

router = APIRouter(
    prefix="/host-health",
    tags=["host"],
)


@router.get(
    "",
    summary="Latest Agent host health",
)
def get_host_health(
    observation_store: ObservationStoreDependency,
) -> dict[str, Any]:
    """Return the latest host snapshot published by Ohana-Agent."""
    observations = observation_store.history(
        capability_id="host.health",
        limit=1,
    )
    if not observations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune observation de santé hôte n'est disponible.",
        )

    observation = observations[-1]
    snapshot = observation.metadata.get("host_health")
    if not isinstance(snapshot, dict):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La dernière observation hôte ne contient aucun instantané.",
        )

    return {
        **snapshot,
        "observation_id": str(observation.observation_id),
        "observed_at": observation.observed_at.isoformat(),
    }
