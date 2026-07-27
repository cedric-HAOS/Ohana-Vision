"use strict";

import {
    escapeHtml,
    formatDate,
    healthStatusLabel,
    normalizeHealthStatus,
} from "./utils.js";

import {
    TimelinePeriod,
} from "./timeline_period.js";


/**
 * Format a duration for timeline tooltips.
 *
 * @param {number|null} durationSeconds
 * @returns {string}
 */
function formatTimelineDuration(durationSeconds) {
    const totalSeconds =
        Number(durationSeconds);

    if (
        !Number.isFinite(totalSeconds)
        || totalSeconds < 0
    ) {
        return "En cours";
    }

    const roundedSeconds =
        Math.round(totalSeconds);

    const hours =
        Math.floor(
            roundedSeconds / 3600,
        );

    const minutes =
        Math.floor(
            (
                roundedSeconds % 3600
            ) / 60,
        );

    const seconds =
        roundedSeconds % 60;

    const parts = [];

    if (hours > 0) {
        parts.push(
            `${hours} h`,
        );
    }

    if (
        minutes > 0
        || hours > 0
    ) {
        parts.push(
            `${minutes} min`,
        );
    }

    if (
        hours === 0
        && seconds > 0
    ) {
        parts.push(
            `${seconds} s`,
        );
    }

    return parts.join(" ") || "0 s";
}


/**
 * Controls the infrastructure timeline.
 */
export class TimelineController {
    constructor({
        state,
        onNodeSelected = () => {},
    }) {
        if (!state) {
            throw new Error(
                "TimelineController requires application state.",
            );
        }

        this.state = state;
        this.onNodeSelected = onNodeSelected;
        this.compactMode = false;

        this.elements = {
            content: document.querySelector(
                "#timeline-content",
            ),
            title: document.querySelector(
                "#timeline-heading",
            ),
            kicker: document.querySelector(
                ".dashboard-timeline .panel-heading__kicker",
            ),
            periodCount: document.querySelector(
                "#timeline-period-count",
            ),
            rangeButtons: document.querySelectorAll(
                "[data-timeline-hours]",
            ),
        };
        this.periodGroups = [];
    }

    /**
     * Synchronize node periods from the shared timeline.
     */
    updatePeriods() {
        const nodes =
            Array.isArray(
                this.state.timeline?.nodes,
            )
                ? this.state.timeline.nodes
                : [];

        this.periodGroups =
            nodes.map((node) => {
                const periods =
                    Array.isArray(node.periods)
                        ? node.periods
                        : [];

                return {
                    nodeId:
                        node.node_id
                        ?? "unknown",
                    periods:
                        periods.map(
                            (period) =>
                                TimelinePeriod
                                    .fromPayload(
                                        period,
                                    ),
                        ),
                };
            });
    }

    /**
     * Bind timeline interactions and render its initial state.
     */
    initialize() {
        this.bindRangeButtons();
        this.render();
    }

    /**
     * Switch between the compact overview and the full history.
     *
     * @param {boolean} compactMode
     */
    setCompactMode(compactMode) {
        const nextMode = Boolean(compactMode);

        this.compactMode = nextMode;

        if (this.elements.kicker) {
            this.elements.kicker.textContent =
                nextMode
                    ? "Infrastructure"
                    : "Historique";
        }

        if (this.elements.title) {
            this.elements.title.textContent =
                nextMode
                    ? "État courant"
                    : "Timeline de l’infrastructure";
        }

        this.render();
    }

    /**
     * Return all loaded periods.
     *
     * @returns {TimelinePeriod[]}
     */
    getPeriods() {
        return this.periodGroups.flatMap(
            (group) => group.periods,
        );
    }

    /**
     * Render the timeline from node periods.
     */
    render() {
        this.updatePeriods();

        if (!this.elements.content) {
            return;
        }

        if (this.compactMode) {
            this.renderCurrentStates();
            return;
        }

        const {
            startedAt,
            endedAt,
        } = this.timelineRange();

        const groups =
            this.periodGroups.filter(
                (group) => {
                    return group.periods.some(
                        (period) =>
                            period.overlaps(
                                startedAt,
                                endedAt,
                            ),
                    );
                },
            );

        const visiblePeriodCount =
            groups.reduce(
                (count, group) => {
                    return count
                        + group.periods.filter(
                            (period) =>
                                period.overlaps(
                                    startedAt,
                                    endedAt,
                                ),
                        ).length;
                },
                0,
            );

        this.renderPeriodCount(
            visiblePeriodCount,
        );

        if (groups.length === 0) {
            this.renderEmpty(
                startedAt,
                endedAt,
            );
            return;
        }

        this.elements.content.innerHTML = `
            ${this.renderAxis(
                startedAt,
                endedAt,
            )}

            <div class="timeline-rows">
                ${groups
                    .map((group) => {
                        return this.renderPeriodRow(
                            group,
                            startedAt,
                            endedAt,
                        );
                    })
                    .join("")}
            </div>
        `;

        this.bindTimelineInteractions();
    }

    renderCurrentStates() {
        const currentStates =
            this.periodGroups
                .map((group) => ({
                    nodeId: group.nodeId,
                    period: group.periods.at(-1) ?? null,
                }))
                .filter((group) => group.period !== null);

        this.renderPeriodCount(
            currentStates.length,
        );

        if (currentStates.length === 0) {
            this.elements.content.innerHTML = `
                <div
                    class="timeline-empty"
                    role="status"
                >
                    <div class="timeline-empty__content">
                        <strong>
                            Aucun état courant
                        </strong>
                        <p>
                            Les états apparaîtront après la
                            première observation d’Agent.
                        </p>
                    </div>
                </div>
            `;
            return;
        }

        this.elements.content.innerHTML = `
            <div class="timeline-current-states">
                ${currentStates
                    .map((group) =>
                        this.renderCurrentState(group),
                    )
                    .join("")}
            </div>
        `;

        this.bindTimelineInteractions();
    }

    renderCurrentState({
        nodeId,
        period,
    }) {
        const status = normalizeHealthStatus(
            period.status,
        );
        const statusLabel = healthStatusLabel(
            status,
        );
        const startedAt = this.timelineTimeLabel(
            period.startedAt,
        );

        return `
            <button
                class="timeline-current-state"
                type="button"
                data-timeline-node="${escapeHtml(nodeId)}"
                title="Sélectionner ${escapeHtml(nodeId)}"
            >
                <span
                    aria-hidden="true"
                    class="timeline-row__status
                        timeline-row__status--${status}"
                ></span>
                <span class="timeline-current-state__identity">
                    <strong>${escapeHtml(nodeId)}</strong>
                    <small>${escapeHtml(statusLabel)}</small>
                </span>
                <time datetime="${escapeHtml(
                    period.startedAt.toISOString(),
                )}">
                    ${period.isOpen ? "Depuis" : "À"}
                    ${escapeHtml(startedAt)}
                </time>
            </button>
        `;
    }

    /**
     * Return the active timeline range.
     *
     * @returns {{
     *     startedAt: Date,
     *     endedAt: Date,
     * }}
     */
    timelineRange() {
        const endedAt = new Date();

        const hours = Number(
            this.state.timelineRangeHours ?? 6,
        );

        const startedAt = new Date(
            endedAt.getTime()
            - hours
            * 60
            * 60
            * 1000,
        );

        return {
            startedAt,
            endedAt,
        };
    }

    /**
     * Change the active timeline range.
     *
     * @param {number} hours
     */
    setRange(hours) {
        if (
            !Number.isFinite(hours)
            || hours <= 0
        ) {
            return;
        }

        this.state.timelineRangeHours = hours;

        for (
            const button
            of this.elements.rangeButtons
        ) {
            const buttonHours = Number(
                button.dataset.timelineHours,
            );

            button.classList.toggle(
                "timeline-range__button--active",
                buttonHours === hours,
            );
        }

        this.render();
    }

    bindRangeButtons() {
        for (
            const button
            of this.elements.rangeButtons
        ) {
            button.addEventListener(
                "click",
                () => {
                    const hours = Number(
                        button.dataset.timelineHours,
                    );

                    this.setRange(hours);
                },
            );
        }
    }

    bindTimelineInteractions() {
        const nodeButtons =
            this.elements.content.querySelectorAll(
                "[data-timeline-node]",
            );

        for (const button of nodeButtons) {
            button.addEventListener(
                "click",
                () => {
                    this.onNodeSelected(
                        button.dataset.timelineNode,
                    );
                },
            );
        }

        const eventButtons =
            this.elements.content.querySelectorAll(
                "[data-node-id]",
            );

        for (const button of eventButtons) {
            button.addEventListener(
                "click",
                () => {
                    this.onNodeSelected(
                        button.dataset.nodeId,
                    );
                },
            );
        }
    }

    renderPeriodCount(count) {
        if (!this.elements.periodCount) {
            return;
        }

        this.elements.periodCount.textContent =
            `${count} période`
            + (count > 1 ? "s" : "");
    }

    renderEmpty(
        startedAt,
        endedAt,
    ) {
        const hours =
            this.state.timelineRangeHours ?? 6;

        this.elements.content.innerHTML = `
            ${this.renderAxis(
                startedAt,
                endedAt,
            )}

            <div
                class="timeline-empty"
                role="status"
            >
                <span
                    aria-hidden="true"
                    class="timeline-empty__icon
                        timeline-empty__icon--empty"
                ></span>

                <div class="timeline-empty__content">
                    <strong>
                        Aucune période sur cette plage
                    </strong>

                    <p>
                        Aucune période n’a été observée durant
                        les ${escapeHtml(hours)}
                        dernières heures.
                    </p>
                </div>
            </div>
        `;
    }

    /**
     * Render a timeline loading error.
     *
     * @param {string} message
     */
    renderError(message) {
        if (!this.elements.content) {
            return;
        }

        this.renderPeriodCount(0);

        this.elements.content.innerHTML = `
            <div
                class="timeline-empty
                    timeline-empty--error"
                role="alert"
            >
                <span
                    aria-hidden="true"
                    class="timeline-empty__icon
                        timeline-empty__icon--error"
                ></span>

                <div class="timeline-empty__content">
                    <strong>
                        Timeline indisponible
                    </strong>

                    <p>
                        ${escapeHtml(message)}
                    </p>
                </div>
            </div>
        `;
    }

    renderAxis(
        startedAt,
        endedAt,
    ) {
        const ticks = 5;

        const labels = Array.from(
            {
                length: ticks,
            },
            (_, index) => {
                const ratio =
                    index / (ticks - 1);

                const date = new Date(
                    startedAt.getTime()
                    + (
                        endedAt.getTime()
                        - startedAt.getTime()
                    )
                    * ratio,
                );

                return `
                    <span>
                        ${escapeHtml(
                            this.timelineTimeLabel(
                                date,
                            ),
                        )}
                    </span>
                `;
            },
        ).join("");

        return `
            <div class="timeline-axis">
                <span
                    class="timeline-axis__spacer"
                ></span>

                <div class="timeline-axis__labels">
                    ${labels}
                </div>
            </div>
        `;
    }

    /**
     * Render one node row from timeline periods.
     *
     * @param {{
     *     nodeId: string,
     *     periods: TimelinePeriod[],
     * }} group
     * @param {Date} startedAt
     * @param {Date} endedAt
     * @returns {string}
     */
    renderPeriodRow(
        group,
        startedAt,
        endedAt,
    ) {
        const visiblePeriods =
            group.periods.filter(
                (period) =>
                    period.overlaps(
                        startedAt,
                        endedAt,
                    ),
            );

        const latest =
            visiblePeriods.at(-1)
            ?? group.periods.at(-1);

        const latestStatus =
            normalizeHealthStatus(
                latest?.status,
            );

        const periods =
            visiblePeriods
                .map((period) => {
                    return this.renderPeriod(
                        group.nodeId,
                        period,
                        startedAt,
                        endedAt,
                    );
                })
                .join("");

        return `
            <div class="timeline-row">
                <button
                    class="timeline-row__node"
                    type="button"
                    data-timeline-node="${escapeHtml(
                        group.nodeId,
                    )}"
                    title="Sélectionner ${escapeHtml(
                        group.nodeId,
                    )}"
                >
                    <span
                        class="timeline-row__status
                            timeline-row__status--${latestStatus}"
                    ></span>

                    <span>
                        ${escapeHtml(
                            group.nodeId,
                        )}
                    </span>
                </button>

                <div class="timeline-row__track">
                    <span
                        class="timeline-row__current
                            timeline-row__current--${latestStatus}"
                    ></span>

                    ${periods}
                </div>
            </div>
        `;
    }

    /**
     * Render one timeline period.
     *
     * @param {string} nodeId
     * @param {TimelinePeriod} period
     * @param {Date} startedAt
     * @param {Date} endedAt
     * @returns {string}
     */
    renderPeriod(
        nodeId,
        period,
        startedAt,
        endedAt,
    ) {
        const visiblePeriod =
            period.clippedTo(
                startedAt,
                endedAt,
            );

        if (!visiblePeriod) {
            return "";
        }

        const left =
            this.timelinePosition(
                visiblePeriod.startedAt,
                startedAt,
                endedAt,
            );

        const right =
            this.timelinePosition(
                visiblePeriod.endedAt,
                startedAt,
                endedAt,
            );

        const width =
            Math.max(
                right - left,
                0.5,
            );

        const classes = [
            "timeline-period",
            `timeline-period--${period.status}`,
        ];

        if (period.isOpen) {
            classes.push(
                "timeline-period--open",
            );
        }

        const effectiveDurationSeconds =
            period.durationSeconds
            ?? (
                period.isOpen
                    ? Math.max(
                        (
                            endedAt.getTime()
                            - period.startedAt.getTime()
                        ) / 1000,
                        0,
                    )
                    : null
            );

        const durationLabel =
            formatTimelineDuration(
                effectiveDurationSeconds,
            );

        const statusLabel =
            healthStatusLabel(
                period.status,
            );

        const startedAtLabel =
            formatDate(
                period.startedAt,
            );

        const endedAtLabel =
            period.endedAt
                ? formatDate(
                    period.endedAt,
                )
                : "En cours";

        const title = [
            `État : ${statusLabel}`,
            `Début : ${startedAtLabel}`,
            `Fin : ${endedAtLabel}`,
            `Durée : ${durationLabel}`,
        ].join("\n");

        return `
            <button
                class="${classes.join(" ")}"
                type="button"
                style="
                    left: ${left}%;
                    width: ${width}%;
                "
                title="${escapeHtml(title)}"
                aria-label="${escapeHtml(title)}"
                data-node-id="${escapeHtml(nodeId)}"
                data-period-status="${escapeHtml(
                    period.status,
                )}"
                data-period-open="${String(
                    period.isOpen,
                )}"
            >
                <span></span>
            </button>
        `;
    }

    timelinePosition(
        observedAt,
        startedAt,
        endedAt,
    ) {
        const timestamp =
            new Date(observedAt).getTime();

        const start =
            startedAt.getTime();

        const end =
            endedAt.getTime();

        const duration =
            end - start;

        if (
            !Number.isFinite(timestamp)
            || duration <= 0
        ) {
            return 0;
        }

        return Math.min(
            100,
            Math.max(
                0,
                (
                    timestamp - start
                )
                / duration
                * 100,
            ),
        );
    }

    timelineTimeLabel(date) {
        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                hour: "2-digit",
                minute: "2-digit",
            },
        ).format(date);
    }
}