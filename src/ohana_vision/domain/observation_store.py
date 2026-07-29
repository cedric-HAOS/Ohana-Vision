"""In-memory storage for immutable observations."""

from collections.abc import Iterable
from datetime import datetime
from heapq import nlargest
from uuid import UUID

from ohana_vision.domain.observation import Observation


class DuplicateObservationError(ValueError):
    """Raised when an observation identifier already exists."""


class ObservationStore:
    """Store immutable observations without projecting domain state."""

    def __init__(self) -> None:
        """Initialize an empty observation store."""

        self._observations: list[Observation] = []
        self._observation_ids: set[UUID] = set()

    @property
    def observation_count(self) -> int:
        """Return the number of stored observations."""

        return len(self._observations)

    @property
    def observations(self) -> tuple[Observation, ...]:
        """Return observations in ingestion order."""

        return tuple(self._observations)

    def add(self, observation: Observation) -> Observation:
        """Store and return an observation."""

        if observation.observation_id in self._observation_ids:
            raise DuplicateObservationError(
                f"Observation {observation.observation_id} already exists."
            )

        self._observations.append(observation)
        self._observation_ids.add(observation.observation_id)

        return observation

    def add_many(
        self,
        observations: Iterable[Observation],
    ) -> tuple[Observation, ...]:
        """Store several observations in the provided order."""

        return tuple(self.add(observation) for observation in observations)

    def history(
        self,
        *,
        node_id: str | None = None,
        service_id: str | None = None,
        capability_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int | None = None,
    ) -> tuple[Observation, ...]:
        """Return chronologically ordered observations matching filters."""

        self._validate_dates(since=since, until=until)
        self._validate_limit(limit)

        observations = (
            observation
            for observation in self._observations
            if node_id is None or observation.node_id == node_id
        )
        observations = (
            observation
            for observation in observations
            if service_id is None or observation.service_id == service_id
        )
        observations = (
            observation
            for observation in observations
            if (capability_id is None or observation.capability_id == capability_id)
        )
        observations = (
            observation
            for observation in observations
            if since is None or observation.observed_at >= since
        )
        observations = (
            observation
            for observation in observations
            if until is None or observation.observed_at <= until
        )

        if limit is None:
            return tuple(
                sorted(
                    observations,
                    key=lambda observation: observation.observed_at,
                )
            )

        latest = nlargest(
            limit,
            observations,
            key=lambda observation: observation.observed_at,
        )

        return tuple(
            sorted(
                latest,
                key=lambda observation: observation.observed_at,
            )
        )

    def history_window(
        self,
        *,
        since: datetime,
        until: datetime | None = None,
    ) -> tuple[Observation, ...]:
        """Return one bounded timeline window with carry-forward states.

        The latest observation before ``since`` is retained for every
        capability so the timeline can reconstruct the state already active
        at the beginning of the visible window without processing the full
        history.
        """
        self._validate_dates(since=since, until=until)

        previous_by_capability: dict[
            tuple[str, str, str],
            Observation,
        ] = {}
        visible: list[Observation] = []

        for observation in self._observations:
            if until is not None and observation.observed_at > until:
                continue

            if observation.observed_at >= since:
                visible.append(observation)
                continue

            key = (
                observation.node_id,
                observation.service_id,
                observation.capability_id,
            )
            previous = previous_by_capability.get(key)

            if previous is None or observation.observed_at > previous.observed_at:
                previous_by_capability[key] = observation

        return tuple(
            sorted(
                [
                    *previous_by_capability.values(),
                    *visible,
                ],
                key=lambda observation: observation.observed_at,
            )
        )

    def clear(self) -> None:
        """Remove every stored observation."""

        self._observations.clear()
        self._observation_ids.clear()

    @staticmethod
    def _validate_limit(limit: int | None) -> None:
        """Validate the optional maximum history length."""
        if limit is not None and limit <= 0:
            raise ValueError("limit must be greater than zero.")

    @staticmethod
    def _validate_dates(
        *,
        since: datetime | None,
        until: datetime | None,
    ) -> None:
        """Validate history date filters."""

        if since is not None and since.tzinfo is None:
            raise ValueError("since must be timezone-aware.")

        if until is not None and until.tzinfo is None:
            raise ValueError("until must be timezone-aware.")

        if since is not None and until is not None and since > until:
            raise ValueError("since must not be after until.")
