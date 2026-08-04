"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

import {
    applicationState,
    setTimeline,
} from "./application_state.js";

import {
    ConfigurationController,
} from "./configuration.js";

import {
    DashboardController,
} from "./dashboard.js";

import {
    DeviceDetailsController,
} from "./device_details.js";

import {
    NavigationController,
} from "./navigation.js";

import {
    ObservationsController,
} from "./observations.js";

import {
    ServicesController,
} from "./services.js";

import {
    TimelineController,
} from "./timeline.js";

import {
    TopologyController,
} from "./topology.js";

import {
    formatDate,
} from "./utils.js";

import {
    WebSocketController,
} from "./websocket.js";

/**
 * Coordinates the Ohana-Vision frontend modules.
 */
export class ApplicationController {
    constructor() {
        this.state = applicationState();

        this.dashboard = null;
        this.configuration = null;
        this.deviceDetails = null;
        this.navigation = null;
        this.observations = null;
        this.services = null;
        this.timeline = null;
        this.topology = null;
        this.websocket = null;

        this.observationRefreshTimer = null;
        this.observationRefreshInFlight = false;
        this.observationRefreshPending = false;
        this.timelineLoadInFlight = null;
        this.timelineLastLoadedAt = 0;
        this.timelineRefreshIntervalMs = 5000;
        this.timelineHistoryHours = 24;
        this.initialDataLoaded = false;

        this.elements = {
            refreshButton:
                document.querySelector(
                    "#refresh-button",
                ),
            lastRefresh:
                document.querySelector(
                    "#last-refresh",
                ),
            visionVersion:
                document.querySelector(
                    "#vision-version",
                ),
            agentVersion:
                document.querySelector(
                    "#agent-version",
                ),
        };

        this.handleNavigationChanged =
            this.handleNavigationChanged.bind(
                this,
            );
        this.handleRealtimeMessage =
            this.handleRealtimeMessage.bind(
                this,
            );
    }

    /**
     * Initialize the complete frontend application.
     */
    initialize() {
        this.createControllers();
        this.bindApplicationEvents();
        this.initializeControllers();

        void this.loadVisionVersion();
        void this.refresh();
        this.websocket.initialize();
    }

    /**
     * Create the frontend controllers and connect them.
     */
    createControllers() {
        this.configuration =
            new ConfigurationController();

        this.dashboard =
            new DashboardController({
                state: this.state,
                onDeviceSelected: (
                    deviceId,
                ) => {
                    this.deviceDetails.select(
                        deviceId,
                    );
                },
            });

        this.deviceDetails =
            new DeviceDetailsController({
                state: this.state,
                onSelectionChanged: (
                    deviceId,
                ) => {
                    this.topology
                        ?.setSelectedDevice(
                            deviceId,
                        );
                },
            });

        this.topology =
            new TopologyController({
                state: this.state,
                onDeviceSelected: (
                    deviceId,
                ) => {
                    this.deviceDetails.select(
                        deviceId,
                    );
                },
                onTopologyChanged: () => {
                    this.dashboard
                        .renderActiveAlerts();

                    this.dashboard
                        .renderKpis();

                    this.deviceDetails
                        .refresh();
                },
            });

        this.timeline =
            new TimelineController({
                state: this.state,
                onNodeSelected: (
                    nodeId,
                ) => {
                    this.topology
                        .selectDeviceByNode(
                            nodeId,
                        );
                },
            });

        this.services =
            new ServicesController({
                state: this.state,
                onHostSelected: ({
                    deviceId,
                    nodeId,
                }) => {
                    this.navigation?.activate(
                        "infrastructure",
                    );

                    if (deviceId) {
                        this.deviceDetails.select(
                            deviceId,
                        );
                        return;
                    }

                    if (nodeId) {
                        this.topology.selectDeviceByNode(
                            nodeId,
                        );
                    }
                },
            });

        this.observations =
            new ObservationsController({
                state: this.state,
                onObservationsChanged: () => {
                    if (
                        this.navigation?.activeView
                            === "services"
                    ) {
                        this.services.render();
                    }
                },
                onDashboardRefresh: () => {
                    this.dashboard
                        .renderKpis();
                },
            });

        this.navigation =
            new NavigationController({
                defaultView: "overview",
            });

        this.websocket =
            new WebSocketController({
                onMessage:
                    this.handleRealtimeMessage,
            });
    }

    /**
     * Bind application-level events.
     */
    bindApplicationEvents() {
        this.elements.refreshButton
            ?.addEventListener(
                "click",
                () => {
                    void this.refresh();
                },
            );

        document.addEventListener(
            "ohana:navigation-changed",
            this.handleNavigationChanged,
        );
    }

    /**
     * Initialize controllers that expose lifecycle methods.
     */
    initializeControllers() {
        this.deviceDetails.initialize();
        this.configuration.initialize();
        this.services.initialize();
        this.topology.initialize();
        this.timeline.initialize();

        /*
         * Navigation is initialized last because it emits
         * an initial navigation-changed event.
         */
        this.navigation.initialize();
    }

    /**
     * Handle a navigation change.
     *
     * @param {CustomEvent} event
     */
    handleNavigationChanged(event) {
        const viewName =
            event.detail?.view;

        if (!viewName) {
            return;
        }

        this.dashboard.updateViewHeader(
            viewName,
        );

        this.timeline.setCompactMode(
            viewName === "overview",
        );

        if (
            viewName === "overview"
            || viewName === "infrastructure"
        ) {
            this.topology.reflow();
        }

        if (viewName === "services") {
            void this.services.load();
        }

        if (
            this.initialDataLoaded
            && new Set([
                "overview",
                "infrastructure",
                "services",
                "timeline",
                "observations",
            ]).has(viewName)
        ) {
            this.scheduleObservationRefresh();
        }

        if (viewName.startsWith("configuration-")) {
            this.configuration.activateSection(
                viewName.replace(
                    "configuration-",
                    "",
                ),
            );
            void this.configuration.load();
        }
    }

    /**
     * Refresh only the resources affected by one realtime event.
     *
     * Observation events are frequent. They must not reload the
     * topology definition or the administration editor because that
     * would rebuild the canvas and overwrite an in-progress draft.
     *
     * @param {object} message
     */
    handleRealtimeMessage(message) {
        if (
            message.type
                === "observation.accepted"
        ) {
            this.scheduleObservationRefresh();
            return;
        }

        if (
            message.type
                === "infrastructure.updated"
        ) {
            void this.refreshInfrastructure();
        }
    }

    scheduleObservationRefresh() {
        if (this.observationRefreshInFlight) {
            this.observationRefreshPending = true;
            return;
        }

        if (this.observationRefreshTimer) {
            return;
        }

        this.observationRefreshTimer = window.setTimeout(
            () => {
                this.observationRefreshTimer = null;
                void this.refreshObservationState();
            },
            750,
        );
    }

    /**
     * Refresh runtime data produced by a new observation.
     */
    async refreshObservationState() {
        if (this.observationRefreshInFlight) {
            this.observationRefreshPending = true;
            return;
        }

        this.observationRefreshInFlight = true;
        this.setRefreshing(true);

        try {
            const activeView =
                this.navigation?.activeView
                ?? "overview";
            const operations = [];

            if (activeView === "overview") {
                operations.push(
                    this.loadRuntime(),
                    this.loadObservations(),
                    this.loadTimeline({
                        force: true,
                    }),
                );
            } else if (activeView === "infrastructure") {
                operations.push(
                    this.loadObservations(),
                    this.loadTimeline({
                        force: true,
                    }),
                );
            } else if (
                activeView === "services"
            ) {
                operations.push(
                    this.loadObservations(),
                    this.loadTimeline({
                        force: true,
                    }),
                );
            } else if (activeView === "observations") {
                operations.push(
                    this.loadObservations(),
                );
            } else if (activeView === "timeline") {
                operations.push(
                    this.loadTimeline({
                        force: true,
                    }),
                );
            }

            if (operations.length > 0) {
                await Promise.allSettled(operations);
            }

            if (
                activeView === "overview"
                || activeView === "infrastructure"
            ) {
                await this.topology.refreshStatus();
            }

            if (operations.length > 0) {
                this.renderLastRefresh();
            }
        } finally {
            this.setRefreshing(false);
            this.observationRefreshInFlight = false;

            if (this.observationRefreshPending) {
                this.observationRefreshPending = false;
                this.scheduleObservationRefresh();
            }
        }
    }

    /**
     * Reload the topology only when Agent announces a new snapshot.
     */
    async refreshInfrastructure() {
        this.setRefreshing(true);

        try {
            this.services.invalidate();

            const operations = [
                this.topology.load(),
            ];

            if (
                this.navigation?.activeView
                    === "services"
            ) {
                operations.push(
                    this.services.load({
                        force: true,
                    }),
                );
            }

            await Promise.allSettled(operations);
            this.renderLastRefresh();
        } finally {
            this.setRefreshing(false);
        }
    }

    /**
     * Refresh all backend-backed frontend data.
     */
    async refresh() {
        this.setRefreshing(true);

        try {
            const dataOperations = [
                this.loadRuntime(),
                this.loadObservations(),
                this.loadTimeline({
                    force: true,
                }),
                this.loadAgentVersion(),
            ];

            if (
                this.navigation.activeView
                    === "services"
            ) {
                dataOperations.push(
                    this.services.load({
                        force: true,
                    }),
                );
            }

            if (
                this.navigation.activeView
                    ?.startsWith(
                        "configuration-",
                    )
                && this.configuration.loaded
            ) {
                dataOperations.push(
                    this.configuration.reload(),
                );
            }

            await Promise.allSettled(
                dataOperations,
            );
            await this.topology.load();

            if (
                this.navigation.activeView
                    === "services"
            ) {
                this.services.render();
            }

            this.renderLastRefresh();
            this.initialDataLoaded = true;
        } finally {
            this.setRefreshing(false);
        }
    }

    /**
     * Load the version exposed by the running Vision backend.
     */
    async loadVisionVersion() {
        if (!this.elements.visionVersion) {
            return;
        }

        try {
            const payload = await fetchJson(
                API.version,
            );
            const version = String(
                payload?.version
                ?? "",
            ).trim();

            this.elements.visionVersion.textContent =
                version && version !== "unknown"
                    ? `v${version}`
                    : "inconnue";
        } catch {
            this.elements.visionVersion.textContent =
                "indisponible";
        }
    }

    /**
     * Load the version exposed by Ohana-Agent administration.
     */
    async loadAgentVersion() {
        if (!this.elements.agentVersion) {
            return;
        }

        try {
            const capabilities = await fetchJson(
                API.administrationCapabilities,
            );
            const version = String(
                capabilities?.agent_version
                ?? "",
            ).trim();

            this.elements.agentVersion.textContent =
                version && version !== "unknown"
                    ? `v${version}`
                    : "inconnue";
        } catch {
            this.elements.agentVersion.textContent =
                "indisponible";
        }
    }

    /**
     * Load runtime information.
     */
    async loadRuntime() {
        try {
            const runtime = await fetchJson(
                API.runtime,
            );

            this.dashboard.renderRuntime(
                runtime,
            );
        } catch (error) {
            this.dashboard.showRuntimeError(
                "Runtime indisponible : "
                + this.errorMessage(error),
            );
        }
    }

    /**
     * Load stored observations.
     */
    async loadObservations() {
        try {
            const observations =
                await fetchJson(
                    `${API.observations}?limit=100`,
                );

            this.observations.render(
                observations,
            );
        } catch (error) {
            this.observations.showError(
                "Observations indisponibles : "
                + this.errorMessage(error),
            );
        }
    }

    /**
     * Load infrastructure timeline.
     */
    async loadTimeline({force = false} = {}) {
        const now = Date.now();

        if (
            !force
            && this.timelineLastLoadedAt > 0
            && now - this.timelineLastLoadedAt
                < this.timelineRefreshIntervalMs
        ) {
            return;
        }

        if (this.timelineLoadInFlight) {
            await this.timelineLoadInFlight;
            return;
        }

        this.timelineLoadInFlight = (async () => {
            try {
                const since = new Date(
                    Date.now()
                    - this.timelineHistoryHours
                    * 60
                    * 60
                    * 1000,
                ).toISOString();
                const timeline =
                    await fetchJson(
                        `${API.timeline}?since=${encodeURIComponent(
                            since,
                        )}`,
                    );

                setTimeline(
                    timeline,
                );
                this.timelineLastLoadedAt = Date.now();
                this.timeline.render();
                this.deviceDetails.refresh();
                if (
                    this.navigation?.activeView
                        === "services"
                ) {
                    this.services.render();
                }
            } catch (error) {
                setTimeline(
                    null,
                );

                this.timeline.renderError(
                    "Timeline indisponible : "
                    + this.errorMessage(error),
                );
                this.timelineLastLoadedAt = Date.now();
            }
        })();

        try {
            await this.timelineLoadInFlight;
        } finally {
            this.timelineLoadInFlight = null;
        }
    }

    /**
     * Enable or disable the manual refresh button.
     *
     * @param {boolean} isRefreshing
     */
    setRefreshing(isRefreshing) {
        if (!this.elements.refreshButton) {
            return;
        }

        this.elements.refreshButton.disabled =
            isRefreshing;
    }

    /**
     * Render the latest refresh date.
     */
    renderLastRefresh() {
        if (!this.elements.lastRefresh) {
            return;
        }

        this.elements.lastRefresh.textContent =
            "Dernière actualisation : "
            + formatDate(
                new Date().toISOString(),
            );
    }

    /**
     * Normalize an unknown caught error.
     *
     * @param {unknown} error
     * @returns {string}
     */
    errorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}
