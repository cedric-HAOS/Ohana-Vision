"use strict";

import {
    escapeHtml,
    formatDate,
    healthStatusLabel,
    hideError,
    normalizeHealthStatus,
    showError,
    statusBadge,
} from "./utils.js";

/**
 * Manage the observations displayed by the frontend.
 */
export class ObservationsController {
    constructor({
        state,
        onObservationsChanged = () => {},
        onDashboardRefresh = () => {},
    }) {
        if (!state) {
            throw new Error(
                "ObservationsController requires application state.",
            );
        }

        this.state = state;
        this.onObservationsChanged =
            onObservationsChanged;
        this.onDashboardRefresh =
            onDashboardRefresh;

        this.elements = {
            error: document.querySelector(
                "#observations-error",
            ),
            count: document.querySelector(
                "#observation-count",
            ),
            recentList: document.querySelector(
                "#recent-observations-list",
            ),
            statusFilter: document.querySelector(
                "#observation-status-filter",
            ),
            nodeFilter: document.querySelector(
                "#observation-node-filter",
            ),
            serviceFilter: document.querySelector(
                "#observation-service-filter",
            ),
        };

        [
            this.elements.statusFilter,
            this.elements.nodeFilter,
            this.elements.serviceFilter,
        ].forEach((filter) => {
            filter?.addEventListener("change", () => {
                this.renderRecent(
                    this.state.observations ?? [],
                );
            });
        });
    }

    /**
     * Render observations and update the shared state.
     *
     * @param {Array<object>} observations
     */

    /**
     * Display an observations loading error.
     *
     * @param {unknown} message
     */
    showError(message) {
        showError(
            this.elements.error,
            message,
        );
    }

    /**
     * Render the latest observations card.
     *
     * @param {Array<object>} observations
     */
    renderRecent(observations) {
        if (!this.elements.recentList) {
            return;
        }

        this.populateObservationFilters(observations);
        const filtered = this.filterObservations(observations);
        const recent = this.groupObservations(filtered);

        this.renderCount(
            recent.length,
            observations.length,
        );

        if (recent.length === 0) {
            this.elements.recentList.innerHTML = `
                <p class="side-panel-placeholder">
                    Aucune observation reçue.
                </p>
            `;
            return;
        }

        this.elements.recentList.innerHTML = recent
            .map((observation) => {
                return this.renderRecentItem(
                    observation,
                );
            })
            .join("");
    }

    populateObservationFilters(observations) {
        this.populateObservationFilter(
            this.elements.nodeFilter,
            observations.map((observation) =>
                String(observation.node_id ?? ""),
            ),
        );
        this.populateObservationFilter(
            this.elements.serviceFilter,
            observations.map((observation) =>
                String(observation.service_id ?? ""),
            ),
        );
    }

    populateObservationFilter(select, values) {
        if (!select) {
            return;
        }

        const selected = select.value;
        const options = [...new Set(values)]
            .filter(Boolean)
            .sort((first, second) =>
                first.localeCompare(second),
            );

        select.innerHTML = [
            '<option value="all">Tous</option>',
            ...options.map((value) => `
                <option value="${escapeHtml(value)}">
                    ${escapeHtml(value)}
                </option>
            `),
        ].join("");
        select.value = options.includes(selected)
            ? selected
            : "all";
    }

    filterObservations(observations) {
        const statusFilter =
            this.elements.statusFilter?.value
            ?? "all";
        const nodeFilter =
            this.elements.nodeFilter?.value
            ?? "all";
        const serviceFilter =
            this.elements.serviceFilter?.value
            ?? "all";

        return observations.filter((observation) => {
            const status = normalizeHealthStatus(
                observation.status,
            );
            const statusMatches =
                statusFilter === "all"
                || (
                    statusFilter === "anomalies"
                    && ["degraded", "unhealthy"]
                        .includes(status)
                )
                || statusFilter === status;
            const nodeMatches =
                nodeFilter === "all"
                || observation.node_id === nodeFilter;
            const serviceMatches =
                serviceFilter === "all"
                || observation.service_id
                    === serviceFilter;

            return statusMatches
                && nodeMatches
                && serviceMatches;
        });
    }

    groupObservations(observations) {
        const groups = new Map();

        observations.forEach((observation) => {
            const status = normalizeHealthStatus(
                observation.status,
            );
            const key = [
                observation.node_id,
                observation.service_id,
                observation.capability_id,
                status,
            ].join("\u0000");
            const existing = groups.get(key);

            if (!existing) {
                groups.set(key, {
                    ...observation,
                    status,
                    firstObservedAt:
                        observation.observed_at,
                    lastObservedAt:
                        observation.observed_at,
                    observations: [observation],
                });
                return;
            }

            existing.observations.push(observation);
            if (
                this.observationTimestamp(
                    observation.observed_at,
                )
                < this.observationTimestamp(
                    existing.firstObservedAt,
                )
            ) {
                existing.firstObservedAt =
                    observation.observed_at;
            }
            if (
                this.observationTimestamp(
                    observation.observed_at,
                )
                > this.observationTimestamp(
                    existing.lastObservedAt,
                )
            ) {
                Object.assign(existing, observation);
                existing.status = status;
                existing.lastObservedAt =
                    observation.observed_at;
            }
        });

        return [...groups.values()].sort(
            (first, second) =>
                this.observationTimestamp(
                    second.lastObservedAt,
                )
                - this.observationTimestamp(
                    first.lastObservedAt,
                ),
        );
    }

    observationTimestamp(value) {
        const timestamp = new Date(value).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : 0;
    }

    /**
     * Render one recent observation.
     *
     * @param {object} observation
     * @returns {string}
     */
    renderRecentItem(observation) {
        const status =
            normalizeHealthStatus(
                observation.status,
            );

        const count = observation.observations.length;
        const range = count > 1
            ? `${formatDate(observation.firstObservedAt)} → ${formatDate(observation.lastObservedAt)}`
            : formatDate(observation.lastObservedAt);
        const details = count > 1
            ? `
                <details class="recent-observation__details">
                    <summary>Voir les ${count} évaluations</summary>
                    <ol>
                        ${observation.observations
                            .slice()
                            .sort((first, second) => (
                                this.observationTimestamp(
                                    second.observed_at,
                                )
                                - this.observationTimestamp(
                                    first.observed_at,
                                )
                            ))
                            .map((item) => `
                                <li>
                                    <time datetime="${escapeHtml(item.observed_at)}">
                                        ${escapeHtml(formatDate(item.observed_at))}
                                    </time>
                                    <span>${escapeHtml(item.message ?? "Sans détail")}</span>
                                </li>
                            `).join("")}
                    </ol>
                </details>
            `
            : "";

        return `
            <article
                class="recent-observation
                    recent-observation--${escapeHtml(status)}"
            >
                <span
                    class="recent-observation__indicator"
                    aria-hidden="true"
                ></span>

                <div class="recent-observation__content">
                    <strong>
                        ${escapeHtml(
                            observation.capability_id,
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(
                            observation.node_id,
                        )}
                        ·
                        ${escapeHtml(
                            observation.service_id,
                        )}
                    </span>
                </div>

                <div class="recent-observation__meta">
                    <span>
                        ${escapeHtml(
                            healthStatusLabel(status),
                        )}
                        ${count > 1 ? ` · ${count} évaluations` : ""}
                    </span>

                    <time
                        datetime="${escapeHtml(
                            observation.lastObservedAt,
                        )}"
                    >
                        ${escapeHtml(range)}
                    </time>
                </div>

                ${details}
            </article>
        `;
    }

    render(observations) {
        const normalizedObservations =
            Array.isArray(observations)
                ? observations
                : [];

        this.state.observations =
            normalizedObservations;

        this.renderRecent(normalizedObservations);

        hideError(this.elements.error);

        this.onObservationsChanged(
            normalizedObservations,
        );

        this.onDashboardRefresh();
    }

    /**
     * Render the observations table.
     *
     * @param {Array<object>} observations
     */

    /**
     * Render the observations count.
     *
     * @param {number} visibleCount
     * @param {number} totalCount
     */
    renderCount(visibleCount, totalCount) {
        if (!this.elements.count) {
            return;
        }

        this.elements.count.textContent =
            `${visibleCount} état`
            + (visibleCount > 1 ? "s" : "")
            + ` · ${totalCount} observation`
            + (totalCount > 1 ? "s" : "");
    }

    /**
     * Render one observations table row.
     *
     * @param {object} observation
     * @returns {string}
     */
}
