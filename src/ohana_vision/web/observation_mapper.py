"""Mapping between REST observation requests and domain observations."""

from __future__ import annotations

from uuid import UUID, uuid4

from ohana_vision.domain.observation import Observation
from ohana_vision.web.observation_request import ObservationRequest


class ObservationMapper:
    """Convert REST observation requests into domain observations."""

    @staticmethod
    def to_domain(request: ObservationRequest) -> Observation:
        """Convert an observation request into a domain observation."""
        agent_observation = request.metadata.get("agent_observation")
        observation_id = request.observation_id
        message = request.message

        if isinstance(agent_observation, dict):
            if observation_id is None:
                try:
                    observation_id = UUID(str(agent_observation.get("id")))
                except (TypeError, ValueError, AttributeError):
                    observation_id = None

            if message is None and agent_observation.get("message") is not None:
                message = str(agent_observation["message"])

        return Observation(
            observation_id=observation_id or uuid4(),
            capability_id=request.capability_id,
            service_id=request.service_id,
            node_id=request.node_id,
            status=request.status,
            observed_at=request.observed_at,
            message=message,
            latency_ms=request.latency_ms,
            metadata=dict(request.metadata),
        )
