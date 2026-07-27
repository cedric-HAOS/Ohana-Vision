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
        this.timeline = null;
        this.topology = null;
        this.websocket = null;

        this.elements = {
            refreshButton:
                document.querySelector(
                    "#refresh-button",
                ),
            lastRefresh:
                document.querySelector(
                    "#last-refresh",
                ),
        };

        this.handleNavigationChanged =
            this.handleNavigationChanged.bind(
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

        this.observations =
            new ObservationsController({
                state: this.state,
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
                onMessage: () => {
                    void this.refresh();
                },
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

        if (
            viewName === "overview"
            || viewName === "infrastructure"
        ) {
            this.topology.reflow();
        }

        if (viewName === "configuration") {
            void this.configuration.load();
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
                this.loadTimeline(),
            ];

            if (
                this.navigation.activeView
                    === "configuration"
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

            this.renderLastRefresh();
        } finally {
            this.setRefreshing(false);
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
                    API.observations,
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
    async loadTimeline() {
        try {
            const timeline =
                await fetchJson(
                    API.timeline,
                );

            setTimeline(
                timeline,
            );
            this.timeline.render();
            this.deviceDetails.refresh();
        } catch (error) {
            setTimeline(
                null,
            );

            this.timeline.renderError(
                "Timeline indisponible : "
                + this.errorMessage(error),
            );
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
