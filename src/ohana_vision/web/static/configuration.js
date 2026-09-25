"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

import {
    hideError,
    showError,
} from "./utils.js";

import {
    agentSupportsDistributedJobs,
    normalizePluginPresentation,
} from "./configuration/shared.js";

import { WorkersMethods } from "./configuration/workers.js";
import { CompanionsMethods } from "./configuration/companions.js";
import { NetworkMethods } from "./configuration/network.js";
import { DhcpMethods } from "./configuration/dhcp.js";
import { ArchitectureViewMethods } from "./configuration/architecture_view.js";
import { ArchitectureEditorMethods } from "./configuration/architecture_editor.js";
import { PluginsMethods } from "./configuration/plugins.js";

/**
 * Controls graphical infrastructure administration.
 */
export class ConfigurationController {
    constructor() {
        this.network = null;
        this.networkAvailable = false;
        this.networkLoadError = null;
        this.dhcp = null;
        this.dhcpAvailable = false;
        this.dhcpLoadError = null;
        this.infrastructure = null;
        this.liveTopology = null;
        this.plugins = [];
        this.pluginsAvailable = false;
        this.pluginsLoadError = null;
        this.workerPairings = [];
        this.workers = [];
        this.workerPairingsAvailable = false;
        this.workerPairingsLoadError = null;
        this.workerWakeOnLan = null;
        this.workerWakeOnLanAvailable = false;
        this.workerWakeWriteAvailable = false;
        this.workerWakeAvailable = false;
        this.workerWakeOnLanLoadError = null;
        this.tsunadeLogPolicy = null;
        this.tsunadeLogPolicyAvailable = false;
        this.tsunadeLogPolicyWriteAvailable = false;
        this.tsunadeLogPolicyLoadError = null;
        this.workerAvailabilityRefreshTimer = null;
        this.workerAvailabilityRefreshDeadline = 0;
        this.workerAvailabilityRefreshIntervalMs = 5000;
        this.companionPairings = [];
        this.companions = [];
        this.companionsAvailable = false;
        this.companionsLoadError = null;
        this.selectedPluginId = null;
        this.pluginFormDirty = false;
        this.loaded = false;
        this.selectedArchitectureItem = null;
        this.architectureInteractionMode = "move";
        this.pendingLinkSource = null;
        this.draggedArchitectureDevice = null;
        this.architectureViewport = {
            scale: 1,
            x: 0,
            y: 0,
        };
        this.architectureViewportInitialized = false;
        this.architecturePanning = false;
        this.architecturePanStart = null;
        this.architecturePanMoved = false;

        this.elements = this.findElements();
    }

    findElements() {
        const byId = (id) =>
            document.getElementById(id);

        return {
            error: byId("configuration-error"),
            notice: byId("configuration-notice"),
            networkForm: byId("network-settings-form"),
            networkMethod: byId("network-method"),
            networkConfirm: byId("network-confirm"),
            networkRollback: byId("network-rollback"),
            networkPendingChange: byId("network-pending-change"),
            networkPendingActions: byId("network-pending-actions"),
            networkManualFields: Array.from(
                document.querySelectorAll(".network-manual-field"),
            ),
            panels: Array.from(
                document.querySelectorAll(
                    "[data-configuration-panel]",
                ),
            ),
            dhcpServer: byId("dhcp-server"),
            dhcpRangeSummary:
                byId("dhcp-range-summary"),
            dhcpLeaseDurationSummary:
                byId(
                    "dhcp-lease-duration-summary",
                ),
            dhcpActiveLeasesCount:
                byId("dhcp-active-leases-count"),
            dhcpReservationsCount:
                byId("dhcp-reservations-count"),
            dhcpTable:
                byId("dhcp-reservations-table"),
            dhcpSettingsForm:
                byId("dhcp-settings-form"),
            dhcpAddReservation:
                byId("dhcp-add-reservation"),
            dhcpReservationDialog:
                byId("dhcp-reservation-dialog"),
            dhcpReservationForm:
                byId("dhcp-reservation-form"),
            dhcpReservationHostname:
                byId("dhcp-reservation-hostname"),
            dhcpReservationDialogTitle:
                byId(
                    "dhcp-reservation-dialog-title",
                ),
            dhcpReservationClose:
                byId("dhcp-reservation-close"),
            dhcpReservationCancel:
                byId("dhcp-reservation-cancel"),
            architectureBoard:
                byId("architecture-board"),
            architectureAddDevice:
                byId("architecture-add-device"),
            architectureDiscoveryNotice:
                byId("architecture-discovery-notice"),
            architectureDiscoveryCount:
                byId("architecture-discovery-count"),
            architecturePositionDiscovered:
                byId("architecture-position-discovered"),
            architectureModeMove:
                byId("architecture-mode-move"),
            architectureModeLink:
                byId("architecture-mode-link"),
            architectureModeStatus:
                byId("architecture-mode-status"),
            architectureZoomIn:
                byId("architecture-zoom-in"),
            architectureZoomOut:
                byId("architecture-zoom-out"),
            architectureZoomReset:
                byId("architecture-zoom-reset"),
            architectureDeviceServices:
                byId("architecture-device-services"),
            architectureAddServiceToDevice:
                byId(
                    "architecture-add-service-to-device",
                ),
            architectureForm:
                byId("architecture-editor-form"),
            architectureEditorKind:
                byId("architecture-editor-kind"),
            architectureEditorTitle:
                byId("architecture-editor-title"),
            architectureEditorId:
                byId("architecture-editor-id"),
            architectureEditorMode:
                byId("architecture-editor-mode"),
            architectureDeviceFields:
                byId("architecture-device-fields"),
            architectureServiceFields:
                byId("architecture-service-fields"),
            architectureLinkFields:
                byId("architecture-link-fields"),
            architectureEditorActions:
                byId("architecture-editor-actions"),
            architectureDelete:
                byId("architecture-delete"),
            architectureApply:
                byId("architecture-apply"),
            pluginCards: byId("plugin-cards"),
            pluginCount: byId("plugin-count"),
            pluginInspectorEmpty:
                byId("plugin-inspector-empty"),
            pluginForm:
                byId("plugin-configuration-form"),
            pluginInspectorContent:
                byId("plugin-inspector-content"),
            pluginTest: byId("plugin-test"),
            pluginTestResult:
                byId("plugin-test-result"),
            workerPairingsTable:
                byId("worker-pairings-table"),
            workerPairingsPendingCount:
                byId("worker-pairings-pending-count"),
            workerPairingsRefresh:
                byId("worker-pairings-refresh"),
            workersTable: byId("workers-table"),
            workerAvailabilitySummary:
                byId("worker-availability-summary"),
            workerWakeSummary:
                byId("worker-wake-summary"),
            workerWakeEnabled:
                byId("worker-wake-enabled"),
            workerWakeBroadcast:
                byId("worker-wake-broadcast"),
            workerWakePort:
                byId("worker-wake-port"),
            workerWakeTimeout:
                byId("worker-wake-timeout"),
            workerWakeHeartbeat:
                byId("worker-wake-heartbeat"),
            workerWakePolicyNotice:
                byId("worker-wake-policy-notice"),
            workerWakeToggle:
                byId("worker-wake-toggle"),
            tsunadeLogPolicyNotice:
                byId("tsunade-log-policy-notice"),
            tsunadeLogEnabled:
                byId("tsunade-log-enabled"),
            tsunadeLogTime:
                byId("tsunade-log-time"),
            tsunadeLogWindowHours:
                byId("tsunade-log-window-hours"),
            tsunadeLogMaxMiB:
                byId("tsunade-log-max-mib"),
            tsunadeLogTimeout:
                byId("tsunade-log-timeout"),
            tsunadeLogSources:
                byId("tsunade-log-sources"),
            tsunadeLogSave:
                byId("tsunade-log-save"),
            companionPairingsTable:
                byId("companion-pairings-table"),
            companionPairingsPendingCount:
                byId("companion-pairings-pending-count"),
            companionPairingsRefresh:
                byId("companion-pairings-refresh"),
            companionsTable: byId("companions-table"),
        };
    }

    initialize() {
        this.elements.networkForm
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    void this.saveNetworkSettings();
                },
            );
        this.elements.networkMethod
            ?.addEventListener(
                "change",
                () => this.updateNetworkMethodFields(),
            );
        this.elements.networkConfirm
            ?.addEventListener(
                "click",
                () => void this.confirmNetworkChange(),
            );
        this.elements.networkRollback
            ?.addEventListener(
                "click",
                () => void this.rollbackNetworkChange(),
            );
        this.elements.workerPairingsRefresh
            ?.addEventListener(
                "click",
                () => void this.refreshWorkerPairings(),
            );
        this.elements.workerPairingsTable
            ?.addEventListener(
                "click",
                (event) => {
                    const button = event.target.closest(
                        "[data-worker-pairing-action]",
                    );
                    if (button) {
                        void this.decideWorkerPairing(
                            button.dataset.workerPairingId,
                            button.dataset.workerPairingAction,
                        );
                    }
                },
            );
        this.elements.workersTable
            ?.addEventListener("click", (event) => {
                const button = event.target.closest(
                    "[data-worker-wake]",
                );
                if (button) {
                    void this.testWorkerWake(button.dataset.workerWake);
                }
            });
        this.elements.workerWakeToggle
            ?.addEventListener(
                "click",
                () => void this.toggleWakeOnLan(),
            );
        this.elements.tsunadeLogSave
            ?.addEventListener(
                "click",
                () => void this.saveTsunadeLogPolicy(),
            );
        this.elements.companionPairingsRefresh
            ?.addEventListener(
                "click",
                () => void this.refreshCompanions(),
            );
        this.elements.companionPairingsTable
            ?.addEventListener("click", (event) => {
                const button = event.target.closest(
                    "[data-companion-pairing-action]",
                );
                if (button) {
                    void this.decideCompanionPairing(
                        button.dataset.companionPairingId,
                        button.dataset.companionPairingAction,
                    );
                }
            });
        this.elements.companionsTable
            ?.addEventListener("click", (event) => {
                const button = event.target.closest(
                    "[data-companion-revoke]",
                );
                if (button) {
                    void this.revokeCompanion(button.dataset.companionRevoke);
                }
            });

        this.elements.dhcpSettingsForm
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    void this.saveDHCPSettings();
                },
            );

        this.elements.dhcpAddReservation
            ?.addEventListener(
                "click",
                () => {
                    this.openReservation();
                },
            );

        this.elements.dhcpReservationForm
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    void this.saveReservation();
                },
            );

        this.elements.dhcpReservationHostname
            ?.addEventListener(
                "input",
                () => {
                    this.validateReservationHostname();
                },
            );

        this.elements.dhcpReservationClose
            ?.addEventListener(
                "click",
                () => this.closeReservation(),
            );
        this.elements.dhcpReservationCancel
            ?.addEventListener(
                "click",
                () => this.closeReservation(),
            );

        this.elements.dhcpTable
            ?.addEventListener(
                "click",
                (event) => {
                    this.handleDHCPTableClick(event);
                },
            );

        this.elements.architectureBoard
            ?.addEventListener(
                "click",
                (event) => {
                    this.handleArchitectureClick(event);
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "wheel",
                (event) => {
                    this.handleArchitectureWheel(event);
                },
                {passive: false},
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "pointerdown",
                (event) => {
                    this.handleArchitecturePointerDown(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "pointermove",
                (event) => {
                    this.handleArchitecturePointerMove(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "pointerup",
                (event) => {
                    this.handleArchitecturePointerUp(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "pointercancel",
                (event) => {
                    this.handleArchitecturePointerUp(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "dragstart",
                (event) => {
                    this.handleArchitectureDragStart(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "dragover",
                (event) => {
                    this.handleArchitectureDragOver(
                        event,
                    );
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "drop",
                (event) => {
                    this.handleArchitectureDrop(event);
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "dragend",
                () => {
                    this.draggedArchitectureDevice =
                        null;
                },
            );
        this.elements.architectureBoard
            ?.addEventListener(
                "keydown",
                (event) => {
                    const link = event.target.closest(
                        "[data-architecture-link]",
                    );

                    if (
                        link
                        && (
                            event.key === "Enter"
                            || event.key === " "
                        )
                    ) {
                        event.preventDefault();
                        this.editLink(
                            link.dataset
                                .architectureLink,
                        );
                    }
                },
            );

        this.elements.architectureAddDevice
            ?.addEventListener(
                "click",
                () => this.editNewDevice(),
            );
        this.elements.architecturePositionDiscovered
            ?.addEventListener(
                "click",
                () => this.positionDiscoveredDevices(),
            );
        this.elements.architectureModeMove
            ?.addEventListener(
                "click",
                () => this.setArchitectureMode(
                    "move",
                ),
            );
        this.elements.architectureModeLink
            ?.addEventListener(
                "click",
                () => this.setArchitectureMode(
                    "link",
                ),
            );
        this.elements.architectureZoomIn
            ?.addEventListener(
                "click",
                () => this.zoomArchitecture(1.2),
            );
        this.elements.architectureZoomOut
            ?.addEventListener(
                "click",
                () => this.zoomArchitecture(1 / 1.2),
            );
        this.elements.architectureZoomReset
            ?.addEventListener(
                "click",
                () => this.fitArchitectureViewport(),
            );
        this.elements.architectureAddServiceToDevice
            ?.addEventListener(
                "click",
                () => {
                    this.editNewServiceForSelection();
                },
            );
        document.getElementById(
            "architecture-device-address",
        )?.addEventListener(
            "input",
            () => {
                this.updateNetworkPresenceControl();
            },
        );
        document.getElementById(
            "architecture-device-monitoring-schedule-enabled",
        )?.addEventListener(
            "change",
            () => this.updateMonitoringScheduleFields(),
        );
        document.getElementById(
            "architecture-service-type",
        )?.addEventListener(
            "change",
            () => {
                this.updateServiceSpecificFields();
            },
        );
        this.elements.architectureDeviceServices
            ?.addEventListener(
                "click",
                (event) => {
                    const button = event.target.closest(
                        "[data-architecture-service]",
                    );

                    if (button) {
                        this.editService(
                            button.dataset
                                .architectureService,
                        );
                    }
                },
            );

        this.elements.architectureForm
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    this.saveArchitectureItem();
                },
            );
        this.elements.architectureDelete
            ?.addEventListener(
                "click",
                () => this.deleteArchitectureItem(),
            );
        this.elements.architectureApply
            ?.addEventListener(
                "click",
                () => {
                    void this.applyArchitecture();
                },
            );

        this.elements.pluginCards
            ?.addEventListener(
                "click",
                (event) => {
                    const card = event.target.closest(
                        "[data-plugin-id]",
                    );

                    if (card) {
                        this.selectPlugin(
                            card.dataset.pluginId,
                        );
                    }
                },
            );
        this.elements.pluginForm
            ?.addEventListener(
                "submit",
                (event) => {
                    event.preventDefault();
                    void this.savePluginConfiguration();
                },
            );
        for (const eventName of ["input", "change"]) {
            this.elements.pluginForm
                ?.addEventListener(
                    eventName,
                    (event) => {
                        if (
                            event.target?.id?.startsWith(
                                "plugin-backup-icloud-",
                            )
                        ) {
                            return;
                        }
                        this.pluginFormDirty = true;
                    },
                );
        }
        this.elements.pluginTest
            ?.addEventListener(
                "click",
                () => {
                    void this.testSelectedPlugin();
                },
            );
    }

    async load() {
        if (this.loaded) {
            return;
        }

        hideError(this.elements.error);

        try {
            const capabilities = await fetchJson(
                API.administrationCapabilities,
            );
            const operations =
                capabilities.operations ?? [];

            if (
                !operations.includes(
                    "infrastructure.read",
                )
            ) {
                throw new Error(
                    "Agent n’expose pas les capacités "
                    + "d’administration de "
                    + "l’architecture.",
                );
            }

            this.infrastructure = await fetchJson(
                API.administrationInfrastructure,
            );
            this.architectureViewportInitialized = false;
            this.liveTopology = null;

            try {
                this.liveTopology = await fetchJson(
                    API.topology,
                );
            } catch (error) {
                this.showNotice(
                    "Les équipements découverts sont "
                    + "temporairement indisponibles : "
                    + this.errorMessage(error),
                );
            }
            this.dhcp = null;
            this.dhcpAvailable = operations.includes(
                "dhcp.read",
            );
            this.dhcpLoadError = null;

            if (this.dhcpAvailable) {
                try {
                    this.dhcp = await fetchJson(
                        API.administrationDHCP,
                    );
                } catch (error) {
                    this.dhcpLoadError =
                        this.errorMessage(error);
                    this.showNotice(
                        "Le serveur DHCP est "
                        + "temporairement indisponible. "
                        + "La page DHCP reste accessible : "
                        + this.dhcpLoadError,
                    );
                }
            } else {
                this.dhcpLoadError =
                    "Ohana-Agent n’expose pas "
                    + "l’administration DHCP dans "
                    + "cet environnement.";
                this.showNotice(
                    this.dhcpLoadError
                    + " L’architecture reste "
                    + "modifiable.",
                );
            }

            this.network = null;
            this.networkAvailable = operations.includes(
                "system.network.read",
            );
            this.networkLoadError = null;

            if (this.networkAvailable) {
                try {
                    this.network = await fetchJson(
                        API.administrationNetwork,
                    );
                } catch (error) {
                    this.networkLoadError = this.errorMessage(error);
                }
            } else {
                this.networkLoadError =
                    "NetworkManager n’est pas administrable dans cet environnement.";
            }

            this.plugins = [];
            this.pluginsAvailable = operations.includes(
                "plugins.read",
            );
            this.pluginsLoadError = null;

            if (this.pluginsAvailable) {
                try {
                    const pluginsPayload =
                        await fetchJson(
                            API.administrationPlugins,
                        );
                    this.plugins = (
                        pluginsPayload.plugins ?? []
                    ).map(normalizePluginPresentation);
                } catch (error) {
                    this.pluginsLoadError =
                        this.errorMessage(error);
                }
            }

            this.workerPairings = [];
            this.workerPairingsAvailable = operations.includes(
                "jobs.workers.pairings.read",
            );
            this.workerWakeOnLanAvailable = operations.includes(
                "jobs.wake_on_lan.read",
            );
            this.workerWakeWriteAvailable = operations.includes(
                "jobs.wake_on_lan.write",
            );
            this.workerWakeAvailable = operations.includes(
                "jobs.workers.wake",
            );
            this.tsunadeLogPolicyAvailable = operations.includes(
                "incidents.logs.read",
            );
            this.tsunadeLogPolicyWriteAvailable = operations.includes(
                "incidents.logs.write",
            );
            this.workerPairingsLoadError = null;
            this.workerWakeOnLanLoadError = null;
            this.workerWakeOnLan = null;
            this.tsunadeLogPolicyLoadError = null;
            this.tsunadeLogPolicy = null;
            if (this.workerPairingsAvailable) {
                try {
                    const [pairingPayload, workersPayload] = await Promise.all([
                        fetchJson(API.administrationWorkerPairings),
                        fetchJson(API.administrationWorkers),
                    ]);
                    this.workerPairings = pairingPayload.pairings ?? [];
                    this.workers = workersPayload.workers ?? [];
                } catch (error) {
                    this.workerPairingsLoadError = this.errorMessage(error);
                }
            } else {
                this.workerPairingsLoadError = agentSupportsDistributedJobs(
                    capabilities.agent_version,
                )
                    ? "Les jobs distribués Katsuyu sont désactivés dans la configuration d’Agent."
                    : "Cette version d’Agent ne prend pas en charge l’appairage Katsuyu.";
            }

            if (this.workerWakeOnLanAvailable) {
                try {
                    this.workerWakeOnLan = await fetchJson(
                        API.administrationWakeOnLan,
                    );
                } catch (error) {
                    this.workerWakeOnLanLoadError = this.errorMessage(error);
                }
            } else {
                this.workerWakeOnLanLoadError =
                    "Cette version d’Agent n’expose pas encore la politique Wake-on-LAN.";
            }

            if (this.tsunadeLogPolicyAvailable) {
                try {
                    this.tsunadeLogPolicy = await fetchJson(
                        API.tsunadeLogPolicy,
                    );
                } catch (error) {
                    this.tsunadeLogPolicyLoadError = this.errorMessage(error);
                }
            } else {
                this.tsunadeLogPolicyLoadError =
                    "Cette version d’Agent n’expose pas encore la configuration des contrôles de journaux.";
            }

            this.companionPairings = [];
            this.companions = [];
            this.companionsAvailable = operations.includes(
                "companions.pairings.read",
            );
            this.companionsLoadError = null;
            if (this.companionsAvailable) {
                try {
                    const [pairings, companions] = await Promise.all([
                        fetchJson(API.administrationCompanionPairings),
                        fetchJson(API.administrationCompanions),
                    ]);
                    this.companionPairings = pairings.pairings ?? [];
                    this.companions = companions.devices ?? [];
                } catch (error) {
                    this.companionsLoadError = this.errorMessage(error);
                }
            } else {
                this.companionsLoadError =
                    "Le listener compagnon Shizune est désactivé dans Agent.";
            }

            this.loaded = true;
            this.renderNetwork();
            this.renderArchitecture();
            this.renderPlugins();
            this.renderWorkerPairings();
            this.renderWorkers();
            this.renderWakeOnLan();
            this.renderTsunadeLogPolicy();
            this.renderCompanions();

            if (this.dhcp) {
                this.renderDHCP();
            } else {
                this.renderDHCPUnavailable(
                    this.dhcpLoadError
                    ?? "Configuration DHCP indisponible.",
                );
            }
        } catch (error) {
            showError(
                this.elements.error,
                "Administration indisponible : "
                + this.errorMessage(error),
            );
        }
    }

    async reload() {
        this.loaded = false;
        await this.load();
    }

    activateSection(sectionName) {
        const availableSections = new Set(
            this.elements.panels.map(
                (panel) =>
                    panel.dataset.configurationPanel,
            ),
        );

        if (!availableSections.has(sectionName)) {
            return false;
        }

        this.elements.panels.forEach((panel) => {
            panel.hidden =
                panel.dataset.configurationPanel
                !== sectionName;
        });

        if (sectionName === "architecture") {
            window.requestAnimationFrame(() => {
                if (!this.architectureViewportInitialized) {
                    this.fitArchitectureViewport();
                } else {
                    this.applyArchitectureViewport();
                }
            });
        }

        if (
            sectionName === "network"
            && this.loaded
            && this.networkAvailable
        ) {
            void this.refreshNetwork();
        }

        if (
            sectionName === "workers"
            && this.loaded
        ) {
            if (this.workerPairingsAvailable) {
                void this.refreshWorkerPairings();
            }
            if (this.companionsAvailable) {
                void this.refreshCompanions();
            }
        }

        if (
            sectionName === "plugins"
            && this.loaded
            && this.pluginsAvailable
        ) {
            void this.refreshPlugins();
        }

        return true;
    }

    showNotice(message) {
        if (!this.elements.notice) {
            return;
        }

        this.elements.notice.textContent = message;
        this.elements.notice.classList.remove(
            "hidden",
        );
    }

    uniqueId(baseId, items) {
        const normalizedBase =
            baseId || "element";
        const identifiers = new Set(
            items.map((item) => item.id),
        );

        if (!identifiers.has(normalizedBase)) {
            return normalizedBase;
        }

        let suffix = 2;

        while (
            identifiers.has(
                `${normalizedBase}-${suffix}`,
            )
        ) {
            suffix += 1;
        }

        return `${normalizedBase}-${suffix}`;
    }

    slugify(value) {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    value(id) {
        return document.getElementById(id)
            ?.value.trim() ?? "";
    }

    listValue(id) {
        return this.value(id)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = String(value ?? "");
        }
    }

    setValue(id, value) {
        const element =
            document.getElementById(id);

        if (element) {
            element.value = String(
                value ?? "",
            );
        }
    }

    checked(id) {
        return document.getElementById(id)
            ?.checked ?? false;
    }

    setChecked(id, checked) {
        const element =
            document.getElementById(id);

        if (element) {
            element.checked = Boolean(checked);
        }
    }

    errorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}

Object.assign(
    ConfigurationController.prototype,
    WorkersMethods,
    CompanionsMethods,
    NetworkMethods,
    DhcpMethods,
    ArchitectureViewMethods,
    ArchitectureEditorMethods,
    PluginsMethods,
);
