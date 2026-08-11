"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

import {
    hideError,
    normalizeHealthStatus,
    showError,
} from "./utils.js";

const STATUS_PRIORITY = Object.freeze({
    suspended: -1,
    healthy: 0,
    unknown: 1,
    stale: 2,
    degraded: 3,
    unhealthy: 4,
});

/**
 * Controls the infrastructure topology.
 */
export class TopologyController {
    constructor({
        state,
        onDeviceSelected = () => {},
        onTopologyChanged = () => {},
    }) {
        if (!state) {
            throw new Error(
                "TopologyController requires application state.",
            );
        }

        if (
            typeof window.TopologyCanvas
            !== "function"
        ) {
            throw new Error(
                "TopologyCanvas is not available.",
            );
        }

        this.state = state;
        this.onDeviceSelected =
            onDeviceSelected;
        this.onTopologyChanged =
            onTopologyChanged;

        this.elements = {
            zoomIn: document.querySelector(
                "#topology-zoom-in",
            ),
            zoomOut: document.querySelector(
                "#topology-zoom-out",
            ),
            resetView: document.querySelector(
                "#topology-reset-view",
            ),
            error: document.querySelector(
                "#topology-error",
            ),
            container: document.querySelector(
                "#topology-container",
            ),
            layoutLabel: document.querySelector(
                "#topology-layout-label",
            ),
        };

        this.canvas = new window.TopologyCanvas({
            container: this.elements.container,
            layoutLabel: this.elements.layoutLabel,
            showError: (message) => {
                showError(
                    this.elements.error,
                    message,
                );
            },
            hideError: () => {
                hideError(
                    this.elements.error,
                );
            },
            onDeviceSelected: (deviceId) => {
                this.onDeviceSelected(
                    deviceId,
                );
            },
        });
    }

    /**
     * Bind topology controls.
     */
    initialize() {
        this.bindControls();
    }

    /**
     * Load and render topology data.
     */
    async load() {
        try {
            const topology = await fetchJson(
                API.topology,
            );

            const deviceHealth =
                this.buildDeviceHealth(
                    topology,
                    this.state.timeline,
                );
            const devicePresence =
                this.buildDevicePresence(
                    topology,
                    this.state.observations,
                );

            this.state.topology = topology;
            this.state.deviceHealth =
                deviceHealth;
            this.state.devicePresence =
                devicePresence;

            this.canvas.render(
                topology,
                deviceHealth,
                devicePresence,
            );

            if (this.state.selectedDeviceId) {
                this.setSelectedDevice(
                    this.state.selectedDeviceId,
                );
            }

            hideError(this.elements.error);

            this.onTopologyChanged({
                topology,
                deviceHealth,
                devicePresence,
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            this.canvas.renderError(
                `Carte indisponible : ${message}`,
            );
        }
    }

    /**
     * Refresh health and network presence without reloading the
     * topology definition.
     *
     * Statuses are reconciled on the existing SVG nodes. Rebuilding
     * the canvas would replay every entrance animation and make the
     * whole map blink whenever one device changes state.
     */
    async refreshStatus() {
        const topology = this.state.topology;

        if (!topology) {
            await this.load();
            return;
        }

        const deviceHealth =
            this.buildDeviceHealth(
                topology,
                this.state.timeline,
            );
        const devicePresence =
            this.buildDevicePresence(
                topology,
                this.state.observations,
            );
        this.state.deviceHealth =
            deviceHealth;
        this.state.devicePresence =
            devicePresence;

        this.canvas.updateStatus(
            deviceHealth,
            devicePresence,
        );

        hideError(this.elements.error);

        this.onTopologyChanged({
            topology,
            deviceHealth,
            devicePresence,
        });
    }

    /**
     * Select one topology device.
     *
     * @param {string | null} deviceId
     */
    setSelectedDevice(deviceId) {
        this.canvas.setSelectedDevice(
            deviceId,
        );
    }

    /**
     * Select a device from its node identifier.
     *
     * @param {string} nodeId
     * @returns {boolean}
     */
    selectDeviceByNode(nodeId) {
        const device = (
            this.state.topology?.devices
            ?? []
        ).find((candidate) => {
            return candidate.node_id === nodeId;
        });

        if (!device) {
            return false;
        }

        this.onDeviceSelected(
            device.device_id,
        );

        return true;
    }

    /**
     * Recalculate the visible topology dimensions.
     */
    reflow() {
        if (!this.elements.container) {
            return;
        }

        window.requestAnimationFrame(() => {
            window.dispatchEvent(
                new Event("resize"),
            );
        });
    }

    bindControls() {
        this.elements.zoomIn?.addEventListener(
            "click",
            () => {
                this.canvas.zoomIn();
            },
        );

        this.elements.zoomOut?.addEventListener(
            "click",
            () => {
                this.canvas.zoomOut();
            },
        );

        this.elements.resetView?.addEventListener(
            "click",
            () => {
                this.canvas.resetView();
            },
        );
    }

    currentPeriod(periods) {
        if (
            !Array.isArray(periods)
            || periods.length === 0
        ) {
            return null;
        }

        const openPeriod = periods.find(
            (period) => !period.ended_at,
        );

        if (openPeriod) {
            return openPeriod;
        }

        return periods
            .slice()
            .sort((first, second) => {
                return (
                    new Date(
                        second.started_at,
                    ).getTime()
                    - new Date(
                        first.started_at,
                    ).getTime()
                );
            })[0];
    }

    currentStatus(periods) {
        return (
            this.currentPeriod(periods)
                ?.status
            ?? "unknown"
        );
    }

    buildNodeHealthIndex(timeline) {
        const nodes = timeline?.nodes ?? {};

        if (Array.isArray(nodes)) {
            return Object.fromEntries(
                nodes.map((node) => {
                    const period = this.currentPeriod(
                        node.periods,
                    );

                    return [
                        node.node_id,
                        {
                            status:
                                period?.status
                                ?? "unknown",
                            observed_at:
                                period?.started_at
                                ?? null,
                        },
                    ];
                }),
            );
        }

        return Object.fromEntries(
            Object.entries(nodes).map(
                ([
                    nodeId,
                    node,
                ]) => {
                    const period = this.currentPeriod(
                        node.periods,
                    );

                    return [
                        nodeId,
                        {
                            status:
                                period?.status
                                ?? "unknown",
                            observed_at:
                                period?.started_at
                                ?? null,
                        },
                    ];
                },
            ),
        );
    }

    buildObservationHealthIndex(observations) {
        const latestByCapability = new Map();

        for (const observation of (
            observations ?? []
        )) {
            if (
                observation.metadata
                    ?.target_type === "device"
            ) {
                continue;
            }

            const nodeId = String(
                observation.node_id ?? "",
            );
            const serviceId = String(
                observation.service_id ?? "",
            );
            const capabilityId = String(
                observation.capability_id ?? "",
            );

            if (
                !nodeId
                || !serviceId
                || !capabilityId
            ) {
                continue;
            }

            const key = [
                nodeId,
                serviceId,
                capabilityId,
            ].join("\u0000");
            const current =
                latestByCapability.get(key);

            if (
                !current
                || this.timestamp(
                    observation.observed_at,
                ) >= this.timestamp(
                    current.observed_at,
                )
            ) {
                latestByCapability.set(
                    key,
                    observation,
                );
            }
        }

        const nodeHealth = {};

        for (const observation of latestByCapability.values()) {
            const nodeId = String(
                observation.node_id,
            );
            const status = normalizeHealthStatus(
                observation.status,
            );
            const current = nodeHealth[nodeId];

            if (
                !current
                || STATUS_PRIORITY[status]
                    > STATUS_PRIORITY[
                        current.status
                    ]
                || (
                    status === current.status
                    && this.timestamp(
                        observation.observed_at,
                    ) > this.timestamp(
                        current.observed_at,
                    )
                )
            ) {
                nodeHealth[nodeId] = {
                    status,
                    observed_at:
                        observation.observed_at,
                };
                continue;
            }

            if (
                this.timestamp(
                    observation.observed_at,
                ) > this.timestamp(
                    current.observed_at,
                )
            ) {
                current.observed_at =
                    observation.observed_at;
            }
        }

        return nodeHealth;
    }

    buildTargetDeviceHealthIndex(observations) {
        const deviceHealth = {};

        for (const observation of (
            observations ?? []
        )) {
            const metadata =
                observation.metadata ?? {};

            if (
                metadata.target_type !== "device"
                || metadata.contributes_to_device_health
                    !== true
            ) {
                continue;
            }

            const deviceId = String(
                metadata.device_id
                ?? observation.service_id
                ?? "",
            );

            if (!deviceId) {
                continue;
            }

            const current = deviceHealth[deviceId];

            if (
                current
                && this.timestamp(
                    observation.observed_at,
                ) < this.timestamp(
                    current.observed_at,
                )
            ) {
                continue;
            }

            deviceHealth[deviceId] = {
                status: normalizeHealthStatus(
                    observation.status,
                ),
                observed_at:
                    observation.observed_at,
            };
        }

        return deviceHealth;
    }

    buildDeviceHealth(
        topology,
        timeline,
    ) {
        const nodeHealth =
            this.buildNodeHealthIndex(
                timeline,
            );
        const observationHealth =
            this.buildObservationHealthIndex(
                this.state.observations,
            );
        const targetDeviceHealth =
            this.buildTargetDeviceHealthIndex(
                this.state.observations,
            );

        return Object.fromEntries(
            (
                topology?.devices
                ?? []
            ).map((device) => {
                const targeted =
                    targetDeviceHealth[
                        device.device_id
                    ];
                const status = targeted?.status
                    ?? (
                        device.node_id
                            ? this.resolveDeviceHealth(
                                nodeHealth[
                                    device.node_id
                                ],
                                observationHealth[
                                    device.node_id
                                ],
                            )
                            : "unknown"
                    );

                return [
                    device.device_id,
                    status,
                ];
            }),
        );
    }

    resolveDeviceHealth(
        timelineHealth,
        observationHealth,
    ) {
        if (
            observationHealth
            && (
                !timelineHealth
                || this.timestamp(
                    observationHealth.observed_at,
                ) >= this.timestamp(
                    timelineHealth.observed_at,
                )
            )
        ) {
            return observationHealth.status;
        }

        return timelineHealth?.status ?? "unknown";
    }

    buildDevicePresence(
        topology,
        observations,
    ) {
        const devices =
            topology?.devices ?? [];
        const deviceIds = new Set(
            devices.map(
                (device) => device.device_id,
            ),
        );
        const presence = {};

        for (const observation of (
            observations ?? []
        )) {
            if (
                observation.capability_id
                !== "network.reachable"
            ) {
                continue;
            }

            const metadata =
                observation.metadata ?? {};
            const deviceId =
                metadata.device_id
                ?? observation.service_id;

            if (!deviceIds.has(deviceId)) {
                continue;
            }

            const observedAt = new Date(
                observation.observed_at,
            ).getTime();
            const currentAt = new Date(
                presence[deviceId]
                    ?.observed_at
                    ?? 0,
            ).getTime();

            if (
                Number.isFinite(currentAt)
                && Number.isFinite(observedAt)
                && observedAt < currentAt
            ) {
                continue;
            }

            presence[deviceId] = {
                status: this.presenceStatus(
                    observation.status,
                ),
                observed_at:
                    observation.observed_at,
                address: metadata.address,
                method: metadata.method,
                latency_ms:
                    observation.latency_ms,
                consecutive_failures:
                    metadata.consecutive_failures,
                failure_threshold:
                    metadata.failure_threshold,
                message:
                    metadata.agent_observation
                        ?.message,
            };
        }

        for (const device of devices) {
            if (
                device.address
                && !presence[device.device_id]
            ) {
                presence[device.device_id] = {
                    status: "unknown",
                    address: device.address,
                };
            }
        }

        return presence;
    }

    presenceStatus(status) {
        const normalized = String(
            status ?? "unknown",
        ).toLowerCase();

        if (normalized === "healthy") {
            return "present";
        }

        if (
            normalized === "unavailable"
            || normalized === "unhealthy"
        ) {
            return "absent";
        }

        return "unknown";
    }

    timestamp(value) {
        const timestamp = new Date(
            String(value ?? ""),
        ).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : 0;
    }

}
