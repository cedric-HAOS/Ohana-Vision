"""Background SQLite WAL checkpoints kept off the ingestion path."""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from threading import Event, Thread
from time import monotonic

LOGGER = logging.getLogger(__name__)


class WalCheckpointer:
    """Copy the WAL back into the database from a dedicated thread.

    SQLite checkpoints automatically inside the commit that crosses 1000 WAL
    pages. That checkpoint syncs the database file: on the INFRA-01 SD card it
    took over five seconds, during which the observation request waited and
    Ohana-Agent timed out every four minutes. Connections writing to the
    database disable automatic checkpoints; this thread checkpoints instead,
    with its own connection, which never blocks WAL writers.
    """

    def __init__(self, database_path: Path | str, *, interval_seconds: float) -> None:
        """Prepare a checkpointer; call start() to run it."""
        if interval_seconds <= 0:
            raise ValueError("interval_seconds must be greater than zero.")
        self._database_path = Path(database_path)
        self._interval_seconds = interval_seconds
        self._stop_event = Event()
        self._thread: Thread | None = None

    @property
    def running(self) -> bool:
        """Return whether the background thread is alive."""
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Start the background thread once."""
        if self.running:
            return
        self._stop_event.clear()
        self._thread = Thread(
            target=self._run,
            name="vision-wal-checkpoint",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        """Stop the thread after a final checkpoint."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join()
            self._thread = None

    def _run(self) -> None:
        connection = sqlite3.connect(self._database_path)
        try:
            connection.execute("PRAGMA busy_timeout=5000")
            while not self._stop_event.wait(self._interval_seconds):
                self._checkpoint(connection)
            self._checkpoint(connection)
        finally:
            connection.close()

    @staticmethod
    def _checkpoint(connection: sqlite3.Connection) -> None:
        started = monotonic()
        try:
            busy, wal_frames, copied = connection.execute(
                "PRAGMA wal_checkpoint(PASSIVE)"
            ).fetchone()
        except sqlite3.Error as error:
            LOGGER.warning("WAL checkpoint failed: %s", error)
            return
        duration = monotonic() - started
        if duration >= 1:
            LOGGER.info(
                "WAL checkpoint copied %s/%s frames in %.1f s (busy=%s).",
                copied,
                wal_frames,
                duration,
                busy,
            )
