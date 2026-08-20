"""Host supervision API routes for Ohana-Vision."""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from ohana_vision.web.dependencies import ObservationProcessorDependency

router = APIRouter(
    prefix="/host-health",
    tags=["host"],
)


@router.get(
    "",
    summary="Latest Agent host health",
)
async def get_host_health(
    observation_processor: ObservationProcessorDependency,
) -> dict[str, Any]:
    """Return the latest host snapshot published by Ohana-Agent."""
    observation = observation_processor.latest_observation(
        capability_id="host.health",
    )
    if observation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune observation de santé hôte n'est disponible.",
        )
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
