"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "./api.js";

import {
    deviceIconPath,
    escapeHtml,
    hideError,
    showError,
} from "./utils.js";

const DHCP_CATEGORY_LABELS = Object.freeze({
    infrastructure: "Infrastructure",
    servers: "Serveurs",
    network: "Réseau",
    home_automation: "Domotique",
    critical: "Critique",
});

const ARCHITECTURE_MINIMUM_COLUMNS = 15;
const ARCHITECTURE_MINIMUM_ROWS = 10;
const DNS_NAME_PATTERN =
    /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]+(?:\.(?!-)[A-Za-z0-9-]+)*$/;
const BACKUP_WEEKDAYS = Object.freeze([
    ["0", "Lundi"],
    ["1", "Mardi"],
    ["2", "Mercredi"],
    ["3", "Jeudi"],
    ["4", "Vendredi"],
    ["5", "Samedi"],
    ["6", "Dimanche"],
]);
const BACKUP_MONTH_DAYS = Object.freeze(
    Array.from(
        {length: 31},
        (_, index) => String(index + 1),
    ),
);

function formatTlsFingerprint(value) {
    const normalized = String(value ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
        return "Empreinte indisponible";
    }
    return normalized.match(/.{2}/g).join(":").toUpperCase();
}

function agentSupportsDistributedJobs(value) {
    const parts = String(value ?? "").split(".").map(Number);
    return parts.length >= 2
        && Number.isInteger(parts[0])
        && Number.isInteger(parts[1])
        && (parts[0] > 1 || (parts[0] === 1 && parts[1] >= 16));
}


const SERVICE_PORT_POLICIES = Object.freeze({
    dhcp: { mode: "hidden", defaultPort: null },
    dns: { mode: "hidden", defaultPort: null },
    mqtt: { mode: "optional", defaultPort: 1883 },
    ntp: { mode: "optional", defaultPort: 123 },
    home_assistant: { mode: "hidden", defaultPort: 8123 },
    home_assistant_telemetry: { mode: "hidden", defaultPort: null },
    shelly_telemetry: { mode: "hidden", defaultPort: null },
    teleinformation: { mode: "hidden", defaultPort: null },
    zwave: { mode: "optional", defaultPort: 3000 },
    wireguard: { mode: "optional", defaultPort: null },
    http: { mode: "optional", defaultPort: 80 },
    https: { mode: "optional", defaultPort: 443 },
    other: { mode: "optional", defaultPort: null },
});

function isIpv4Address(value) {
    const parts = value.split(".");
    return parts.length === 4
        && parts.every((part) => {
            if (!/^\d{1,3}$/.test(part)) {
                return false;
            }
            const number = Number(part);
            return number >= 0 && number <= 255;
        });
}

function isDnsHostname(value) {
    const normalized = value.trim().replace(/\.$/, "");
    return DNS_NAME_PATTERN.test(normalized)
        && normalized.split(".").every((label) => label.length <= 63);
}

function endpointTypeForAddress(value) {
    return isIpv4Address(value.trim()) ? "ip" : "hostname";
}

function servicePortPolicy(type) {
    return SERVICE_PORT_POLICIES[type]
        ?? SERVICE_PORT_POLICIES.other;
}

function isHomeAssistantTelemetryPlugin(plugin) {
    return [
        "home_assistant_telemetry",
        "shelly_telemetry",
    ].includes(plugin?.id);
}

function normalizePluginPresentation(plugin) {
    if (plugin?.id !== "shelly_telemetry") {
        return plugin;
    }

    return {
        ...plugin,
        name: "Télémétrie Home Assistant",
    };
}

const PLUGIN_STATUS_LABELS = Object.freeze({
    active: "Actif",
    idle: "En attente",
    disabled: "Désactivé",
    degraded: "Dégradé",
    error: "En erreur",
});

const PLUGIN_ICONS = Object.freeze({
    backup: "/ui/assets/icons/administration/archive.svg",
    dhcp: "/ui/assets/icons/network/router.svg",
    dns: "/ui/assets/icons/network/globe-2.svg",
    ntp: "/ui/assets/icons/network/clock-3.svg",
    mqtt: "/ui/assets/icons/services/radio.svg",
    network: "/ui/assets/icons/infrastructure/network.svg",
    zwave: "/ui/assets/icons/protocols/zwave.svg",
    wireguard: "/ui/assets/icons/network/shield-check.svg",
    home_assistant_telemetry: "/ui/assets/icons/observability/activity.svg",
    shelly_telemetry: "/ui/assets/icons/observability/activity.svg",
    teleinformation: "/ui/assets/icons/observability/gauge.svg",
});

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

    async refreshWorkerPairings() {
        if (!this.workerPairingsAvailable) {
            this.renderWorkerPairings();
            return;
        }
        try {
            const [pairingPayload, workersPayload] = await Promise.all([
                fetchJson(API.administrationWorkerPairings),
                fetchJson(API.administrationWorkers),
            ]);
            this.workerPairings = pairingPayload.pairings ?? [];
            this.workers = workersPayload.workers ?? [];
            this.workerPairingsLoadError = null;
            if (this.workerWakeOnLanAvailable) {
                try {
                    this.workerWakeOnLan = await fetchJson(
                        API.administrationWakeOnLan,
                    );
                    this.workerWakeOnLanLoadError = null;
                } catch (error) {
                    this.workerWakeOnLanLoadError = this.errorMessage(error);
                }
            }
            if (this.tsunadeLogPolicyAvailable) {
                try {
                    this.tsunadeLogPolicy = await fetchJson(
                        API.tsunadeLogPolicy,
                    );
                    this.tsunadeLogPolicyLoadError = null;
                } catch (error) {
                    this.tsunadeLogPolicyLoadError = this.errorMessage(error);
                }
            }
            this.renderWorkerPairings();
            this.renderWorkers();
            this.renderWakeOnLan();
            this.renderTsunadeLogPolicy();
        } catch (error) {
            this.workerPairingsLoadError = this.errorMessage(error);
            this.renderWorkerPairings();
            this.renderWorkers();
            this.renderWakeOnLan();
            this.renderTsunadeLogPolicy();
        }
    }

    renderWorkerPairings() {
        const table = this.elements.workerPairingsTable;
        if (!table) {
            return;
        }
        const pending = this.workerPairings.filter(
            (pairing) => pairing.status === "PENDING",
        );
        if (this.elements.workerPairingsPendingCount) {
            this.elements.workerPairingsPendingCount.textContent =
                String(pending.length);
        }
        if (this.workerPairingsLoadError) {
            table.innerHTML = `<tr><td colspan="6">${escapeHtml(this.workerPairingsLoadError)}</td></tr>`;
            return;
        }
        if (!pending.length) {
            table.innerHTML = '<tr><td colspan="6">Aucune demande en attente.</td></tr>';
            return;
        }
        table.innerHTML = pending.map((pairing) => {
            const pairingId = escapeHtml(pairing.pairing_id);
            const capabilities = (pairing.capabilities ?? []).join(", ");
            const expiresAt = new Date(pairing.expires_at).toLocaleString("fr-FR");
            const fingerprint = formatTlsFingerprint(pairing.tls_ca_sha256);
            return `<tr>
                <td><strong>${escapeHtml(pairing.worker_id)}</strong><small>${escapeHtml(pairing.platform)} · ${escapeHtml(pairing.worker_version)}</small></td>
                <td><strong>${escapeHtml(pairing.verification_code)}</strong></td>
                <td><code class="configuration-table__fingerprint">${escapeHtml(fingerprint)}</code></td>
                <td>${escapeHtml(capabilities)}</td>
                <td>${escapeHtml(expiresAt)}</td>
                <td><span class="configuration-table__actions">
                    <button class="button" data-worker-pairing-action="approve" data-worker-pairing-id="${pairingId}" type="button">Autoriser</button>
                    <button class="configuration-danger-button" data-worker-pairing-action="reject" data-worker-pairing-id="${pairingId}" type="button">Refuser</button>
                </span></td>
            </tr>`;
        }).join("");
    }

    renderWakeOnLan() {
        const policy = this.workerWakeOnLan;
        const hasWakeMac = this.workers.some(
            (worker) => Boolean(worker.wake_on_lan_mac_address),
        );

        if (this.elements.workerWakePolicyNotice) {
            let message;

            if (this.workerWakeOnLanLoadError) {
                message = this.workerWakeOnLanLoadError;
            } else if (policy?.enabled) {
                message =
                    "Politique fournie par Agent/Tsunade. "
                    + "La MAC reste annoncée par Katsuyu.";
            } else if (!hasWakeMac) {
                message =
                    "Wake-on-LAN désactivé. Katsuyu doit d’abord "
                    + "annoncer une adresse MAC compatible WOL.";
            } else {
                message =
                    "Wake-on-LAN désactivé. "
                    + "Vous pouvez l’activer pour permettre à Tsunade "
                    + "de réveiller Katsuyu.";
            }

            this.elements.workerWakePolicyNotice.textContent = message;
        }

        if (this.elements.workerWakeEnabled) {
            this.elements.workerWakeEnabled.textContent = policy
                ? (policy.enabled ? "Activé" : "Désactivé")
                : "—";
        }

        if (this.elements.workerWakeBroadcast) {
            this.elements.workerWakeBroadcast.textContent =
                policy?.broadcast_address ?? "—";
        }

        if (this.elements.workerWakePort) {
            this.elements.workerWakePort.textContent =
                policy?.port ?? "—";
        }

        if (this.elements.workerWakeTimeout) {
            this.elements.workerWakeTimeout.textContent = policy
                ? `${policy.wait_timeout_seconds} s`
                : "—";
        }

        if (this.elements.workerWakeHeartbeat) {
            this.elements.workerWakeHeartbeat.textContent = policy
                ? `${policy.available_for_seconds} s`
                : "—";
        }

        const toggle = this.elements.workerWakeToggle;

        if (!toggle) {
            return;
        }

        if (!policy || !this.workerWakeWriteAvailable) {
            toggle.textContent = "Configuration indisponible";
            toggle.disabled = true;
            toggle.title =
                "Cette version d’Agent ne permet pas de modifier "
                + "la politique Wake-on-LAN.";
            return;
        }

        if (policy.enabled) {
            toggle.textContent = "Désactiver le Wake-on-LAN";
            toggle.disabled = false;
            toggle.title = "";
            return;
        }

        toggle.textContent = "Activer le Wake-on-LAN";
        toggle.disabled = !hasWakeMac;

        toggle.title = hasWakeMac
            ? ""
            : "Katsuyu doit d’abord annoncer une adresse MAC WOL.";
    }

    async toggleWakeOnLan() {
        const policy = this.workerWakeOnLan;

        if (
            !policy
            || !this.workerWakeWriteAvailable
        ) {
            return;
        }

        const enabled = !policy.enabled;

        if (enabled) {
            const hasWakeMac = this.workers.some(
                (worker) =>
                    Boolean(worker.wake_on_lan_mac_address),
            );

            if (!hasWakeMac) {
                showError(
                    this.elements.error,
                    "Impossible d’activer le Wake-on-LAN : "
                    + "aucun worker Katsuyu n’a encore annoncé "
                    + "d’adresse MAC WOL.",
                );
                return;
            }
        }

        const confirmation = enabled
            ? (
                "Activer le Wake-on-LAN ?\n\n"
                + "Tsunade pourra réveiller Bubule lorsqu’un job "
                + "nécessitant Katsuyu doit être exécuté."
            )
            : (
                "Désactiver le Wake-on-LAN ?\n\n"
                + "Tsunade ne pourra plus démarrer Bubule "
                + "automatiquement."
            );

        if (!window.confirm(confirmation)) {
            return;
        }

        hideError(this.elements.error);

        if (this.elements.workerWakeToggle) {
            this.elements.workerWakeToggle.disabled = true;
        }

        try {
            this.workerWakeOnLan = await requestJson(
                API.administrationWakeOnLan,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        enabled,
                    }),
                },
            );

            /*
            * Agent rend l'opération de réveil disponible
            * lorsque la politique WOL est active.
            *
            * Sans cette mise à jour locale, le bouton
            * "Tester le réveil" resterait indisponible
            * jusqu'au prochain rechargement complet.
            */
            this.workerWakeAvailable = enabled;

            this.renderWakeOnLan();
            this.renderWorkers();

            this.showNotice(
                enabled
                    ? (
                        "Wake-on-LAN activé. "
                        + "Tsunade peut maintenant réveiller Bubule."
                    )
                    : (
                        "Wake-on-LAN désactivé. "
                        + "Bubule ne sera plus réveillé automatiquement."
                    ),
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Impossible de modifier le Wake-on-LAN : "
                + this.errorMessage(error),
            );

            this.renderWakeOnLan();
        }
    }

    renderTsunadeLogPolicy() {
        const policy = this.tsunadeLogPolicy;
        const disabled =
            !policy
            || !this.tsunadeLogPolicyWriteAvailable;

        if (this.elements.tsunadeLogPolicyNotice) {
            this.elements.tsunadeLogPolicyNotice.textContent =
                this.tsunadeLogPolicyLoadError
                    ?? (
                        policy?.enabled
                            ? "Contrôle planifié par Agent/Tsunade."
                            : "Contrôle automatique désactivé."
                    );
        }

        if (this.elements.tsunadeLogEnabled) {
            this.elements.tsunadeLogEnabled.checked =
                policy?.enabled === true;
            this.elements.tsunadeLogEnabled.disabled = disabled;
        }

        if (this.elements.tsunadeLogTime) {
            const draft = this.backupScheduleDraft(
                policy?.schedule ?? "0 5 * * *",
            );
            this.elements.tsunadeLogTime.value = draft.time;
            this.elements.tsunadeLogTime.disabled = disabled;
        }

        if (this.elements.tsunadeLogWindowHours) {
            this.elements.tsunadeLogWindowHours.value =
                String(policy?.window_hours ?? 24);
            this.elements.tsunadeLogWindowHours.disabled = disabled;
        }

        if (this.elements.tsunadeLogMaxMiB) {
            this.elements.tsunadeLogMaxMiB.value = String(
                Math.max(
                    1,
                    Math.round(
                        (policy?.max_bytes_per_source ?? 2097152)
                        / 1048576,
                    ),
                ),
            );
            this.elements.tsunadeLogMaxMiB.disabled = disabled;
        }

        if (this.elements.tsunadeLogTimeout) {
            this.elements.tsunadeLogTimeout.value =
                String(policy?.timeout_seconds ?? 900);
            this.elements.tsunadeLogTimeout.disabled = disabled;
        }

        if (this.elements.tsunadeLogSources) {
            const selectedSources = new Set(
                policy?.sources ?? [],
            );
            const sources = policy?.sources?.length
                ? policy.sources
                : ["infra-01", "ha-01", "linky-01", "zwave-01"];
            this.elements.tsunadeLogSources.innerHTML = sources.map(
                (source) => `
                    <label class="configuration-check worker-log-source">
                        <input
                            data-tsunade-log-source="${escapeHtml(source)}"
                            type="checkbox"
                            ${selectedSources.has(source) ? "checked" : ""}
                            ${disabled ? "disabled" : ""}
                        >
                        ${escapeHtml(source)}
                    </label>
                `,
            ).join("");
        }

        if (this.elements.tsunadeLogSave) {
            this.elements.tsunadeLogSave.disabled = disabled;
        }
    }

    async saveTsunadeLogPolicy() {
        if (
            !this.tsunadeLogPolicy
            || !this.tsunadeLogPolicyWriteAvailable
        ) {
            return;
        }

        const [
            hour,
            minute,
        ] = this.value("tsunade-log-time").split(":").map(Number);
        const sources = Array.from(
            this.elements.tsunadeLogSources?.querySelectorAll(
                "[data-tsunade-log-source]",
            ) ?? [],
        )
            .filter((element) => element.checked)
            .map((element) => element.dataset.tsunadeLogSource);

        hideError(this.elements.error);

        try {
            this.tsunadeLogPolicy = await requestJson(
                API.tsunadeLogPolicy,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        enabled: this.checked("tsunade-log-enabled"),
                        schedule: `${minute} ${hour} * * *`,
                        sources,
                        window_hours: Number(
                            this.value("tsunade-log-window-hours"),
                        ),
                        max_bytes_per_source:
                            Number(this.value("tsunade-log-max-mib"))
                            * 1048576,
                        timeout_seconds: Number(
                            this.value("tsunade-log-timeout"),
                        ),
                    }),
                },
            );
            this.tsunadeLogPolicyLoadError = null;
            this.renderTsunadeLogPolicy();
            this.showNotice(
                "Contrôles de journaux enregistrés.",
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Impossible d’enregistrer les contrôles de journaux : "
                + this.errorMessage(error),
            );
            this.renderTsunadeLogPolicy();
        }
    }

    renderWorkers() {
        const table = this.elements.workersTable;
        if (!table) {
            return;
        }
        if (this.workerPairingsLoadError) {
            this.clearWorkerAvailabilityRefresh();
            table.innerHTML = `<tr><td colspan="8">${escapeHtml(this.workerPairingsLoadError)}</td></tr>`;
            return;
        }
        if (!this.workers.length) {
            this.clearWorkerAvailabilityRefresh();
            table.innerHTML = '<tr><td colspan="8">Aucun worker enregistré.</td></tr>';
            this.elements.workerAvailabilitySummary.textContent = "UNAVAILABLE";
            this.elements.workerWakeSummary.textContent = "aucun worker connu";
            return;
        }
        const primary = this.workers[0];
        this.elements.workerAvailabilitySummary.textContent = primary.availability;
        this.elements.workerWakeSummary.textContent = primary.woken_by_ohana
            ? "réveillé par Ohana"
            : "démarrage non déclenché par Ohana";
        table.innerHTML = this.workers.map((worker) => {
            const lastSeen = worker.last_seen_at
                ? new Date(worker.last_seen_at).toLocaleString("fr-FR")
                : "Jamais";
            const lastWake = worker.wake_requested_at
                ? new Date(worker.wake_requested_at).toLocaleString("fr-FR")
                : "—";
            const wake = worker.woken_by_ohana ? "Ohana" : "Humain / système";
            const mac = worker.wake_on_lan_mac_address ?? "Non détectée";
            const canWake = this.workerWakeAvailable
                && this.workerWakeOnLan?.enabled
                && worker.availability === "UNAVAILABLE"
                && Boolean(worker.wake_on_lan_mac_address);
            let wakeAction = "—";
            if (worker.availability === "WAKING") {
                wakeAction = '<button class="configuration-secondary-button" type="button" disabled>Réveil en cours</button>';
            } else if (worker.availability === "AVAILABLE") {
                wakeAction = '<button class="configuration-secondary-button" type="button" disabled>Déjà disponible</button>';
            } else if (canWake) {
                wakeAction = `<button class="configuration-secondary-button" data-worker-wake="${escapeHtml(worker.worker_id)}" type="button">Tester le réveil</button>`;
            } else if (!worker.wake_on_lan_mac_address) {
                wakeAction = "MAC WOL indisponible";
            } else if (!this.workerWakeOnLan?.enabled) {
                wakeAction = "WOL désactivé";
            }
            return `<tr>
                <td><strong>${escapeHtml(worker.worker_id)}</strong><small>${escapeHtml(worker.platform)} · ${escapeHtml(worker.worker_version)}</small></td>
                <td><strong>${escapeHtml(worker.availability)}</strong></td>
                <td><code>${escapeHtml(mac)}</code></td>
                <td>${escapeHtml(wake)}</td>
                <td>${escapeHtml(lastWake)}</td>
                <td>${escapeHtml(lastSeen)}</td>
                <td>${escapeHtml((worker.capabilities ?? []).join(", "))}</td>
                <td>${wakeAction}</td>
            </tr>`;
        }).join("");
        this.watchWakingWorkers();
    }

    async testWorkerWake(workerId) {
        if (!workerId || !this.workerWakeAvailable) {
            return;
        }
        const worker = this.workers.find(
            (candidate) => candidate.worker_id === workerId,
        );
        if (!worker || worker.availability !== "UNAVAILABLE") {
            return;
        }
        try {
            const result = await requestJson(
                API.administrationWorkerWake(workerId),
                { method: "POST" },
            );
            this.showNotice(
                `Wake-on-LAN envoyé à ${workerId}. État : ${result.availability ?? "WAKING"}.`,
            );
            this.resetWorkerAvailabilityRefreshDeadline();
            await this.refreshWorkerPairings();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de réveiller ${workerId} : ${this.errorMessage(error)}`,
            );
        }
    }

    hasWakingWorker() {
        return this.workers.some(
            (worker) => worker.availability === "WAKING",
        );
    }

    resetWorkerAvailabilityRefreshDeadline() {
        const timeoutSeconds =
            this.workerWakeOnLan?.wait_timeout_seconds
            ?? 180;
        this.workerAvailabilityRefreshDeadline =
            Date.now() + timeoutSeconds * 1000;
    }

    clearWorkerAvailabilityRefresh() {
        if (this.workerAvailabilityRefreshTimer) {
            window.clearTimeout(
                this.workerAvailabilityRefreshTimer,
            );
            this.workerAvailabilityRefreshTimer = null;
        }
        this.workerAvailabilityRefreshDeadline = 0;
    }

    watchWakingWorkers() {
        if (
            !this.workerPairingsAvailable
            || !this.hasWakingWorker()
        ) {
            this.clearWorkerAvailabilityRefresh();
            return;
        }

        if (!this.workerAvailabilityRefreshDeadline) {
            this.resetWorkerAvailabilityRefreshDeadline();
        }

        if (
            Date.now()
            >= this.workerAvailabilityRefreshDeadline
        ) {
            this.clearWorkerAvailabilityRefresh();
            return;
        }

        if (this.workerAvailabilityRefreshTimer) {
            return;
        }

        this.workerAvailabilityRefreshTimer =
            window.setTimeout(
                async () => {
                    this.workerAvailabilityRefreshTimer = null;
                    if (!this.hasWakingWorker()) {
                        this.clearWorkerAvailabilityRefresh();
                        return;
                    }
                    await this.refreshWorkerPairings();
                    if (this.hasWakingWorker()) {
                        this.watchWakingWorkers();
                    }
                },
                this.workerAvailabilityRefreshIntervalMs,
            );
    }

    async decideWorkerPairing(pairingId, action) {
        if (!pairingId || !["approve", "reject"].includes(action)) {
            return;
        }
        const verb = action === "approve" ? "autoriser" : "refuser";
        const pairing = this.workerPairings.find(
            (candidate) => candidate.pairing_id === pairingId,
        );
        const securityDetail = pairing
            ? `\n\nCode : ${pairing.verification_code}\nSHA-256 : ${formatTlsFingerprint(pairing.tls_ca_sha256)}`
            : "";
        if (!window.confirm(`Confirmer : ${verb} cet appairage Katsuyu ?${securityDetail}`)) {
            return;
        }
        try {
            await requestJson(
                API.administrationWorkerPairingAction(pairingId, action),
                { method: "POST" },
            );
            this.showNotice(
                action === "approve"
                    ? "L’appairage est autorisé. Katsuyu peut maintenant récupérer son jeton."
                    : "La demande d’appairage a été refusée.",
            );
            await this.refreshWorkerPairings();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de ${verb} l’appairage : ${this.errorMessage(error)}`,
            );
        }
    }

    async refreshCompanions() {
        if (!this.companionsAvailable) {
            this.renderCompanions();
            return;
        }
        try {
            const [pairings, companions] = await Promise.all([
                fetchJson(API.administrationCompanionPairings),
                fetchJson(API.administrationCompanions),
            ]);
            this.companionPairings = pairings.pairings ?? [];
            this.companions = companions.devices ?? [];
            this.companionsLoadError = null;
        } catch (error) {
            this.companionsLoadError = this.errorMessage(error);
        }
        this.renderCompanions();
    }

    renderCompanions() {
        const pairingTable = this.elements.companionPairingsTable;
        const devicesTable = this.elements.companionsTable;
        if (!pairingTable || !devicesTable) {
            return;
        }
        const pending = this.companionPairings.filter(
            (pairing) => pairing.status === "PENDING",
        );
        if (this.elements.companionPairingsPendingCount) {
            this.elements.companionPairingsPendingCount.textContent =
                String(pending.length);
        }
        if (this.companionsLoadError) {
            const message = escapeHtml(this.companionsLoadError);
            pairingTable.innerHTML = `<tr><td colspan="6">${message}</td></tr>`;
            devicesTable.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
            return;
        }
        pairingTable.innerHTML = pending.length
            ? pending.map((pairing) => {
                const id = escapeHtml(pairing.pairing_id);
                const expires = new Date(pairing.expires_at)
                    .toLocaleString("fr-FR");
                const fingerprint = String(pairing.tls_ca_sha256 ?? "");
                const shortFingerprint = fingerprint.slice(0, 16)
                    .match(/.{1,4}/g)?.join(" ") ?? "indisponible";
                return `<tr>
                    <td><strong>${escapeHtml(pairing.device_name)}</strong><small>${escapeHtml(pairing.device_id)}</small></td>
                    <td><strong>${escapeHtml(pairing.verification_code)}</strong></td>
                    <td title="${escapeHtml(fingerprint)}"><code>${escapeHtml(shortFingerprint)}</code></td>
                    <td>${escapeHtml(pairing.platform)} · ${escapeHtml(pairing.app_version)}</td>
                    <td>${escapeHtml(expires)}</td>
                    <td><span class="configuration-table__actions">
                        <button class="button" data-companion-pairing-action="approve" data-companion-pairing-id="${id}" type="button">Autoriser</button>
                        <button class="configuration-danger-button" data-companion-pairing-action="reject" data-companion-pairing-id="${id}" type="button">Refuser</button>
                    </span></td>
                </tr>`;
            }).join("")
            : '<tr><td colspan="6">Aucune demande Shizune en attente.</td></tr>';
        devicesTable.innerHTML = this.companions.length
            ? this.companions.map((device) => {
                const lastSeen = device.last_seen_at
                    ? new Date(device.last_seen_at).toLocaleString("fr-FR")
                    : "Jamais";
                const expires = new Date(device.expires_at).toLocaleString("fr-FR");
                const active = !device.revoked_at
                    && new Date(device.expires_at) > new Date();
                return `<tr>
                    <td><strong>${escapeHtml(device.device_name)}</strong><small>${escapeHtml(device.device_id)}</small></td>
                    <td>${active ? "Active" : "Révoquée / expirée"}</td>
                    <td>${escapeHtml(lastSeen)}</td>
                    <td>${escapeHtml(expires)}</td>
                    <td>${active ? `<button class="configuration-danger-button" data-companion-revoke="${escapeHtml(device.device_id)}" type="button">Révoquer</button>` : "—"}</td>
                </tr>`;
            }).join("")
            : '<tr><td colspan="5">Aucun iPhone associé.</td></tr>';
    }

    async decideCompanionPairing(pairingId, action) {
        if (!pairingId || !["approve", "reject"].includes(action)) {
            return;
        }
        const pairing = this.companionPairings.find(
            (candidate) => candidate.pairing_id === pairingId,
        );
        const verb = action === "approve" ? "autoriser" : "refuser";
        if (!window.confirm(
            `Confirmer : ${verb} cet iPhone Shizune ?\n\nCode : ${pairing?.verification_code ?? "inconnu"}\nEmpreinte : ${String(pairing?.tls_ca_sha256 ?? "").slice(0, 16).match(/.{1,4}/g)?.join(" ") ?? "indisponible"}`,
        )) {
            return;
        }
        try {
            await requestJson(
                API.administrationCompanionPairingAction(pairingId, action),
                { method: "POST" },
            );
            this.showNotice(
                action === "approve"
                    ? "L’iPhone est autorisé à récupérer son jeton Shizune limité."
                    : "La demande Shizune a été refusée.",
            );
            await this.refreshCompanions();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de ${verb} l’iPhone : ${this.errorMessage(error)}`,
            );
        }
    }

    async revokeCompanion(deviceId) {
        if (!deviceId || !window.confirm(
            "Révoquer immédiatement cette session Shizune ?",
        )) {
            return;
        }
        try {
            await requestJson(API.administrationCompanionRevoke(deviceId), {
                method: "POST",
            });
            this.showNotice("La session Shizune et son jeton APNs sont révoqués.");
            await this.refreshCompanions();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de révoquer la session : ${this.errorMessage(error)}`,
            );
        }
    }

    async refreshNetwork() {
        if (!this.networkAvailable) {
            return;
        }
        try {
            this.network = await fetchJson(API.administrationNetwork);
            this.networkLoadError = null;
            this.renderNetwork();
        } catch (error) {
            this.networkLoadError = this.errorMessage(error);
            showError(
                this.elements.error,
                "Réseau de l’Agent indisponible : " + this.networkLoadError,
            );
        }
    }

    renderNetwork() {
        const state = this.network;
        const enabled = Boolean(state && this.networkAvailable);
        this.setNetworkControlsEnabled(enabled);

        this.setText("network-interface-summary", state?.interface ?? "Indisponible");
        this.setText("network-connection-summary", state?.connection_name ?? "NetworkManager");
        this.setText("network-address-summary", state?.address ?? "—");
        this.setText(
            "network-method-summary",
            state?.method === "auto" ? "DHCP" : state ? "Adresse statique" : "—",
        );
        this.setText(
            "network-state-summary",
            state?.active ? "Connecté" : state ? "Déconnecté" : "Indisponible",
        );
        this.setText(
            "network-gateway-summary",
            state?.gateway ? `Passerelle ${state.gateway}` : "Aucune passerelle",
        );

        if (!state) {
            this.setValue("network-interface", "");
            return;
        }
        this.setValue("network-interface", state.interface ?? "");
        this.setValue("network-method", state.method ?? "manual");
        this.setValue("network-address", state.address ?? "");
        this.setValue("network-gateway", state.gateway ?? "");
        this.setValue("network-dns", (state.dns_servers ?? []).join(", "));
        this.updateNetworkMethodFields();
        this.renderNetworkPendingChange(state.pending_change);
    }

    setNetworkControlsEnabled(enabled) {
        this.elements.networkForm
            ?.querySelectorAll("input, select, button")
            .forEach((control) => {
                control.disabled = !enabled;
            });
    }

    updateNetworkMethodFields() {
        const manual = this.value("network-method") !== "auto";
        this.elements.networkManualFields.forEach((field) => {
            field.hidden = !manual;
            field.querySelectorAll("input").forEach((input) => {
                input.required = manual;
            });
        });
    }

    renderNetworkPendingChange(pending) {
        const visible = Boolean(pending?.transaction_id);
        this.elements.networkPendingChange?.classList.toggle("hidden", !visible);
        this.elements.networkPendingActions?.classList.toggle("hidden", !visible);
        if (!visible) {
            if (this.elements.networkPendingChange) {
                this.elements.networkPendingChange.textContent = "";
            }
            return;
        }
        const requestedAddress = pending.requested?.address ?? "la nouvelle adresse";
        this.elements.networkPendingChange.textContent =
            `Modification en attente pour ${requestedAddress}. `
            + `Retour automatique prévu à ${new Date(pending.expires_at).toLocaleTimeString("fr-FR")}.`;
    }

    networkPayload() {
        const method = this.value("network-method");
        return {
            schema_version: 1,
            rollback_seconds: Number(this.value("network-rollback-seconds")),
            settings: {
                interface: this.value("network-interface").trim(),
                method,
                address: method === "manual"
                    ? this.value("network-address").trim()
                    : null,
                gateway: method === "manual"
                    ? this.value("network-gateway").trim()
                    : null,
                dns_servers: method === "manual"
                    ? this.listValue("network-dns")
                    : [],
            },
        };
    }

    async saveNetworkSettings() {
        const payload = this.networkPayload();
        const currentAddress = this.network?.address ?? null;
        const nextAddress = payload.settings.address;
        if (!window.confirm(
            "Appliquer cette configuration réseau ? La connexion peut être interrompue. "
            + "L’ancienne configuration sera restaurée automatiquement sans confirmation.",
        )) {
            return;
        }
        hideError(this.elements.error);
        const redirectUrl = this.networkRedirectUrl(nextAddress);
        try {
            const change = await requestJson(
                API.administrationNetwork,
                {
                    method: "PUT",
                    body: JSON.stringify(payload),
                },
            );
            this.network = change.state;
            this.network.pending_change = {
                transaction_id: change.transaction_id,
                expires_at: change.expires_at,
                requested: payload.settings,
            };
            this.renderNetwork();
            this.showNotice(
                "La configuration a été appliquée. Reconnectez-vous et confirmez avant le retour automatique.",
            );
            if (redirectUrl && nextAddress !== currentAddress) {
                window.setTimeout(() => window.location.assign(redirectUrl), 1500);
            }
        } catch (error) {
            const message = this.errorMessage(error);
            if (redirectUrl && /failed to fetch|networkerror|réseau/i.test(message)) {
                window.setTimeout(() => window.location.assign(redirectUrl), 1500);
                return;
            }
            showError(this.elements.error, "Modification réseau refusée : " + message);
        }
    }

    networkRedirectUrl(address) {
        if (!address) {
            return null;
        }
        const host = String(address).split("/", 1)[0];
        if (!isIpv4Address(host)) {
            return null;
        }
        const port = window.location.port ? `:${window.location.port}` : "";
        return `${window.location.protocol}//${host}${port}/#configuration-network`;
    }

    async confirmNetworkChange() {
        const transactionId = this.network?.pending_change?.transaction_id;
        if (!transactionId) {
            return;
        }
        try {
            this.network = await requestJson(
                API.administrationNetworkConfirm(transactionId),
                { method: "POST" },
            );
            this.renderNetwork();
            this.showNotice("La nouvelle configuration réseau est confirmée.");
        } catch (error) {
            showError(this.elements.error, "Confirmation impossible : " + this.errorMessage(error));
        }
    }

    async rollbackNetworkChange() {
        const transactionId = this.network?.pending_change?.transaction_id;
        if (!transactionId || !window.confirm("Restaurer immédiatement l’ancienne configuration réseau ?")) {
            return;
        }
        try {
            this.network = await requestJson(
                API.administrationNetworkRollback(transactionId),
                { method: "POST" },
            );
            this.renderNetwork();
            this.showNotice("L’ancienne configuration réseau a été restaurée.");
        } catch (error) {
            showError(this.elements.error, "Restauration impossible : " + this.errorMessage(error));
        }
    }

    renderDHCP() {
        if (!this.dhcp) {
            return;
        }

        this.setDHCPControlsEnabled(true);

        const settings = this.dhcp.settings;
        const reservations =
            this.dhcp.reservations ?? [];
        const leases = this.dhcp.leases ?? [];

        this.elements.dhcpServer.textContent =
            this.dhcp.server_node_id;
        this.elements.dhcpRangeSummary.textContent =
            `${settings.range_start} – `
            + settings.range_end;
        this.elements.dhcpLeaseDurationSummary
            .textContent =
                `Bail ${settings.lease_duration}`;
        this.elements.dhcpActiveLeasesCount
            .textContent = String(leases.length);
        this.elements.dhcpReservationsCount
            .textContent =
                `${reservations.length} `
                + (
                    reservations.length > 1
                        ? "réservations"
                        : "réservation"
                );

        this.setValue(
            "dhcp-interface",
            settings.interface,
        );
        this.setValue(
            "dhcp-lease-duration",
            settings.lease_duration,
        );
        this.setValue(
            "dhcp-range-start",
            settings.range_start,
        );
        this.setValue(
            "dhcp-range-end",
            settings.range_end,
        );
        this.setValue(
            "dhcp-subnet-mask",
            settings.subnet_mask,
        );
        this.setValue(
            "dhcp-gateway",
            settings.gateway,
        );
        this.setValue(
            "dhcp-dns-servers",
            settings.dns_servers.join(", "),
        );
        this.setValue(
            "dhcp-ntp-servers",
            settings.ntp_servers.join(", "),
        );
        this.setValue(
            "dhcp-domain",
            settings.domain,
        );

        this.renderDHCPTable(
            reservations,
            leases,
        );
    }

    renderDHCPUnavailable(message) {
        this.setDHCPControlsEnabled(false);

        if (this.elements.dhcpServer) {
            this.elements.dhcpServer.textContent = "Indisponible";
        }
        if (this.elements.dhcpRangeSummary) {
            this.elements.dhcpRangeSummary.textContent = "—";
        }
        if (this.elements.dhcpLeaseDurationSummary) {
            this.elements.dhcpLeaseDurationSummary.textContent =
                "Administration non chargée";
        }
        if (this.elements.dhcpActiveLeasesCount) {
            this.elements.dhcpActiveLeasesCount.textContent = "—";
        }
        if (this.elements.dhcpReservationsCount) {
            this.elements.dhcpReservationsCount.textContent =
                "Réessayez avec Actualiser";
        }
        if (this.elements.dhcpTable) {
            this.elements.dhcpTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `;
        }
    }

    setDHCPControlsEnabled(enabled) {
        this.elements.dhcpSettingsForm
            ?.querySelectorAll(
                "input, select, button",
            )
            .forEach((control) => {
                control.disabled = !enabled;
            });

        if (this.elements.dhcpAddReservation) {
            this.elements.dhcpAddReservation.disabled =
                !enabled;
        }
    }

    renderDHCPTable(
        reservations,
        leases,
    ) {
        if (!this.elements.dhcpTable) {
            return;
        }

        const activeByMac = new Map(
            leases.map((lease) => [
                lease.mac_address.toUpperCase(),
                lease,
            ]),
        );
        const reservedMacs = new Set(
            reservations.map((reservation) =>
                reservation.mac_address.toUpperCase(),
            ),
        );
        const rows = reservations.map(
            (reservation) => {
                const active = activeByMac.has(
                    reservation.mac_address
                        .toUpperCase(),
                );

                return {
                    address: reservation.address,
                    markup: this.reservationRow(
                        reservation,
                        active,
                    ),
                };
            },
        );

        leases
            .filter(
                (lease) => !reservedMacs.has(
                    lease.mac_address.toUpperCase(),
                ),
            )
            .forEach((lease) => {
                rows.push({
                    address: lease.address,
                    markup:
                        this.dynamicLeaseRow(lease),
                });
            });

        rows.sort((first, second) => {
            return this.compareIPAddresses(
                first.address,
                second.address,
            );
        });

        this.elements.dhcpTable.innerHTML =
            rows.length
                ? rows.map(
                    (row) => row.markup,
                ).join("")
                : (
                    "<tr><td colspan=\"6\">"
                    + "Aucun bail DHCP."
                    + "</td></tr>"
                );
    }

    reservationRow(reservation, active) {
        const mac = escapeHtml(
            reservation.mac_address,
        );
        const validHostname =
            this.isValidDNSName(
                reservation.hostname,
            );

        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(reservation.hostname)}</strong>
                        <small>${escapeHtml(DHCP_CATEGORY_LABELS[reservation.category] ?? reservation.category)}${validHostname ? "" : " · Nom DNS invalide"}</small>
                    </span>
                </td>
                <td>${escapeHtml(reservation.address)}</td>
                <td><code>${mac}</code></td>
                <td>Réservé</td>
                <td>
                    <span class="status-badge ${validHostname ? (active ? "status-badge--healthy" : "status-badge--unknown") : "status-badge--error"}">
                        ${validHostname ? (active ? "Actif" : "Inactif") : "À corriger"}
                    </span>
                </td>
                <td>
                    <span class="configuration-table__actions">
                        <button class="configuration-icon-button" data-dhcp-edit="${mac}" type="button">Modifier</button>
                        <button class="configuration-icon-button" data-dhcp-delete="${mac}" type="button">Supprimer</button>
                    </span>
                </td>
            </tr>
        `;
    }

    dynamicLeaseRow(lease) {
        const mac = escapeHtml(lease.mac_address);
        const hostname = lease.hostname
            ?? "Client sans nom";

        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(hostname)}</strong>
                        <small>Bail dynamique</small>
                    </span>
                </td>
                <td>${escapeHtml(lease.address)}</td>
                <td><code>${mac}</code></td>
                <td>Dynamique</td>
                <td><span class="status-badge status-badge--healthy">Actif</span></td>
                <td>
                    <span class="configuration-table__actions">
                        <button aria-label="Ajouter ${escapeHtml(hostname)} comme réservation" class="configuration-icon-button configuration-icon-button--add" data-dhcp-add="${mac}" title="Ajouter comme réservation" type="button">+</button>
                    </span>
                </td>
            </tr>
        `;
    }

    compareIPAddresses(firstAddress, secondAddress) {
        const firstValue = this.ipv4AddressValue(
            firstAddress,
        );
        const secondValue = this.ipv4AddressValue(
            secondAddress,
        );

        if (firstValue !== secondValue) {
            return firstValue - secondValue;
        }

        return String(firstAddress).localeCompare(
            String(secondAddress),
        );
    }

    ipv4AddressValue(address) {
        const octets = String(address)
            .split(".")
            .map((octet) => Number(octet));

        if (
            octets.length !== 4
            || octets.some(
                (octet) =>
                    !Number.isInteger(octet)
                    || octet < 0
                    || octet > 255,
            )
        ) {
            return Number.MAX_SAFE_INTEGER;
        }

        return octets.reduce(
            (value, octet) => value * 256 + octet,
            0,
        );
    }

    async saveDHCPSettings() {
        if (
            !this.dhcp
            || !this.elements.dhcpSettingsForm
                ?.reportValidity()
        ) {
            return;
        }

        if (
            !window.confirm(
                "Appliquer cette configuration DHCP ? "
                + "Agent validera dnsmasq avant son "
                + "rechargement.",
            )
        ) {
            return;
        }

        const previousDHCP =
            structuredClone(this.dhcp);
        this.dhcp.settings = {
            interface:
                this.value("dhcp-interface"),
            lease_duration:
                this.value(
                    "dhcp-lease-duration",
                ),
            range_start:
                this.value("dhcp-range-start"),
            range_end:
                this.value("dhcp-range-end"),
            subnet_mask:
                this.value("dhcp-subnet-mask"),
            gateway:
                this.value("dhcp-gateway"),
            dns_servers:
                this.listValue(
                    "dhcp-dns-servers",
                ),
            ntp_servers:
                this.listValue(
                    "dhcp-ntp-servers",
                ),
            domain:
                this.value("dhcp-domain"),
        };

        await this.applyDHCP(
            "Configuration DHCP appliquée.",
            previousDHCP,
        );
    }

    openReservation(reservation = null, options = {}) {
        const dialog =
            this.elements.dhcpReservationDialog;

        if (!dialog) {
            return;
        }

        const editing = Boolean(
            reservation && !options.isNew,
        );

        this.elements
            .dhcpReservationDialogTitle
            .textContent = editing
                ? "Modifier la réservation"
                : "Ajouter une réservation";

        this.setValue(
            "dhcp-reservation-original-mac",
            editing
                ? reservation.mac_address
                : "",
        );
        this.setValue(
            "dhcp-reservation-hostname",
            reservation?.hostname ?? "",
        );
        this.setValue(
            "dhcp-reservation-address",
            reservation?.address ?? "",
        );
        this.setValue(
            "dhcp-reservation-mac",
            reservation?.mac_address ?? "",
        );
        this.setValue(
            "dhcp-reservation-category",
            reservation?.category
                ?? "infrastructure",
        );
        this.validateReservationHostname();

        dialog.showModal();
    }

    closeReservation() {
        this.elements.dhcpReservationDialog
            ?.close();
    }

    async saveReservation() {
        this.validateReservationHostname();

        if (
            !this.dhcp
            || !this.elements
                .dhcpReservationForm
                ?.reportValidity()
        ) {
            return;
        }

        const originalMac = this.value(
            "dhcp-reservation-original-mac",
        ).toUpperCase();
        const reservation = {
            hostname: this.value(
                "dhcp-reservation-hostname",
            ).toLowerCase(),
            address: this.value(
                "dhcp-reservation-address",
            ),
            mac_address: this.value(
                "dhcp-reservation-mac",
            ).toUpperCase(),
            category: this.value(
                "dhcp-reservation-category",
            ),
            description: "",
        };

        if (
            !window.confirm(
                `Enregistrer la réservation DHCP de ${reservation.hostname} ?`,
            )
        ) {
            return;
        }

        const previousDHCP =
            structuredClone(this.dhcp);
        const reservations = [
            ...(this.dhcp.reservations ?? []),
        ];
        const existingIndex =
            reservations.findIndex(
                (item) =>
                    item.mac_address.toUpperCase()
                    === originalMac,
            );

        if (existingIndex >= 0) {
            reservations[existingIndex] =
                reservation;
        } else {
            reservations.push(reservation);
        }

        this.dhcp.reservations = reservations;
        this.closeReservation();
        await this.applyDHCP(
            "Réservation DHCP enregistrée.",
            previousDHCP,
        );
    }

    validateReservationHostname() {
        const field =
            this.elements.dhcpReservationHostname;

        if (!field) {
            return true;
        }

        const hostname = field.value.trim();
        const valid = this.isValidDNSName(hostname);

        field.setCustomValidity(
            !hostname || valid
                ? ""
                : this.dnsNameValidationMessage(
                    hostname,
                ),
        );
        field.setAttribute(
            "aria-invalid",
            valid ? "false" : "true",
        );

        return valid;
    }

    isValidDNSName(value) {
        return DNS_NAME_PATTERN.test(
            String(value).trim(),
        );
    }

    dnsNameValidationMessage(value) {
        const hostname = String(value).trim();
        const suggestion = hostname
            .toLowerCase()
            .replace(/[\s_]+/g, "-");
        const example = suggestion
            && suggestion !== hostname
            && this.isValidDNSName(suggestion)
                ? ` Essayez « ${suggestion} ».`
                : "";

        return (
            "Utilisez uniquement des lettres, des chiffres, "
            + "des tirets et des points. Un nom DNS ne peut "
            + "pas commencer par un tiret."
            + example
        );
    }

    invalidDHCPReservations() {
        return (this.dhcp?.reservations ?? [])
            .filter(
                (reservation) =>
                    !this.isValidDNSName(
                        reservation.hostname,
                    ),
            );
    }

    handleDHCPTableClick(event) {
        const button = event.target.closest(
            "[data-dhcp-edit], [data-dhcp-delete], "
            + "[data-dhcp-add]",
        );

        if (!button || !this.dhcp) {
            return;
        }

        const editMac =
            button.dataset.dhcpEdit;
        const deleteMac =
            button.dataset.dhcpDelete;
        const addMac =
            button.dataset.dhcpAdd;

        if (addMac) {
            const lease = (this.dhcp.leases ?? [])
                .find((item) =>
                    item.mac_address.toUpperCase()
                    === addMac.toUpperCase(),
                );

            if (lease) {
                this.openReservation({
                    hostname: lease.hostname ?? "",
                    address: lease.address,
                    mac_address: lease.mac_address,
                    category: "infrastructure",
                }, {isNew: true});
            }
            return;
        }

        const mac = editMac ?? deleteMac;
        const reservation =
            this.dhcp.reservations.find(
                (item) =>
                    item.mac_address.toUpperCase()
                    === mac.toUpperCase(),
            );

        if (!reservation) {
            return;
        }

        if (editMac) {
            this.openReservation(reservation);
            return;
        }

        if (
            window.confirm(
                `Supprimer la réservation de ${reservation.hostname} ?`,
            )
        ) {
            const previousDHCP =
                structuredClone(this.dhcp);
            this.dhcp.reservations =
                this.dhcp.reservations.filter(
                    (item) => item !== reservation,
                );
            void this.applyDHCP(
                "Réservation DHCP supprimée.",
                previousDHCP,
            );
        }
    }

    async applyDHCP(
        message,
        previousDHCP = null,
    ) {
        hideError(this.elements.error);

        const invalidReservations =
            this.invalidDHCPReservations();

        if (invalidReservations.length) {
            if (previousDHCP) {
                this.dhcp = previousDHCP;
                this.renderDHCP();
            }

            const invalidNames =
                invalidReservations
                    .map((reservation) =>
                        `« ${reservation.hostname} »`,
                    )
                    .join(", ");

            showError(
                this.elements.error,
                "Modification DHCP refusée : "
                + "nom DNS invalide pour "
                + `${invalidNames}. Utilisez des tirets `
                + "à la place des espaces ou underscores.",
            );
            return;
        }

        try {
            this.dhcp = await requestJson(
                API.administrationDHCP,
                {
                    method: "PUT",
                    body: JSON.stringify(
                        this.dhcpPayload(),
                    ),
                },
            );
            this.renderDHCP();
            this.showNotice(message);
        } catch (error) {
            if (previousDHCP) {
                this.dhcp = previousDHCP;
                this.renderDHCP();
            }

            showError(
                this.elements.error,
                "Modification DHCP refusée : "
                + this.errorMessage(error),
            );
        }
    }

    dhcpPayload() {
        return {
            schema_version: 1,
            implementation: "dnsmasq",
            server_node_id:
                this.dhcp.server_node_id,
            settings: this.dhcp.settings,
            reservations:
                this.dhcp.reservations,
        };
    }

    renderArchitecture() {
        if (
            !this.infrastructure
            || !this.elements.architectureBoard
        ) {
            return;
        }

        this.ensureTopology();
        this.renderDiscoveredDevices();
        const topology =
            this.infrastructure.topology;
        const layout = this.architectureLayout();
        const nodesById = new Map(
            this.infrastructure.nodes.map(
                (node) => [node.id, node],
            ),
        );
        const servicesByNode = new Map();

        this.infrastructure.services.forEach(
            (service) => {
                const services =
                    servicesByNode.get(service.node)
                    ?? [];
                services.push(service);
                servicesByNode.set(
                    service.node,
                    services,
                );
            },
        );

        const maximumColumn = Math.max(
            ARCHITECTURE_MINIMUM_COLUMNS - 1,
            ...Object.values(layout.positions)
                .map((position) => position.column),
        );
        const maximumRow = Math.max(
            ARCHITECTURE_MINIMUM_ROWS - 1,
            ...Object.values(layout.positions)
                .map((position) => position.row),
        );
        const columnCount = maximumColumn + 1;
        const rowCount = maximumRow + 1;
        const cellWidth = 240;
        const cellHeight = 150;
        const deviceCards = topology.devices.map(
            (device) => {
                const position =
                    layout.positions[device.id];
                const node =
                    nodesById.get(device.node);
                const services =
                    servicesByNode.get(
                        device.node,
                    ) ?? [];
                const selected =
                    this.selectedArchitectureItem
                        ?.mode === "device"
                    && this.selectedArchitectureItem
                        .id === device.id;
                const pending =
                    this.pendingLinkSource
                        === device.id;
                const serviceSummary = services.length
                    ? `${services.length} service${services.length > 1 ? "s" : ""}`
                    : "Aucun service";

                return `
                    <button
                        aria-label="${escapeHtml(device.label)}, ${escapeHtml(serviceSummary)}"
                        class="architecture-map-device ${selected ? "is-selected" : ""} ${pending ? "is-link-source" : ""}"
                        data-architecture-device="${escapeHtml(device.id)}"
                        draggable="${this.architectureInteractionMode === "move"}"
                        style="grid-column:${position.column + 1};grid-row:${position.row + 1}"
                        type="button"
                    >
                        <span class="architecture-map-device__icon" aria-hidden="true" style="--architecture-device-icon:url('${deviceIconPath(device.kind)}')"></span>
                        <strong>${escapeHtml(device.label)}</strong>
                        <small>${escapeHtml(node?.endpoint?.address ?? device.address ?? device.kind)}</small>
                        <span class="architecture-map-device__services">${escapeHtml(serviceSummary)}</span>
                    </button>
                `;
            },
        );
        const linkLines = topology.links.map(
            (link) => {
                const source =
                    layout.positions[link.source];
                const target =
                    layout.positions[link.target];

                if (!source || !target) {
                    return "";
                }

                const selected =
                    this.selectedArchitectureItem
                        ?.mode === "link"
                    && this.selectedArchitectureItem
                        .id === link.id;
                const visualKind =
                    this.architectureLinkVisualKind(
                        link,
                    );
                const x1 =
                    source.column * cellWidth
                    + cellWidth / 2;
                const y1 =
                    source.row * cellHeight
                    + cellHeight / 2;
                const x2 =
                    target.column * cellWidth
                    + cellWidth / 2;
                const y2 =
                    target.row * cellHeight
                    + cellHeight / 2;

                return `
                    <g
                        aria-label="${escapeHtml(link.label ?? link.id)}"
                        class="architecture-map-link ${selected ? "is-selected" : ""}"
                        data-architecture-link="${escapeHtml(link.id)}"
                        role="button"
                        tabindex="0"
                    >
                        <line class="architecture-map-link__hitbox" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
                        <line class="architecture-map-link__line architecture-map-link__line--${escapeHtml(visualKind)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
                    </g>
                `;
            },
        );

        this.elements.architectureBoard
            .innerHTML = `
                <div
                    class="architecture-map"
                    data-architecture-columns="${columnCount}"
                    data-architecture-rows="${rowCount}"
                    style="--architecture-columns:${columnCount};--architecture-rows:${rowCount}"
                >
                    <svg
                        aria-label="Liaisons de l’architecture"
                        class="architecture-map__links"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 ${columnCount * cellWidth} ${rowCount * cellHeight}"
                    >
                        ${linkLines.join("")}
                    </svg>
                    <div class="architecture-map__grid">
                        ${deviceCards.join("") || "<p class=\"empty-state\">Aucun équipement déclaré.</p>"}
                    </div>
                </div>
            `;

        this.applyArchitectureViewport();
        if (!this.architectureViewportInitialized) {
            window.requestAnimationFrame(() => {
                this.fitArchitectureViewport();
            });
        }

        this.updateArchitectureModeControls();
        this.populateNodeOptions();
        this.populateDeviceOptions();
    }

    discoveredDevicesToPosition() {
        if (!this.infrastructure || !this.liveTopology) {
            return [];
        }

        this.ensureTopology();
        const declaredDeviceIds = new Set(
            this.infrastructure.topology.devices.map(
                (device) => device.id,
            ),
        );

        return (this.liveTopology.devices ?? [])
            .filter((device) => (
                device.metadata?.managed_by
                    === "zwave_discovery"
                && !declaredDeviceIds.has(
                    device.device_id,
                )
            ));
    }

    renderDiscoveredDevices() {
        const count =
            this.discoveredDevicesToPosition().length;
        const visible = count > 0;

        if (this.elements.architectureDiscoveryNotice) {
            this.elements.architectureDiscoveryNotice.hidden =
                !visible;
        }

        if (this.elements.architectureDiscoveryCount) {
            this.elements.architectureDiscoveryCount.textContent =
                `${count} équipement${count > 1 ? "s" : ""} à positionner`;
        }

        if (this.elements.architecturePositionDiscovered) {
            this.elements.architecturePositionDiscovered.disabled =
                !visible;
        }
    }

    positionDiscoveredDevices() {
        const discovered =
            this.discoveredDevicesToPosition();

        if (discovered.length === 0) {
            return;
        }

        const topology = this.infrastructure.topology;
        const discoveredIds = new Set(
            discovered.map((device) => device.device_id),
        );

        discovered.forEach((device) => {
            topology.devices.push({
                id: device.device_id,
                label: device.label,
                kind: device.kind,
                node: device.node_id ?? null,
                address: device.address ?? null,
                metadata: {
                    ...(device.metadata ?? {}),
                },
            });
        });

        const declaredDeviceIds = new Set(
            topology.devices.map((device) => device.id),
        );
        const declaredLinkIds = new Set(
            topology.links.map((link) => link.id),
        );
        const discoveredLinks = (
            this.liveTopology.links ?? []
        ).filter((link) => (
            link.metadata?.managed_by
                === "zwave_discovery"
            && (
                discoveredIds.has(link.source_device_id)
                || discoveredIds.has(link.target_device_id)
            )
            && declaredDeviceIds.has(link.source_device_id)
            && declaredDeviceIds.has(link.target_device_id)
            && !declaredLinkIds.has(link.link_id)
        ));

        discoveredLinks.forEach((link) => {
            topology.links.push({
                id: link.link_id,
                source: link.source_device_id,
                target: link.target_device_id,
                kind: link.kind,
                direction: link.direction,
                label: link.label ?? null,
                bandwidth_mbps:
                    link.bandwidth_mbps ?? null,
                metadata: {
                    ...(link.metadata ?? {}),
                },
            });
        });

        this.positionDevicesAroundGateway(
            [...discoveredIds],
            discoveredLinks,
        );
        this.renderArchitecture();
        this.showNotice(
            `${discovered.length} équipement${discovered.length > 1 ? "s" : ""} `
            + "positionné"
            + `${discovered.length > 1 ? "s" : ""}. `
            + "Appliquez l’architecture pour conserver ce placement.",
        );
    }

    positionDevicesAroundGateway(deviceIds, links) {
        const layout = this.architectureLayout();

        deviceIds.forEach((deviceId) => {
            delete layout.positions[deviceId];
        });

        const occupied = new Set(
            Object.values(layout.positions).map(
                (position) =>
                    `${position.column}:${position.row}`,
            ),
        );
        const gatewayId = links
            .map((link) => (
                deviceIds.includes(link.source_device_id)
                    ? link.target_device_id
                    : link.source_device_id
            ))
            .find((deviceId) => layout.positions[deviceId]);
        const anchor = layout.positions[gatewayId] ?? {
            column: 0,
            row: 0,
        };
        const candidates = [];

        for (
            let radius = 1;
            candidates.length < deviceIds.length;
            radius += 1
        ) {
            for (
                let rowOffset = -radius;
                rowOffset <= radius;
                rowOffset += 1
            ) {
                for (
                    let columnOffset = -radius;
                    columnOffset <= radius;
                    columnOffset += 1
                ) {
                    if (
                        Math.max(
                            Math.abs(columnOffset),
                            Math.abs(rowOffset),
                        ) !== radius
                    ) {
                        continue;
                    }

                    const column =
                        anchor.column + columnOffset;
                    const row = anchor.row + rowOffset;
                    const key = `${column}:${row}`;

                    if (
                        column < 0
                        || row < 0
                        || occupied.has(key)
                    ) {
                        continue;
                    }

                    candidates.push({ column, row });
                    occupied.add(key);

                    if (
                        candidates.length
                            === deviceIds.length
                    ) {
                        break;
                    }
                }

                if (
                    candidates.length
                        === deviceIds.length
                ) {
                    break;
                }
            }
        }

        deviceIds.forEach((deviceId, index) => {
            layout.positions[deviceId] =
                candidates[index];
        });
    }

    serviceCard(service) {
        const selected =
            this.selectedArchitectureItem
                ?.mode === "service"
            && this.selectedArchitectureItem
                .id === service.id;

        return `
            <button
                class="architecture-service ${selected ? "is-selected" : ""}"
                data-architecture-service="${escapeHtml(service.id)}"
                data-service-type="${escapeHtml(service.type)}"
                type="button"
            >
                <strong>${escapeHtml(service.name)}</strong>
                <small>${escapeHtml(service.implementation ?? service.type)}${service.port ? ` · port ${escapeHtml(String(service.port))}` : ""}${service.critical ? " · critique" : ""}</small>
            </button>
        `;
    }

    handleArchitectureClick(event) {
        if (this.architecturePanMoved) {
            this.architecturePanMoved = false;
            return;
        }

        const element = event.target.closest(
            "[data-architecture-device], "
            + "[data-architecture-service], "
            + "[data-architecture-link]",
        );

        if (!element) {
            return;
        }

        if (element.dataset.architectureDevice) {
            if (
                this.architectureInteractionMode
                    === "link"
            ) {
                this.selectLinkEndpoint(
                    element.dataset
                        .architectureDevice,
                );
                return;
            }

            this.editDevice(
                element.dataset.architectureDevice,
            );
        } else if (
            element.dataset.architectureService
        ) {
            this.editService(
                element.dataset.architectureService,
            );
        } else {
            this.editLink(
                element.dataset.architectureLink,
            );
        }
    }

    applyArchitectureViewport() {
        const map = this.elements.architectureBoard
            ?.querySelector(".architecture-map");

        if (!map) {
            return;
        }

        const {scale, x, y} =
            this.architectureViewport;
        map.style.transform =
            `translate(${x}px, ${y}px) scale(${scale})`;
    }

    fitArchitectureViewport() {
        const board = this.elements.architectureBoard;
        const map = board?.querySelector(
            ".architecture-map",
        );

        if (!board || !map) {
            return;
        }

        map.style.transform = "none";
        const boardBounds = board.getBoundingClientRect();
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;
        const devices = [
            ...map.querySelectorAll(
                ".architecture-map-device",
            ),
        ];

        if (
            boardBounds.width <= 0
            || boardBounds.height <= 0
            || mapWidth <= 0
            || mapHeight <= 0
        ) {
            this.applyArchitectureViewport();
            return;
        }

        const content = devices.length
            ? {
                x: Math.min(
                    ...devices.map((device) =>
                        device.offsetLeft,
                    ),
                ),
                y: Math.min(
                    ...devices.map((device) =>
                        device.offsetTop,
                    ),
                ),
                right: Math.max(
                    ...devices.map((device) =>
                        device.offsetLeft
                        + device.offsetWidth,
                    ),
                ),
                bottom: Math.max(
                    ...devices.map((device) =>
                        device.offsetTop
                        + device.offsetHeight,
                    ),
                ),
            }
            : {
                x: 0,
                y: 0,
                right: mapWidth,
                bottom: mapHeight,
            };
        const contentWidth =
            content.right - content.x;
        const contentHeight =
            content.bottom - content.y;
        const padding = 48;
        const scale = Math.min(
            (boardBounds.width - padding * 2)
                / contentWidth,
            (boardBounds.height - padding * 2)
                / contentHeight,
            1,
        );
        const boundedScale = Math.max(0.35, scale);

        this.architectureViewport = {
            scale: boundedScale,
            x: (
                boardBounds.width
                - contentWidth * boundedScale
            ) / 2
                - content.x * boundedScale,
            y: (
                boardBounds.height
                - contentHeight * boundedScale
            ) / 2
                - content.y * boundedScale,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    }

    zoomArchitecture(factor, clientPoint = null) {
        const board = this.elements.architectureBoard;

        if (!board) {
            return;
        }

        const bounds = board.getBoundingClientRect();
        const point = clientPoint ?? {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
        };
        const localX = point.x - bounds.left;
        const localY = point.y - bounds.top;
        const previous = this.architectureViewport;
        const scale = Math.min(
            3,
            Math.max(0.35, previous.scale * factor),
        );
        const appliedFactor = scale / previous.scale;

        this.architectureViewport = {
            scale,
            x: localX
                - (localX - previous.x)
                * appliedFactor,
            y: localY
                - (localY - previous.y)
                * appliedFactor,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    }

    handleArchitectureWheel(event) {
        if (
            !this.elements.architectureBoard
                ?.querySelector(".architecture-map")
        ) {
            return;
        }

        event.preventDefault();
        this.zoomArchitecture(
            event.deltaY < 0 ? 1.2 : 1 / 1.2,
            {
                x: event.clientX,
                y: event.clientY,
            },
        );
    }

    handleArchitecturePointerDown(event) {
        if (
            event.button !== 0
            || event.target.closest(
                "[data-architecture-device], "
                + "[data-architecture-service], "
                + "[data-architecture-link], button, input, select",
            )
        ) {
            return;
        }

        this.architecturePanning = true;
        this.architecturePanMoved = false;
        this.architecturePanStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            x: this.architectureViewport.x,
            y: this.architectureViewport.y,
        };
        this.elements.architectureBoard
            .setPointerCapture(event.pointerId);
        this.elements.architectureBoard
            .classList.add("is-panning");
    }

    handleArchitecturePointerMove(event) {
        if (
            !this.architecturePanning
            || !this.architecturePanStart
        ) {
            return;
        }

        const deltaX =
            event.clientX
            - this.architecturePanStart.clientX;
        const deltaY =
            event.clientY
            - this.architecturePanStart.clientY;

        if (Math.hypot(deltaX, deltaY) > 3) {
            this.architecturePanMoved = true;
        }

        this.architectureViewport = {
            ...this.architectureViewport,
            x: this.architecturePanStart.x + deltaX,
            y: this.architecturePanStart.y + deltaY,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    }

    handleArchitecturePointerUp(event) {
        if (!this.architecturePanning) {
            return;
        }

        this.architecturePanning = false;
        this.architecturePanStart = null;
        if (
            this.elements.architectureBoard
                .hasPointerCapture(event.pointerId)
        ) {
            this.elements.architectureBoard
                .releasePointerCapture(event.pointerId);
        }
        this.elements.architectureBoard
            .classList.remove("is-panning");
    }

    setArchitectureMode(mode) {
        this.architectureInteractionMode = mode;
        this.pendingLinkSource = null;
        this.updateArchitectureModeControls();
        this.renderArchitecture();
    }

    updateArchitectureModeControls() {
        const linkMode =
            this.architectureInteractionMode === "link";
        this.elements.architectureModeMove
            ?.classList.toggle(
                "is-active",
                !linkMode,
            );
        this.elements.architectureModeLink
            ?.classList.toggle(
                "is-active",
                linkMode,
            );
        this.elements.architectureModeMove
            ?.setAttribute(
                "aria-pressed",
                String(!linkMode),
            );
        this.elements.architectureModeLink
            ?.setAttribute(
                "aria-pressed",
                String(linkMode),
            );

        if (!this.elements.architectureModeStatus) {
            return;
        }

        if (!linkMode) {
            this.elements.architectureModeStatus
                .textContent =
                    "Mode Déplacer : faites glisser "
                    + "un équipement vers une case.";
        } else if (this.pendingLinkSource) {
            const source =
                this.infrastructure.topology.devices
                    .find(
                        (device) =>
                            device.id
                            === this.pendingLinkSource,
                    );
            this.elements.architectureModeStatus
                .textContent =
                    `${source?.label ?? this.pendingLinkSource} sélectionné : choisissez l’équipement de destination.`;
        } else {
            this.elements.architectureModeStatus
                .textContent =
                    "Mode Relier : sélectionnez "
                    + "l’équipement source, puis "
                    + "la destination.";
        }
    }

    selectLinkEndpoint(deviceId) {
        if (!this.pendingLinkSource) {
            this.pendingLinkSource = deviceId;
            this.renderArchitecture();
            return;
        }

        if (this.pendingLinkSource === deviceId) {
            this.pendingLinkSource = null;
            this.renderArchitecture();
            return;
        }

        const source = this.pendingLinkSource;
        this.pendingLinkSource = null;
        const existingLink =
            this.infrastructure.topology.links.find(
                (link) =>
                    (
                        link.source === source
                        && link.target === deviceId
                    )
                    || (
                        link.source === deviceId
                        && link.target === source
                    ),
            );

        if (existingLink) {
            this.editLink(existingLink.id);
            this.showNotice(
                "Cette liaison existe déjà : "
                + "vous pouvez la modifier.",
            );
            return;
        }

        const id = this.uniqueId(
            `${source}-${deviceId}`,
            this.infrastructure.topology.links,
        );
        this.infrastructure.topology.links.push({
            id,
            source,
            target: deviceId,
            kind: "ethernet",
            direction: "bidirectional",
            label: null,
            bandwidth_mbps: null,
            metadata: {},
        });
        this.editLink(id);
        this.showNotice(
            "Liaison créée. Précisez ses "
            + "caractéristiques puis appliquez "
            + "l’architecture.",
        );
    }

    handleArchitectureDragStart(event) {
        const device = event.target.closest(
            "[data-architecture-device]",
        );

        if (
            !device
            || this.architectureInteractionMode
                !== "move"
        ) {
            event.preventDefault();
            return;
        }

        this.draggedArchitectureDevice =
            device.dataset.architectureDevice;
        event.dataTransfer?.setData(
            "text/plain",
            this.draggedArchitectureDevice,
        );
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
        device.classList.add("is-dragging");
    }

    handleArchitectureDragOver(event) {
        if (
            this.architectureInteractionMode === "move"
            && this.draggedArchitectureDevice
        ) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
        }
    }

    handleArchitectureDrop(event) {
        if (
            this.architectureInteractionMode !== "move"
            || !this.draggedArchitectureDevice
        ) {
            return;
        }

        const map = event.target.closest(
            ".architecture-map",
        );

        if (!map) {
            return;
        }

        event.preventDefault();
        const bounds = map.getBoundingClientRect();
        const columnCount = Number(
            map.dataset.architectureColumns,
        );
        const rowCount = Number(
            map.dataset.architectureRows,
        );
        const column = Math.min(
            columnCount - 1,
            Math.max(
                0,
                Math.floor(
                    (
                        event.clientX - bounds.left
                    ) / bounds.width * columnCount,
                ),
            ),
        );
        const row = Math.min(
            rowCount - 1,
            Math.max(
                0,
                Math.floor(
                    (
                        event.clientY - bounds.top
                    ) / bounds.height * rowCount,
                ),
            ),
        );
        this.moveArchitectureDevice(
            this.draggedArchitectureDevice,
            column,
            row,
        );
        this.draggedArchitectureDevice = null;
    }

    moveArchitectureDevice(deviceId, column, row) {
        const layout = this.architectureLayout();
        const previous = layout.positions[deviceId];
        const occupant = Object.entries(
            layout.positions,
        ).find(
            ([otherId, position]) =>
                otherId !== deviceId
                && position.column === column
                && position.row === row,
        );

        if (occupant && previous) {
            layout.positions[occupant[0]] = {
                column: previous.column,
                row: previous.row,
            };
        }

        layout.positions[deviceId] = {
            column,
            row,
        };
        this.renderArchitecture();
        this.showNotice(
            "Position modifiée. Appliquez "
            + "l’architecture pour la conserver.",
        );
    }

    editDevice(deviceId) {
        const device =
            this.infrastructure.topology.devices
                .find((item) => item.id === deviceId);

        if (!device) {
            return;
        }

        const node =
            this.infrastructure.nodes.find(
                (item) => item.id === device.node,
            );
        this.selectArchitectureEditor(
            "device",
            device.id,
            "Équipement",
            device.label,
        );
        this.setValue(
            "architecture-device-name",
            device.label,
        );
        this.setValue(
            "architecture-device-kind",
            device.kind,
        );
        this.setValue(
            "architecture-device-role",
            device.metadata?.role ?? "",
        );
        this.setValue(
            "architecture-device-address",
            node?.endpoint?.address
                ?? device.address
                ?? "",
        );
        this.setChecked(
            "architecture-device-network-presence",
            device.metadata
                ?.network_presence_enabled !== false,
        );
        const monitoringSchedule = device.metadata?.monitoring_schedule;
        const monitoringPeriod = monitoringSchedule?.periods?.[0] ?? {};
        this.setChecked(
            "architecture-device-monitoring-schedule-enabled",
            Boolean(monitoringSchedule?.enabled !== false && monitoringSchedule?.periods?.length),
        );
        this.setValue(
            "architecture-device-monitoring-start",
            monitoringPeriod.start ?? "07:00",
        );
        this.setValue(
            "architecture-device-monitoring-end",
            monitoringPeriod.end ?? "22:00",
        );
        this.setValue(
            "architecture-device-monitoring-timezone",
            monitoringSchedule?.timezone ?? "Europe/Paris",
        );
        this.setValue(
            "architecture-device-monitoring-grace",
            monitoringSchedule?.startup_grace_seconds ?? 300,
        );
        this.setMonitoringScheduleDays(
            monitoringPeriod.days ?? [
                "monday", "tuesday", "wednesday", "thursday",
                "friday", "saturday", "sunday",
            ],
        );
        this.updateNetworkPresenceControl();
        this.updateMonitoringScheduleFields();
        this.renderAssociatedServices(device);
    }

    editNewDevice() {
        this.selectArchitectureEditor(
            "device",
            "",
            "Nouvel équipement",
            "Ajouter un équipement",
        );
        this.setValue(
            "architecture-device-name",
            "",
        );
        this.setValue(
            "architecture-device-kind",
            "server",
        );
        this.setValue(
            "architecture-device-role",
            "",
        );
        this.setValue(
            "architecture-device-address",
            "",
        );
        this.setChecked(
            "architecture-device-network-presence",
            true,
        );
        this.setChecked(
            "architecture-device-monitoring-schedule-enabled",
            false,
        );
        this.setValue("architecture-device-monitoring-start", "07:00");
        this.setValue("architecture-device-monitoring-end", "22:00");
        this.setValue("architecture-device-monitoring-timezone", "Europe/Paris");
        this.setValue("architecture-device-monitoring-grace", 300);
        this.setMonitoringScheduleDays([
            "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday",
        ]);
        this.updateNetworkPresenceControl();
        this.updateMonitoringScheduleFields();
        this.renderAssociatedServices(null);
    }

    updateNetworkPresenceControl() {
        const control = document.getElementById(
            "architecture-device-network-presence",
        );

        if (!control) {
            return;
        }

        control.disabled = !this.value(
            "architecture-device-address",
        );
    }

    updateMonitoringScheduleFields() {
        const enabled = this.checked(
            "architecture-device-monitoring-schedule-enabled",
        );
        const fields = document.getElementById(
            "architecture-device-monitoring-schedule-fields",
        );
        if (fields) {
            fields.hidden = !enabled;
        }

        const requiredControls = [
            "architecture-device-monitoring-start",
            "architecture-device-monitoring-end",
            "architecture-device-monitoring-timezone",
        ];
        const optionalControls = [
            "architecture-device-monitoring-grace",
        ];

        for (const id of requiredControls) {
            const control = document.getElementById(id);
            if (control) {
                control.disabled = !enabled;
                control.required = enabled;
            }
        }
        for (const id of optionalControls) {
            const control = document.getElementById(id);
            if (control) {
                control.disabled = !enabled;
            }
        }
        for (const control of document.querySelectorAll(
            "[data-monitoring-day]",
        )) {
            control.disabled = !enabled;
        }
    }

    monitoringScheduleDays() {
        return Array.from(document.querySelectorAll(
            "[data-monitoring-day]",
        ))
            .filter((control) => control.checked)
            .map((control) => control.dataset.monitoringDay);
    }

    setMonitoringScheduleDays(days) {
        const selected = new Set(days ?? []);
        for (const control of document.querySelectorAll(
            "[data-monitoring-day]",
        )) {
            control.checked = selected.has(control.dataset.monitoringDay);
        }
    }

    updateHomeAssistantTelemetryServiceFields() {
        const isHomeAssistantTelemetry = this.value(
            "architecture-service-type",
        ) === "home_assistant_telemetry";
        const fields = document.getElementById(
            "architecture-service-home-assistant-telemetry-fields",
        );
        const powerEntity = document.getElementById(
            "architecture-service-home-assistant-primary-entity",
        );

        if (fields) {
            fields.hidden = !isHomeAssistantTelemetry;
        }

        if (powerEntity) {
            powerEntity.required = isHomeAssistantTelemetry;
        }
    }

    updateTeleinformationServiceFields() {
        const isTeleinformation = this.value(
            "architecture-service-type",
        ) === "teleinformation";
        const fields = document.getElementById(
            "architecture-service-teleinformation-fields",
        );
        const requiredEntityIds = [
            "architecture-service-teleinformation-meter-id",
        ];

        if (fields) {
            fields.hidden = !isTeleinformation;
        }

        for (const id of requiredEntityIds) {
            const control = document.getElementById(id);

            if (control) {
                control.required = isTeleinformation;
            }
        }
    }

    updateServicePortField() {
        const type = this.value("architecture-service-type");
        const policy = servicePortPolicy(type);
        const field = document.getElementById(
            "architecture-service-port-field",
        );
        const control = document.getElementById(
            "architecture-service-port",
        );
        const help = document.getElementById(
            "architecture-service-port-help",
        );

        if (!field || !control) {
            return;
        }

        field.hidden = policy.mode === "hidden";
        control.required = policy.mode === "required";

        if (policy.mode === "hidden") {
            control.value = policy.defaultPort === null
                ? ""
                : String(policy.defaultPort);
        } else if (!control.value && policy.defaultPort !== null) {
            control.value = String(policy.defaultPort);
        }

        if (help) {
            help.textContent = policy.defaultPort === null
                ? "Facultatif : laissez vide pour utiliser la configuration du plugin."
                : `Facultatif : ${policy.defaultPort} est utilisé par défaut.`;
        }
    }

    updateServiceSpecificFields() {
        this.updateHomeAssistantTelemetryServiceFields();
        this.updateTeleinformationServiceFields();
        this.updateServicePortField();
        if (
            this.value("architecture-service-type") === "dns"
            && !this.value("architecture-service-availability-group")
        ) {
            this.setValue("architecture-service-availability-group", "dns");
        }
    }

    editService(serviceId) {
        const service =
            this.infrastructure.services.find(
                (item) => item.id === serviceId,
            );

        if (!service) {
            return;
        }

        this.selectArchitectureEditor(
            "service",
            service.id,
            "Service",
            service.name,
        );
        this.setValue(
            "architecture-service-name",
            service.name,
        );
        this.setValue(
            "architecture-service-type",
            service.type === "shelly_telemetry"
                ? "home_assistant_telemetry"
                : service.type,
        );
        this.setValue(
            "architecture-service-port",
            service.port ?? "",
        );
        this.setValue(
            "architecture-service-node",
            service.node,
        );
        this.setValue(
            "architecture-service-implementation",
            service.implementation ?? "",
        );
        this.setValue(
            "architecture-service-availability-group",
            service.metadata?.availability_group
                ?? (service.type === "dns" ? "dns" : ""),
        );
        this.setChecked(
            "architecture-service-enabled",
            service.enabled ?? true,
        );
        this.setChecked(
            "architecture-service-critical",
            service.critical ?? false,
        );
        this.setValue(
            "architecture-service-home-assistant-primary-entity",
            service.metadata?.primary_entity_id
                ?? service.metadata?.power_entity_id
                ?? "",
        );
        this.setValue(
            "architecture-service-home-assistant-secondary-entity",
            service.metadata?.secondary_entity_id
                ?? service.metadata?.energy_entity_id
                ?? "",
        );
        this.setValue(
            "architecture-service-home-assistant-maximum-age",
            service.metadata?.maximum_age_seconds ?? 900,
        );
        this.setValue(
            "architecture-service-teleinformation-meter-id",
            service.metadata?.meter_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-source-id",
            service.metadata?.source_id ?? "rpi-linky",
        );
        this.setValue(
            "architecture-service-teleinformation-power-entity",
            service.metadata?.apparent_power_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-tariff-entity",
            service.metadata?.tariff_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-off-peak-entity",
            service.metadata?.blue_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-peak-entity",
            service.metadata?.blue_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-off-peak-entity",
            service.metadata?.white_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-peak-entity",
            service.metadata?.white_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-off-peak-entity",
            service.metadata?.red_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-peak-entity",
            service.metadata?.red_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-maximum-age",
            service.metadata?.maximum_age_seconds ?? 30,
        );
        this.updateServiceSpecificFields();
    }

    editNewService(nodeId = null) {
        if (!this.infrastructure.nodes.length) {
            showError(
                this.elements.error,
                "Ajoutez d’abord un équipement "
                + "possédant un hôte ou une adresse IP.",
            );
            return;
        }

        this.selectArchitectureEditor(
            "service",
            "",
            "Nouveau service",
            "Ajouter un service",
        );
        this.setValue(
            "architecture-service-name",
            "",
        );
        this.setValue(
            "architecture-service-type",
            "dhcp",
        );
        this.setValue(
            "architecture-service-port",
            "",
        );
        this.setValue(
            "architecture-service-node",
            nodeId ?? this.infrastructure.nodes[0].id,
        );
        this.setValue(
            "architecture-service-implementation",
            "",
        );
        this.setValue(
            "architecture-service-availability-group",
            "",
        );
        this.setChecked(
            "architecture-service-enabled",
            true,
        );
        this.setChecked(
            "architecture-service-critical",
            false,
        );
        this.setValue(
            "architecture-service-home-assistant-primary-entity",
            "",
        );
        this.setValue(
            "architecture-service-home-assistant-secondary-entity",
            "",
        );
        this.setValue(
            "architecture-service-home-assistant-maximum-age",
            900,
        );
        this.setValue(
            "architecture-service-teleinformation-meter-id",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-source-id",
            "rpi-linky",
        );
        this.setValue(
            "architecture-service-teleinformation-power-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-tariff-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-maximum-age",
            30,
        );
        this.updateServiceSpecificFields();
    }

    editNewServiceForSelection() {
        const selectedDeviceId =
            this.selectedArchitectureItem?.mode
                === "device"
                ? this.selectedArchitectureItem.id
                : null;
        const device =
            this.infrastructure.topology.devices
                .find(
                    (item) =>
                        item.id === selectedDeviceId,
                );

        if (!device?.node) {
            showError(
                this.elements.error,
                "Renseignez d’abord l’hôte ou l’adresse IP "
                + "de cet équipement et enregistrez-le.",
            );
            return;
        }

        this.editNewService(device.node);
    }

    renderAssociatedServices(device) {
        const container =
            this.elements.architectureDeviceServices;

        if (!container) {
            return;
        }

        if (!device?.node) {
            container.innerHTML = `
                <p class="empty-state">
                    Renseignez une adresse IP pour
                    pouvoir associer des services.
                </p>
            `;
            return;
        }

        const services =
            this.infrastructure.services.filter(
                (service) =>
                    service.node === device.node,
            );
        container.innerHTML = services.length
            ? services.map(
                (service) =>
                    this.serviceCard(service),
            ).join("")
            : `
                <p class="empty-state">
                    Aucun service associé.
                </p>
            `;
    }

    editLink(linkId) {
        const link =
            this.infrastructure.topology.links
                .find((item) => item.id === linkId);

        if (!link) {
            return;
        }

        this.selectArchitectureEditor(
            "link",
            link.id,
            "Liaison",
            link.label ?? link.id,
        );
        this.setValue(
            "architecture-link-label",
            link.label ?? "",
        );
        this.setValue(
            "architecture-link-source",
            link.source,
        );
        this.setValue(
            "architecture-link-target",
            link.target,
        );
        this.setValue(
            "architecture-link-kind",
            this.linkEditorKind(link),
        );
        this.setValue(
            "architecture-link-direction",
            link.direction,
        );
        this.setValue(
            "architecture-link-bandwidth",
            link.bandwidth_mbps ?? "",
        );
    }

    editNewLink() {
        const devices =
            this.infrastructure.topology.devices;

        if (devices.length < 2) {
            showError(
                this.elements.error,
                "Deux équipements sont nécessaires "
                + "pour créer une liaison.",
            );
            return;
        }

        this.selectArchitectureEditor(
            "link",
            "",
            "Nouvelle liaison",
            "Relier deux équipements",
        );
        this.setValue(
            "architecture-link-label",
            "",
        );
        this.setValue(
            "architecture-link-source",
            devices[0].id,
        );
        this.setValue(
            "architecture-link-target",
            devices[1].id,
        );
        this.setValue(
            "architecture-link-kind",
            "ethernet",
        );
        this.setValue(
            "architecture-link-direction",
            "bidirectional",
        );
        this.setValue(
            "architecture-link-bandwidth",
            "",
        );
    }

    selectArchitectureEditor(
        mode,
        id,
        kind,
        title,
    ) {
        this.selectedArchitectureItem = {
            mode,
            id,
        };
        this.elements.architectureEditorMode
            .value = mode;
        this.elements.architectureEditorId
            .value = id;
        this.elements.architectureEditorKind
            .textContent = kind;
        this.elements.architectureEditorTitle
            .textContent = title;
        this.elements.architectureDeviceFields
            .hidden = mode !== "device";
        this.elements.architectureServiceFields
            .hidden = mode !== "service";
        this.elements.architectureLinkFields
            .hidden = mode !== "link";
        this.elements.architectureEditorActions
            .hidden = false;
        this.elements.architectureDelete
            .hidden = !id;
        this.renderArchitecture();
    }

    saveArchitectureItem() {
        const mode =
            this.elements.architectureEditorMode
                .value;

        if (mode === "device") {
            this.saveDeviceDraft();
        } else if (mode === "service") {
            this.saveServiceDraft();
        } else if (mode === "link") {
            this.saveLinkDraft();
        }
    }

    saveDeviceDraft() {
        const name = this.value(
            "architecture-device-name",
        );
        const address = this.value(
            "architecture-device-address",
        );
        const role = this.value(
            "architecture-device-role",
        );
        const networkPresenceEnabled = this.checked(
            "architecture-device-network-presence",
        );
        const monitoringScheduleEnabled = this.checked(
            "architecture-device-monitoring-schedule-enabled",
        );
        const monitoringDays = this.monitoringScheduleDays();

        if (!name) {
            return;
        }

        const addressControl = document.getElementById(
            "architecture-device-address",
        );
        const validAddress = !address
            || isIpv4Address(address)
            || isDnsHostname(address);

        addressControl?.setCustomValidity(
            validAddress
                ? ""
                : "Saisissez une adresse IPv4 ou un nom DNS valide.",
        );

        if (!validAddress) {
            addressControl?.reportValidity();
            return;
        }

        if (monitoringScheduleEnabled && !monitoringDays.length) {
            showError(
                this.elements.error,
                "Sélectionnez au moins un jour de surveillance.",
            );
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const id = currentId
            || this.uniqueId(
                this.slugify(name),
                this.infrastructure.topology
                    .devices,
            );
        let device =
            this.infrastructure.topology.devices
                .find((item) => item.id === id);

        if (!device) {
            device = {
                id,
                label: name,
                kind: this.value(
                    "architecture-device-kind",
                ),
                node: address ? id : null,
                address: address || null,
                metadata: role
                    ? {
                        role,
                    }
                    : {},
            };
            this.infrastructure.topology.devices
                .push(device);
        } else {
            device.label = name;
            device.kind = this.value(
                "architecture-device-kind",
            );
            device.address = address || null;
        }

        device.metadata ??= {};

        if (role) {
            device.metadata.role = role;
        } else {
            delete device.metadata.role;
        }

        if (address) {
            device.metadata.network_presence_enabled =
                networkPresenceEnabled;
        } else {
            delete device.metadata
                .network_presence_enabled;
        }

        if (monitoringScheduleEnabled) {
            device.metadata.monitoring_schedule = {
                enabled: true,
                timezone: this.value(
                    "architecture-device-monitoring-timezone",
                ) || "Europe/Paris",
                periods: [{
                    days: monitoringDays,
                    start: this.value("architecture-device-monitoring-start"),
                    end: this.value("architecture-device-monitoring-end"),
                }],
                startup_grace_seconds: Number(this.value(
                    "architecture-device-monitoring-grace",
                ) || 0),
            };
        } else {
            delete device.metadata.monitoring_schedule;
        }

        if (address) {
            const nodeId = device.node ?? id;
            let node =
                this.infrastructure.nodes.find(
                    (item) => item.id === nodeId,
                );

            if (!node) {
                node = {
                    id: nodeId,
                    name,
                    description: "",
                    endpoint: {
                        type: endpointTypeForAddress(address),
                        address,
                    },
                };
                this.infrastructure.nodes.push(
                    node,
                );
            } else {
                node.name = name;
                node.endpoint.type = endpointTypeForAddress(address);
                node.endpoint.address = address;
            }

            device.node = nodeId;
        }

        this.selectArchitectureEditor(
            "device",
            id,
            "Équipement",
            name,
        );
        this.renderAssociatedServices(device);
        this.showNotice(
            "Équipement modifié. Appliquez "
            + "l’architecture pour confirmer.",
        );
    }

    saveServiceDraft() {
        const name = this.value(
            "architecture-service-name",
        );

        if (!name) {
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const id = currentId
            || this.uniqueId(
                this.slugify(name),
                this.infrastructure.services,
            );
        let service =
            this.infrastructure.services.find(
                (item) => item.id === id,
            );
        const port = this.value(
            "architecture-service-port",
        );
        const type = this.value(
            "architecture-service-type",
        );
        const metadata = {
            ...(service?.metadata ?? {}),
        };
        const availabilityGroup = this.value(
            "architecture-service-availability-group",
        );

        if (availabilityGroup) {
            metadata.availability_group = availabilityGroup;
        } else {
            delete metadata.availability_group;
        }

        const teleinformationEntityFields = {
            apparent_power_entity_id:
                "architecture-service-teleinformation-power-entity",
            tariff_entity_id:
                "architecture-service-teleinformation-tariff-entity",
            blue_off_peak_entity_id:
                "architecture-service-teleinformation-blue-off-peak-entity",
            blue_peak_entity_id:
                "architecture-service-teleinformation-blue-peak-entity",
            white_off_peak_entity_id:
                "architecture-service-teleinformation-white-off-peak-entity",
            white_peak_entity_id:
                "architecture-service-teleinformation-white-peak-entity",
            red_off_peak_entity_id:
                "architecture-service-teleinformation-red-off-peak-entity",
            red_peak_entity_id:
                "architecture-service-teleinformation-red-peak-entity",
        };

        if (type === "home_assistant_telemetry") {
            metadata.primary_entity_id = this.value(
                "architecture-service-home-assistant-primary-entity",
            );
            const secondaryEntityId = this.value(
                "architecture-service-home-assistant-secondary-entity",
            );
            const maximumAge = Number(this.value(
                "architecture-service-home-assistant-maximum-age",
            ) || 900);

            if (secondaryEntityId) {
                metadata.secondary_entity_id = secondaryEntityId;
            } else {
                delete metadata.secondary_entity_id;
            }

            metadata.maximum_age_seconds = maximumAge;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
            for (const field of Object.keys(teleinformationEntityFields)) {
                delete metadata[field];
            }
        } else if (type === "teleinformation") {
            metadata.meter_id = this.value(
                "architecture-service-teleinformation-meter-id",
            );
            metadata.source_id = this.value(
                "architecture-service-teleinformation-source-id",
            ) || "rpi-linky";
            for (const [field, controlId] of Object.entries(
                teleinformationEntityFields,
            )) {
                const entityId = this.value(controlId);

                if (entityId) {
                    metadata[field] = entityId;
                } else {
                    delete metadata[field];
                }
            }

            metadata.maximum_age_seconds = Number(this.value(
                "architecture-service-teleinformation-maximum-age",
            ) || 30);
            delete metadata.primary_entity_id;
            delete metadata.secondary_entity_id;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
        } else {
            delete metadata.primary_entity_id;
            delete metadata.secondary_entity_id;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
            delete metadata.maximum_age_seconds;
            delete metadata.meter_id;
            delete metadata.source_id;
            for (const field of Object.keys(teleinformationEntityFields)) {
                delete metadata[field];
            }
        }

        const portPolicy = servicePortPolicy(type);
        const resolvedPort = portPolicy.mode === "hidden"
            ? portPolicy.defaultPort
            : (port ? Number(port) : null);

        const values = {
            id,
            name,
            type,
            node: this.value(
                "architecture-service-node",
            ),
            port: resolvedPort,
            implementation: this.value(
                "architecture-service-implementation",
            ) || null,
            enabled: this.checked(
                "architecture-service-enabled",
            ),
            critical: this.checked(
                "architecture-service-critical",
            ),
            metadata,
        };

        if (service) {
            Object.assign(service, values);
        } else {
            service = values;
            this.infrastructure.services.push(
                service,
            );
        }

        this.selectArchitectureEditor(
            "service",
            id,
            "Service",
            name,
        );
        this.showNotice(
            "Service modifié. Appliquez "
            + "l’architecture pour confirmer.",
        );
    }

    saveLinkDraft() {
        const source = this.value(
            "architecture-link-source",
        );
        const target = this.value(
            "architecture-link-target",
        );

        if (!source || !target || source === target) {
            showError(
                this.elements.error,
                "Une liaison doit relier deux "
                + "équipements différents.",
            );
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const baseId = `${source}-${target}`;
        const id = currentId
            || this.uniqueId(
                baseId,
                this.infrastructure.topology.links,
            );
        let link =
            this.infrastructure.topology.links
                .find((item) => item.id === id);
        const bandwidth = this.value(
            "architecture-link-bandwidth",
        );
        const editorKind = this.value(
            "architecture-link-kind",
        );
        const metadata = {
            ...(link?.metadata ?? {}),
        };

        if (editorKind === "fiber") {
            metadata.medium = "fiber";
        } else if (metadata.medium === "fiber") {
            delete metadata.medium;
        }

        const values = {
            id,
            source,
            target,
            kind: editorKind === "fiber"
                ? "ethernet"
                : editorKind,
            direction: this.value(
                "architecture-link-direction",
            ),
            label: this.value(
                "architecture-link-label",
            ) || null,
            bandwidth_mbps: bandwidth
                ? Number(bandwidth)
                : null,
            metadata,
        };

        if (link) {
            Object.assign(link, values);
        } else {
            link = values;
            this.infrastructure.topology.links
                .push(link);
        }

        this.selectArchitectureEditor(
            "link",
            id,
            "Liaison",
            values.label ?? id,
        );
        this.showNotice(
            "Liaison modifiée. Appliquez "
            + "l’architecture pour confirmer.",
        );
    }

    deleteArchitectureItem() {
        const selection =
            this.selectedArchitectureItem;

        if (
            !selection?.id
            || !window.confirm(
                "Supprimer cet élément de "
                + "l’architecture ?",
            )
        ) {
            return;
        }

        if (selection.mode === "service") {
            this.infrastructure.services =
                this.infrastructure.services
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
        } else if (selection.mode === "link") {
            this.infrastructure.topology.links =
                this.infrastructure.topology.links
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
        } else {
            const device =
                this.infrastructure.topology.devices
                    .find(
                        (item) =>
                            item.id === selection.id,
                    );
            const nodeId = device?.node;
            this.infrastructure.topology.devices =
                this.infrastructure.topology.devices
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
            this.infrastructure.topology.links =
                this.infrastructure.topology.links
                    .filter(
                        (item) =>
                            item.source
                                !== selection.id
                            && item.target
                                !== selection.id,
                    );

            if (nodeId) {
                const nodeStillUsed =
                    this.infrastructure.topology
                        .devices.some(
                            (item) =>
                                item.node === nodeId,
                        );

                if (!nodeStillUsed) {
                    this.infrastructure.services =
                        this.infrastructure.services
                            .filter(
                                (item) =>
                                    item.node !== nodeId,
                            );
                    this.infrastructure.nodes =
                        this.infrastructure.nodes
                            .filter(
                                (item) =>
                                    item.id !== nodeId,
                            );
                }
            }

            this.infrastructure.topology.layouts
                .forEach((layout) => {
                    delete layout.positions[
                        selection.id
                    ];
                });
        }

        this.clearArchitectureEditor();
        this.renderArchitecture();
        this.showNotice(
            "Suppression préparée. Appliquez "
            + "l’architecture pour confirmer.",
        );
    }

    linkEditorKind(link) {
        if (link.metadata?.medium === "fiber") {
            return "fiber";
        }

        return link.kind;
    }

    architectureLinkVisualKind(link) {
        if (
            link.metadata?.medium === "fiber"
            || link.metadata?.role === "internet_uplink"
        ) {
            return "fiber";
        }

        if (link.kind !== "ethernet") {
            return link.kind;
        }

        const bandwidth = Number(
            link.bandwidth_mbps ?? 0,
        );

        if (bandwidth >= 10000) {
            return "ethernet-10g";
        }

        if (bandwidth >= 2500) {
            return "ethernet-2-5g";
        }

        if (bandwidth >= 1000) {
            return "ethernet-1g";
        }

        if (bandwidth >= 100) {
            return "ethernet-100m";
        }

        return "ethernet";
    }

    async applyArchitecture() {
        if (
            !this.infrastructure
            || !window.confirm(
                "Appliquer cette architecture ? "
                + "Agent vérifiera les équipements, "
                + "services et liaisons.",
            )
        ) {
            return;
        }

        hideError(this.elements.error);

        try {
            this.infrastructure =
                await requestJson(
                    API
                        .administrationInfrastructure,
                    {
                        method: "PUT",
                        body: JSON.stringify(
                            this.infrastructure,
                        ),
                    },
                );
            this.renderArchitecture();

            if (
                this.pluginsAvailable
                && !await this.refreshPlugins()
            ) {
                this.showNotice(
                    "Architecture appliquée et plugins "
                    + "replanifiés. Le compteur des tâches "
                    + "sera actualisé à la prochaine ouverture "
                    + "de la page Plugins.",
                );
                return;
            }

            this.showNotice(
                "Architecture validée, appliquée "
                + "et plugins replanifiés par Agent.",
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Architecture refusée : "
                + this.errorMessage(error),
            );
        }
    }

    populateNodeOptions() {
        const select = document.getElementById(
            "architecture-service-node",
        );

        if (!select || !this.infrastructure) {
            return;
        }

        const currentValue = select.value;
        select.innerHTML =
            this.infrastructure.nodes.map(
                (node) => `
                    <option value="${escapeHtml(node.id)}">
                        ${escapeHtml(node.name)} · ${escapeHtml(node.endpoint.address)}
                    </option>
                `,
            ).join("");

        if (
            this.infrastructure.nodes.some(
                (node) =>
                    node.id === currentValue,
            )
        ) {
            select.value = currentValue;
        }
    }

    populateDeviceOptions() {
        const options =
            this.infrastructure.topology.devices
                .map((device) => `
                    <option value="${escapeHtml(device.id)}">
                        ${escapeHtml(device.label)}
                    </option>
                `)
                .join("");

        [
            "architecture-link-source",
            "architecture-link-target",
        ].forEach((id) => {
            const select =
                document.getElementById(id);

            if (!select) {
                return;
            }

            const currentValue = select.value;
            select.innerHTML = options;
            select.value = currentValue;
        });
    }

    architectureLayout() {
        let layout =
            this.infrastructure.topology.layouts
                .find(
                    (item) =>
                        item.kind === "physical",
                )
            ?? this.infrastructure.topology.layouts[0];

        if (!layout) {
            layout = {
                id: "physical",
                label: "Topologie physique",
                kind: "physical",
                positions: {},
            };
            this.infrastructure.topology.layouts.push(
                layout,
            );
        }

        layout.positions ??= {};
        const occupied = new Set(
            Object.values(layout.positions).map(
                (position) =>
                    `${position.column}:${position.row}`,
            ),
        );

        this.infrastructure.topology.devices
            .forEach((device, index) => {
                if (layout.positions[device.id]) {
                    return;
                }

                let slot = index;
                let column = slot % ARCHITECTURE_MINIMUM_COLUMNS;
                let row = Math.floor(
                    slot / ARCHITECTURE_MINIMUM_COLUMNS,
                );

                while (
                    occupied.has(`${column}:${row}`)
                ) {
                    slot += 1;
                    column = slot % ARCHITECTURE_MINIMUM_COLUMNS;
                    row = Math.floor(
                        slot / ARCHITECTURE_MINIMUM_COLUMNS,
                    );
                }

                layout.positions[device.id] = {
                    column,
                    row,
                };
                occupied.add(`${column}:${row}`);
            });

        return layout;
    }

    ensureTopology() {
        if (!this.infrastructure.topology) {
            this.infrastructure.topology = {
                metadata: {},
                devices: [],
                links: [],
                layouts: [],
            };
        }

        this.infrastructure.nodes ??= [];
        this.infrastructure.services ??= [];
        this.infrastructure.topology.devices ??= [];
        this.infrastructure.topology.links ??= [];
        this.infrastructure.topology.layouts ??= [];
    }

    async refreshPlugins() {
        if (!this.pluginsAvailable) {
            return false;
        }

        try {
            const pluginsPayload = await fetchJson(
                API.administrationPlugins,
            );
            this.plugins = (pluginsPayload.plugins ?? [])
                .map(normalizePluginPresentation);
            this.pluginsLoadError = null;

            if (
                this.selectedPluginId
                && !this.plugins.some(
                    (plugin) =>
                        plugin.id === this.selectedPluginId,
                )
            ) {
                this.selectedPluginId = null;
            }

            this.renderPlugins();
            return true;
        } catch (error) {
            this.pluginsLoadError =
                this.errorMessage(error);
            this.renderPlugins();
            return false;
        }
    }

    renderPlugins() {
        if (!this.elements.pluginCards) {
            return;
        }

        this.elements.pluginCount.textContent =
            String(this.plugins.length);

        if (!this.pluginsAvailable) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state">
                    <img alt="" src="/ui/assets/icons/empty-states/puzzle.svg">
                    <h3>Administration indisponible</h3>
                    <p>Agent n’expose pas encore la gestion des plugins.</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (this.pluginsLoadError) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state plugin-empty-state--error">
                    <img alt="" src="/ui/assets/icons/empty-states/server-crash.svg">
                    <h3>Plugins indisponibles</h3>
                    <p>${escapeHtml(this.pluginsLoadError)}</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (this.plugins.length === 0) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state">
                    <img alt="" src="/ui/assets/icons/empty-states/puzzle.svg">
                    <h3>Aucun plugin enregistré</h3>
                    <p>Les plugins intégrés à Agent apparaîtront ici.</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (
            !this.plugins.some(
                (plugin) =>
                    plugin.id === this.selectedPluginId,
            )
        ) {
            this.selectedPluginId = this.plugins[0].id;
        }

        this.elements.pluginCards.innerHTML =
            this.plugins.map((plugin) => {
                const selected =
                    plugin.id === this.selectedPluginId;
                const statusLabel =
                    PLUGIN_STATUS_LABELS[plugin.status]
                    ?? plugin.status;
                const lastExecution =
                    this.formatPluginDate(
                        plugin.last_execution_at,
                    );
                const error = plugin.last_error
                    ? `
                        <p class="plugin-card__error">
                            ${escapeHtml(plugin.last_error)}
                        </p>
                    `
                    : "";

                return `
                    <button
                        aria-pressed="${selected}"
                        class="plugin-card ${selected ? "is-selected" : ""}"
                        data-plugin-id="${escapeHtml(plugin.id)}"
                        type="button"
                    >
                        <span class="plugin-card__icon">
                            <img
                                alt=""
                                src="${escapeHtml(PLUGIN_ICONS[plugin.id] ?? "/ui/assets/icons/plugins/puzzle.svg")}"
                            >
                        </span>
                        <span class="plugin-card__content">
                            <span class="plugin-card__heading">
                                <span>
                                    <strong>${escapeHtml(plugin.name)}</strong>
                                    <small>v${escapeHtml(plugin.version)}</small>
                                </span>
                                <span class="plugin-status plugin-status--${escapeHtml(plugin.status)}">
                                    ${escapeHtml(statusLabel)}
                                </span>
                            </span>
                            <span class="plugin-card__description">
                                ${escapeHtml(plugin.description || "Plugin Ohana-Agent")}
                            </span>
                            <span class="plugin-card__metrics">
                                <span>${plugin.task_count} tâche${plugin.task_count > 1 ? "s" : ""}</span>
                                <span>${plugin.execution_count} exécution${plugin.execution_count > 1 ? "s" : ""}</span>
                                <span>${escapeHtml(lastExecution)}</span>
                            </span>
                            ${error}
                        </span>
                    </button>
                `;
            }).join("");

        this.renderPluginInspector();
    }

    selectPlugin(identifier) {
        if (
            !this.plugins.some(
                (plugin) => plugin.id === identifier,
            )
        ) {
            return;
        }

        this.selectedPluginId = identifier;
        this.renderPlugins();
    }

    selectedPlugin() {
        return this.plugins.find(
            (plugin) =>
                plugin.id === this.selectedPluginId,
        ) ?? null;
    }

    renderPluginInspector() {
        const plugin = this.selectedPlugin();

        if (
            !plugin
            || !this.elements.pluginForm
            || !this.elements.pluginInspectorContent
        ) {
            if (this.elements.pluginForm) {
                this.elements.pluginForm.hidden = true;
            }

            if (this.elements.pluginInspectorEmpty) {
                this.elements.pluginInspectorEmpty.hidden = false;
            }
            return;
        }

        this.elements.pluginInspectorEmpty.hidden = true;
        this.elements.pluginForm.hidden = false;
        this.elements.pluginTestResult.classList.add(
            "hidden",
        );
        this.elements.pluginTestResult.textContent = "";

        const statusLabel =
            PLUGIN_STATUS_LABELS[plugin.status]
            ?? plugin.status;
        const capabilities =
            plugin.capabilities.length > 0
                ? plugin.capabilities.map(
                    (capability) => `
                        <span class="plugin-capability">
                            ${escapeHtml(capability)}
                        </span>
                    `,
                ).join("")
                : '<span class="plugin-capability">Aucune capacité</span>';

        this.elements.pluginInspectorContent.innerHTML = `
            <div class="configuration-card__heading plugin-inspector__heading">
                <div>
                    <p class="panel-heading__kicker">Plugin ${escapeHtml(plugin.id)}</p>
                    <h2>${escapeHtml(plugin.name)}</h2>
                    <p>${escapeHtml(plugin.description || "Plugin Ohana-Agent")}</p>
                </div>
                <span class="plugin-status plugin-status--${escapeHtml(plugin.status)}">
                    ${escapeHtml(statusLabel)}
                </span>
            </div>
            <div class="plugin-capabilities">
                ${capabilities}
            </div>
            <div class="plugin-runtime-summary">
                <span>
                    <small>Tâches</small>
                    <strong>${plugin.task_count}</strong>
                </span>
                <span>
                    <small>Dernière exécution</small>
                    <strong>${escapeHtml(this.formatPluginDate(plugin.last_execution_at))}</strong>
                </span>
                <span>
                    <small>Prochaine exécution</small>
                    <strong>${escapeHtml(this.formatPluginDate(plugin.next_run_at, "Non planifiée"))}</strong>
                </span>
            </div>
            <div class="configuration-form-grid plugin-configuration-fields">
                ${this.pluginActivationField(plugin)}
                ${this.pluginConfigurationFields(plugin)}
            </div>
            <p class="plugin-inspector__hint">
                ${escapeHtml(this.pluginConfigurationHint(plugin))}
            </p>
        `;
        this.pluginFormDirty = false;

        document.getElementById("plugin-enabled")
            ?.addEventListener(
                "change",
                () => {
                    this.updatePluginConfigurationAvailability();
                },
            );
        document.getElementById("plugin-backup-icloud-connect")
            ?.addEventListener(
                "click",
                () => {
                    void this.connectBackupICloud();
                },
            );
        this.updatePluginConfigurationAvailability();
    }

    pluginActivationField(plugin) {
        if (
            plugin.id === "network"
            || isHomeAssistantTelemetryPlugin(plugin)
            || plugin.id === "teleinformation"
        ) {
            const scope = plugin.id === "network"
                ? "Choisissez les équipements surveillés dans Configuration → Architecture."
                : isHomeAssistantTelemetryPlugin(plugin)
                    ? "Ajoutez un service Télémétrie Home Assistant à chaque équipement concerné dans Configuration → Architecture."
                    : "Ajoutez le service Téléinformation au RPI-Linky dans Configuration → Architecture.";

            return `
                <div class="plugin-scope configuration-span-2">
                    <span class="plugin-scope__icon" aria-hidden="true"></span>
                    <span>
                        <strong>${plugin.id === "network" ? "Activation par équipement" : "Activation par service"}</strong>
                        <small>${escapeHtml(scope)}</small>
                    </span>
                </div>
            `;
        }

        return `
            <label class="configuration-check configuration-span-2">
                <input id="plugin-enabled" type="checkbox" ${plugin.enabled ? "checked" : ""}>
                ${escapeHtml(this.pluginEnabledLabel(plugin))}
            </label>
        `;
    }

    pluginEnabledLabel(plugin) {
        if (plugin.id === "backup") {
            return "Sauvegardes activées";
        }

        if (plugin.id === "dhcp") {
            return "Observation DHCP activée";
        }

        return "Plugin activé";
    }

    pluginConfigurationHint(plugin) {
        if (plugin.id === "backup") {
            return "Agent protège les systèmes HAOS et INFRA-01 dans iCloud, sans écrire d’archive persistante sur la carte microSD.";
        }

        if (plugin.id === "network") {
            return "Les équipements adressables sont découverts automatiquement depuis l’onglet Architecture.";
        }

        if (plugin.id === "dhcp") {
            return "Cette observation surveille le service et l’occupation du pool. Les baux et réservations restent gérés dans la page DHCP.";
        }

        if (plugin.id === "zwave") {
            return "Les contrôleurs Z-Wave JS UI ciblés proviennent des services Z-Wave déclarés dans l’onglet Architecture.";
        }

        if (plugin.id === "wireguard") {
            return "Le serveur WireGuard est contrôlé directement dans Freebox OS. Le service WireGuard doit être déclaré sur la Freebox dans l’onglet Architecture et Ohana-Agent doit être autorisé par la Freebox.";
        }

        if (isHomeAssistantTelemetryPlugin(plugin)) {
            return "Cette page configure la connexion Home Assistant. Les entités et l’âge maximal sont définis dans chaque service Télémétrie Home Assistant de l’architecture.";
        }

        if (plugin.id === "teleinformation") {
            return "Cette page configure la connexion Home Assistant. Les entités SINSTS, NTARF et EASF01 à EASF06 sont définies dans le service Téléinformation du RPI-Linky.";
        }

        return "Les serveurs et courtiers ciblés proviennent des services déclarés dans l’onglet Architecture.";
    }

    backupScheduleDraft(schedule) {
        const parts = String(schedule ?? "").trim().split(/\s+/);

        if (parts.length !== 5) {
            return {
                frequency: "daily",
                time: "00:00",
                weekday: "0",
                monthDay: "1",
            };
        }

        const [
            minute,
            hour,
            day,
            month,
            weekday,
        ] = parts;
        const time =
            `${String(Number(hour)).padStart(2, "0")}:`
            + String(Number(minute)).padStart(2, "0");

        if (
            day === "*"
            && month === "*"
            && weekday !== "*"
        ) {
            return {
                frequency: "weekly",
                time,
                weekday,
                monthDay: "1",
            };
        }

        if (
            day !== "*"
            && month === "*"
            && weekday === "*"
        ) {
            return {
                frequency: "monthly",
                time,
                weekday: "0",
                monthDay: day,
            };
        }

        return {
            frequency: "daily",
            time,
            weekday: "0",
            monthDay: "1",
        };
    }

    backupFrequencyControl(prefix, schedule) {
        const draft = this.backupScheduleDraft(schedule);
        const weekdayOptions = BACKUP_WEEKDAYS.map(
            ([value, label]) => `
                <option value="${value}" ${draft.weekday === value ? "selected" : ""}>
                    ${label}
                </option>
            `,
        ).join("");
        const monthDayOptions = BACKUP_MONTH_DAYS.map(
            (value) => `
                <option value="${value}" ${draft.monthDay === value ? "selected" : ""}>
                    ${value}
                </option>
            `,
        ).join("");

        return `
            <label>
                Périodicité
                <select id="${prefix}-frequency">
                    <option value="daily" ${draft.frequency === "daily" ? "selected" : ""}>Quotidien</option>
                    <option value="weekly" ${draft.frequency === "weekly" ? "selected" : ""}>Hebdomadaire</option>
                    <option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>Mensuel</option>
                </select>
            </label>
            <label>
                Heure
                <input id="${prefix}-time" type="time" value="${escapeHtml(draft.time)}" required>
            </label>
            <label>
                Jour hebdomadaire
                <select id="${prefix}-weekday">
                    ${weekdayOptions}
                </select>
            </label>
            <label>
                Jour mensuel
                <select id="${prefix}-month-day">
                    ${monthDayOptions}
                </select>
            </label>
        `;
    }

    backupSchedulePayload(prefix) {
        const time = this.value(`${prefix}-time`);
        const [
            hour,
            minute,
        ] = time.split(":").map(Number);
        const frequency = this.value(`${prefix}-frequency`);

        if (frequency === "weekly") {
            return `${minute} ${hour} * * ${this.value(`${prefix}-weekday`)}`;
        }

        if (frequency === "monthly") {
            return `${minute} ${hour} ${this.value(`${prefix}-month-day`)} * *`;
        }

        return `${minute} ${hour} * * *`;
    }

    updatePluginConfigurationAvailability() {
        const plugin = this.selectedPlugin();
        const activationControl =
            document.getElementById("plugin-enabled");
        const enabled = (
            plugin?.id === "network"
            || isHomeAssistantTelemetryPlugin(plugin)
            || plugin?.id === "teleinformation"
        )
            ? true
            : (
                activationControl
                    ? activationControl.checked
                    : Boolean(plugin?.enabled)
            );

        this.elements.pluginInspectorContent
            ?.querySelectorAll(
                "input:not(#plugin-enabled), select, textarea",
            )
            .forEach((control) => {
                control.disabled = !enabled;
            });

        if (this.elements.pluginTest) {
            this.elements.pluginTest.disabled = !enabled;
        }
    }

    pluginConfigurationFields(plugin) {
        const configuration = plugin.configuration ?? {};
        const numberField = (
            id,
            label,
            value,
            options = "",
        ) => `
            <label>
                ${escapeHtml(label)}
                <input id="${id}" type="number" value="${escapeHtml(value)}" ${options}>
            </label>
        `;

        const common = `
            ${numberField(
                "plugin-interval-seconds",
                "Intervalle (secondes)",
                configuration.interval_seconds ?? 60,
                'min="1" required',
            )}
            ${numberField(
                "plugin-timeout",
                "Délai maximal (secondes)",
                configuration.timeout ?? 2,
                'min="0.1" step="0.1" required',
            )}
            ${numberField(
                "plugin-retries",
                "Nouvelles tentatives",
                configuration.retries ?? 1,
                'min="0" step="1" required',
            )}
        `;

        if (plugin.id === "backup") {
            const defaults = [
                ["ha-01", "HA-01", "02:00"],
                ["linky-01", "LINKY-01", "03:00"],
                ["zwave-01", "ZWAVE-01", "04:00"],
            ];
            const configuredTargets = configuration.targets ?? [];
            const targets = configuredTargets.length > 0
                ? configuredTargets
                : defaults.map(([id, label, time]) => ({
                    id,
                    label,
                    enabled: true,
                    url: `http://${id}.ohana.lan:8123`,
                    token: null,
                    password: null,
                    schedule: `${Number(time.slice(3))} ${Number(time.slice(0, 2))} * * *`,
                    verify_tls: true,
                    timeout: id === "ha-01" ? 900 : 600,
                }));
            const icloud = configuration.icloud ?? {};
            const infra = configuration.infra_01 ?? {};
            const destinationPath = String(
                configuration.rclone_remote ?? "icloud:Ohana/Backups",
            ).split(":", 2)[1] || "Ohana/Backups";
            const icloudStatus = !icloud.binary_available
                ? "rclone n’est pas encore installé sur Agent."
                : icloud.configured
                    ? "Connexion iCloud configurée."
                    : icloud.requires_two_factor
                        ? "Authentification commencée : code 2FA attendu."
                        : "Connexion iCloud non configurée.";

            return `
                <fieldset class="plugin-backup-target configuration-span-2">
                    <legend>Connexion iCloud</legend>
                    <p class="configuration-span-2">${escapeHtml(icloudStatus)}</p>
                    ${icloud.requires_two_factor ? `
                        <label class="configuration-span-2">
                            Code de validation Apple
                            <input id="plugin-backup-icloud-two-factor" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="Code 2FA">
                        </label>
                        <div class="configuration-span-2">
                            <button id="plugin-backup-icloud-connect" class="button" type="button" ${icloud.binary_available ? "" : "disabled"}>
                                Valider le code 2FA
                            </button>
                        </div>
                    ` : `
                        <details class="configuration-span-2" ${icloud.configured ? "" : "open"}>
                            <summary>${icloud.configured ? "Renouveler la connexion iCloud" : "Configurer la connexion iCloud"}</summary>
                            <div class="configuration-form-grid plugin-backup-target__advanced">
                                <label>
                                    Identifiant Apple
                                    <input id="plugin-backup-icloud-apple-id" type="email" autocomplete="username" placeholder="nom@icloud.com">
                                </label>
                                <label>
                                    Mot de passe Apple
                                    <input id="plugin-backup-icloud-password" type="password" autocomplete="current-password">
                                    <small>Ces identifiants ne sont pas conservés. Le mot de passe Apple normal est requis ; les mots de passe spécifiques aux apps ne fonctionnent pas avec rclone.</small>
                                </label>
                                <div class="configuration-span-2">
                                    <button id="plugin-backup-icloud-connect" class="button" type="button" ${icloud.binary_available ? "" : "disabled"}>
                                        ${icloud.configured ? "Reconnecter iCloud" : "Connecter iCloud"}
                                    </button>
                                </div>
                            </div>
                        </details>
                    `}
                </fieldset>
                <label class="configuration-span-2">
                    Dossier de destination iCloud
                    <input id="plugin-backup-destination-path" type="text" value="${escapeHtml(destinationPath)}" placeholder="Ohana/Backups" required>
                    <small>Chemin dans iCloud Drive. La connexion rclone « ${escapeHtml(icloud.remote_name ?? "icloud")} » est gérée automatiquement par Agent.</small>
                </label>
                <fieldset class="plugin-backup-target configuration-span-2">
                    <legend>INFRA-01</legend>
                    <label class="configuration-check configuration-span-2">
                        <input id="plugin-backup-infra-enabled" type="checkbox" ${infra.enabled === true ? "checked" : ""}>
                        Sauvegarder les configurations d’INFRA-01
                    </label>
                    ${this.backupFrequencyControl("plugin-backup-infra", infra.schedule ?? "0 1 * * *")}
                    <p>
                        Chiffrement age géré automatiquement
                        <small>
                            Ohana-Installer crée l’identité sur INFRA-01 et conserve
                            sa copie de récupération dans iCloud Drive.
                        </small>
                    </p>
                    <label>
                        Sauvegardes conservées dans iCloud
                        <input id="plugin-backup-infra-retention" type="number" min="0" max="365" step="1" value="${escapeHtml(infra.remote_retention_count ?? 0)}" required>
                        <small>0 conserve toutes les sauvegardes. La rotation ne supprime que des sauvegardes complètes après validation de la nouvelle.</small>
                    </label>
                    <p class="configuration-span-2">
                        ${infra.backup_in_progress ? "Sauvegarde en cours…" : "Archive chiffrée, vérifiée puis envoyée directement à iCloud via le stockage temporaire en RAM."}
                    </p>
                </fieldset>
                ${targets.map((target, index) => `
                    <fieldset class="plugin-backup-target configuration-span-2" data-backup-target-index="${index}">
                        <legend>${escapeHtml(target.label ?? target.id)}</legend>
                        <input id="plugin-backup-target-${index}-id" type="hidden" value="${escapeHtml(target.id)}">
                        <label class="configuration-check configuration-span-2">
                            <input id="plugin-backup-target-${index}-enabled" type="checkbox" ${target.enabled !== false ? "checked" : ""}>
                            Sauvegarder ${escapeHtml(target.label ?? target.id)}
                        </label>
                        <label>
                            Nom affiché
                            <input id="plugin-backup-target-${index}-label" type="text" value="${escapeHtml(target.label ?? target.id)}" required>
                        </label>
                        ${this.backupFrequencyControl(`plugin-backup-target-${index}`, target.schedule)}
                        <label class="configuration-span-2">
                            Adresse HAOS
                            <input id="plugin-backup-target-${index}-url" type="url" value="${escapeHtml(target.url ?? `http://${target.id}.ohana.lan:8123`)}" placeholder="http://${escapeHtml(target.id)}.ohana.lan:8123" required>
                        </label>
                        <label>
                            Délai maximal (secondes)
                            <input id="plugin-backup-target-${index}-timeout" type="number" min="1" step="1" value="${escapeHtml(target.timeout ?? 600)}" required>
                        </label>
                        <label class="configuration-check">
                            <input id="plugin-backup-target-${index}-verify-tls" type="checkbox" ${target.verify_tls !== false ? "checked" : ""}>
                            Vérifier le certificat TLS
                        </label>
                        <details class="configuration-span-2">
                            <summary>Secrets et préparation</summary>
                            <div class="configuration-form-grid plugin-backup-target__advanced">
                                <label>
                                    Jeton Home Assistant
                                    <input id="plugin-backup-target-${index}-token" type="password" value="" autocomplete="new-password" placeholder="Laisser vide pour conserver le jeton actuel">
                                    <small>${target.token_configured ? "Jeton configuré. Laissez vide pour le conserver." : "Jeton absent."}</small>
                                </label>
                                <label>
                                    Clé de chiffrement des sauvegardes
                                    <input id="plugin-backup-target-${index}-password" type="password" value="" autocomplete="new-password" placeholder="Laisser vide pour conserver la clé actuelle">
                                    <small>${target.password_configured ? "Clé configurée. Laissez vide pour la conserver." : "Clé absente."} Elle se trouve dans Home Assistant → Paramètres → Système → Sauvegardes.</small>
                                </label>
                                ${target.id === "zwave-01" ? `
                                    <label class="configuration-span-2">
                                        Action Home Assistant optionnelle avant sauvegarde
                                        <input id="plugin-backup-target-${index}-pre-action" type="text" value="${escapeHtml(target.pre_backup_action ? `${target.pre_backup_action.domain}.${target.pre_backup_action.service}` : "")}" placeholder="Laisser vide avec la planification NVM de Z-Wave JS UI">
                                        <small>Recommandé : planifiez la sauvegarde NVM directement dans Z-Wave JS UI avant l’heure HAOS.</small>
                                    </label>
                                ` : ""}
                            </div>
                        </details>
                    </fieldset>
                `).join("")}
            `;
        }

        if (plugin.id === "dhcp") {
            return `
                ${numberField(
                    "plugin-interval-seconds",
                    "Intervalle (secondes)",
                    configuration.interval_seconds ?? 60,
                    'min="1" required',
                )}
                ${numberField(
                    "plugin-timeout",
                    "Délai maximal (secondes)",
                    configuration.timeout ?? 3,
                    'min="0.1" step="0.1" required',
                )}
                <label class="configuration-check">
                    <input id="plugin-dhcp-check-service" type="checkbox" ${configuration.check_service_active !== false ? "checked" : ""}>
                    Vérifier le service dnsmasq
                </label>
                ${numberField(
                    "plugin-dhcp-maximum-pool-usage",
                    "Occupation maximale du pool (%)",
                    configuration.policy?.maximum_pool_usage_percent ?? 90,
                    'min="0.1" max="100" step="0.1" required',
                )}
            `;
        }

        if (plugin.id === "network") {
            return `
                ${common}
                ${numberField(
                    "plugin-network-failure-threshold",
                    "Échecs avant absence",
                    configuration.failure_threshold ?? 3,
                    'min="1" step="1" required',
                )}
            `;
        }

        if (plugin.id === "dns") {
            return `
                <label class="configuration-span-2">
                    Noms à résoudre
                    <input
                        id="plugin-dns-queries"
                        type="text"
                        value="${escapeHtml((configuration.queries ?? []).join(", "))}"
                        placeholder="example.com, ohana.lan"
                        required
                    >
                </label>
                ${common}
                ${numberField(
                    "plugin-dns-minimum-healthy",
                    "Serveurs sains minimum",
                    configuration.policy?.minimum_healthy_servers ?? 1,
                    'min="1" step="1" required',
                )}
            `;
        }

        if (plugin.id === "ntp") {
            return `
                ${common}
                ${numberField(
                    "plugin-ntp-maximum-offset",
                    "Décalage maximal (ms)",
                    configuration.policy?.maximum_offset_ms ?? 1000,
                    'min="0.1" step="0.1" required',
                )}
                ${numberField(
                    "plugin-ntp-maximum-stratum",
                    "Strate maximale",
                    configuration.policy?.maximum_stratum ?? 15,
                    'min="1" max="15" step="1" required',
                )}
            `;
        }

        if (plugin.id === "zwave") {
            return `
                ${common}
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-zwave-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                    Vérifier le certificat TLS des connexions WSS
                </label>
                <small class="configuration-span-2">
                    Les services Z-Wave utilisent par défaut le serveur WebSocket sur le port 3000.
                </small>
            `;
        }

        if (plugin.id === "wireguard") {
            const tokenHint = configuration.app_token_configured
                ? "Un jeton Freebox est déjà configuré. Laissez vide pour le conserver."
                : "Autorisez Ohana-Agent sur la Freebox, puis renseignez le jeton obtenu.";

            return `
                ${common}
                <label>
                    Identifiant de l’application
                    <input id="plugin-wireguard-app-id" type="text" value="${escapeHtml(configuration.app_id ?? "fr.ohana.agent")}" required>
                </label>
                <label>
                    Version de l’application
                    <input id="plugin-wireguard-app-version" type="text" value="${escapeHtml(configuration.app_version ?? "1.8.0")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton d’autorisation Freebox
                    <input id="plugin-wireguard-app-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(tokenHint)}</small>
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-wireguard-verify-tls" type="checkbox" ${configuration.verify_tls ? "checked" : ""}>
                    Vérifier le certificat TLS de Freebox OS
                </label>
            `;
        }

        if (isHomeAssistantTelemetryPlugin(plugin)) {
            const tokenHint = configuration.access_token_configured
                ? "Un jeton Home Assistant est déjà configuré. Laissez vide pour le conserver."
                : "Renseignez un jeton d’accès longue durée Home Assistant ou une variable d’environnement.";
            return `
                ${common}
                <label>
                    URL Home Assistant
                    <input id="plugin-home-assistant-telemetry-url" type="url" value="${escapeHtml(configuration.home_assistant_url ?? "http://ha-green.ohana.lan:8123")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton Home Assistant
                    <input id="plugin-home-assistant-telemetry-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(tokenHint)}</small>
                </label>
                <label class="configuration-span-2">
                    Variable d’environnement du jeton
                    <input id="plugin-home-assistant-telemetry-token-environment" type="text" value="${escapeHtml(configuration.access_token_environment_variable ?? "OHANA_HOME_ASSISTANT_TOKEN")}" placeholder="OHANA_HOME_ASSISTANT_TOKEN">
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-home-assistant-telemetry-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                    Vérifier le certificat TLS de Home Assistant
                </label>
            `;
        }

        if (plugin.id === "teleinformation") {
            const ingestionTokenHint = configuration.ingestion_token_configured
                ? "Un jeton d’ingestion est déjà configuré. Laissez vide pour le conserver."
                : "Utilisez le même jeton dans l’add-on teleinfo2mqtt sur RPI-Linky.";
            const legacyTokenHint = configuration.access_token_configured
                ? "Un jeton Home Assistant historique est configuré."
                : "Uniquement nécessaire pour le mode historique Home Assistant.";
            return `
                ${common}
                <label>
                    Mode de réception
                    <select id="plugin-teleinformation-mode">
                        <option value="direct_http" ${configuration.mode !== "home_assistant" ? "selected" : ""}>HTTP direct depuis teleinfo2mqtt</option>
                        <option value="home_assistant" ${configuration.mode === "home_assistant" ? "selected" : ""}>Home Assistant (historique)</option>
                    </select>
                </label>
                <label>
                    Port d’écoute Agent
                    <input id="plugin-teleinformation-listen-port" type="number" min="1" max="65535" value="${escapeHtml(configuration.listen_port ?? 8770)}" required>
                </label>
                <label>
                    Adresse d’écoute
                    <input id="plugin-teleinformation-listen-host" type="text" value="${escapeHtml(configuration.listen_host ?? "0.0.0.0")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton d’ingestion RPI-Linky
                    <input id="plugin-teleinformation-ingestion-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(ingestionTokenHint)}</small>
                </label>
                <label class="configuration-span-2">
                    Variable d’environnement du jeton d’ingestion
                    <input id="plugin-teleinformation-ingestion-token-environment" type="text" value="${escapeHtml(configuration.ingestion_token_environment_variable ?? "OHANA_TELEINFORMATION_INGESTION_TOKEN")}" placeholder="OHANA_TELEINFORMATION_INGESTION_TOKEN">
                </label>
                <p class="configuration-span-2 configuration-help">
                    Endpoint à configurer dans l’add-on :
                    <code>http://infra-01.ohana.lan:${escapeHtml(configuration.listen_port ?? 8770)}/v1/teleinformation/frames</code>
                </p>
                <details class="configuration-span-2 configuration-legacy-fields">
                    <summary>Mode historique Home Assistant</summary>
                    <div class="configuration-form-grid">
                        <label>
                            URL Home Assistant
                            <input id="plugin-teleinformation-home-assistant-url" type="url" value="${escapeHtml(configuration.home_assistant_url ?? "http://ha-green.ohana.lan:8123")}">
                        </label>
                        <label>
                            Jeton Home Assistant
                            <input id="plugin-teleinformation-access-token" type="password" value="" autocomplete="new-password">
                            <small>${escapeHtml(legacyTokenHint)}</small>
                        </label>
                        <label>
                            Variable d’environnement du jeton
                            <input id="plugin-teleinformation-token-environment" type="text" value="${escapeHtml(configuration.access_token_environment_variable ?? "OHANA_HOME_ASSISTANT_TOKEN")}">
                        </label>
                        <label class="configuration-check">
                            <input id="plugin-teleinformation-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                            Vérifier le certificat TLS
                        </label>
                    </div>
                </details>
            `;
        }

        if (plugin.id === "mqtt") {
            const authentication =
                configuration.authentication ?? {};
            const tls = configuration.tls ?? {};
            const homeAssistant =
                configuration.home_assistant ?? {};
            const passwordHint =
                authentication.password_configured
                    ? "Un mot de passe est déjà configuré. Laissez vide pour le conserver."
                    : "Laissez vide si aucune authentification n’est requise.";

            return `
                ${common}
                ${numberField(
                    "plugin-mqtt-keepalive",
                    "Keepalive (secondes)",
                    configuration.keepalive_seconds ?? 60,
                    'min="1" step="1" required',
                )}
                <label>
                    QoS
                    <select id="plugin-mqtt-qos">
                        ${[0, 1, 2].map(
                            (qos) => `
                                <option value="${qos}" ${Number(configuration.qos ?? 1) === qos ? "selected" : ""}>
                                    ${qos}
                                </option>
                            `,
                        ).join("")}
                    </select>
                </label>
                <label class="configuration-span-2">
                    Préfixe du client
                    <input id="plugin-mqtt-client-prefix" type="text" value="${escapeHtml(configuration.client_id_prefix ?? "ohana-agent")}" required>
                </label>
                <label class="configuration-span-2">
                    Préfixe du sujet
                    <input id="plugin-mqtt-topic-prefix" type="text" value="${escapeHtml(configuration.topic_prefix ?? "ohana/agent/check")}" required>
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-mqtt-ha-enabled" type="checkbox" ${homeAssistant.enabled !== false ? "checked" : ""}>
                    Publier la santé Ohana dans Home Assistant
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-mqtt-ha-discovery-enabled" type="checkbox" ${homeAssistant.discovery_enabled !== false ? "checked" : ""}>
                    Activer MQTT Discovery
                </label>
                <label>
                    Préfixe Discovery
                    <input id="plugin-mqtt-ha-discovery-prefix" type="text" value="${escapeHtml(homeAssistant.discovery_prefix ?? "homeassistant")}" required>
                </label>
                <label>
                    Topic racine Ohana
                    <input id="plugin-mqtt-ha-topic-prefix" type="text" value="${escapeHtml(homeAssistant.topic_prefix ?? "ohana")}" required>
                </label>
                ${numberField(
                    "plugin-mqtt-ha-heartbeat",
                    "Battement Home Assistant (secondes)",
                    homeAssistant.heartbeat_seconds ?? 60,
                    'min="1" step="1" required',
                )}
                <small class="configuration-span-2">
                    Publie le score global, l’état, les incidents critiques, les alertes et la fraîcheur des capacités.
                </small>
                <label>
                    Utilisateur
                    <input id="plugin-mqtt-username" type="text" value="${escapeHtml(authentication.username ?? "")}">
                </label>
                <label>
                    Mot de passe
                    <input id="plugin-mqtt-password" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(passwordHint)}</small>
                </label>
                <label class="configuration-check">
                    <input id="plugin-mqtt-tls-enabled" type="checkbox" ${tls.enabled ? "checked" : ""}>
                    TLS activé
                </label>
                <label class="configuration-check">
                    <input id="plugin-mqtt-tls-insecure" type="checkbox" ${tls.insecure ? "checked" : ""}>
                    Autoriser un certificat non vérifié
                </label>
                <label class="configuration-span-2">
                    Autorité de certification
                    <input id="plugin-mqtt-ca-file" type="text" value="${escapeHtml(tls.ca_file ?? "")}" placeholder="/etc/ssl/certs/ohana-ca.pem">
                </label>
            `;
        }

        return common;
    }

    pluginConfigurationPayload(plugin) {
        const configuration = structuredClone(
            plugin.configuration ?? {},
        );
        if (plugin.id === "backup") {
            configuration.rclone_remote = `${configuration.icloud?.remote_name ?? "icloud"}:${this.value("plugin-backup-destination-path")}`;
            configuration.infra_01 = {
                ...(plugin.configuration?.infra_01 ?? {}),
                enabled: this.checked("plugin-backup-infra-enabled"),
                schedule: this.backupSchedulePayload("plugin-backup-infra"),
                age_binary: plugin.configuration?.infra_01?.age_binary ?? "/usr/bin/age",
                remote_retention_count: Number(this.value("plugin-backup-infra-retention")),
            };
            delete configuration.infra_01.age_recipient;
            delete configuration.infra_01.backup_in_progress;
            configuration.targets = Array.from(
                document.querySelectorAll("[data-backup-target-index]"),
            ).map((fieldset) => {
                const index = fieldset.dataset.backupTargetIndex;
                const original = (plugin.configuration?.targets ?? [])[index] ?? {};
                const action = this.value(`plugin-backup-target-${index}-pre-action`);
                const [domain, ...serviceParts] = action.split(".");
                const target = {
                    ...original,
                    id: this.value(`plugin-backup-target-${index}-id`),
                    label: this.value(`plugin-backup-target-${index}-label`),
                    enabled: this.checked(`plugin-backup-target-${index}-enabled`),
                    url: this.value(`plugin-backup-target-${index}-url`),
                    token: this.value(`plugin-backup-target-${index}-token`) || null,
                    password: this.value(`plugin-backup-target-${index}-password`) || null,
                    token_environment_variable: original.token_environment_variable ?? null,
                    password_environment_variable: original.password_environment_variable ?? null,
                    schedule: this.backupSchedulePayload(
                        `plugin-backup-target-${index}`,
                    ),
                    verify_tls: this.checked(`plugin-backup-target-${index}-verify-tls`),
                    timeout: Number(this.value(`plugin-backup-target-${index}-timeout`)),
                };
                delete target.token_configured;
                delete target.password_configured;
                if (action) {
                    target.pre_backup_action = {
                        domain,
                        service: serviceParts.join("."),
                        data: original.pre_backup_action?.data ?? {},
                    };
                } else {
                    target.pre_backup_action = null;
                }
                return target;
            });
            return {
                enabled: this.checked("plugin-enabled"),
                configuration,
            };
        }
        configuration.interval_seconds = Number(
            this.value("plugin-interval-seconds"),
        );
        configuration.timeout = Number(
            this.value("plugin-timeout"),
        );

        if (plugin.id === "dhcp") {
            delete configuration.retries;
            configuration.check_service_active =
                this.checked(
                    "plugin-dhcp-check-service",
                );
            configuration.policy = {
                maximum_pool_usage_percent: Number(
                    this.value(
                        "plugin-dhcp-maximum-pool-usage",
                    ),
                ),
            };
        } else {
            configuration.retries = Number(
                this.value("plugin-retries"),
            );
        }

        if (plugin.id === "network") {
            configuration.failure_threshold = Number(
                this.value(
                    "plugin-network-failure-threshold",
                ),
            );
        } else if (plugin.id === "dns") {
            configuration.queries = this.listValue(
                "plugin-dns-queries",
            );
            configuration.policy = {
                minimum_healthy_servers: Number(
                    this.value(
                        "plugin-dns-minimum-healthy",
                    ),
                ),
            };
        } else if (plugin.id === "ntp") {
            configuration.policy = {
                maximum_offset_ms: Number(
                    this.value(
                        "plugin-ntp-maximum-offset",
                    ),
                ),
                maximum_stratum: Number(
                    this.value(
                        "plugin-ntp-maximum-stratum",
                    ),
                ),
            };
        } else if (plugin.id === "zwave") {
            configuration.verify_tls = this.checked(
                "plugin-zwave-verify-tls",
            );
        } else if (plugin.id === "wireguard") {
            configuration.app_id = this.value(
                "plugin-wireguard-app-id",
            );
            configuration.app_version = this.value(
                "plugin-wireguard-app-version",
            );
            configuration.app_token =
                this.value("plugin-wireguard-app-token")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-wireguard-verify-tls",
            );
            delete configuration.app_token_configured;
        } else if (isHomeAssistantTelemetryPlugin(plugin)) {
            configuration.home_assistant_url = this.value(
                "plugin-home-assistant-telemetry-url",
            );
            configuration.access_token =
                this.value("plugin-home-assistant-telemetry-token")
                || null;
            configuration.access_token_environment_variable =
                this.value("plugin-home-assistant-telemetry-token-environment")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-home-assistant-telemetry-verify-tls",
            );
            delete configuration.devices;
            delete configuration.access_token_configured;
        } else if (plugin.id === "teleinformation") {
            configuration.mode = this.value("plugin-teleinformation-mode")
                || "direct_http";
            configuration.listen_host = this.value(
                "plugin-teleinformation-listen-host",
            ) || "0.0.0.0";
            configuration.listen_port = Number(this.value(
                "plugin-teleinformation-listen-port",
            ) || 8770);
            configuration.ingestion_token =
                this.value("plugin-teleinformation-ingestion-token")
                || null;
            configuration.ingestion_token_environment_variable =
                this.value("plugin-teleinformation-ingestion-token-environment")
                || null;
            configuration.home_assistant_url = this.value(
                "plugin-teleinformation-home-assistant-url",
            ) || "http://ha-green.ohana.lan:8123";
            configuration.access_token =
                this.value("plugin-teleinformation-access-token")
                || null;
            configuration.access_token_environment_variable =
                this.value("plugin-teleinformation-token-environment")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-teleinformation-verify-tls",
            );
            delete configuration.access_token_configured;
            delete configuration.ingestion_token_configured;
        } else if (plugin.id === "mqtt") {
            configuration.keepalive_seconds = Number(
                this.value("plugin-mqtt-keepalive"),
            );
            configuration.qos = Number(
                this.value("plugin-mqtt-qos"),
            );
            configuration.client_id_prefix =
                this.value("plugin-mqtt-client-prefix");
            configuration.topic_prefix =
                this.value("plugin-mqtt-topic-prefix");
            configuration.home_assistant = {
                enabled: this.checked(
                    "plugin-mqtt-ha-enabled",
                ),
                discovery_enabled: this.checked(
                    "plugin-mqtt-ha-discovery-enabled",
                ),
                discovery_prefix: this.value(
                    "plugin-mqtt-ha-discovery-prefix",
                ),
                topic_prefix: this.value(
                    "plugin-mqtt-ha-topic-prefix",
                ),
                heartbeat_seconds: Number(
                    this.value(
                        "plugin-mqtt-ha-heartbeat",
                    ),
                ),
            };
            configuration.authentication = {
                username:
                    this.value("plugin-mqtt-username")
                    || null,
                password:
                    this.value("plugin-mqtt-password")
                    || null,
            };
            configuration.tls = {
                enabled: this.checked(
                    "plugin-mqtt-tls-enabled",
                ),
                ca_file:
                    this.value("plugin-mqtt-ca-file")
                    || null,
                insecure: this.checked(
                    "plugin-mqtt-tls-insecure",
                ),
            };
        }

        return {
            enabled: (
                plugin.id === "network"
                || isHomeAssistantTelemetryPlugin(plugin)
                || plugin.id === "teleinformation"
            )
                ? true
                : this.checked("plugin-enabled"),
            configuration,
        };
    }

    async savePluginConfiguration() {
        const plugin = this.selectedPlugin();

        if (
            !plugin
            || !window.confirm(
                `Appliquer la configuration du plugin ${plugin.name} ?`,
            )
        ) {
            return;
        }

        hideError(this.elements.error);

        try {
            const updated = await requestJson(
                API.administrationPlugin(plugin.id),
                {
                    method: "PUT",
                    body: JSON.stringify(
                        this.pluginConfigurationPayload(plugin),
                    ),
                },
            );
            this.plugins = this.plugins.map(
                (item) =>
                    item.id === updated.id
                        ? updated
                        : item,
            );
            this.selectedPluginId = updated.id;
            this.renderPlugins();
            this.showNotice(
                `Plugin ${updated.name} configuré et replanifié par Agent.`,
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Configuration du plugin refusée : "
                + this.errorMessage(error),
            );
        }
    }

    async testSelectedPlugin() {
        const plugin = this.selectedPlugin();

        if (!plugin) {
            return;
        }

        if (this.pluginFormDirty) {
            this.elements.pluginTestResult.innerHTML = `
                <strong>Modifications non appliquées</strong>
                <span>Cliquez sur Appliquer avant de tester la configuration enregistrée.</span>
            `;
            this.elements.pluginTestResult.className =
                "plugin-test-result plugin-test-result--error";
            return;
        }

        hideError(this.elements.error);
        this.elements.pluginTest.disabled = true;
        this.elements.pluginTestResult.textContent =
            "Test en cours…";
        this.elements.pluginTestResult.className =
            "plugin-test-result";

        try {
            const result = await requestJson(
                API.administrationPluginTest(plugin.id),
                {
                    method: "POST",
                },
            );
            const message = result.message
                || (
                    result.success
                        ? "Test réussi."
                        : "Test échoué."
                );
            this.elements.pluginTestResult.innerHTML = `
                <strong>${result.success ? "Test réussi" : "Test échoué"}</strong>
                <span>${escapeHtml(message)}</span>
                <small>${Number(result.latency_ms).toFixed(2)} ms</small>
            `;
            this.elements.pluginTestResult.className =
                `plugin-test-result plugin-test-result--${result.success ? "success" : "error"}`;
        } catch (error) {
            this.elements.pluginTestResult.innerHTML = `
                <strong>Test impossible</strong>
                <span>${escapeHtml(this.errorMessage(error))}</span>
            `;
            this.elements.pluginTestResult.className =
                "plugin-test-result plugin-test-result--error";
        } finally {
            this.elements.pluginTest.disabled = false;
        }
    }

    async connectBackupICloud() {
        const plugin = this.selectedPlugin();
        if (plugin?.id !== "backup") {
            return;
        }
        const icloud = plugin.configuration?.icloud ?? {};
        const requiredFields = icloud.requires_two_factor
            ? [
                {
                    id: "plugin-backup-icloud-two-factor",
                    message: "Renseignez le code 2FA pour valider la connexion iCloud.",
                },
            ]
            : [
                {
                    id: "plugin-backup-icloud-apple-id",
                    message: "Renseignez l'identifiant Apple pour connecter iCloud.",
                },
                {
                    id: "plugin-backup-icloud-password",
                    message: "Renseignez le mot de passe Apple pour connecter iCloud.",
                },
            ];
        const missingField = requiredFields.find(
            (field) => !this.value(field.id).trim(),
        );
        if (missingField) {
            showError(this.elements.error, missingField.message);
            document.getElementById(missingField.id)?.focus();
            return;
        }
        const formDraft = this.captureBackupFormDraft();
        const button = document.getElementById("plugin-backup-icloud-connect");
        if (button) {
            button.disabled = true;
        }
        hideError(this.elements.error);
        try {
            const payload = icloud.requires_two_factor
                ? {
                    two_factor_code: this.value("plugin-backup-icloud-two-factor"),
                }
                : {
                    apple_id: this.value("plugin-backup-icloud-apple-id"),
                    password: this.value("plugin-backup-icloud-password"),
                };
            const result = await requestJson(
                API.administrationBackupICloudConnect,
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                },
            );
            plugin.configuration.icloud = result;
            this.renderPluginInspector();
            this.restoreBackupFormDraft(formDraft);
            this.showNotice(result.message ?? "Configuration iCloud mise à jour.");
        } catch (error) {
            showError(
                this.elements.error,
                "Connexion iCloud refusée : " + this.errorMessage(error),
            );
            if (button) {
                button.disabled = false;
            }
        }
    }

    captureBackupFormDraft() {
        const fields = Array.from(
            document.querySelectorAll(
                "#plugin-enabled, [id^='plugin-backup-']",
            ),
        )
            .filter((element) =>
                element.matches("input, select, textarea")
                && !element.id.startsWith("plugin-backup-icloud-")
            )
            .map((element) => ({
                id: element.id,
                checked: element.matches("input[type='checkbox'], input[type='radio']")
                    ? element.checked
                    : null,
                value: element.value,
            }));
        const expandedTargets = Array.from(
            document.querySelectorAll(
                "[data-backup-target-index] details[open]",
            ),
        ).map((details) => details.closest("[data-backup-target-index]")?.dataset.backupTargetIndex);
        return {
            fields,
            expandedTargets,
            dirty: this.pluginFormDirty,
        };
    }

    restoreBackupFormDraft(draft) {
        for (const field of draft.fields) {
            const element = document.getElementById(field.id);
            if (!element) {
                continue;
            }
            if (field.checked === null) {
                element.value = field.value;
            } else {
                element.checked = field.checked;
            }
        }
        for (const index of draft.expandedTargets) {
            document.querySelector(
                `[data-backup-target-index="${index}"] details`,
            )?.setAttribute("open", "");
        }
        this.pluginFormDirty = Boolean(draft.dirty);
    }

    formatPluginDate(value, fallback = "Jamais") {
        if (!value) {
            return fallback;
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return fallback;
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                dateStyle: "short",
                timeStyle: "medium",
            },
        ).format(date);
    }

    clearArchitectureEditor() {
        this.selectedArchitectureItem = null;
        this.elements.architectureEditorMode
            .value = "";
        this.elements.architectureEditorId
            .value = "";
        this.elements.architectureEditorKind
            .textContent = "Sélection";
        this.elements.architectureEditorTitle
            .textContent = "Choisissez un élément";
        this.elements.architectureDeviceFields
            .hidden = true;
        this.elements.architectureServiceFields
            .hidden = true;
        this.elements.architectureLinkFields
            .hidden = true;
        this.elements.architectureEditorActions
            .hidden = true;
        this.renderAssociatedServices(null);
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
