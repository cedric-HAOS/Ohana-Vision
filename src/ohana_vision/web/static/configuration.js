"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "./api.js";

import {
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

const ARCHITECTURE_MINIMUM_COLUMNS = 10;
const ARCHITECTURE_MINIMUM_ROWS = 8;

const PLUGIN_STATUS_LABELS = Object.freeze({
    active: "Actif",
    idle: "En attente",
    disabled: "Désactivé",
    degraded: "Dégradé",
    error: "En erreur",
});

const PLUGIN_ICONS = Object.freeze({
    dhcp: "/ui/assets/icons/network/router.svg",
    dns: "/ui/assets/icons/network/globe-2.svg",
    ntp: "/ui/assets/icons/network/clock-3.svg",
    mqtt: "/ui/assets/icons/services/radio.svg",
    network: "/ui/assets/icons/infrastructure/network.svg",
});

/**
 * Controls graphical infrastructure administration.
 */
export class ConfigurationController {
    constructor() {
        this.dhcp = null;
        this.dhcpAvailable = false;
        this.dhcpLoadError = null;
        this.infrastructure = null;
        this.plugins = [];
        this.pluginsAvailable = false;
        this.pluginsLoadError = null;
        this.selectedPluginId = null;
        this.loaded = false;
        this.selectedArchitectureItem = null;
        this.architectureInteractionMode = "move";
        this.pendingLinkSource = null;
        this.draggedArchitectureDevice = null;

        this.elements = this.findElements();
    }

    findElements() {
        const byId = (id) =>
            document.getElementById(id);

        return {
            error: byId("configuration-error"),
            notice: byId("configuration-notice"),
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
            architectureModeMove:
                byId("architecture-mode-move"),
            architectureModeLink:
                byId("architecture-mode-link"),
            architectureModeStatus:
                byId("architecture-mode-status"),
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
        };
    }

    initialize() {
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
                    this.plugins =
                        pluginsPayload.plugins ?? [];
                } catch (error) {
                    this.pluginsLoadError =
                        this.errorMessage(error);
                }
            }

            this.loaded = true;
            this.renderArchitecture();
            this.renderPlugins();

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

        return true;
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

        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(reservation.hostname)}</strong>
                        <small>${escapeHtml(DHCP_CATEGORY_LABELS[reservation.category] ?? reservation.category)}</small>
                    </span>
                </td>
                <td>${escapeHtml(reservation.address)}</td>
                <td><code>${mac}</code></td>
                <td>Réservé</td>
                <td>
                    <span class="status-badge ${active ? "status-badge--healthy" : "status-badge--unknown"}">
                        ${active ? "Actif" : "Inactif"}
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
        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(lease.hostname ?? "Client sans nom")}</strong>
                        <small>Bail dynamique</small>
                    </span>
                </td>
                <td>${escapeHtml(lease.address)}</td>
                <td><code>${escapeHtml(lease.mac_address)}</code></td>
                <td>Dynamique</td>
                <td><span class="status-badge status-badge--healthy">Actif</span></td>
                <td></td>
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

    openReservation(reservation = null) {
        const dialog =
            this.elements.dhcpReservationDialog;

        if (!dialog) {
            return;
        }

        this.elements
            .dhcpReservationDialogTitle
            .textContent = reservation
                ? "Modifier la réservation"
                : "Ajouter une réservation";

        this.setValue(
            "dhcp-reservation-original-mac",
            reservation?.mac_address ?? "",
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

        dialog.showModal();
    }

    closeReservation() {
        this.elements.dhcpReservationDialog
            ?.close();
    }

    async saveReservation() {
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
            ),
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

    handleDHCPTableClick(event) {
        const button = event.target.closest(
            "[data-dhcp-edit], [data-dhcp-delete]",
        );

        if (!button || !this.dhcp) {
            return;
        }

        const editMac =
            button.dataset.dhcpEdit;
        const deleteMac =
            button.dataset.dhcpDelete;
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
                        <span class="architecture-map-device__icon" aria-hidden="true">${this.deviceGlyph(device.kind)}</span>
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

        this.updateArchitectureModeControls();
        this.populateNodeOptions();
        this.populateDeviceOptions();
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

    deviceGlyph(kind) {
        return {
            internet: "◎",
            router: "⇄",
            switch: "⌘",
            access_point: "⌁",
            raspberry_pi: "π",
            server: "▤",
            home_assistant: "⌂",
            smart_device: "◇",
            camera: "◉",
            computer: "▣",
            storage: "▥",
            solar: "☀",
        }[kind] ?? "◆";
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
        this.updateNetworkPresenceControl();
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
        this.updateNetworkPresenceControl();
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
            service.type,
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
        this.setChecked(
            "architecture-service-enabled",
            service.enabled ?? true,
        );
        this.setChecked(
            "architecture-service-critical",
            service.critical ?? false,
        );
    }

    editNewService(nodeId = null) {
        if (!this.infrastructure.nodes.length) {
            showError(
                this.elements.error,
                "Ajoutez d’abord un équipement "
                + "possédant une adresse IP.",
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
        this.setChecked(
            "architecture-service-enabled",
            true,
        );
        this.setChecked(
            "architecture-service-critical",
            false,
        );
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
                "Renseignez d’abord l’adresse IP "
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

        if (!name) {
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
                        type: "ip",
                        address,
                    },
                };
                this.infrastructure.nodes.push(
                    node,
                );
            } else {
                node.name = name;
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
        const values = {
            id,
            name,
            type: this.value(
                "architecture-service-type",
            ),
            node: this.value(
                "architecture-service-node",
            ),
            port: port ? Number(port) : null,
            implementation: this.value(
                "architecture-service-implementation",
            ) || null,
            enabled: this.checked(
                "architecture-service-enabled",
            ),
            critical: this.checked(
                "architecture-service-critical",
            ),
            metadata: service?.metadata ?? {},
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

        if (bandwidth >= 8000) {
            return "ethernet-8g";
        }

        if (bandwidth >= 5000) {
            return "ethernet-5g";
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
            this.showNotice(
                "Architecture validée et "
                + "appliquée par Agent.",
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
                let column = slot % 5;
                let row = Math.floor(slot / 5);

                while (
                    occupied.has(`${column}:${row}`)
                ) {
                    slot += 1;
                    column = slot % 5;
                    row = Math.floor(slot / 5);
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

        document.getElementById("plugin-enabled")
            ?.addEventListener(
                "change",
                () => {
                    this.updatePluginConfigurationAvailability();
                },
            );
        this.updatePluginConfigurationAvailability();
    }

    pluginActivationField(plugin) {
        if (plugin.id === "network") {
            return `
                <div class="plugin-scope configuration-span-2">
                    <span class="plugin-scope__icon" aria-hidden="true"></span>
                    <span>
                        <strong>Activation par équipement</strong>
                        <small>Choisissez les équipements surveillés dans Configuration → Architecture.</small>
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
        if (plugin.id === "dhcp") {
            return "Observation DHCP activée";
        }

        return "Plugin activé";
    }

    pluginConfigurationHint(plugin) {
        if (plugin.id === "network") {
            return "Les équipements adressables sont découverts automatiquement depuis l’onglet Architecture.";
        }

        if (plugin.id === "dhcp") {
            return "Cette observation surveille le service et l’occupation du pool. Les baux et réservations restent gérés dans la page DHCP.";
        }

        return "Les serveurs et courtiers ciblés proviennent des services déclarés dans l’onglet Architecture.";
    }

    updatePluginConfigurationAvailability() {
        const plugin = this.selectedPlugin();
        const activationControl =
            document.getElementById("plugin-enabled");
        const enabled = plugin?.id === "network"
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

        if (plugin.id === "mqtt") {
            const authentication =
                configuration.authentication ?? {};
            const tls = configuration.tls ?? {};
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
            enabled: plugin.id === "network"
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
