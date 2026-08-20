"""In-memory and bounded SQLite storage for immutable observations."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from heapq import nlargest
from pathlib import Path
from threading import RLock
from time import monotonic
from uuid import UUID

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.observation import Observation


class DuplicateObservationError(ValueError):
    """Raised when an observation identifier already exists."""


class ObservationStore:
    """Store immutable observations without materialising durable history."""

    _SCHEMA_VERSION = 2

    def __init__(
        self,
        database_path: Path | str | None = None,
        *,
        retention_days: int | None = None,
        purge_interval_seconds: float = 3600,
        history_max_rows: int = 50_000,
    ) -> None:
        """Initialize an in-memory store or a bounded SQLite-backed store."""
        if retention_days is not None and retention_days <= 0:
            raise ValueError("retention_days must be greater than zero.")
        if purge_interval_seconds <= 0:
            raise ValueError("purge_interval_seconds must be greater than zero.")
        if history_max_rows <= 0:
            raise ValueError("history_max_rows must be greater than zero.")

        self._observations: list[Observation] = []
        self._observation_ids: set[UUID] = set()
        self._lock = RLock()
        self._database_path = Path(database_path) if database_path is not None else None
        self._connection: sqlite3.Connection | None = None
        self._retention_days = retention_days
        self._purge_interval_seconds = purge_interval_seconds
        self._history_max_rows = history_max_rows
        self._next_purge_at = monotonic() + purge_interval_seconds

        if self._database_path is not None:
            self._open_database()
            self.purge_expired()

    @property
    def observation_count(self) -> int:
        """Return the number of stored observations without loading them."""
        with self._lock:
            if self._connection is None:
                return len(self._observations)
            row = self._connection.execute(
                "SELECT COUNT(*) AS count FROM observations"
            ).fetchone()
            return int(row["count"])

    @property
    def observations(self) -> tuple[Observation, ...]:
        """Return a bounded compatibility snapshot in chronological order."""
        if self._connection is not None:
            return self.history(limit=self._history_max_rows)
        with self._lock:
            return tuple(self._observations)

    def add(self, observation: Observation) -> Observation:
        """Store and return an observation."""
        with self._lock:
            if self._connection is None:
                if observation.observation_id in self._observation_ids:
                    raise DuplicateObservationError(
                        f"Observation {observation.observation_id} already exists."
                    )
                self._observations.append(observation)
                self._observation_ids.add(observation.observation_id)
            else:
                self._persist(observation)
                self._maybe_purge()
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
        offset: int = 0,
    ) -> tuple[Observation, ...]:
        """Return a bounded chronological page matching the filters."""
        self._validate_dates(since=since, until=until)
        self._validate_limit(limit)
        self._validate_offset(offset)
        effective_limit = min(limit or self._history_max_rows, self._history_max_rows)

        if self._connection is not None:
            return self._sqlite_history(
                node_id=node_id,
                service_id=service_id,
                capability_id=capability_id,
                since=since,
                until=until,
                limit=effective_limit,
                offset=offset,
            )

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
            if capability_id is None or observation.capability_id == capability_id
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
        latest = nlargest(
            effective_limit + offset,
            observations,
            key=lambda observation: observation.observed_at,
        )
        page = latest[offset : offset + effective_limit]
        return tuple(sorted(page, key=lambda observation: observation.observed_at))

    def latest_per_capability(self) -> tuple[Observation, ...]:
        """Return only the latest state for each capability identity."""
        if self._connection is None:
            latest: dict[tuple[str, str, str], Observation] = {}
            with self._lock:
                stored = tuple(self._observations)
            for observation in stored:
                key = self._capability_key(observation)
                current = latest.get(key)
                if current is None or observation.observed_at >= current.observed_at:
                    latest[key] = observation
            return tuple(sorted(latest.values(), key=lambda item: item.observed_at))

        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT {self._COLUMN_NAMES}
                FROM observations AS candidate
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM observations AS newer
                    WHERE newer.node_id = candidate.node_id
                      AND newer.service_id = candidate.service_id
                      AND newer.capability_id = candidate.capability_id
                      AND (
                          newer.observed_at > candidate.observed_at
                          OR (
                              newer.observed_at = candidate.observed_at
                              AND newer.sequence > candidate.sequence
                          )
                      )
                )
                ORDER BY candidate.observed_at, candidate.sequence
                """
            ).fetchall()
        return tuple(self._from_row(row) for row in rows)

    def unprocessed_for_incidents(
        self,
        *,
        limit: int = 1000,
    ) -> tuple[Observation, ...]:
        """Return a small recovery batch not reflected in incident state."""
        self._validate_limit(limit)
        if self._connection is None:
            return self.observations[:limit]
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT {self._COLUMN_NAMES}
                FROM observations AS observation
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM incident_observations AS processed
                    WHERE processed.observation_id = observation.observation_id
                )
                ORDER BY observation.sequence
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return tuple(self._from_row(row) for row in rows)

    def history_window(
        self,
        *,
        since: datetime,
        until: datetime | None = None,
    ) -> tuple[Observation, ...]:
        """Return a bounded timeline window with carry-forward states."""
        self._validate_dates(since=since, until=until)
        if self._connection is None:
            return self._memory_history_window(since=since, until=until)

        clauses = ["observed_at >= ?"]
        parameters: list[object] = [self._database_datetime(since)]
        if until is not None:
            clauses.append("observed_at <= ?")
            parameters.append(self._database_datetime(until))
        parameters.append(self._history_max_rows + 1)
        with self._lock:
            visible_rows = self._connection.execute(
                f"""
                SELECT {self._COLUMN_NAMES}
                FROM observations
                WHERE {" AND ".join(clauses)}
                ORDER BY observed_at, sequence
                LIMIT ?
                """,
                parameters,
            ).fetchall()
            if len(visible_rows) > self._history_max_rows:
                raise ValueError(
                    "history window exceeds the configured maximum row count."
                )
            previous_rows = self._connection.execute(
                f"""
                SELECT {self._COLUMN_NAMES}
                FROM observations AS candidate
                WHERE candidate.observed_at < ?
                  AND NOT EXISTS (
                      SELECT 1
                      FROM observations AS newer
                      WHERE newer.node_id = candidate.node_id
                        AND newer.service_id = candidate.service_id
                        AND newer.capability_id = candidate.capability_id
                        AND newer.observed_at < ?
                        AND (
                            newer.observed_at > candidate.observed_at
                            OR (
                                newer.observed_at = candidate.observed_at
                                AND newer.sequence > candidate.sequence
                            )
                        )
                  )
                """,
                (self._database_datetime(since), self._database_datetime(since)),
            ).fetchall()
        return tuple(
            sorted(
                (self._from_row(row) for row in [*previous_rows, *visible_rows]),
                key=lambda observation: observation.observed_at,
            )
        )

    def purge_expired(self, *, now: datetime | None = None) -> int:
        """Purge expired observations and their incident deduplication rows."""
        if self._retention_days is None:
            return 0
        current = now or datetime.now(UTC)
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("now must be timezone-aware.")
        cutoff = self._database_datetime(current - timedelta(days=self._retention_days))
        with self._lock:
            if self._connection is None:
                retained_after = current - timedelta(days=self._retention_days)
                retained = [
                    item
                    for item in self._observations
                    if item.observed_at >= retained_after
                ]
                removed = len(self._observations) - len(retained)
                self._observations = retained
                self._observation_ids = {
                    item.observation_id for item in self._observations
                }
                return removed
            cursor = self._connection.execute(
                "DELETE FROM observations WHERE observed_at < ?",
                (cutoff,),
            )
            removed = max(cursor.rowcount, 0)
            if self._table_exists("incident_observations"):
                self._connection.execute(
                    """
                    DELETE FROM incident_observations
                    WHERE NOT EXISTS (
                        SELECT 1 FROM observations
                        WHERE observations.observation_id =
                              incident_observations.observation_id
                    )
                    """
                )
            self._connection.commit()
            self._next_purge_at = monotonic() + self._purge_interval_seconds
            return removed

    def clear(self) -> None:
        """Remove every stored observation."""
        with self._lock:
            if self._connection is not None:
                self._connection.execute("DELETE FROM observations")
                if self._table_exists("incident_observations"):
                    self._connection.execute("DELETE FROM incident_observations")
                self._connection.commit()
            self._observations.clear()
            self._observation_ids.clear()

    def close(self) -> None:
        """Close the optional SQLite connection."""
        with self._lock:
            if self._connection is not None:
                self._connection.close()
                self._connection = None

    _COLUMN_NAMES = """
        sequence, observation_id, capability_id, service_id, node_id, status,
        observed_at, message, latency_ms, metadata_json
    """

    def _open_database(self) -> None:
        if self._database_path is None:
            return
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA cache_size=-2048")
        connection.execute("PRAGMA temp_store=FILE")
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
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS observations_observed_at
            ON observations(observed_at, sequence)
            """
        )
        connection.execute(f"PRAGMA user_version={self._SCHEMA_VERSION}")
        connection.commit()
        self._connection = connection

    def _persist(self, observation: Observation) -> None:
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
                    self._database_datetime(observation.observed_at),
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

    def _sqlite_history(
        self,
        *,
        node_id: str | None,
        service_id: str | None,
        capability_id: str | None,
        since: datetime | None,
        until: datetime | None,
        limit: int,
        offset: int,
    ) -> tuple[Observation, ...]:
        clauses: list[str] = []
        parameters: list[object] = []
        for column, value in (
            ("node_id", node_id),
            ("service_id", service_id),
            ("capability_id", capability_id),
        ):
            if value is not None:
                clauses.append(f"{column} = ?")
                parameters.append(value)
        if since is not None:
            clauses.append("observed_at >= ?")
            parameters.append(self._database_datetime(since))
        if until is not None:
            clauses.append("observed_at <= ?")
            parameters.append(self._database_datetime(until))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.extend((limit, offset))
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT * FROM (
                    SELECT {self._COLUMN_NAMES}
                    FROM observations
                    {where}
                    ORDER BY observed_at DESC, sequence DESC
                    LIMIT ? OFFSET ?
                )
                ORDER BY observed_at, sequence
                """,
                parameters,
            ).fetchall()
        return tuple(self._from_row(row) for row in rows)

    def _memory_history_window(
        self,
        *,
        since: datetime,
        until: datetime | None,
    ) -> tuple[Observation, ...]:
        previous: dict[tuple[str, str, str], Observation] = {}
        visible: list[Observation] = []
        with self._lock:
            stored = tuple(self._observations)
        for observation in stored:
            if until is not None and observation.observed_at > until:
                continue
            if observation.observed_at >= since:
                visible.append(observation)
                continue
            key = self._capability_key(observation)
            current = previous.get(key)
            if current is None or observation.observed_at > current.observed_at:
                previous[key] = observation
        if len(visible) > self._history_max_rows:
            raise ValueError("history window exceeds the configured maximum row count.")
        return tuple(
            sorted([*previous.values(), *visible], key=lambda item: item.observed_at)
        )

    def _maybe_purge(self) -> None:
        if self._retention_days is not None and monotonic() >= self._next_purge_at:
            self.purge_expired()

    def _table_exists(self, table: str) -> bool:
        if self._connection is None:
            return False
        row = self._connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
        return row is not None

    @staticmethod
    def _from_row(row: sqlite3.Row) -> Observation:
        return Observation(
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

    @staticmethod
    def _capability_key(observation: Observation) -> tuple[str, str, str]:
        return observation.node_id, observation.service_id, observation.capability_id

    @staticmethod
    def _database_datetime(value: datetime) -> str:
        return value.astimezone(UTC).isoformat()

    @staticmethod
    def _validate_limit(limit: int | None) -> None:
        if limit is not None and limit <= 0:
            raise ValueError("limit must be greater than zero.")

    @staticmethod
    def _validate_offset(offset: int) -> None:
        if offset < 0:
            raise ValueError("offset must not be negative.")

    @staticmethod
    def _validate_dates(*, since: datetime | None, until: datetime | None) -> None:
        if since is not None and (since.tzinfo is None or since.utcoffset() is None):
            raise ValueError("since must be timezone-aware.")
        if until is not None and (until.tzinfo is None or until.utcoffset() is None):
            raise ValueError("until must be timezone-aware.")
        if since is not None and until is not None and since > until:
            raise ValueError("since must not be after until.")
