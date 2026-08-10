"""In-memory and SQLite-backed storage for immutable observations."""

import json
import sqlite3
from collections.abc import Iterable
from datetime import datetime
from heapq import nlargest
from pathlib import Path
from threading import RLock
from uuid import UUID

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation


class DuplicateObservationError(ValueError):
    """Raised when an observation identifier already exists."""


class ObservationStore:
    """Store immutable observations without projecting domain state."""

    _SCHEMA_VERSION = 1

    def __init__(self, database_path: Path | str | None = None) -> None:
        """Initialize a memory store with optional durable SQLite storage."""

        self._observations: list[Observation] = []
        self._observation_ids: set[UUID] = set()
        self._lock = RLock()
        self._database_path = Path(database_path) if database_path is not None else None
        self._connection: sqlite3.Connection | None = None

        if self._database_path is not None:
            self._open_database()
            self._load_observations()

    @property
    def observation_count(self) -> int:
        """Return the number of stored observations."""

        with self._lock:
            return len(self._observations)

    @property
    def observations(self) -> tuple[Observation, ...]:
        """Return observations in ingestion order."""

        with self._lock:
            return tuple(self._observations)

    def add(self, observation: Observation) -> Observation:
        """Store and return an observation."""

        with self._lock:
            if observation.observation_id in self._observation_ids:
                raise DuplicateObservationError(
                    f"Observation {observation.observation_id} already exists."
                )

            self._persist(observation)
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

        with self._lock:
            stored = tuple(self._observations)

        observations = (
            observation
            for observation in stored
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

        with self._lock:
            stored = tuple(self._observations)

        for observation in stored:
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

        with self._lock:
            if self._connection is not None:
                self._connection.execute("DELETE FROM observations")
                self._connection.commit()

            self._observations.clear()
            self._observation_ids.clear()

    def close(self) -> None:
        """Close the optional SQLite connection."""
        with self._lock:
            if self._connection is not None:
                self._connection.close()
                self._connection = None

    def _open_database(self) -> None:
        """Create or open the durable observation database."""
        if self._database_path is None:
            return

        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(
            self._database_path,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA busy_timeout=5000")

        version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        if version > self._SCHEMA_VERSION:
            connection.close()
            raise RuntimeError(
                "Observation database schema is newer than this Vision version."
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS observations (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                observation_id TEXT NOT NULL UNIQUE,
                capability_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                message TEXT,
                latency_ms REAL,
                metadata_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS observations_lookup
            ON observations(node_id, service_id, capability_id, observed_at)
            """
        )
        connection.execute(f"PRAGMA user_version={self._SCHEMA_VERSION}")
        connection.commit()
        self._connection = connection

    def _load_observations(self) -> None:
        """Restore observations from SQLite in ingestion order."""
        if self._connection is None:
            return

        rows = self._connection.execute(
            """
            SELECT observation_id, capability_id, service_id, node_id, status,
                   observed_at, message, latency_ms, metadata_json
            FROM observations
            ORDER BY sequence
            """
        ).fetchall()

        for row in rows:
            observation = Observation(
                observation_id=UUID(row["observation_id"]),
                capability_id=row["capability_id"],
                service_id=row["service_id"],
                node_id=row["node_id"],
                status=HealthStatus(row["status"]),
                observed_at=datetime.fromisoformat(row["observed_at"]),
                message=row["message"],
                latency_ms=row["latency_ms"],
                metadata=json.loads(row["metadata_json"]),
            )
            self._observations.append(observation)
            self._observation_ids.add(observation.observation_id)

    def _persist(self, observation: Observation) -> None:
        """Persist one observation before exposing it in memory."""
        if self._connection is None:
            return

        try:
            self._connection.execute(
                """
                INSERT INTO observations (
                    observation_id, capability_id, service_id, node_id, status,
                    observed_at, message, latency_ms, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(observation.observation_id),
                    observation.capability_id,
                    observation.service_id,
                    observation.node_id,
                    observation.status.value,
                    observation.observed_at.isoformat(),
                    observation.message,
                    observation.latency_ms,
                    json.dumps(
                        dict(observation.metadata),
                        ensure_ascii=False,
                        separators=(",", ":"),
                        sort_keys=True,
                    ),
                ),
            )
            self._connection.commit()
        except sqlite3.IntegrityError as error:
            raise DuplicateObservationError(
                f"Observation {observation.observation_id} already exists."
            ) from error

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
