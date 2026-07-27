"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

import {
    hideError,
    showError,
} from "./utils.js";

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
                    return [
                        node.node_id,
                        this.currentStatus(
                            node.periods,
                        ),
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
                    return [
                        nodeId,
                        this.currentStatus(
                            node.periods,
                        ),
                    ];
                },
            ),
        );
    }

    buildDeviceHealth(
        topology,
        timeline,
    ) {
        const nodeHealth =
            this.buildNodeHealthIndex(
                timeline,
            );

        return Object.fromEntries(
            (
                topology?.devices
                ?? []
            ).map((device) => {
                const status = device.node_id
                    ? (
                        nodeHealth[
                            device.node_id
                        ]
                        ?? "unknown"
                    )
                    : "unknown";

                return [
                    device.device_id,
                    status,
                ];
            }),
        );
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

}
