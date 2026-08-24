"use strict";

import {
    escapeHtml,
    hideError,
    isDeviceSupervised,
    normalizeHealthStatus,
    showError,
} from "./utils.js";

const VIEW_HEADERS = Object.freeze({
    overview: {
        kicker: "Shikamaru · Supervision",
        title: "Konoha",
    },
    infrastructure: {
        kicker: "Infrastructure",
        title: "Carte de l’infrastructure",
    },
    services: {
        kicker: "Infrastructure logique",
        title: "Carte des services",
    },
    host: {
        kicker: "Shikamaru · Supervision système",
        title: "Santé de l’hôte Agent",
    },
    timeline: {
        kicker: "Shikamaru · Historique",
        title: "Timeline de l’infrastructure",
    },
    observations: {
        kicker: "Shikamaru · Activité",
        title: "Observations",
    },
    "configuration-workers": {
        kicker: "Configuration",
        title: "Workers Katsuyu",
    },
    "configuration-dhcp": {
        kicker: "Configuration",
        title: "DHCP",
    },
    "configuration-architecture": {
        kicker: "Configuration",
        title: "Architecture",
    },
    "configuration-plugins": {
        kicker: "Configuration",
        title: "Plugins",
    },
});

/**
 * Controls dashboard indicators and global health.
 */
export class DashboardController {
    constructor({
        state,
        onDeviceSelected = () => {},
    }) {
        if (!state) {
            throw new Error(
                "DashboardController requires application state.",
            );
        }

        this.state = state;
        this.onDeviceSelected =
            onDeviceSelected;

        this.elements = {
            runtimeError: document.querySelector(
                "#runtime-error",
            ),

            observationsReceived:
                document.querySelector(
                    "#observations-received",
                ),
            observationsAccepted:
                document.querySelector(
                    "#observations-accepted",
                ),
            observationsRejected:
                document.querySelector(
                    "#observations-rejected",
                ),
            runtimeErrors:
                document.querySelector(
                    "#runtime-errors",
                ),

            availabilityValue:
                document.querySelector(
                    "#availability-value",
                ),
            availabilityProgress:
                document.querySelector(
                    "#availability-progress",
                ),
            availabilityTrend:
                document.querySelector(
                    "#availability-trend",
                ),

            devicesCount:
                document.querySelector(
                    "#devices-count",
                ),
            healthyDevicesCount:
                document.querySelector(
                    "#healthy-devices-count",
                ),
            capabilityDistributionRing:
                document.querySelector(
                    "#capability-distribution-ring",
                ),
            capabilityDistributionTotal:
                document.querySelector(
                    "#capability-distribution-total",
                ),
            capabilityDistributionSummary:
                document.querySelector(
                    "#capability-distribution-summary",
                ),

            alertsKpi:
                document.querySelector(
                    "#alerts-kpi",
                ),
            alertsCount:
                document.querySelector(
                    "#alerts-count",
                ),
            alertsKpiStatus:
                document.querySelector(
                    "#alerts-kpi-status",
                ),


            topologyHealthIndicator:
                document.querySelector(
                    "#topology-health-indicator",
                ),
            topologyHealthLabel:
                document.querySelector(
                    "#topology-health-label",
                ),

            activeAlertsCount:
                document.querySelector(
                    "#active-alerts-count",
                ),
            activeAlertsList:
                document.querySelector(
                    "#active-alerts-list",
                ),

            acceptanceRate:
                document.querySelector(
                    "#acceptance-rate",
                ),
            acceptanceRateProgress:
                document.querySelector(
                    "#acceptance-rate-progress",
                ),

            headerKicker:
                document.querySelector(
                    ".dashboard-header__kicker",
                ),
            headerTitle:
                document.querySelector(
                    ".dashboard-header h1",
                ),
        };
    }

    /**
     * Render backend runtime information.
     *
     * @param {object} runtime
     */
    renderRuntime(runtime) {
        const normalizedRuntime =
            runtime
            && typeof runtime === "object"
                ? runtime
                : {};

        const statistics =
            normalizedRuntime.statistics
            ?? {};

        this.state.runtime =
            normalizedRuntime;

        this.setText(
            this.elements.observationsReceived,
            statistics.observations_received
            ?? 0,
        );

        this.setText(
            this.elements.observationsAccepted,
            statistics.observations_accepted
            ?? 0,
        );

        this.setText(
            this.elements.observationsRejected,
            statistics.observations_rejected
            ?? 0,
        );

        this.setText(
            this.elements.runtimeErrors,
            statistics.errors
            ?? 0,
        );

        this.renderAcceptanceRate(
            statistics,
        );

        this.renderKpis();
        this.hideRuntimeError();
    }

    /**
     * Render all dashboard indicators.
     */
    renderKpis() {
        const health =
            this.deviceHealthStatistics();

        const globalHealth =
            this.globalTopologyHealth(
                health,
            );

        this.renderGlobalHealth(
            globalHealth,
        );

        this.renderAvailability(
            health,
        );

        this.updateAnimatedText(
            this.elements.devicesCount,
            health.total,
        );

        const unsupervised =
            health.total - health.supervised;
        const equipmentSummary = [
            `${health.healthy} sain${health.healthy === 1 ? "" : "s"}`,
            `${health.supervised} supervisé${health.supervised === 1 ? "" : "s"}`,
        ];

        if (unsupervised > 0) {
            equipmentSummary.push(
                `${unsupervised} non supervisé${unsupervised === 1 ? "" : "s"}`,
            );
        }

        this.setText(
            this.elements.healthyDevicesCount,
            equipmentSummary.join(" · "),
        );

        this.renderAlertsKpi(health);
        this.renderCapabilityDistribution();
    }

    /**
     * Render the currently active alerts.
     */
    renderActiveAlerts() {
        const devices =
            this.state.topology?.devices
            ?? [];

        const effectiveHealth =
            this.effectiveDeviceHealth();

        const alerts = devices
            .map((device) => {
                return {
                    device,
                    status:
                        effectiveHealth[
                            device.device_id
                        ]
                        ?? "unknown",
                };
            })
            .filter(({ status }) => {
                return (
                    status === "degraded"
                    || status === "unhealthy"
                );
            })
            .sort((first, second) => {
                return (
                    this.alertSeverity(
                        second.status,
                    )
                    - this.alertSeverity(
                        first.status,
                    )
                );
            });

        this.setText(
            this.elements.activeAlertsCount,
            alerts.length,
        );

        if (!this.elements.activeAlertsList) {
            return;
        }

        if (alerts.length === 0) {
            this.elements.activeAlertsList.innerHTML = `
                <div class="active-alerts__empty">
                    <span aria-hidden="true">
                        ✓
                    </span>

                    <div>
                        <strong>
                            Infrastructure stable
                        </strong>

                        <p>
                            Aucune alerte active.
                        </p>
                    </div>
                </div>
            `;

            return;
        }

        this.elements.activeAlertsList.innerHTML =
            alerts
                .map(({ device, status }) => {
                    return this.renderAlert(
                        device,
                        status,
                    );
                })
                .join("");

        this.bindAlertButtons();
    }

    /**
     * Update the global header from a view name.
     *
     * @param {string} viewName
     */
    updateViewHeader(viewName) {
        const header =
            VIEW_HEADERS[viewName]
            ?? VIEW_HEADERS.overview;

        this.setText(
            this.elements.headerKicker,
            header.kicker,
        );

        this.setText(
            this.elements.headerTitle,
            header.title,
        );
    }

    /**
     * Display a runtime loading error.
     *
     * @param {unknown} message
     */
    showRuntimeError(message) {
        showError(
            this.elements.runtimeError,
            message,
        );
    }

    hideRuntimeError() {
        hideError(
            this.elements.runtimeError,
        );
    }

    renderGlobalHealth(status) {
        if (
            this.elements
                .topologyHealthIndicator
        ) {
            this.elements
                .topologyHealthIndicator
                .className =
                "topology-heading-status__indicator "
                + (
                    "topology-heading-status__indicator"
                    + `--${status}`
                );
        }

        const label =
            this.formatGlobalTopologyHealth(
                status,
            );

        this.setText(
            this.elements.topologyHealthLabel,
            label,
        );
    }

    renderAvailability(statistics) {
        const availability =
            this.availabilityPercentage(
                statistics,
            );

        if (availability === null) {
            this.updateAnimatedText(
                this.elements.availabilityValue,
                "—",
            );
            if (
                this.elements
                    .availabilityProgress
            ) {
                this.elements
                    .availabilityProgress
                    .style.width = "0%";
            }

            this.setText(
                this.elements.availabilityTrend,
                "En attente de données",
            );

            return;
        }

        const formattedAvailability =
            `${availability.toFixed(1)} %`;

        this.updateAnimatedText(
            this.elements.availabilityValue,
            formattedAvailability,
        );
        if (
            this.elements
                .availabilityProgress
        ) {
            this.elements
                .availabilityProgress
                .style.width =
                `${availability}%`;
        }

        const knownDevices =
            statistics.healthy
            + statistics.degraded
            + statistics.unhealthy;

        this.setText(
            this.elements.availabilityTrend,
            `${statistics.healthy}/${knownDevices} observés sains`,
        );
    }

    renderCapabilityDistribution() {
        const statuses = [
            ...this.latestCapabilityObservations()
                .values(),
        ].map((observation) => {
            return normalizeHealthStatus(
                observation.status,
            );
        });
        const total = statuses.length;
        const healthy = statuses.filter(
            (status) => status === "healthy",
        ).length;
        const degraded = statuses.filter(
            (status) => status === "degraded",
        ).length;
        const unhealthy = statuses.filter(
            (status) => status === "unhealthy",
        ).length;
        const unknown = statuses.filter(
            (status) => status === "unknown",
        ).length;

        this.setText(
            this.elements.capabilityDistributionTotal,
            total,
        );

        const summary = total === 0
            ? "Aucune donnée"
            : (
                `${healthy} saine${healthy > 1 ? "s" : ""}`
                + ` · ${degraded} dégradée${degraded > 1 ? "s" : ""}`
                + ` · ${unhealthy} critique${unhealthy > 1 ? "s" : ""}`
                + (
                    unknown > 0
                        ? ` · ${unknown} inconnue${unknown > 1 ? "s" : ""}`
                        : ""
                )
            );

        this.setText(
            this.elements.capabilityDistributionSummary,
            summary,
        );

        if (this.elements.capabilityDistributionRing) {
            const percentage = total === 0
                ? 0
                : healthy / total * 100;

            this.elements.capabilityDistributionRing
                .style.setProperty(
                    "--healthy-percentage",
                    `${percentage}%`,
                );
        }
    }

    renderAlertsKpi(statistics) {
        const alerts =
            statistics.degraded
            + statistics.unhealthy;

        this.updateAnimatedText(
            this.elements.alertsCount,
            alerts,
        );

        this.elements.alertsKpi
            ?.classList.toggle(
                "dashboard-kpi--warning",
                (
                    statistics.degraded > 0
                    && statistics.unhealthy
                    === 0
                ),
            );

        this.elements.alertsKpi
            ?.classList.toggle(
                "dashboard-kpi--critical",
                statistics.unhealthy > 0,
            );

        if (statistics.unhealthy > 0) {
            this.setText(
                this.elements.alertsKpiStatus,
                (
                    `${statistics.unhealthy} `
                    + "indisponible"
                    + (
                        statistics.unhealthy > 1
                            ? "s"
                            : ""
                    )
                ),
            );

            return;
        }

        if (statistics.degraded > 0) {
            this.setText(
                this.elements.alertsKpiStatus,
                (
                    `${statistics.degraded} `
                    + "dégradé"
                    + (
                        statistics.degraded > 1
                            ? "s"
                            : ""
                    )
                ),
            );

            return;
        }

        this.setText(
            this.elements.alertsKpiStatus,
            "Aucune alerte",
        );
    }

    renderAcceptanceRate(statistics) {
        const received =
            Number(
                statistics
                    .observations_received
                ?? 0,
            );

        const accepted =
            Number(
                statistics
                    .observations_accepted
                ?? 0,
            );

        if (received === 0) {
            this.setText(
                this.elements.acceptanceRate,
                "—",
            );

            if (
                this.elements
                    .acceptanceRateProgress
            ) {
                this.elements
                    .acceptanceRateProgress
                    .style.width = "0%";
            }

            return;
        }

        const rate =
            Math.min(
                100,
                Math.max(
                    0,
                    accepted
                    / received
                    * 100,
                ),
            );

        this.setText(
            this.elements.acceptanceRate,
            `${rate.toFixed(1)} %`,
        );

        if (
            this.elements
                .acceptanceRateProgress
        ) {
            this.elements
                .acceptanceRateProgress
                .style.width =
                `${rate}%`;
        }
    }

    renderAlert(device, status) {
        return `
            <button
                class="active-alert
                    active-alert--${escapeHtml(
                        status,
                    )}"
                type="button"
                data-device-id="${escapeHtml(
                    device.device_id,
                )}"
            >
                <span
                    class="active-alert__indicator"
                    aria-hidden="true"
                ></span>

                <span
                    class="active-alert__content"
                >
                    <strong>
                        ${escapeHtml(
                            device.label,
                        )}
                    </strong>

                    <small>
                        ${escapeHtml(
                            this.deviceDetailLabel(
                                device,
                            ),
                        )}
                    </small>
                </span>

                <span
                    class="active-alert__status"
                >
                    ${escapeHtml(
                        this.alertStatusLabel(
                            status,
                        ),
                    )}
                </span>
            </button>
        `;
    }

    bindAlertButtons() {
        const buttons =
            this.elements.activeAlertsList
                ?.querySelectorAll(
                    "[data-device-id]",
                )
            ?? [];

        for (const button of buttons) {
            button.addEventListener(
                "click",
                () => {
                    this.onDeviceSelected(
                        button.dataset.deviceId,
                    );
                },
            );
        }
    }

    observationKey(observation) {
        return [
            observation.node_id,
            observation.service_id,
            observation.capability_id,
        ].join("/");
    }

    observationTimestamp(observation) {
        const timestamp = new Date(
            observation.observed_at,
        ).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : 0;
    }

    latestCapabilityObservations() {
        const latest = new Map();

        for (const observation of (
            this.state.observations
            ?? []
        )) {
            const key =
                this.observationKey(
                    observation,
                );
            const current = latest.get(key);

            if (
                current
                && this.observationTimestamp(
                    observation,
                )
                    < this.observationTimestamp(
                        current,
                    )
            ) {
                continue;
            }

            latest.set(key, observation);
        }

        return latest;
    }

    criticalServicePolicies() {
        const policies = new Map();

        for (const device of (
            this.state.topology?.devices
            ?? []
        )) {
            if (!device.node_id) {
                continue;
            }

            const services = Array.isArray(
                device.metadata?.services,
            )
                ? device.metadata.services
                : [];

            for (const service of services) {
                if (
                    !service?.service_id
                    || service.enabled === false
                    || service.critical !== true
                ) {
                    continue;
                }

                policies.set(
                    [
                        device.node_id,
                        service.service_id,
                    ].join("/"),
                    device.device_id,
                );
            }
        }

        return policies;
    }

    criticalCapabilityImpact(status) {
        const normalized = String(
            status ?? "unknown",
        ).toLowerCase();

        if (
            normalized === "unavailable"
            || normalized === "unhealthy"
        ) {
            return "unhealthy";
        }

        if (
            normalized === "degraded"
            || normalized === "stale"
            || normalized === "unknown"
        ) {
            return "degraded";
        }

        return normalized === "healthy"
            ? "healthy"
            : "degraded";
    }

    healthSeverity(status) {
        const priorities = {
            healthy: 0,
            unknown: 1,
            degraded: 2,
            unhealthy: 3,
        };

        return priorities[status] ?? priorities.unknown;
    }

    mostSevereHealth(first, second) {
        const normalizedFirst =
            normalizeHealthStatus(first);
        const normalizedSecond =
            normalizeHealthStatus(second);

        return this.healthSeverity(
            normalizedSecond,
        ) > this.healthSeverity(
            normalizedFirst,
        )
            ? normalizedSecond
            : normalizedFirst;
    }

    criticalCapabilityHealthByDevice() {
        const policies =
            this.criticalServicePolicies();
        const health = {};

        for (const observation of (
            this.latestCapabilityObservations()
                .values()
        )) {
            const serviceKey = [
                observation.node_id,
                observation.service_id,
            ].join("/");
            const deviceId =
                policies.get(serviceKey);

            if (!deviceId) {
                continue;
            }

            const impact =
                this.criticalCapabilityImpact(
                    observation.status,
                );

            health[deviceId] =
                this.mostSevereHealth(
                    health[deviceId]
                    ?? "healthy",
                    impact,
                );
        }

        return health;
    }

    effectiveDeviceHealth() {
        const health = Object.fromEntries(
            Object.entries(
                this.state.deviceHealth
                ?? {},
            ).map(([deviceId, status]) => {
                return [
                    deviceId,
                    normalizeHealthStatus(status),
                ];
            }),
        );
        const criticalHealth =
            this.criticalCapabilityHealthByDevice();

        for (const [
            deviceId,
            status,
        ] of Object.entries(criticalHealth)) {
            health[deviceId] =
                this.mostSevereHealth(
                    health[deviceId]
                    ?? "unknown",
                    status,
                );
        }

        return health;
    }

    deviceHealthStatistics() {
        const devices =
            this.state.topology?.devices
            ?? [];

        const supervisedDevices = devices.filter(
            (device) => isDeviceSupervised(
                device,
                this.state.observations ?? [],
            ),
        );

        const effectiveHealth =
            this.effectiveDeviceHealth();
        const statuses =
            supervisedDevices.map(
                (device) => {
                    return (
                        effectiveHealth[
                            device.device_id
                        ]
                        ?? "unknown"
                    );
                },
            );

        return {
            total: devices.length,
            supervised:
                supervisedDevices.length,
            healthy:
                statuses.filter(
                    (status) => {
                        return (
                            status
                            === "healthy"
                        );
                    },
                ).length,
            degraded:
                statuses.filter(
                    (status) => {
                        return (
                            status
                            === "degraded"
                        );
                    },
                ).length,
            unhealthy:
                statuses.filter(
                    (status) => {
                        return (
                            status
                            === "unhealthy"
                        );
                    },
                ).length,
            unknown:
                statuses.filter(
                    (status) => {
                        return (
                            status
                            === "unknown"
                        );
                    },
                ).length,
        };
    }

    globalTopologyHealth(statistics) {
        if (statistics.unhealthy > 0) {
            return "unhealthy";
        }

        if (statistics.degraded > 0) {
            return "degraded";
        }

        if (statistics.healthy > 0) {
            return "healthy";
        }

        return "unknown";
    }

    formatGlobalTopologyHealth(status) {
        const labels = {
            healthy:
                "Infrastructure saine",
            degraded:
                "Infrastructure dégradée",
            unhealthy:
                "Incident actif",
            unknown:
                "État inconnu",
        };

        return (
            labels[status]
            ?? labels.unknown
        );
    }

    availabilityPercentage(statistics) {
        const knownDevices =
            statistics.healthy
            + statistics.degraded
            + statistics.unhealthy;

        if (knownDevices === 0) {
            return null;
        }

        return (
            statistics.healthy
            / knownDevices
            * 100
        );
    }

    alertSeverity(status) {
        if (status === "unhealthy") {
            return 2;
        }

        if (status === "degraded") {
            return 1;
        }

        return 0;
    }

    alertStatusLabel(status) {
        const labels = {
            degraded: "Dégradé",
            unhealthy: "Indisponible",
        };

        return (
            labels[status]
            ?? "Inconnu"
        );
    }

    deviceDetailLabel(device) {
        return (
            device.address
            ?? device.node_id
            ?? device.metadata?.model
            ?? device.device_id
        );
    }

    updateAnimatedText(element, value) {
        if (!element) {
            return;
        }

        const normalizedValue =
            String(value);

        if (
            element.textContent
            === normalizedValue
        ) {
            return;
        }

        element.textContent =
            normalizedValue;

        this.animateKpi(element);
    }

    animateKpi(element) {
        const card =
            element?.closest(
                ".dashboard-kpi",
            );

        if (!card) {
            return;
        }

        card.classList.remove(
            "dashboard-kpi--updating",
        );

        window.requestAnimationFrame(
            () => {
                card.classList.add(
                    "dashboard-kpi--updating",
                );
            },
        );

        window.setTimeout(
            () => {
                card.classList.remove(
                    "dashboard-kpi--updating",
                );
            },
            260,
        );
    }

    setText(element, value) {
        if (!element) {
            return;
        }

        element.textContent =
            String(value ?? "—");
    }
}
