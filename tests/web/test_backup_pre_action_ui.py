"""Regression tests for the optional HAOS backup preparation action."""

from pathlib import Path


def test_absent_backup_pre_action_stays_empty_in_editor() -> None:
    """Do not turn the example script name into a configured action."""
    static = Path("src/ohana_vision/web/static")
    script = "\n".join(
        path.read_text(encoding="utf-8")
        for path in [
            static / "configuration.js",
            *sorted((static / "configuration").glob("*.js")),
        ]
    )

    empty_fallback = (
        'target.pre_backup_action.domain}.${target.pre_backup_action.service}` : ""'
    )
    optional_placeholder = (
        'placeholder="Laisser vide avec la planification NVM de Z-Wave JS UI"'
    )

    assert empty_fallback in script
    assert optional_placeholder in script
