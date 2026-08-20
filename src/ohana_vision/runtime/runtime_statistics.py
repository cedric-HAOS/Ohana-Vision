"""Runtime statistics for the Ohana-Vision backend."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime


@dataclass(frozen=True, slots=True)
class RuntimeStatistics:
    """Statistics collected by the backend runtime."""

    observations_received: int = 0
    observations_accepted: int = 0
    observations_rejected: int = 0
    errors: int = 0
    last_observation_at: datetime | None = None
    last_error_at: datetime | None = None
    last_processing_ms: float | None = None
    average_processing_ms: float = 0.0
    max_processing_ms: float = 0.0
    total_processing_ms: float = 0.0

    @property
    def observations_processed(self) -> int:
        """Return the number of observations already processed."""

        return self.observations_accepted + self.observations_rejected

    @property
    def observations_pending(self) -> int:
        """Return the number of received observations not yet processed."""

        return self.observations_received - self.observations_processed

    @property
    def acceptance_rate(self) -> float:
        """Return the proportion of accepted processed observations."""

        if self.observations_processed == 0:
            return 0.0

        return self.observations_accepted / self.observations_processed

    def record_received(self, received_at: datetime) -> RuntimeStatistics:
        """Return statistics including one newly received observation."""

        return replace(
            self,
            observations_received=self.observations_received + 1,
            last_observation_at=received_at,
        )

    def record_accepted(
        self,
        processing_ms: float | None = None,
    ) -> RuntimeStatistics:
        """Return statistics including one accepted observation."""

        if self.observations_processed >= self.observations_received:
            raise ValueError("Cannot accept an observation that has not been received")

        updated = replace(
            self,
            observations_accepted=self.observations_accepted + 1,
        )
        return updated._record_processing(processing_ms)

    def record_rejected(
        self,
        processing_ms: float | None = None,
    ) -> RuntimeStatistics:
        """Return statistics including one rejected observation."""

        if self.observations_processed >= self.observations_received:
            raise ValueError("Cannot reject an observation that has not been received")

        updated = replace(
            self,
            observations_rejected=self.observations_rejected + 1,
        )
        return updated._record_processing(processing_ms)

    def record_error(self, occurred_at: datetime) -> RuntimeStatistics:
        """Return statistics including one runtime error."""

        return replace(
            self,
            errors=self.errors + 1,
            last_error_at=occurred_at,
        )

    def _record_processing(self, processing_ms: float | None) -> RuntimeStatistics:
        if processing_ms is None:
            return self
        if processing_ms < 0:
            raise ValueError("processing_ms cannot be negative")
        total = self.total_processing_ms + processing_ms
        return replace(
            self,
            last_processing_ms=processing_ms,
            total_processing_ms=total,
            average_processing_ms=total / self.observations_processed,
            max_processing_ms=max(self.max_processing_ms, processing_ms),
        )
